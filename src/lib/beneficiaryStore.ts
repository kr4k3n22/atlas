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
