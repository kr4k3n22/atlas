import { z } from "zod";

export const CaseStatus = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "NEEDS_MORE_INFO",
  "EXPIRED",
]);

export const RiskLabel = z.enum(["ROUTINE", "ESCALATE", "BLOCK"]);

export const CaseHistoryItem = z.object({
  ts: z.string(),
  actor: z.string(),
  event: z.string(),
  detail: z.string(),
});

export const CaseSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  status: CaseStatus,
  user_display: z.string(),
  user_message: z.string(),
  tool_name: z.string(),
  tool_args_redacted: z.record(z.string(), z.unknown()),
  risk_label: RiskLabel,
  risk_score: z.number().min(0).max(100),
  risk_rationale: z.string(),
  policy_refs: z.array(z.string()),
  history: z.array(CaseHistoryItem),

  // Signal level from MCP Brain risk scoring
  signal_level: z.enum(["none", "low", "moderate", "strong"]).optional(),
  // Harm/rights signal types detected
  signal_types: z.array(z.string()).optional(),
  // Signal source
  signal_source: z.enum(["claimant", "caseworker", "third_party", "system"]).optional(),
  // Signal notes
  signal_notes: z.string().optional(),

  // MCP Brain recommended action
  recommended_action: z.enum(["auto_approve", "auto_deny", "auto_review", "escalate_to_human"]).optional(),
  // MCP Brain policy rationale
  policy_rationale: z.string().optional(),

  // Decision context from chatbot layer
  decision_type: z.enum(["approve", "deny", "continue_review"]).optional(),
  payment_due_within_days: z.number().nullable().optional(),
  case_age_days: z.number().optional(),
  channel: z.enum(["web", "phone", "in_person", "chat", "assisted", "mobile"]).optional(),

  // Engagement barriers (fairness-critical)
  language_barrier: z.enum(["none", "some", "significant", "unknown"]).optional(),
  digital_access: z.enum(["good", "limited", "none", "unknown"]).optional(),
  disability_accommodation_needed: z.enum(["yes", "no", "unknown"]).optional(),

  // Fraud signals
  fraud_identity_duplicate: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),
  fraud_device_reuse: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),
  fraud_document_tampering: z.enum(["none", "possible", "confirmed", "unknown"]).optional(),

  // Structured verification statuses
  idv_status: z.enum(["verified", "partial", "failed", "pending"]).optional(),
  residency_status: z.enum(["verified", "pending", "not_verified", "unknown"]).optional(),
  employment_status: z.enum(["unemployed", "employed", "unknown"]).optional(),
  separation_reason: z.string().optional(),
  employer_report_status: z.enum(["received", "pending", "disputed", "not_provided"]).optional(),
  contributions_status: z.enum(["sufficient", "insufficient", "pending", "unknown"]).optional(),
  income_verification: z.enum(["verified", "partial", "missing", "none", "unknown"]).optional(),
  overlap_check: z.enum(["clear", "possible", "confirmed", "unknown"]).optional(),

  // Free text (split from single user_message)
  claimant_message: z.string().optional(),
  agent_transcript: z.string().optional(),
  caseworker_note: z.string().optional(),
});

export type Case = z.infer<typeof CaseSchema>;

export const DecisionSchema = z.object({
  case_id: z.string(),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  comment: z.string().optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;
