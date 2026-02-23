/**
 * intakePayloadBuilder.ts
 *
 * Single source-of-truth for building a welfare IntakePayload that matches
 * the MCP Gateway v2.1.0 `/api/intake` contract.
 *
 * The payload is validated with Zod before being returned so callers get a
 * compile-time–safe, schema-compliant object.
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import type { ClaimantProfile } from "@/lib/beneficiaryStore";

// ──────────────────────────────────────────────────────────────────────────────
// Zod schema — the authoritative shape for /api/intake
// ──────────────────────────────────────────────────────────────────────────────

export const IntakePayloadSchema = z.object({
  case_id: z.string().min(1),
  timestamp_utc: z.string().min(1),
  jurisdiction: z.string().min(1),
  benefit_type: z.string().min(1),
  decision_context: z.object({
    decision_type: z.enum(["approve", "deny", "continue_review"]),
    channel: z.literal("assisted"),
  }),
  structured_inputs: z.object({
    idv_status: z.string(),
    residency_status: z.string(),
    docs_status: z.string(),
    engagement_barriers: z.array(z.string()),
    fraud_signals: z.array(z.string()),
  }),
  free_text: z.object({
    claimant_message: z.string(),
    agent_chat_transcript_excerpt: z.string(),
  }),
});

export type IntakePayload = z.infer<typeof IntakePayloadSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Tool-intent → decision_type mapping (Task 4)
// ──────────────────────────────────────────────────────────────────────────────

const TOOL_DECISION_TYPE: Record<string, IntakePayload["decision_context"]["decision_type"]> = {
  check_payment_status: "continue_review",
  request_payment_extension: "approve",
  modify_welfare_record: "approve",
};

export function mapToolToDecisionType(
  toolName: string,
): IntakePayload["decision_context"]["decision_type"] {
  return TOOL_DECISION_TYPE[toolName] ?? "continue_review";
}

// ──────────────────────────────────────────────────────────────────────────────
// Programs → benefit_type mapping
// ──────────────────────────────────────────────────────────────────────────────

const PROGRAM_LABELS: Record<string, string> = {
  UC: "universal_credit",
  JSA: "jobseekers_allowance",
  ESA: "employment_support_allowance",
  HB: "housing_benefit",
  PIP: "personal_independence_payment",
  CHILD_BENEFIT: "child_benefit",
};

function mapProgramsToBenefitType(programs: string[]): string {
  if (programs.length === 0) return "universal_credit";
  const first = programs[0];
  return PROGRAM_LABELS[first] ?? first.toLowerCase().replace(/\s+/g, "_");
}

// ──────────────────────────────────────────────────────────────────────────────
// Claimant profile → structured_inputs mapping
// ──────────────────────────────────────────────────────────────────────────────

function mapIdvStatus(profile: ClaimantProfile): string {
  const appStatus = (profile.currentApplicationStatus ?? "").toLowerCase();
  if (appStatus === "verified" || appStatus === "active") return "verified";
  if (appStatus === "pending") return "pending";
  if (appStatus === "rejected" || appStatus === "failed") return "failed";
  return "pending";
}

function mapResidencyStatus(profile: ClaimantProfile): string {
  // Infer from application status — extend if more granular data is available
  const appStatus = (profile.currentApplicationStatus ?? "").toLowerCase();
  if (appStatus === "active" || appStatus === "verified") return "verified";
  if (appStatus === "pending") return "pending";
  return "not_verified";
}

/** Reason codes that indicate missing or incomplete documentation. */
const DOC_ISSUE_REASON_CODE_PATTERN =
  /doc|evidence|upload|missing|submit/i;

function mapDocsStatus(profile: ClaimantProfile): string {
  if (profile.pendingDecisions.length === 0) return "complete";

  const allCodes = profile.pendingDecisions.flatMap((d) => d.reasonCodes);
  const hasDocIssue = allCodes.some(
    (c) =>
      DOC_ISSUE_REASON_CODE_PATTERN.test(c),
  );
  if (hasDocIssue) return "partial";

  const latestCode = profile.pendingDecisions[0]?.decisionResultCode ?? "";
  if (latestCode === "APPROVED") return "complete";
  if (latestCode === "DEFERRED" || latestCode === "PENDING") return "pending";
  if (latestCode === "REJECTED") return "missing";

  return "pending";
}

function mapEngagementBarriers(profile: ClaimantProfile): string[] {
  const barriers: string[] = [];

  const empStatus = (profile.employmentStatus ?? "").toLowerCase();
  if (empStatus === "unemployed" || empStatus === "seeking") {
    barriers.push("unemployed");
  } else if (empStatus === "sick" || empStatus === "incapacitated") {
    barriers.push("health_condition");
  } else if (empStatus === "part_time" || empStatus === "part-time") {
    barriers.push("part_time_employment");
  }

  if (profile.householdSize >= 3) {
    barriers.push("caring_responsibilities");
  }

  return barriers;
}

/**
 * Reason codes that indicate a potential fraud signal.
 * Matches patterns like "fraud", "duplicate", "tamper", "mismatch", or "inconsist".
 */
const FRAUD_REASON_CODE_PATTERN = /fraud|duplicate|tamper|mismatch|inconsist/i;

function mapFraudSignals(profile: ClaimantProfile): string[] {
  const signals: string[] = [];

  for (const decision of profile.pendingDecisions) {
    for (const code of decision.reasonCodes) {
      if (FRAUD_REASON_CODE_PATTERN.test(code)) {
        signals.push(code.toLowerCase());
      }
    }
  }

  return signals;
}

// ──────────────────────────────────────────────────────────────────────────────
// Transcript excerpt helper
// ──────────────────────────────────────────────────────────────────────────────

const TRANSCRIPT_MESSAGES = 6;

export function buildTranscriptExcerpt(
  history: Array<{ role: string; content: string }>,
): string {
  const recent = history.slice(-TRANSCRIPT_MESSAGES);
  if (recent.length === 0) return "";
  return recent.map((m) => `[${m.role}]: ${m.content}`).join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main builder
// ──────────────────────────────────────────────────────────────────────────────

export interface BuildIntakePayloadOptions {
  /** Claimant profile from beneficiaryStore */
  profile: ClaimantProfile;
  /** The user's current message */
  userMessage: string;
  /** Conversation history for transcript excerpt */
  history: Array<{ role: string; content: string }>;
  /** Tool call intent resolved by OpenAI or regex */
  toolName: string;
  /** Existing conversation/case ID — used as case_id if provided */
  caseId?: string;
  /** ISO 3166-1 alpha-2 jurisdiction code (default "GB") */
  jurisdiction?: string;
}

/**
 * Builds and validates a welfare IntakePayload ready to POST to `/api/intake`.
 *
 * Throws a `z.ZodError` if any required field cannot be populated.
 */
export function buildIntakePayload(options: BuildIntakePayloadOptions): IntakePayload {
  const {
    profile,
    userMessage,
    history,
    toolName,
    caseId,
    jurisdiction = "GB",
  } = options;

  const raw = {
    case_id: caseId ?? `REF-${nanoid(10)}`,
    timestamp_utc: new Date().toISOString(),
    jurisdiction,
    benefit_type: mapProgramsToBenefitType(profile.programs),
    decision_context: {
      decision_type: mapToolToDecisionType(toolName),
      channel: "assisted" as const,
    },
    structured_inputs: {
      idv_status: mapIdvStatus(profile),
      residency_status: mapResidencyStatus(profile),
      docs_status: mapDocsStatus(profile),
      engagement_barriers: mapEngagementBarriers(profile),
      fraud_signals: mapFraudSignals(profile),
    },
    free_text: {
      claimant_message: userMessage,
      agent_chat_transcript_excerpt: buildTranscriptExcerpt(history),
    },
  };

  // Validate — throws ZodError on schema violation
  return IntakePayloadSchema.parse(raw);
}

// ──────────────────────────────────────────────────────────────────────────────
// Client-side validation helper (Task 3)
// ──────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an IntakePayload object.  Logs errors in dev mode and returns a
 * structured result so callers can surface a user-friendly error message.
 */
export function validateIntakePayload(payload: unknown): ValidationResult {
  const result = IntakePayloadSchema.safeParse(payload);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );

  if (process.env.NODE_ENV !== "production") {
    console.error("[intakePayloadBuilder] Payload validation failed:", errors);
  }

  return { valid: false, errors };
}
