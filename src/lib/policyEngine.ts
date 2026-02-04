import { z } from "zod";
import { evaluatePolicy } from "@/lib/policyEngine";
import { createCase } from "@/lib/caseStore";
import { appendAuditEvent } from "@/lib/auditStore";

const DecisionContextSchema = z.object({
  decision_type: z.enum(["approve", "deny", "reduce", "suspend", "continue_review"]),
  payment_due_within_days: z.number().int().nonnegative().optional(),
  case_age_days: z.number().int().nonnegative().optional(),
  channel: z.enum(["web", "phone", "in_person", "chat"]).optional(),
});

const DocsStatusSchema = z.object({
  docs_requested: z.array(z.string()).optional(),
  docs_received: z.array(z.string()).optional(),
  docs_quality: z.string().optional(),
});

const EngagementBarriersSchema = z.object({
  language_barrier: z.string().optional(),
  digital_access: z.string().optional(),
  disability_accommodation_needed: z.string().optional(),
});

const FraudSignalsSchema = z.object({
  identity_duplicate_match: z.string().optional(),
  device_or_address_reuse: z.string().optional(),
  document_tampering: z.string().optional(),
});

const StructuredInputsSchema = z.object({
  idv_status: z.string().optional(),
  residency_status: z.string().optional(),
  address_stability: z.string().optional(),
  employment_status_declared: z.string().optional(),
  separation_reason_declared: z.string().optional(),
  reason_for_unemployment: z.string().optional(),
  employer_report_status: z.string().optional(),
  last_employer_report: z.string().optional(),
  contributions_record_status: z.string().optional(),
  contributions_record: z.string().optional(),
  earnings_record_last_30d: z.string().optional(),
  recent_earnings_record: z.string().optional(),
  declared_income: z.string().optional(),
  income_verification: z.string().optional(),
  other_benefits_overlap_check: z.string().optional(),
  bank_data_access: z.string().optional(),
  docs_status: DocsStatusSchema.optional(),
  engagement_barriers: EngagementBarriersSchema.optional(),
  fraud_signals: FraudSignalsSchema.optional(),
  claim_history: z.string().optional(),
});

const FreeTextSchema = z.object({
  claimant_message: z.string().optional(),
  agent_chat_transcript_excerpt: z.string().optional(),
  caseworker_note: z.string().optional(),
});

const PolicyRequest = z.object({
  case_id: z.string().optional(),
  timestamp_utc: z.string().optional(),
  jurisdiction: z.string().optional(),
  benefit_type: z.string().optional(),
  decision_context: DecisionContextSchema,
  structured_inputs: StructuredInputsSchema,
  free_text: FreeTextSchema.optional(),
  harm_signal_present: z.enum(["none", "weak", "moderate", "strong"]).optional(),
  harm_signal_source: z.enum(["claimant message", "call notes", "third-party", "system flag"]).optional(),
  ability_to_engage: z.enum([
    "normal",
    "limited digital access",
    "language barrier",
    "disability accommodation needed",
  ]).optional(),
  appeal_or_review_requested: z.enum(["yes", "no"]).optional(),
});

export async function POST(request: Request) {
  const body = PolicyRequest.parse(await request.json());
  const decision = evaluatePolicy(body);

  let caseRecord = null;

  if (decision.decision !== "ALLOW") {
    caseRecord = await createCase({
      user_display: "Claimant",
      user_message: body.free_text?.claimant_message ?? "No claimant message provided.",
      tool_name: `benefit_${body.decision_context.decision_type}`,
      tool_args_redacted: {
        case_id: body.case_id,
        jurisdiction: body.jurisdiction,
        benefit_type: body.benefit_type,
        decision_context: body.decision_context,
        structured_inputs: body.structured_inputs,
        free_text: body.free_text ?? {},
      },
      risk_label: decision.risk_label,
      risk_score: decision.risk_score,
      risk_rationale: decision.risk_rationale,
      policy_refs: decision.policy_refs,
    });
  }

  await appendAuditEvent({
    actor: "policy_engine",
    action: "policy_decision",
    case_id: caseRecord?.id,
    detail: `${decision.decision} (${decision.risk_label} ${decision.risk_score})`,
  });

  return Response.json({
    decision: decision.decision,
    case_id: caseRecord?.id ?? null,
    risk_label: decision.risk_label,
    risk_score: decision.risk_score,
    risk_rationale: decision.risk_rationale,
    policy_refs: decision.policy_refs,
    harm_rights_signals: decision.harm_rights_signals,
    labels: decision.labels,
  });
}
