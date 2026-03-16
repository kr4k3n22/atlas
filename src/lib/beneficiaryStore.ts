/**
 * beneficiaryStore.ts
 *
 * Queries the PostgreSQL welfare-claims schema to retrieve claimant profile
 * data for grounding the AI chat agent's responses.
 *
 * Data source: app.claimant_case_detailed (canonical flat-column view).
 * A single row read replaces the legacy dual-RPC approach that parsed
 * nested JSONB at both DB and application layers.
 *
 * All monetary amounts are stored in minor currency units (pence for GBP).
 * Consumer code should convert to display units when presenting to users.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluatePolicy, type PolicyDecision } from "@/lib/policyEngine";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ClaimantProfile {
  claimantId: string;
  externalRef: string;
  fullName: string;
  dateOfBirth: string | null;
  employmentStatus: string | null;
  currentApplicationStatus: string | null;
  currentApplicationRef: string | null;
  programs: string[];
  // Extended grounding data from flat columns
  idvStatus?: string;
  residencyStatus?: string;
  employerReportStatus?: string;
  contributionRecordStatus?: string;
  docsStatus?: {
    requested: string[];
    received: string[];
    quality: string;
  };
  harmSignals?: {
    level: string;
    types: string[];
    notes: string;
  };
  caseworkerNote?: string;
}


export interface ApplicationStatus {
  applicationId: string;
  applicationRef: string;
  statusCode: string;
  submittedAt: string | null;
  programs: string[];
}


// ──────────────────────────────────────────────────────────────────────────────
// Claimant update result
// ──────────────────────────────────────────────────────────────────────────────

export type UpdateResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };


// ──────────────────────────────────────────────────────────────────────────────
// Internal helper — single row read from app.claimant_case_detailed
// ──────────────────────────────────────────────────────────────────────────────

async function fetchDetailedRow(
  beneficiaryId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await (supabaseAdmin as any)
    .schema("app")
    .from("claimant_case_detailed")
    .select("*")
    .eq("beneficiary_id", beneficiaryId)
    .single();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// updateEmploymentStatus
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Updates `employment_status_declared` for the claimant identified by
 * `beneficiaryId` in `app.claimant_case_detailed`.
 *
 * Only this column is written; no other fields are touched and no
 * business-rule recomputation is performed.
 *
 * After the update, the fresh row is re-read and returned as a
 * `ClaimantProfile` so callers always have consistent post-write state.
 *
 * @param beneficiaryId         The external claimant reference (e.g. "BEN-ATLAS-001")
 * @param employmentStatus      The new value for employment_status_declared
 */
export async function updateEmploymentStatus(
  beneficiaryId: string,
  employmentStatus: string,
): Promise<UpdateResult<ClaimantProfile>> {
  const { error } = await (supabaseAdmin as any)
    .schema("app")
    .from("claimant_case_detailed")
    .update({ employment_status_declared: employmentStatus })
    .eq("beneficiary_id", beneficiaryId);

  if (error) {
    return {
      ok: false,
      error: `DB update failed for beneficiary_id=${beneficiaryId}: ${error.message}`,
    };
  }

  // Re-read the fresh row so the caller always sees the committed state
  const fresh = await getClaimantProfile(beneficiaryId);
  if (!fresh) {
    return {
      ok: false,
      error: `Update succeeded but re-read returned no row for beneficiary_id=${beneficiaryId}`,
    };
  }

  return { ok: true, data: fresh };
}

// ──────────────────────────────────────────────────────────────────────────────
// recomputeDecisionState
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Layer 1 — pure eligibility function.
 *
 * Maps claimant facts from a DB row to the chatbot-layer decision_type.
 * Independent of the Brain/governance layer (evaluatePolicy).
 *
 * deny:           employed | idv failed | contributions insufficient
 * continue_review: any evidence gap or docs issue
 * approve:         explicit positive confirmation of ALL required conditions
 *
 * Fields read: employment_status_declared, idv_status, residency_status,
 *   contributions_record_status, employer_report_status,
 *   docs_quality, docs_requested, docs_received.
 * Historical fields NOT read: separation_reason_declared etc.
 */
function deriveDecisionType(
  row: Record<string, unknown>,
): "approve" | "deny" | "continue_review" {
  const emp           = String(row.employment_status_declared   ?? "").trim().toLowerCase();
  const idv           = String(row.idv_status                  ?? "").trim().toLowerCase();
  const contributions = String(row.contributions_record_status ?? "").trim().toLowerCase();
  const residency     = String(row.residency_status            ?? "").trim().toLowerCase();
  const empReport     = String(row.employer_report_status      ?? "").trim().toLowerCase();
  const docsQuality   = String(row.docs_quality                ?? "").trim().toLowerCase();
  const docsRequested = toStringArray(row.docs_requested);
  const docsReceived  = toStringArray(row.docs_received);

  // ── 1. Hard deny signals ────────────────────────────────────────────────
  if (emp === "employed")              return "deny";
  if (idv === "failed")                return "deny";
  if (contributions === "insufficient") return "deny";

  // ── 2. continue_review: missing or invalid evidence ──────────────────────
  // Key evidence fields not yet verified
  if (!idv           || ["pending", "unknown"].includes(idv))                              return "continue_review";
  if (!residency     || ["pending", "not_verified", "unknown"].includes(residency))        return "continue_review";
  if (!contributions || ["pending", "unknown"].includes(contributions))                    return "continue_review";

  // Employer report still pending/unknown (relevant while unemployed)
  if (emp === "unemployed" && empReport && ["pending", "unknown"].includes(empReport))     return "continue_review";

  // Required documents not yet fully received
  if (docsRequested.length > 0) {
    const missingDocs = docsRequested.filter((d) => !docsReceived.includes(d));
    if (missingDocs.length > 0)                                                           return "continue_review";
  }

  // Docs present but quality not acceptable
  const invalidQuality = ["missing", "pending_verification", "expired", "unreadable", "inconsistent", "unknown"];
  if (docsQuality && invalidQuality.includes(docsQuality))                                return "continue_review";

  // ── 3. approve: positive confirmation of all required conditions ──────────
  // All conditions below must be explicitly met — not just absence of bad state.
  if (
    emp === "unemployed" &&
    idv === "verified" &&
    residency === "verified" &&
    contributions === "sufficient" &&
    (!docsQuality || docsQuality === "valid")
  ) return "approve";

  // Anything not clearly approve or deny → hold for review
  return "continue_review";
}

export type RecomputeResult =
  | { ok: true; changed: boolean; newDecisionType: string; policyDecision: PolicyDecision }
  | { ok: false; error: string };

/**
 * Recomputes derived fields after a source field (e.g. employment_status_declared)
 * has changed.
 *
 * Two-layer approach:
 *   Layer 1 — deriveDecisionType(): eligibility-only → decision_type
 *   Layer 2 — evaluatePolicy(): governance → harm_signal_* fields only
 *
 * Derived fields written: decision_type, harm_signal_level, harm_signal_type,
 *   harm_signal_notes, agent_chat_transcript_excerpt.
 *
 * Historical fields NEVER written: employment_status_declared (written by
 *   updateEmploymentStatus), separation_reason_declared, idv_status,
 *   residency_status, contributions_record_status, employer_report_status,
 *   docs_*.
 *
 * @param context  Optional — the live claimant message and transcript from the
 *   current chat turn. When supplied, these take priority over the stored DB
 *   values for harm-signal evaluation, so old hardship statements do not
 *   persist after circumstances change.
 *
 * Brain/governance recommended_action is NOT stored here.
 */
export async function recomputeDecisionState(
  beneficiaryId: string,
  context?: {
    /** Verbatim message sent by the claimant in this turn */
    claimantMessage?: string;
    /** Full chat transcript excerpt for the current turn */
    transcriptExcerpt?: string;
  },
): Promise<RecomputeResult> {
  // 1. Read the fresh committed row (employment_status_declared already updated)
  const row = await fetchDetailedRow(beneficiaryId);
  if (!row) return { ok: false, error: `Row not found for beneficiary_id=${beneficiaryId}` };

  const prevDecisionType = String(row.decision_type ?? "continue_review");

  // 2. Layer 1 — derive claimant eligibility decision_type from facts only
  const newDecisionType = deriveDecisionType(row);

  // 3. Layer 2 — governance evaluation; produces harm_signal_* only.
  //    decision_type is passed as an input, not derived from its output.
  const policyDecision = await evaluatePolicy({
    decision_context: { decision_type: newDecisionType as "approve" | "deny" | "continue_review" },
    structured_inputs: {
      idv_status:                  row.idv_status                 as string | undefined,
      residency_status:            row.residency_status           as string | undefined,
      employment_status_declared:  row.employment_status_declared as string | undefined,
      contributions_record_status: row.contributions_record_status as string | undefined,
      employer_report_status:      row.employer_report_status     as string | undefined,
      docs_status: {
        docs_requested: toStringArray(row.docs_requested),
        docs_received:  toStringArray(row.docs_received),
        docs_quality:   (row.docs_quality as string | null) ?? "unknown",
      },
    },
    free_text: {
      // Current-turn context takes priority over stored DB values so that
      // harm signals reflect the claimant's latest circumstances. Old
      // hardship statements do not carry forward after circumstances change.
      claimant_message:
        context?.claimantMessage ??
        (row.claimant_message as string | null) ?? "",
      agent_chat_transcript_excerpt:
        context?.transcriptExcerpt ??
        (row.agent_chat_transcript_excerpt as string | null) ?? "",
      caseworker_note: (row.caseworker_note as string | null) ?? "",
    },
  });

  // 4. Build deterministic system-state snapshot for agent_chat_transcript_excerpt
  const systemSummary =
    `[SYSTEM RECOMPUTE ${new Date().toISOString()}] ` +
    `employment_status_declared=${row.employment_status_declared ?? "unknown"} ` +
    `decision_type=${newDecisionType} ` +
    `harm_signal_level=${policyDecision.harm_rights_signals.signal_level}`;

  // 5. Write ONLY derived fields — historical fields are never touched here
  const harmTypes = policyDecision.harm_rights_signals.signal_type;
  const { error } = await (supabaseAdmin as any)
    .schema("app")
    .from("claimant_case_detailed")
    .update({
      decision_type:                newDecisionType,
      harm_signal_level:            policyDecision.harm_rights_signals.signal_level,
      harm_signal_type:             harmTypes,
      harm_signal_notes:            policyDecision.harm_rights_signals.notes,
      agent_chat_transcript_excerpt: systemSummary,
    })
    .eq("beneficiary_id", beneficiaryId);

  if (error) {
    return { ok: false, error: `Derived fields write failed: ${error.message}` };
  }

  return {
    ok: true,
    changed: newDecisionType !== prevDecisionType,
    newDecisionType,
    policyDecision,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// extractAndPersistCaseSignals
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Persists chat-derived case signals to app.claimant_case_detailed BEFORE
 * the MCP payload is built (Step 2.9 in chat/route.ts).
 *
 * Purpose: ensure the Brain always receives its input from the database,
 * not from in-memory effectiveHistory.
 *
 * DOES NOT touch decision_type — that is owned by recomputeDecisionState().
 *
 * Fields always written:
 *   harm_signal_level, harm_signal_type, harm_signal_notes  (from evaluatePolicy)
 *   claimant_message                                         (current message)
 *   agent_chat_transcript_excerpt                            (current-turn summary)
 *
 * Fields conditionally written (only if explicitly claimant-reported):
 *   employer_report_status   ("pending" | "received")
 *   docs_quality             ("missing" | "pending_verification")
 *
 * Fields NEVER written:
 *   decision_type, employment_status_declared,
 *   idv_status, residency_status, contributions_record_status,
 *   docs_requested, docs_received
 */
export async function extractAndPersistCaseSignals(
  beneficiaryId: string,
  currentMessage: string,
  transcriptExcerpt: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await fetchDetailedRow(beneficiaryId);
  if (!row) return { ok: false, error: `Row not found: ${beneficiaryId}` };

  // Use the existing DB decision_type as governance input only — do not rewrite it.
  const existingDecisionType =
    (row.decision_type as "approve" | "deny" | "continue_review" | null)
    ?? "continue_review";

  const policyResult = await evaluatePolicy({
    decision_context: { decision_type: existingDecisionType },
    structured_inputs: {
      idv_status:                  row.idv_status                  as string | undefined,
      residency_status:            row.residency_status            as string | undefined,
      employment_status_declared:  row.employment_status_declared  as string | undefined,
      contributions_record_status: row.contributions_record_status as string | undefined,
      employer_report_status:      row.employer_report_status      as string | undefined,
      docs_status: {
        docs_requested: toStringArray(row.docs_requested),
        docs_received:  toStringArray(row.docs_received),
        docs_quality:   (row.docs_quality as string | null) ?? "unknown",
      },
    },
    free_text: {
      claimant_message:              currentMessage,
      agent_chat_transcript_excerpt: transcriptExcerpt,
      caseworker_note:               (row.caseworker_note as string | null) ?? "",
    },
  });

  const docSignals = extractDocSignalsFromMessage(currentMessage);

  // decision_type is deliberately excluded from this update.
  const updateFields: Record<string, unknown> = {
    harm_signal_level:             policyResult.harm_rights_signals.signal_level,
    harm_signal_type:              policyResult.harm_rights_signals.signal_type,
    harm_signal_notes:             policyResult.harm_rights_signals.notes,
    claimant_message:              currentMessage,
    agent_chat_transcript_excerpt: transcriptExcerpt,
  };

  if (docSignals.employer_report_status !== undefined)
    updateFields.employer_report_status = docSignals.employer_report_status;
  if (docSignals.docs_quality !== undefined)
    updateFields.docs_quality = docSignals.docs_quality;

  const { error } = await (supabaseAdmin as any)
    .schema("app")
    .from("claimant_case_detailed")
    .update(updateFields)
    .eq("beneficiary_id", beneficiaryId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Keyword extraction of doc-state signals from claimant-reported phrasing.
 * Conservative — only writes what the claimant explicitly states.
 * Never fabricates docs_requested or docs_received.
 */
function extractDocSignalsFromMessage(message: string): {
  employer_report_status?: string;
  docs_quality?: string;
} {
  const msg = message.toLowerCase();
  const result: { employer_report_status?: string; docs_quality?: string } = {};

  const mentionsEmployer =
    msg.includes("employer") || msg.includes("severance") || msg.includes("proof of");

  if (mentionsEmployer) {
    if (
      msg.includes("sent") || msg.includes("submitted") ||
      msg.includes("received") || msg.includes("provided")
    ) {
      result.employer_report_status = "received";
    } else if (
      msg.includes("waiting") || msg.includes("pending") ||
      msg.includes("not yet") || msg.includes("haven't") ||
      msg.includes("hasn't") || msg.includes("still")
    ) {
      result.employer_report_status = "pending";
    }
  }

  if (
    msg.includes("don't have") || msg.includes("missing") ||
    msg.includes("no documents") || msg.includes("no docs") ||
    msg.includes("haven't submitted")
  ) {
    result.docs_quality = "missing";
  } else if (
    msg.includes("waiting for") || msg.includes("not all") ||
    msg.includes("some documents") || msg.includes("partial")
  ) {
    result.docs_quality = "pending_verification";
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantProfile
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a comprehensive claimant profile from a single read of
 * app.claimant_case_detailed (flat columns).
 *
 * @param beneficiaryId  The external reference (e.g. "BEN-ATLAS-001")
 */
export async function getClaimantProfile(
  beneficiaryId: string,
): Promise<ClaimantProfile | null> {
  const row = await fetchDetailedRow(beneficiaryId);
  if (!row) return null;

  // docs_* columns may be stored as arrays or comma-separated strings
  const docsRequested = toStringArray(row.docs_requested);
  const docsReceived  = toStringArray(row.docs_received);
  const docsQuality   = (row.docs_quality as string | null) ?? "unknown";

  const hasDocsData =
    docsRequested.length > 0 || docsReceived.length > 0 || docsQuality !== "unknown";

  // harm_signal_type may be stored as an array or a single string
  const harmTypes = toStringArray(row.harm_signal_type);
  const harmLevel = (row.harm_signal_level as string | null) ?? "none";

  return {
    claimantId:               (row.beneficiary_id as string),
    externalRef:              (row.beneficiary_id as string),
    fullName:                 (row.claimant_name as string),
    dateOfBirth:              null, // not stored in claimant_case_detailed
    employmentStatus:         (row.employment_status_declared as string | null) ?? null,
    currentApplicationStatus: (row.decision_type as string | null) ?? null,
    currentApplicationRef:    (row.case_id as string | null) ?? null,
    programs:                 row.benefit_type ? [(row.benefit_type as string)] : [],

    idvStatus:                (row.idv_status as string | undefined) ?? undefined,
    residencyStatus:          (row.residency_status as string | undefined) ?? undefined,
    employerReportStatus:     (row.employer_report_status as string | undefined) ?? undefined,
    contributionRecordStatus: (row.contributions_record_status as string | undefined) ?? undefined,

    docsStatus: hasDocsData
      ? { requested: docsRequested, received: docsReceived, quality: docsQuality }
      : undefined,

    harmSignals: harmLevel !== "none"
      ? {
          level: harmLevel,
          types: harmTypes,
          notes: (row.harm_signal_notes as string | null) ?? "",
        }
      : undefined,

    caseworkerNote: (row.caseworker_note as string | undefined) ?? undefined,
  };
}


// ──────────────────────────────────────────────────────────────────────────────
// getClaimantApplicationStatus
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current application status and programmes for a claimant.
 *
 * @param beneficiaryId  External reference (e.g. "BEN-ATLAS-001")
 */
export async function getClaimantApplicationStatus(
  beneficiaryId: string,
): Promise<ApplicationStatus | null> {
  const row = await fetchDetailedRow(beneficiaryId);
  if (!row) return null;

  return {
    applicationId: (row.case_id as string) ?? beneficiaryId,
    applicationRef: (row.case_id as string) ?? beneficiaryId,
    statusCode: (row.decision_type as string) ?? "pending",
    submittedAt: (row.timestamp_utc as string | null) ?? null,
    programs: row.benefit_type ? [(row.benefit_type as string)] : [],
  };
}


// ──────────────────────────────────────────────────────────────────────────────
// Formatting helpers for building system-prompt context strings
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts an amount in minor currency units to a display string.
 * e.g. 210000 GBP → "£2,100.00"
 */
export function formatMinorAmount(minorUnits: number, currencyCode = "GBP"): string {
  const major = minorUnits / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
  }).format(major);
}

/**
 * Builds a concise grounding context string from a ClaimantProfile,
 * suitable for injection into the chat system prompt.
 */
export function buildProfileContext(profile: ClaimantProfile): string {
  const lines: string[] = [
    `Claimant: ${profile.fullName} (ref: ${profile.externalRef})`,
    `Date of birth: ${profile.dateOfBirth ?? "not yet recorded"}`,
    `Employment status: ${profile.employmentStatus ?? "not yet recorded"}`,
  ];

  if (profile.currentApplicationRef) {
    lines.push(
      `Application: ${profile.currentApplicationRef} — status: ${profile.currentApplicationStatus ?? "unknown"}`,
    );
  }

  if (profile.programs.length > 0) {
    lines.push(`Programmes: ${profile.programs.join(", ")}`);
  }

  // Inject extended intake grounding data
  if (profile.idvStatus) lines.push(`Identity verification: ${profile.idvStatus}`);
  if (profile.residencyStatus) lines.push(`Residency status: ${profile.residencyStatus}`);
  if (profile.employerReportStatus) lines.push(`Employer report: ${profile.employerReportStatus}`);
  if (profile.contributionRecordStatus) lines.push(`Contributions record: ${profile.contributionRecordStatus}`);

  if (profile.docsStatus) {
    const { requested, received, quality } = profile.docsStatus;
    if (requested.length > 0) lines.push(`Documents requested: ${requested.join(", ")}`);
    if (received.length > 0) lines.push(`Documents received: ${received.join(", ")}`);
    lines.push(`Document quality: ${quality}`);
  }

  if (profile.harmSignals && profile.harmSignals.level !== "none") {
    lines.push(`Harm/Rights Signal Level: ${profile.harmSignals.level}`);
    if (profile.harmSignals.types.length > 0) {
      lines.push(`Harm/Rights Signals: ${profile.harmSignals.types.join(", ")}`);
    }
    if (profile.harmSignals.notes) {
      lines.push(`Harm/Rights Notes: ${profile.harmSignals.notes}`);
    }
  }

  if (profile.caseworkerNote) {
    lines.push(`Caseworker Note: ${profile.caseworkerNote}`);
  }

  return lines.join("\n");
}


// ──────────────────────────────────────────────────────────────────────────────
// Internal utilities
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Coerces a DB column value to a string array.
 * Handles: null/undefined → [], PostgreSQL arrays (JS Array), comma-separated string.
 */
function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
