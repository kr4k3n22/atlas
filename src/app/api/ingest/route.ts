import { z } from "zod";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/ingest
 *
 * Accepts cases in the training data JSONL format produced by the
 * MCP Brain Risk Scoring SLM and maps them to the approval_queue table.
 */

const DecisionContextSchema = z.object({
  decision_type: z.enum(["approve", "deny", "continue_review"]).optional(),
  payment_due_within_days: z.number().nullable().optional(),
  case_age_days: z.number().optional(),
  channel: z.enum(["web", "phone", "in_person", "chat", "assisted", "mobile"]).optional(),
});

const StructuredInputsSchema = z.object({
  idv_status: z.enum(["verified", "partial", "failed", "pending"]).optional(),
  residency_status: z.enum(["verified", "pending", "not_verified", "unknown"]).optional(),
  employment_status: z.enum(["unemployed", "employed", "unknown"]).optional(),
  separation_reason: z.string().optional(),
  employer_report_status: z.enum(["received", "pending", "disputed", "not_provided"]).optional(),
  contributions_status: z.enum(["sufficient", "insufficient", "pending", "unknown"]).optional(),
  income_verification: z.enum(["verified", "partial", "missing", "none", "unknown"]).optional(),
  overlap_check: z.enum(["clear", "possible", "confirmed", "unknown"]).optional(),
  language_barrier: z.enum(["none", "some", "significant", "unknown"]).optional(),
  digital_access: z.enum(["good", "limited", "none", "unknown"]).optional(),
  disability_accommodation_needed: z.enum(["yes", "no", "unknown"]).optional(),
  fraud_identity_duplicate: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),
  fraud_device_reuse: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),
  fraud_document_tampering: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),
});

const FreeTextSchema = z.object({
  claimant_message: z.string().optional(),
  agent_chat_transcript_excerpt: z.string().optional(),
  caseworker_note: z.string().optional(),
});

const HarmRightsSignalsSchema = z.object({
  signal_level: z.enum(["none", "low", "moderate", "strong"]).optional(),
  // Training data format uses singular "signal_type"; maps to plural "signal_types" in DB
  signal_type: z.array(z.string()).optional(),
  signal_source: z.enum(["claimant", "caseworker", "third_party", "system"]).optional(),
  notes: z.string().optional(),
});

const LabelsSchema = z.object({
  recommended_action: z.enum(["auto_approve", "auto_deny", "auto_review", "escalate_to_human"]).optional(),
  policy_rationale: z.string().optional(),
  risk_label: z.enum(["ROUTINE", "ESCALATE", "BLOCK"]).optional(),
  risk_score: z.number().min(0).max(100).optional(),
});

const IngestBody = z.object({
  case_id: z.string().optional(),
  timestamp_utc: z.string().optional(),
  user_display: z.string().optional(),
  user_message: z.string().optional(),
  tool_name: z.string().optional(),
  tool_args_redacted: z.record(z.string(), z.unknown()).optional(),
  decision_context: DecisionContextSchema.optional(),
  structured_inputs: StructuredInputsSchema.optional(),
  free_text: FreeTextSchema.optional(),
  harm_rights_signals: HarmRightsSignalsSchema.optional(),
  labels: LabelsSchema.optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof IngestBody>;
  try {
    body = IngestBody.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const dc = body.decision_context ?? {};
  const si = body.structured_inputs ?? {};
  const ft = body.free_text ?? {};
  const hrs = body.harm_rights_signals ?? {};
  const labels = body.labels ?? {};

  const claimantMessage = ft.claimant_message ?? body.user_message ?? "";
  const userMessage = claimantMessage;

  const id = body.case_id ?? `CASE-${nanoid(6).toUpperCase()}`;
  const created_at = body.timestamp_utc ?? new Date().toISOString();

  const row: Record<string, unknown> = {
    id,
    created_at,
    status: "PENDING_REVIEW",
    user_display: body.user_display ?? id,
    user_message: userMessage,
    tool_name: body.tool_name ?? "mcp_brain",
    tool_args_redacted: body.tool_args_redacted ?? {},
    risk_label: labels.risk_label ?? "ROUTINE",
    risk_score: labels.risk_score ?? 0,
    risk_rationale: labels.policy_rationale ?? "",
    policy_refs: [],
    history: [
      {
        ts: created_at,
        actor: "MCP Brain",
        event: "created",
        detail: "Case ingested via training data format.",
      },
    ],

    // Signal fields
    signal_level: hrs.signal_level,
    signal_types: hrs.signal_type,
    signal_source: hrs.signal_source,
    signal_notes: hrs.notes,

    // Recommended action / policy rationale
    recommended_action: labels.recommended_action,
    policy_rationale: labels.policy_rationale,

    // Decision context
    decision_type: dc.decision_type,
    payment_due_within_days: dc.payment_due_within_days,
    case_age_days: dc.case_age_days,
    channel: dc.channel,

    // Engagement barriers
    language_barrier: si.language_barrier,
    digital_access: si.digital_access,
    disability_accommodation_needed: si.disability_accommodation_needed,

    // Fraud signals
    fraud_identity_duplicate: si.fraud_identity_duplicate,
    fraud_device_reuse: si.fraud_device_reuse,
    fraud_document_tampering: si.fraud_document_tampering,

    // Verification statuses
    idv_status: si.idv_status,
    residency_status: si.residency_status,
    employment_status: si.employment_status,
    separation_reason: si.separation_reason,
    employer_report_status: si.employer_report_status,
    contributions_status: si.contributions_status,
    income_verification: si.income_verification,
    overlap_check: si.overlap_check,

    // Free text
    claimant_message: ft.claimant_message,
    agent_transcript: ft.agent_chat_transcript_excerpt,
    caseworker_note: ft.caseworker_note,
  };

  // Remove undefined values so Supabase doesn't complain
  for (const key of Object.keys(row)) {
    if (row[key] === undefined) delete row[key];
  }

  const { data, error } = await supabaseAdmin
    .from("approval_queue")
    .insert(row)
    .select("id, status")
    .single();

  if (error) {
    console.error("Failed to ingest case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, case_id: data.id, status: data.status },
    { status: 201 }
  );
}
