/**
 * beneficiaryStore.ts
 *
 * Queries the PostgreSQL welfare-claims schema to retrieve claimant profile
 * data for grounding the AI chat agent's responses.
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
  incomeSummary: ClaimantIncomeSummary | null;
  pendingDecisions: PendingDecision[];
}

export interface ClaimantIncomeSummary {
  claimantId: string;
  currencyCode: string;
  totalGross6mMinor: number;
  totalNet6mMinor: number | null;
  periodCount: number;
  latestPeriodEnd: string | null;
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

export interface PendingDecision {
  decisionId: string;
  decisionResultCode: string;
  decidedAt: string;
  reasonCodes: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantProfile
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a comprehensive claimant profile by joining claimant, household,
 * employment, income, and application data from the welfare-claims schema.
 *
 * @param beneficiaryId  The external reference (e.g. "BEN-ATLAS-001")
 */
export async function getClaimantProfile(
  beneficiaryId: string,
): Promise<ClaimantProfile | null> {
  // 1. Fetch core claimant row via external_claimant_ref
  const { data: claimant, error: claimantError } = await supabaseAdmin
    .schema("app" as never)
    .from("claimant")
    .select("id, external_claimant_ref, first_name, last_name, date_of_birth")
    .eq("external_claimant_ref", beneficiaryId)
    .maybeSingle();

  if (claimantError) {
    console.error("[beneficiaryStore] Error fetching claimant:", claimantError.message);
    return null;
  }
  if (!claimant) return null;

  const claimantId: string = claimant.id;
  const fullName = `${claimant.first_name} ${claimant.last_name}`;

  // 2. Most recent employment status
  const { data: empFacts } = await supabaseAdmin
    .schema("app" as never)
    .from("employment_fact")
    .select("employment_status_code")
    .eq("claimant_id", claimantId)
    .order("last_updated_at", { ascending: false })
    .limit(1);

  const employmentStatus =
    empFacts?.[0]?.employment_status_code ?? null;

  // 3. Household + household size
  const householdCtx = await getClaimantHouseholdContext(claimantId);
  const householdSize = householdCtx.members.length || 1;

  // 4. Most recent application
  const { data: applications } = await supabaseAdmin
    .schema("app" as never)
    .from("application")
    .select("id, application_ref, status_code, submitted_at")
    .eq("claimant_id", claimantId)
    .order("submitted_at", { ascending: false })
    .limit(1);

  const latestApp = applications?.[0] ?? null;

  let programs: string[] = [];
  if (latestApp) {
    const { data: appPrograms } = await supabaseAdmin
      .schema("app" as never)
      .from("application_program")
      .select("program_type_code")
      .eq("application_id", latestApp.id);

    programs = (appPrograms ?? []).map(
      (p: { program_type_code: string }) => p.program_type_code,
    );
  }

  // 5. Income summary for last 6 months
  const incomeSummary = await getClaimantIncomeSummary(claimantId);

  // 6. Pending decisions
  const pendingDecisions = latestApp
    ? await _getPendingDecisions(latestApp.id)
    : [];

  return {
    claimantId,
    externalRef: claimant.external_claimant_ref,
    fullName,
    dateOfBirth: claimant.date_of_birth ?? null,
    employmentStatus,
    householdSize,
    currentApplicationStatus: latestApp?.status_code ?? null,
    currentApplicationRef: latestApp?.application_ref ?? null,
    programs,
    incomeSummary,
    pendingDecisions,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantIncomeSummary
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Queries earned income facts for the last 6 months for a given claimant.
 *
 * @param claimantId  Internal UUID from app.claimant
 */
export async function getClaimantIncomeSummary(
  claimantId: string,
): Promise<ClaimantIncomeSummary | null> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .schema("app" as never)
    .from("earned_income_period_fact")
    .select("gross_income_minor, net_income_minor, currency_code, period_end")
    .eq("claimant_id", claimantId)
    .gte("period_start", cutoffDate);

  if (error) {
    console.error("[beneficiaryStore] Error fetching income summary:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  type IncomePeriod = {
    gross_income_minor: number;
    net_income_minor: number | null;
    currency_code: string;
    period_end: string;
  };

  const rows = data as IncomePeriod[];
  const totalGross = rows.reduce((sum, r) => sum + (r.gross_income_minor ?? 0), 0);
  const totalNet = rows.every((r) => r.net_income_minor != null)
    ? rows.reduce((sum, r) => sum + (r.net_income_minor ?? 0), 0)
    : null;
  const latestPeriodEnd = rows.reduce<string | null>((max, r) => {
    if (!max) return r.period_end;
    return r.period_end > max ? r.period_end : max;
  }, null);

  return {
    claimantId,
    currencyCode: rows[0].currency_code,
    totalGross6mMinor: totalGross,
    totalNet6mMinor: totalNet,
    periodCount: rows.length,
    latestPeriodEnd,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantApplicationStatus
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current application status and programmes for a claimant.
 *
 * @param claimantId  Internal UUID from app.claimant
 */
export async function getClaimantApplicationStatus(
  claimantId: string,
): Promise<ApplicationStatus | null> {
  const { data: applications, error } = await supabaseAdmin
    .schema("app" as never)
    .from("application")
    .select("id, application_ref, status_code, submitted_at")
    .eq("claimant_id", claimantId)
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (error || !applications?.length) return null;

  const app = applications[0];

  const { data: appPrograms } = await supabaseAdmin
    .schema("app" as never)
    .from("application_program")
    .select("program_type_code")
    .eq("application_id", app.id);

  const programs = (appPrograms ?? []).map(
    (p: { program_type_code: string }) => p.program_type_code,
  );

  return {
    applicationId: app.id,
    applicationRef: app.application_ref,
    statusCode: app.status_code,
    submittedAt: app.submitted_at ?? null,
    programs,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// getClaimantHouseholdContext
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns household composition and dependency info for a claimant.
 *
 * @param claimantId  Internal UUID from app.claimant
 */
export async function getClaimantHouseholdContext(
  claimantId: string,
): Promise<HouseholdContext> {
  // Find the household this claimant belongs to
  const { data: memberships } = await supabaseAdmin
    .schema("app" as never)
    .from("household_membership")
    .select("household_id")
    .eq("claimant_id", claimantId)
    .order("start_date", { ascending: false })
    .limit(1);

  const householdId = memberships?.[0]?.household_id ?? null;

  if (!householdId) {
    return { householdId: null, householdRef: null, postcode: null, town: null, members: [] };
  }

  // Fetch household details
  const { data: household } = await supabaseAdmin
    .schema("app" as never)
    .from("household")
    .select("id, household_ref, postcode, town")
    .eq("id", householdId)
    .maybeSingle();

  // Fetch all members
  const { data: allMemberships } = await supabaseAdmin
    .schema("app" as never)
    .from("household_membership")
    .select("claimant_id, relationship_to_primary_code, is_primary")
    .eq("household_id", householdId)
    .is("end_date", null);

  type MembershipRow = {
    claimant_id: string;
    relationship_to_primary_code: string;
    is_primary: boolean;
  };

  const memberIds = (allMemberships as MembershipRow[] ?? []).map((m) => m.claimant_id);
  let memberDetails: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (memberIds.length > 0) {
    const { data } = await supabaseAdmin
      .schema("app" as never)
      .from("claimant")
      .select("id, first_name, last_name")
      .in("id", memberIds);
    memberDetails = (data ?? []) as typeof memberDetails;
  }

  const members: HouseholdMember[] = (allMemberships as MembershipRow[] ?? []).map((m) => {
    const detail = memberDetails.find((d) => d.id === m.claimant_id);
    return {
      claimantId: m.claimant_id,
      fullName: detail ? `${detail.first_name} ${detail.last_name}` : "Unknown",
      relationshipToPrimary: m.relationship_to_primary_code,
      isPrimary: m.is_primary,
    };
  });

  return {
    householdId,
    householdRef: household?.household_ref ?? null,
    postcode: household?.postcode ?? null,
    town: household?.town ?? null,
    members,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

async function _getPendingDecisions(applicationId: string): Promise<PendingDecision[]> {
  const { data: decisions } = await supabaseAdmin
    .schema("app" as never)
    .from("decision")
    .select("id, decision_result_code, decided_at")
    .eq("application_id", applicationId)
    .order("decided_at", { ascending: false })
    .limit(5);

  if (!decisions?.length) return [];

  type DecisionRow = { id: string; decision_result_code: string; decided_at: string };
  const results: PendingDecision[] = [];

  for (const dec of decisions as DecisionRow[]) {
    const { data: reasons } = await supabaseAdmin
      .schema("app" as never)
      .from("decision_reason")
      .select("reason_code")
      .eq("decision_id", dec.id);

    results.push({
      decisionId: dec.id,
      decisionResultCode: dec.decision_result_code,
      decidedAt: dec.decided_at,
      reasonCodes: (reasons ?? []).map((r: { reason_code: string }) => r.reason_code),
    });
  }

  return results;
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
    `Household size: ${profile.householdSize}`,
    `Employment status: ${profile.employmentStatus ?? "unknown"}`,
  ];

  if (profile.currentApplicationRef) {
    lines.push(
      `Application: ${profile.currentApplicationRef} — status: ${profile.currentApplicationStatus ?? "unknown"}`,
    );
  }

  if (profile.programs.length > 0) {
    lines.push(`Programmes: ${profile.programs.join(", ")}`);
  }

  if (profile.incomeSummary) {
    const gross = formatMinorAmount(
      profile.incomeSummary.totalGross6mMinor,
      profile.incomeSummary.currencyCode,
    );
    lines.push(`Income (last 6 months, gross): ${gross}`);
  }

  if (profile.pendingDecisions.length > 0) {
    const latest = profile.pendingDecisions[0];
    lines.push(
      `Latest decision: ${latest.decisionResultCode} on ${latest.decidedAt.slice(0, 10)}`,
    );
    if (latest.reasonCodes.length > 0) {
      lines.push(`  Reason codes: ${latest.reasonCodes.join(", ")}`);
    }
  }

  return lines.join("\n");
}
