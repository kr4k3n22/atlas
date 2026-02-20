import { z } from "zod";
import { createCase } from "@/lib/caseStore";
import { appendAuditEvent } from "@/lib/auditStore";

const IngestRequest = z.object({
  case_id: z.string().optional(),
  timestamp_utc: z.string().optional(),
  jurisdiction: z.string().optional(),
  benefit_type: z.string().optional(),
  decision_context: z.object({
    decision_type: z.enum(["approve", "deny", "continue_review"]),
    payment_due_within_days: z.number().int().nullable().optional(),
    case_age_days: z.number().int().optional(),
    channel: z.enum(["web", "phone", "assisted", "mobile"]).optional(),
  }),
  structured_inputs: z.record(z.string(), z.unknown()).optional(),
  free_text: z.object({
    claimant_message: z.string().optional(),
    agent_chat_transcript_excerpt: z.string().optional(),
    caseworker_note: z.string().optional(),
  }).optional(),
  harm_rights_signals: z.object({
    signal_level: z.enum(["none", "low", "medium", "high"]),
    signal_type: z.array(z.string()).optional(),
    signal_source: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  labels: z.object({
    label: z.enum(["ROUTINE", "ARTICLE14_RISK"]),
    recommended_action: z.enum(["auto_approve", "auto_deny", "auto_review", "escalate_to_human"]),
    policy_rationale: z.string().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof IngestRequest>;
  try {
    body = IngestRequest.parse(await request.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    return Response.json({ error: msg }, { status: 400 });
  }

  const recommendedAction = body.labels?.recommended_action ?? "auto_review";
  const signalLevel = body.harm_rights_signals?.signal_level ?? "none";
  const policyRationale = body.labels?.policy_rationale ?? "";

  // Map training data label to internal risk_label
  const riskLabel =
    body.labels?.label === "ARTICLE14_RISK"
      ? "ESCALATE"
      : recommendedAction === "auto_deny"
        ? "BLOCK"
        : recommendedAction === "escalate_to_human"
          ? "ESCALATE"
          : "ROUTINE";

  // Derive a risk score from signal_level
  const riskScore =
    signalLevel === "high" ? 85
      : signalLevel === "medium" ? 65
        : signalLevel === "low" ? 45
          : 20;

  const caseRecord = await createCase({
    user_display: String(
      (body.structured_inputs as Record<string, unknown>)?.claimant_name ??
      body.case_id ??
      "Claimant"
    ),
    user_message: body.free_text?.claimant_message ?? "No claimant message provided.",
    tool_name: `benefit_${body.decision_context.decision_type}`,
    tool_args_redacted: {
      case_id: body.case_id,
      jurisdiction: body.jurisdiction,
      benefit_type: body.benefit_type,
      decision_context: body.decision_context,
      structured_inputs: body.structured_inputs ?? {},
      free_text: body.free_text ?? {},
      harm_rights_signals: body.harm_rights_signals ?? null,
      labels: body.labels ?? null,
    },
    risk_label: riskLabel,
    risk_score: riskScore,
    risk_rationale: policyRationale || `Ingested from training data. Signal: ${signalLevel}.`,
    policy_refs: body.labels?.label === "ARTICLE14_RISK" ? ["POLICY-HARM-RIGHTS-001", "ARTICLE-14-ECHR"] : ["POLICY-LOW-RISK-001"],
  });

  await appendAuditEvent({
    actor: "MCP Gateway",
    action: "case_ingested",
    case_id: caseRecord.id,
    detail: `Ingested via /api/ingest. Source case_id: ${body.case_id ?? "unknown"}. Action: ${recommendedAction}.`,
  });

  return Response.json(caseRecord, { status: 201 });
}
