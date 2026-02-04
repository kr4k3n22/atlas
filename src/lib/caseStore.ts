import { nanoid } from "nanoid";
import casesJson from "@/data/mock_cases.json";
import { CaseSchema } from "@/lib/schema";
import { appendAuditEvent } from "@/lib/auditStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { executeAction } from "@/lib/actionExecutionStore";
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
}) {
  const id = `CASE-${nanoid(6).toUpperCase()}`;
  const created_at = nowIso();

  const c: CaseRecord = CaseSchema.parse({
    id,
    created_at,
    status: "PENDING_REVIEW",
    user_display: input.user_display,
    user_message: input.user_message,
    tool_name: input.tool_name,
    tool_args_redacted: input.tool_args_redacted,
    risk_label: input.risk_label,
    risk_score: input.risk_score,
    risk_rationale: input.risk_rationale,
    policy_refs: input.policy_refs,
    history: [
      {
        ts: created_at,
        actor: "proxy",
        event: "created",
        detail: "Tool call intercepted.",
      },
      {
        ts: created_at,
        actor: "risk_engine",
        event: "scored",
        detail: `${input.risk_label} (${input.risk_score}).`,
      },
    ],
  });

  const { data, error } = await supabaseAdmin.from("approval_queue").insert(c).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  await appendAuditEvent({
    actor: "proxy",
    action: "case_created",
    case_id: id,
    detail: `Queued ${input.tool_name} for approval.`,
  });

  return stripInternal(normalizeRow(data));
}

export async function applyDecision(input: {
  id: string;
  decision: Decision;
  note?: string;
}): Promise<CaseRecord | null> {
  const { data: current, error } = await supabaseAdmin
    .from("approval_queue")
    .select("*")
    .eq("id", input.id)
    .single();

  if (error || !current) return null;

  const decision = input.decision;
  const note = input.note?.trim() || "";
  const status =
    decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "PENDING_REVIEW";

  const history = Array.isArray(current.history) ? current.history : [];
  history.push({
    ts: nowIso(),
    actor: "reviewer",
    event: "decided",
    detail: `${decision}${note ? `: ${note}` : ""}`,
  });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("approval_queue")
    .update({ status, history })
    .eq("id", input.id)
    .select("*")
    .single();

  if (updateError || !updated) return null;

  await appendAuditEvent({
    actor: "reviewer",
    action: `decision_${decision.toLowerCase()}`,
    case_id: updated.id,
    detail: note || undefined,
  });

  if (decision === "APPROVE") {
    await executeAction({
      case_id: updated.id,
      requested_by: updated.user_display ?? null,
      approver: "reviewer",
      tool_name: updated.tool_name,
      tool_args: updated.tool_args_redacted ?? {},
      decision_source: "APPROVED",
    });
  }

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
