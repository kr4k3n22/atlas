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
  if (profile.idvStatus) return profile.idvStatus;
  const appStatus = (profile.currentApplicationStatus ?? "").toLowerCase();
  if (appStatus === "verified" || appStatus === "active") return "verified";
  if (appStatus === "pending") return "pending";
  if (appStatus === "rejected" || appStatus === "failed") return "failed";
  return "pending";
}

function mapResidencyStatus(profile: ClaimantProfile): string {
  if (profile.residencyStatus) return profile.residencyStatus;
  // Infer from application status — extend if more granular data is available
  const appStatus = (profile.currentApplicationStatus ?? "").toLowerCase();
  if (appStatus === "active" || appStatus === "verified") return "verified";
  if (appStatus === "pending") return "pending";
  return "not_verified";
}


function mapDocsStatus(profile: ClaimantProfile): { docs_requested: string[]; docs_received: string[]; docs_quality: string } {
  if (profile.docsStatus) {
    return {
      docs_requested: profile.docsStatus.requested,
      docs_received: profile.docsStatus.received,
      docs_quality: profile.docsStatus.quality,
    };
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


function mapFraudSignals(_profile: ClaimantProfile): { identity_duplicate_match: string; document_tampering: string } {
  return {
    identity_duplicate_match: "none",
    document_tampering: "none",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Transcript excerpt helper
// ──────────────────────────────────────────────────────────────────────────────

const TRANSCRIPT_MESSAGES = 100;

export function buildTranscriptExcerpt(
  history: Array<{ role: string; content: string }>,
  profile?: ClaimantProfile,
): string {
  let header = "";
  if (profile) {
    const harm = profile.harmSignals
      ? `[GOVERNANCE] Harm Signals: ${profile.harmSignals.level} (${profile.harmSignals.types.join(", ")}) - ${profile.harmSignals.notes}`
      : "[GOVERNANCE] No active harm signals detected.";
    const note = profile.caseworkerNote
      ? `\n[GOVERNANCE] Caseworker Note: ${profile.caseworkerNote}`
      : "";
    header = `${harm}${note}\n---\n`;
  }

  // Use the last TRANSCRIPT_MESSAGES entries
  const recent = history.slice(-TRANSCRIPT_MESSAGES);
  if (recent.length === 0) return header;
  return header + recent.map((m) => `[${m.role}]: ${m.content}`).join("\n");
}


// ──────────────────────────────────────────────────────────────────────────────
// Main builder
// ──────────────────────────────────────────────────────────────────────────────

export interface BuildIntakePayloadOptions {
  /** Claimant profile from beneficiaryStore */
  profile: ClaimantProfile;
  /** The verbatim user message */
  userMessage: string;
  /** Conversation history for transcript excerpt */
  history: Array<{ role: string; content: string }>;
  /** Tool call intent resolved by OpenAI or regex */
  toolName: string;
  /** Existing conversation/case ID — used as case_id if provided */
  caseId?: string;
  /** ISO 3166-1 alpha-2 jurisdiction code (default "GB") */
  jurisdiction?: string;
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
    storedPayload,
  } = options;

  const raw = {
    // Start with the full historical payload from the database to preserve all custom fields
    ...(storedPayload || {}),

    case_id: caseId ?? (storedPayload?.case_id as string) ?? `REF-${nanoid(10)}`,
    timestamp_utc: new Date().toISOString(),
    jurisdiction: (storedPayload?.jurisdiction as string) ?? jurisdiction,
    benefit_type: (storedPayload?.benefit_type as string) ?? mapProgramsToBenefitType(profile.programs),

    decision_context: {
      ...(storedPayload?.decision_context as Record<string, unknown> || {}),
      decision_type: mapToolToDecisionType(toolName),
      channel: "assisted" as const,
    },

    structured_inputs: {
      ...(storedPayload?.structured_inputs as Record<string, unknown> || {}),
      // Overlay live-derived profile status fields
      idv_status: mapIdvStatus(profile),
      residency_status: mapResidencyStatus(profile),
      docs_status: {
        ...((storedPayload?.structured_inputs as any)?.docs_status || {}),
        ...mapDocsStatus(profile),
      },
      engagement_barriers: {
        ...((storedPayload?.structured_inputs as any)?.engagement_barriers || {}),
        ...mapEngagementBarriers(profile),
      },
      fraud_signals: {
        ...((storedPayload?.structured_inputs as any)?.fraud_signals || {}),
        ...mapFraudSignals(profile),
      },
    },

    free_text: {
      ...(storedPayload?.free_text as Record<string, unknown> || {}),
      claimant_message: userMessage,
      agent_chat_transcript_excerpt: buildTranscriptExcerpt(history, profile),
    },

    // Prioritize harmful signals and caseworker notes from the live profile/system context
    harm_rights_signals: profile.harmSignals
      ? {
        signal_level: profile.harmSignals.level,
        signal_type: profile.harmSignals.types,
        signal_source: "system",
        notes: profile.harmSignals.notes,
      }
      : storedPayload?.harm_rights_signals
        ? (storedPayload.harm_rights_signals as any)
        : undefined,
  };

  if (profile.caseworkerNote) {
    (raw.free_text as any).caseworker_note = profile.caseworkerNote;
  }

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
