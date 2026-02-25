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
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    channel: z.string().default("assisted"),
    payment_due_within_days: z.number().nullable().optional(),
    case_age_days: z.number().nullable().optional(),
  }).passthrough(),
  structured_inputs: z.object({
    idv_status: z.string(),
    residency_status: z.string(),
    employment_status_declared: z.string().optional(),
    separation_reason_declared: z.string().optional(),
    employer_report_status: z.string().optional(),
    contributions_record_status: z.string().optional(),
    earnings_record_last_30d: z.string().optional(),
    income_verification: z.string().optional(),
    other_benefits_overlap_check: z.string().optional(),
    bank_data_access: z.string().optional(),
    docs_status: z.object({
      docs_requested: z.array(z.string()).default([]),
      docs_received: z.array(z.string()).default([]),
      docs_quality: z.string().default("valid"),
    }).passthrough(),
    engagement_barriers: z.object({
      language_barrier: z.string().default("none"),
      digital_access: z.string().optional(),
      disability_accommodation_needed: z.string().default("no"),
    }).passthrough(),
    fraud_signals: z.object({
      identity_duplicate_match: z.string().default("none"),
      device_or_address_reuse: z.string().optional(),
      document_tampering: z.string().default("none"),
    }).passthrough(),
  }).passthrough(),
  free_text: z.object({
    claimant_message: z.string(),
    agent_chat_transcript_excerpt: z.string(),
    caseworker_note: z.string().optional(),
  }).passthrough(),
  harm_rights_signals: z.object({
    signal_level: z.string(),
    signal_type: z.array(z.string()),
    signal_source: z.string(),
    notes: z.string(),
  }).optional(),
}).passthrough();

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

function mapDocsStatus(profile: ClaimantProfile): { docs_requested: string[]; docs_received: string[]; docs_quality: string } {
  if (profile.pendingDecisions.length === 0) {
    return { docs_requested: [], docs_received: [], docs_quality: "valid" };
  }

  const allCodes = profile.pendingDecisions.flatMap((d) => (d as { reasonCodes?: string[] }).reasonCodes ?? []);
  const hasDocIssue = allCodes.some(
    (c) =>
      DOC_ISSUE_REASON_CODE_PATTERN.test(c),
  );

  const latestCode = (profile.pendingDecisions[0] as { decisionResultCode?: string } | undefined)?.decisionResultCode ?? "";

  if (hasDocIssue) {
    return { docs_requested: ["supporting_documents"], docs_received: [], docs_quality: "missing" };
  }
  if (latestCode === "APPROVED") {
    return { docs_requested: [], docs_received: ["all_documents"], docs_quality: "valid" };
  }
  if (latestCode === "REJECTED") {
    return { docs_requested: ["supporting_documents"], docs_received: [], docs_quality: "invalid" };
  }

  return { docs_requested: [], docs_received: [], docs_quality: "valid" };
}

function mapEngagementBarriers(profile: ClaimantProfile): { language_barrier: string; disability_accommodation_needed: string } {
  const empStatus = (profile.employmentStatus ?? "").toLowerCase();
  const disabilityAccommodationNeeded =
    empStatus === "sick" || empStatus === "incapacitated" ? "yes" : "no";

  return {
    language_barrier: "none",
    disability_accommodation_needed: disabilityAccommodationNeeded,
  };
}

/**
 * Reason codes that indicate a potential fraud signal.
 * Matches patterns like "fraud", "duplicate", "tamper", "mismatch", or "inconsist".
 */
const FRAUD_REASON_CODE_PATTERN = /fraud|duplicate|tamper|mismatch|inconsist/i;

function mapFraudSignals(profile: ClaimantProfile): { identity_duplicate_match: string; document_tampering: string } {
  let identityDuplicateMatch = "none";
  let documentTampering = "none";

  for (const decision of profile.pendingDecisions) {
    for (const code of (decision as { reasonCodes?: string[] }).reasonCodes ?? []) {
      if (/duplicate|identity/i.test(code) && FRAUD_REASON_CODE_PATTERN.test(code)) {
        identityDuplicateMatch = code.toLowerCase();
      }
      if (/tamper|mismatch|inconsist/i.test(code) && FRAUD_REASON_CODE_PATTERN.test(code)) {
        documentTampering = code.toLowerCase();
      }
    }
  }

  return {
    identity_duplicate_match: identityDuplicateMatch,
    document_tampering: documentTampering,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Transcript excerpt helper
// ──────────────────────────────────────────────────────────────────────────────

const TRANSCRIPT_MESSAGES = 30;

// ──────────────────────────────────────────────────────────────────────────────
// Harm signal keyword detector
// ──────────────────────────────────────────────────────────────────────────────

const HARM_KEYWORDS: Record<string, RegExp> = {
  housing_risk: /\b(rent|evict|eviction|homeless|housing|landlord|mortgage|shelter)\b/i,
  food_insecurity: /\b(food|hungry|hunger|starving|eat|meal|groceries)\b/i,
  medical_access: /\b(medical|medicine|hospital|health|sick|illness|prescription|doctor)\b/i,
  safety_risk: /\b(unsafe|violence|abuse|threat|danger|assault)\b/i,
};

/**
 * Scans the full conversation (all messages + current message) for harm signal
 * keywords and returns a note suitable for the caseworker_note field.
 */
export function detectHarmSignals(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): string | undefined {
  const allText = [...history.map((m) => m.content), currentMessage].join(" ");
  const detected = Object.entries(HARM_KEYWORDS)
    .filter(([, pattern]) => pattern.test(allText))
    .map(([signal]) => signal);

  if (detected.length === 0) return undefined;
  return `Harm signals detected by pre-screening: ${detected.join(", ")}. Please factor these into the risk assessment.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Context-aware claimant message builder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that indicate the current message is a meta/test phrase rather than
 * the substantive request that triggered the tool intent. These messages are
 * safe to ignore in favour of the most recent substantive user turn.
 */
const META_MESSAGE_PATTERN =
  /^(is it (working|fixed|ok)|test(?:ing)?|hello|hi|hey|ok|okay|yes|no|sure|thanks|thank you|retry|try again|again|done|got it|check|checking)\.?$/i;

/**
 * Derives the authoritative claimant message to send to the gateway for risk
 * scoring. When the current message is a trivial meta-phrase (e.g. "is it
 * working now"), the tool was resolved from conversation history — so we use
 * the most recent substantive user turn instead. This prevents users from
 * bypassing the risk assessment by sending benign follow-up messages after a
 * high-risk request.
 *
 * Returns { claimantMessage, isContextInferred } where `isContextInferred`
 * signals that the message was pulled from history rather than the current turn.
 */
export function buildContextualClaimantMessage(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): { claimantMessage: string; isContextInferred: boolean } {
  const trimmed = currentMessage.trim();

  // If the current message is substantive, use it directly
  if (trimmed.length > 30 && !META_MESSAGE_PATTERN.test(trimmed)) {
    return { claimantMessage: trimmed, isContextInferred: false };
  }

  // Current message is trivial — find the most recent substantive user turn
  const userTurns = history
    .filter((m) => m.role === "user" && m.content.trim().length > 10)
    .map((m) => m.content.trim());

  if (userTurns.length === 0) {
    // No history — fall back to current message
    return { claimantMessage: trimmed, isContextInferred: false };
  }

  // Concatenate up to the last 3 substantive user turns to give the gateway
  // the full picture of what the user has been asking for
  const substantive = userTurns.slice(-3).join(" | ");
  return { claimantMessage: substantive, isContextInferred: true };
}

export function buildTranscriptExcerpt(
  history: Array<{ role: string; content: string }>,
): string {
  // Use the last TRANSCRIPT_MESSAGES entries to include enough context
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
  /** The authoritative user message for risk scoring (may differ from the raw
   *  current-turn text when that turn was trivial and context was inferred) */
  userMessage: string;
  /** Conversation history for transcript excerpt */
  history: Array<{ role: string; content: string }>;
  /** Tool call intent resolved by OpenAI or regex */
  toolName: string;
  /** Existing conversation/case ID — used as case_id if provided */
  caseId?: string;
  /** ISO 3166-1 alpha-2 jurisdiction code (default "GB") */
  jurisdiction?: string;
  /** When set, the userMessage was inferred from history because the literal
   *  current turn was a trivial meta-phrase (this string). A caseworker_note
   *  will be added alerting the gateway to this context-bypass risk. */
  contextInferred?: string;
  /** Pre-stored intake payload from claimant_case table — merged as base, with live data overlaid */
  storedPayload?: Record<string, unknown> | null;
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
    contextInferred,
    storedPayload,
  } = options;

  // Build the base caseworker note from harm signals, then prepend a context-
  // bypass warning if the tool intent was resolved from history rather than the
  // current literal message. This is critical: the gateway MUST know that the
  // actual request is in userMessage (from history), not the trivial turn text.
  const harmNote = detectHarmSignals(history, userMessage);
  let caseworkerNote: string | undefined;
  if (contextInferred !== undefined) {
    const bypassWarning =
      `CONTEXT-INFERRED ACTION: The user's current literal message was ` +
      `"${contextInferred}" (trivial/meta), but the tool "${toolName}" was ` +
      `resolved from conversation history. The claimant_message reflects the ` +
      `actual substantive request. Score risk based on the full context, not ` +
      `the literal current turn.`;
    caseworkerNote = harmNote ? `${bypassWarning} ${harmNote}` : bypassWarning;
  } else {
    caseworkerNote = harmNote;
  }

  const storedStructuredInputs = (storedPayload?.structured_inputs ?? {}) as Record<string, unknown>;
  const storedDecisionContext = (storedPayload?.decision_context ?? {}) as Record<string, unknown>;
  const storedHarmSignals = storedPayload?.harm_rights_signals ?? undefined;

  const raw = {
    case_id: caseId ?? (storedPayload?.case_id as string) ?? `REF-${nanoid(10)}`,
    timestamp_utc: new Date().toISOString(),
    jurisdiction: (storedPayload?.jurisdiction as string) ?? jurisdiction,
    benefit_type: (storedPayload?.benefit_type as string) ?? mapProgramsToBenefitType(profile.programs),
    decision_context: {
      ...storedDecisionContext,
      decision_type: mapToolToDecisionType(toolName),
      channel: "assisted" as const,
    },
    structured_inputs: {
      ...storedStructuredInputs,
      // Always overlay live-derived status fields
      idv_status: mapIdvStatus(profile),
      residency_status: mapResidencyStatus(profile),
      docs_status: {
        ...(storedStructuredInputs.docs_status ?? {}),
        ...mapDocsStatus(profile),
      },
      engagement_barriers: {
        ...(storedStructuredInputs.engagement_barriers ?? {}),
        ...mapEngagementBarriers(profile),
      },
      fraud_signals: {
        ...(storedStructuredInputs.fraud_signals ?? {}),
        ...mapFraudSignals(profile),
      },
    },
    free_text: {
      claimant_message: userMessage,
      agent_chat_transcript_excerpt: buildTranscriptExcerpt(history),
      ...(caseworkerNote ? { caseworker_note: caseworkerNote } : {}),
    },
    ...(storedHarmSignals ? { harm_rights_signals: storedHarmSignals } : {}),
  };

  // Validate — throws ZodError on schema violation
  return IntakePayloadSchema.parse(raw);
}

// ──────────────────────────────────────────────────────────────────────────────
// Stored payload fetch helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the stored intake_payload JSONB from app.claimant_case via
 * the get_claimant_intake_payload RPC. Returns null on any error.
 */
export async function getStoredIntakePayload(beneficiaryId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin.rpc("get_claimant_intake_payload", {
    p_beneficiary_id: beneficiaryId,
  });
  if (error || !data) return null;
  return data as Record<string, unknown>;
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
