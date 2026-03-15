import { nanoid } from "nanoid";
import casesJson from "@/data/mock_cases.json";
import { CaseSchema } from "@/lib/schema";
import { appendAuditEvent } from "@/lib/auditStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { executeAction } from "@/lib/actionExecutionStore";
import { notifyGatewayDecision } from "@/lib/gatewayClient";
import { sendEmail } from "@/lib/email";
import { escalationEmail, actionSummaryEmail } from "@/lib/emailTemplates";
import { generateActionSummary } from "@/lib/generateActionSummary";
import type { z } from "zod";

type CaseRecord = z.infer<typeof CaseSchema> & {
  user_name?: string;
  audit_trail?: Array<{ ts: string; actor: string; action: string; detail?: string }>;
};

type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

const nowIso = () => new Date().toISOString();

function normalizeRow(row: any): CaseRecord {
  const normalized = {
    ...row,
    policy_refs: Array.isArray(row.policy_refs) ? row.policy_refs : [],
    history: Array.isArray(row.history) ? row.history : [],
  };
  return CaseSchema.parse(normalized);
}

export async function getAllCases(): Promise<CaseRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("approval_queue")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data?.length ? data : casesJson).map(normalizeRow);
  return rows.map(stripInternal);
}

export async function getCaseById(id: string): Promise<CaseRecord | null> {
  const { data, error } = await supabaseAdmin.from("approval_queue").select("*").eq("id", id).single();

  if (error || !data) return null;
  return stripInternal(normalizeRow(data));
}

export async function createCase(input: {
  user_display: string;
  user_message: string;
  tool_name: string;
  tool_args_redacted: Record<string, unknown>;
  risk_label: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
  gateway_event_id?: string;
  conversation_id?: string;
}) {
  const id = `CASE-${nanoid(6).toUpperCase()}`;
  const created_at = nowIso();

  const extraMeta: Record<string, unknown> = {};
  if (input.gateway_event_id) extraMeta.gateway_event_id = input.gateway_event_id;
  if (input.conversation_id) extraMeta.conversation_id = input.conversation_id;

  const c: CaseRecord = CaseSchema.parse({
    id,
    created_at,
    status: "PENDING_REVIEW",
    user_display: input.user_display,
    user_message: input.user_message,
    tool_name: input.tool_name,
    tool_args_redacted: Object.keys(extraMeta).length
      ? { ...input.tool_args_redacted, ...extraMeta }
      : input.tool_args_redacted,
    risk_label: input.risk_label,
    risk_score: input.risk_score,
    risk_rationale: input.risk_rationale,
    policy_refs: input.policy_refs,
    history: [
      {
        ts: created_at,
        actor: "MCP Gateway",
        event: "created",
        detail: "Tool call intercepted by ATLAS Policy Engine.",
      },
      {
        ts: created_at,
        actor: "Risk Engine",
        event: "scored",
        detail: `${input.risk_label} (${input.risk_score}). ${input.risk_rationale.slice(0, 200)}`,
      },
    ],
  });

  const { data, error } = await supabaseAdmin.from("approval_queue").insert(c).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  await appendAuditEvent({
    actor: "MCP Gateway",
    action: "case_created",
    case_id: id,
    detail: `Queued ${input.tool_name} for HITL approval. Risk: ${input.risk_label} (${input.risk_score}).`,
  });

  // --- Send escalation email + AI action summary (fire-and-forget) ---
  if (input.risk_label === "ESCALATE" || input.risk_label === "BLOCK") {
    const caseRecord = stripInternal(normalizeRow(data));
    const approverEmail = process.env.APPROVER_NOTIFY_EMAIL;
    const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cyber295atlas.app";

    // Notify the approver
    if (approverEmail) {
      const { subject, html } = escalationEmail(caseRecord, "Approver", dashboardUrl);
      sendEmail({ to: approverEmail, subject, html }).catch(() => {});
    }

    // Send AI action summary to the case actions inbox
    const CASE_ACTIONS_EMAIL = process.env.CASE_ACTIONS_EMAIL || "AtlasCaseActions@protonmail.com";
    generateActionSummary(caseRecord)
      .then((summary) => {
        const { subject, html } = actionSummaryEmail(caseRecord, summary, dashboardUrl);
        return sendEmail({ to: CASE_ACTIONS_EMAIL, subject, html });
      })
      .catch((err) => {
        console.error("[caseStore] Failed to send AI action summary email:", err?.message ?? err);
      });
  }

  return stripInternal(normalizeRow(data));
}

export async function applyDecision(input: {
  id: string;
  decision: Decision;
  note?: string;
  approver?: string;
}): Promise<CaseRecord | null> {
  const { data: current, error } = await supabaseAdmin
    .from("approval_queue")
    .select("*")
    .eq("id", input.id)
    .single();

  if (error || !current) return null;

  const decision = input.decision;
  const note = input.note?.trim() || "";
  const approver = input.approver?.trim() || "Reviewer";
  
  const status =
    decision === "APPROVE" 
      ? "APPROVED" 
      : decision === "REJECT" 
        ? "REJECTED" 
        : decision === "REQUEST_INFO"
          ? "NEEDS_MORE_INFO"
          : "PENDING_REVIEW";

  const history = Array.isArray(current.history) ? current.history : [];
  history.push({
    ts: nowIso(),
    actor: approver,
    event: decision === "REQUEST_INFO" ? "request_info" : "decided",
    detail: decision === "REQUEST_INFO" 
      ? `Requested more information${note ? `: ${note}` : ""}`
      : `${decision}${note ? `: ${note}` : ""}`,
  });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("approval_queue")
    .update({ status, history })
    .eq("id", input.id)
    .select("*")
    .single();

  if (updateError || !updated) return null;

  // --- Audit log ---
  await appendAuditEvent({
    actor: approver,
    action: decision === "REQUEST_INFO" ? "request_info" : `decision_${decision.toLowerCase()}`,
    case_id: updated.id,
    detail: note || undefined,
  });

  // --- Execute action on APPROVE ---
  if (decision === "APPROVE") {
    await executeAction({
      case_id: updated.id,
      requested_by: updated.user_display ?? null,
      approver,
      tool_name: updated.tool_name,
      tool_args: updated.tool_args_redacted ?? {},
      decision_source: "APPROVED",
    });
  }

  // --- Write outcome back to chat conversation ---
  const conversationId = current.tool_args_redacted?.conversation_id;
  const gatewayEventId = current.tool_args_redacted?.gateway_event_id;
  if (typeof conversationId === "string" && conversationId) {
    const decisionTs = nowIso();
    const refId = updated.id;

    let chatContent: string;
    const decisionDateStr = new Date(decisionTs).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    if (decision === "APPROVE") {
      chatContent = [
        `✅ **Request Approved**`,
        ``,
        `Your request has been reviewed and approved by a case officer.`,
        note ? `\n**Reviewer Notes:**\n${note}` : ``,
        ``,
        `📋 **Reference:** ${refId}`,
        `🕐 **Decision Time:** ${decisionDateStr}`,
      ].filter(Boolean).join("\n");
    } else if (decision === "REJECT") {
      chatContent = [
        `❌ **Request Not Approved**`,
        ``,
        `Your request has been reviewed and was not approved by a case officer.`,
        note ? `\n**Reviewer Notes:**\n${note}` : ``,
        ``,
        `📋 **Reference:** ${refId}`,
        `🕐 **Decision Time:** ${decisionDateStr}`,
        ``,
        `If you believe this decision is incorrect, you may request a review or appeal.`,
      ].filter(Boolean).join("\n");
    } else {
      chatContent = [
        `ℹ️ **Additional Information Requested**`,
        ``,
        `A case officer has requested additional information before making a decision.`,
        note ? `\n**Reviewer's Request:**\n${note}` : ``,
        ``,
        `📋 **Reference:** ${refId}`,
        `🕐 **Requested At:** ${decisionDateStr}`,
        ``,
        `Please respond in this conversation with the requested information.`,
      ].filter(Boolean).join("\n");
    }

    const { error: msgError } = await supabaseAdmin.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: chatContent,
    });
    if (msgError) {
      console.warn(`[caseStore] Failed to write decision message to chat for ${updated.id}:`, msgError.message);
    }

    const { error: convError } = await supabaseAdmin
      .from("conversations")
      .update({ updated_at: nowIso() })
      .eq("id", conversationId);
    if (convError) {
      console.warn(`[caseStore] Failed to update conversation timestamp for ${updated.id}:`, convError.message);
    }
  }

  // --- Notify Gateway (non-blocking) ---
  // This fires the Inngest event `atlas/sarah.decision` in the Gateway
  // to resume the paused governance workflow.
  const gatewayDecision =
    decision === "APPROVE"
      ? "APPROVED"
      : decision === "REJECT"
        ? "REJECTED"
        : "NEEDS_INFO";

  notifyGatewayDecision({
    case_id: updated.id,
    decision: gatewayDecision,
    note,
    approver,
    event_id: typeof gatewayEventId === "string" ? gatewayEventId : undefined,
  }).then((result) => {
    if (!result.ok) {
      console.warn(
        `[caseStore] Gateway notification failed for ${updated.id}: ${result.error}`
      );
    }
  });

  return stripInternal(normalizeRow(updated));
}

function stripInternal(c: CaseRecord): CaseRecord {
  const out: any = { ...c };
  out.user_name = c.user_display;
  out.audit_trail = (c.history ?? []).map((e) => ({
    ts: e.ts,
    actor: e.actor,
    action: e.event,
    detail: e.detail,
  }));
  return out as CaseRecord;
}
