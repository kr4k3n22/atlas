/**
 * beneficiaryStore.ts
 *
 * Queries the PostgreSQL welfare-claims schema to retrieve claimant profile
 * data for grounding the AI chat agent's responses.
 *
 * Data source: app.claimant_case (via get_claimant_profile_summary and
 * get_claimant_intake_payload RPCs).
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
  householdSize: number;
  currentApplicationStatus: string | null;
  currentApplicationRef: string | null;
  programs: string[];
}


export interface ApplicationStatus {
  applicationId: string;
  applicationRef: string;
  statusCode: string;
  submittedAt: string | null;
  programs: string[];
}

export interface HouseholdContext {
  householdId: string | null;
  householdRef: string | null;
  postcode: string | null;
  town: string | null;
  members: HouseholdMember[];
}

export interface HouseholdMember {
  claimantId: string;
  fullName: string;
  relationshipToPrimary: string;
  isPrimary: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantProfile
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a comprehensive claimant profile from app.claimant_case via
 * get_claimant_profile_summary and get_claimant_intake_payload RPCs.
 *
 * @param beneficiaryId  The external reference (e.g. "BEN-ATLAS-001")
 */
export async function getClaimantProfile(
  beneficiaryId: string,
): Promise<ClaimantProfile | null> {
  const [summaryResult, payloadResult] = await Promise.all([
    supabaseAdmin.rpc("get_claimant_profile_summary", { p_beneficiary_id: beneficiaryId }),
    supabaseAdmin.rpc("get_claimant_intake_payload", { p_beneficiary_id: beneficiaryId }),
  ]);

  const summary = summaryResult.data?.[0] ?? null;
  if (!summary) return null;

  const payload = (payloadResult.data ?? null) as Record<string, unknown> | null;
  const structuredInputs = (payload?.structured_inputs ?? {}) as Record<string, unknown>;

  const employmentStatus =
    (structuredInputs.employment_status_declared as string | undefined) ?? null;
  const dateOfBirth =
    (structuredInputs.dob as string | undefined) ??
    (structuredInputs.date_of_birth as string | undefined) ??
    null;

  return {
    claimantId: summary.beneficiary_id as string,
    externalRef: summary.beneficiary_id as string,
    fullName: summary.claimant_name as string,
    dateOfBirth,
    employmentStatus,
    householdSize: 1,
    currentApplicationStatus: (summary.decision_type as string | null) ?? null,
    currentApplicationRef: (summary.case_id as string | null) ?? null,
    programs: summary.benefit_type ? [summary.benefit_type as string] : [],
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
  const { data, error } = await supabaseAdmin
    .rpc("get_claimant_profile_summary", { p_beneficiary_id: beneficiaryId });

  if (error || !data?.length) return null;

  const summary = data[0];

  return {
    applicationId: summary.case_id as string,
    applicationRef: summary.case_id as string,
    statusCode: (summary.decision_type as string) ?? "pending",
    submittedAt: (summary.timestamp_utc as string | null) ?? null,
    programs: summary.benefit_type ? [summary.benefit_type as string] : [],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantHouseholdContext
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns household composition and dependency info for a claimant.
 * Reads from the intake_payload JSONB stored in app.claimant_case.
 *
 * @param beneficiaryId  External reference (e.g. "BEN-ATLAS-001")
 */
export async function getClaimantHouseholdContext(
  beneficiaryId: string,
): Promise<HouseholdContext> {
  const empty: HouseholdContext = {
    householdId: null,
    householdRef: null,
    postcode: null,
    town: null,
    members: [],
  };

  const { data: payload, error } = await supabaseAdmin
    .rpc("get_claimant_intake_payload", { p_beneficiary_id: beneficiaryId });

  if (error || !payload) return empty;

  const p = payload as Record<string, unknown>;
  const household = (p.household ?? {}) as Record<string, unknown>;
  const rawMembers = Array.isArray(household.members) ? household.members : [];

  const members: HouseholdMember[] = rawMembers.map((m: Record<string, unknown>) => ({
    claimantId: (m.claimant_id as string | undefined) ?? "",
    fullName: (m.full_name as string | undefined) ?? "",
    relationshipToPrimary: (m.relationship_to_primary as string | undefined) ?? "primary",
    isPrimary: (m.is_primary as boolean | undefined) ?? false,
  }));

  return {
    householdId: (household.household_id as string | null) ?? null,
    householdRef: (household.household_ref as string | null) ?? null,
    postcode: (household.postcode as string | null) ?? null,
    town: (household.town as string | null) ?? null,
    members,
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
    `Household size: ${profile.householdSize}`,
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

  return lines.join("\n");
}
