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
});

export type Case = z.infer<typeof CaseSchema>;

export const DecisionSchema = z.object({
  case_id: z.string(),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  comment: z.string().optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;
