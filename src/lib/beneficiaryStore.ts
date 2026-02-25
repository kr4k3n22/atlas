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

export interface HousingPayment {
  paymentTypeCode: string;
  amountMinor: number;
  currencyCode: string;
  frequencyCode: string;
}

export interface EmployerRecord {
  id: string;
  employerName: string;
  statusCode: string;
  startDate: string | null;
  endDate: string | null;
}

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
  housingPayments: HousingPayment[];
  employerRecords: EmployerRecord[];
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
  reasonDetails: (string | null)[];
}

// Row shapes returned by RPC functions (snake_case from PostgreSQL)
type HousingPaymentRow = {
  payment_type_code: string;
  amount_minor: number;
  currency_code: string;
  frequency_code: string;
};

type EmployerRecordRow = {
  id: string;
  employer_name: string;
  status_code: string;
  start_date: string | null;
  end_date: string | null;
};

type HouseholdMemberRow = {
  claimant_id: string;
  first_name: string;
  last_name: string;
  relationship_to_primary_code: string;
  is_primary: boolean;
};

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
  const { data: claimantRows, error: claimantError } = await supabaseAdmin
    .rpc("get_claimant_by_ref", { p_ref: beneficiaryId });

  if (claimantError) {
    console.error("[beneficiaryStore] Error fetching claimant:", claimantError.message);
    return null;
  }
  const claimant = claimantRows?.[0] ?? null;
  if (!claimant) return null;

  const claimantId: string = claimant.id;
  const fullName = `${claimant.first_name} ${claimant.last_name}`;

  // 2. Most recent employment status
  const { data: empFacts } = await supabaseAdmin
    .rpc("get_claimant_employment", { p_claimant_id: claimantId });

  const employmentStatus =
    empFacts?.[0]?.employment_status_code ?? null;

  // 3. Household + household size
  const householdCtx = await getClaimantHouseholdContext(claimantId);
  const householdSize = householdCtx.members.length || 1;

  // 4. Most recent application
  const { data: applications } = await supabaseAdmin
    .rpc("get_claimant_application", { p_claimant_id: claimantId });

  const latestApp = applications?.[0] ?? null;

  let programs: string[] = [];
  if (latestApp) {
    const { data: appPrograms } = await supabaseAdmin
      .rpc("get_application_programs", { p_application_id: latestApp.id });

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

  // 7. Housing payments
  const { data: housingRows } = await supabaseAdmin
    .rpc("get_claimant_housing_payments", { p_claimant_id: claimantId });

  const housingPayments: HousingPayment[] = (housingRows ?? []).map(
    (r: HousingPaymentRow) => ({
      paymentTypeCode: r.payment_type_code,
      amountMinor: r.amount_minor,
      currencyCode: r.currency_code,
      frequencyCode: r.frequency_code,
    }),
  );

  // 8. Employer records
  const { data: employerRows } = await supabaseAdmin
    .rpc("get_claimant_employer_records", { p_claimant_id: claimantId });

  const employerRecords: EmployerRecord[] = (employerRows ?? []).map(
    (r: EmployerRecordRow) => ({
      id: r.id,
      employerName: r.employer_name,
      statusCode: r.status_code,
      startDate: r.start_date ?? null,
      endDate: r.end_date ?? null,
    }),
  );

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
    housingPayments,
    employerRecords,
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
    .rpc("get_claimant_income_summary", { p_claimant_id: claimantId, p_since: cutoffDate });

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
    .rpc("get_claimant_application", { p_claimant_id: claimantId });

  if (error || !applications?.length) return null;

  const app = applications[0];

  const { data: appPrograms } = await supabaseAdmin
    .rpc("get_application_programs", { p_application_id: app.id });

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
  const { data: householdRows } = await supabaseAdmin
    .rpc("get_claimant_household", { p_claimant_id: claimantId });

  const household = householdRows?.[0] ?? null;
  const householdId = household?.household_id ?? null;

  if (!householdId) {
    return { householdId: null, householdRef: null, postcode: null, town: null, members: [] };
  }

  // Fetch all members
  const { data: memberRows } = await supabaseAdmin
    .rpc("get_claimant_household_members", { p_household_id: householdId });

  const members: HouseholdMember[] = (memberRows as HouseholdMemberRow[] ?? []).map((m) => ({
    claimantId: m.claimant_id,
    fullName: `${m.first_name} ${m.last_name}`,
    relationshipToPrimary: m.relationship_to_primary_code,
    isPrimary: m.is_primary,
  }));

  return {
    householdId,
    householdRef: household.household_ref ?? null,
    postcode: household.postcode ?? null,
    town: household.town ?? null,
    members,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

async function _getPendingDecisions(applicationId: string): Promise<PendingDecision[]> {
  const { data: decisions } = await supabaseAdmin
    .rpc("get_application_decisions", { p_application_id: applicationId });

  if (!decisions?.length) return [];

  type DecisionRow = { id: string; decision_result_code: string; decided_at: string };
  type ReasonRow = { reason_code: string; detail: string | null };
  const results: PendingDecision[] = [];

  for (const dec of decisions as DecisionRow[]) {
    const { data: reasons } = await supabaseAdmin
      .rpc("get_decision_reasons", { p_decision_id: dec.id });

    const reasonRows = (reasons ?? []) as ReasonRow[];
    results.push({
      decisionId: dec.id,
      decisionResultCode: dec.decision_result_code,
      decidedAt: dec.decided_at,
      reasonCodes: reasonRows.map((r) => r.reason_code),
      reasonDetails: reasonRows.map((r) => r.detail ?? null),
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

  if (profile.incomeSummary) {
    const gross = formatMinorAmount(
      profile.incomeSummary.totalGross6mMinor,
      profile.incomeSummary.currencyCode,
    );
    const net = profile.incomeSummary.totalNet6mMinor != null
      ? formatMinorAmount(profile.incomeSummary.totalNet6mMinor, profile.incomeSummary.currencyCode)
      : "not yet recorded";
    lines.push(`Income (last 6 months, gross): ${gross}`);
    lines.push(`Income (last 6 months, net): ${net}`);
    lines.push(`Income periods recorded: ${profile.incomeSummary.periodCount}`);
  } else {
    lines.push("Income (last 6 months): not yet recorded");
  }

  if (profile.employerRecords.length > 0) {
    lines.push("Employer records:");
    for (const emp of profile.employerRecords) {
      const period = emp.startDate
        ? `${emp.startDate} – ${emp.endDate ?? "present"}`
        : "dates not recorded";
      lines.push(`  - ${emp.employerName} (${emp.statusCode}): ${period}`);
    }
  }

  if (profile.housingPayments.length > 0) {
    lines.push("Housing payments:");
    for (const hp of profile.housingPayments) {
      const amount = formatMinorAmount(hp.amountMinor, hp.currencyCode);
      lines.push(`  - ${hp.paymentTypeCode}: ${amount} (${hp.frequencyCode})`);
    }
  } else {
    lines.push("Housing payments: not yet recorded");
  }

  if (profile.pendingDecisions.length > 0) {
    lines.push("Decisions:");
    for (const dec of profile.pendingDecisions) {
      lines.push(`  - ${dec.decisionResultCode} on ${dec.decidedAt.slice(0, 10)}`);
      if (dec.reasonCodes.length > 0) {
        lines.push(`    Reason codes: ${dec.reasonCodes.join(", ")}`);
      }
      const details = dec.reasonDetails.filter(Boolean);
      if (details.length > 0) {
        lines.push(`    Details: ${details.join("; ")}`);
      }
    }
  }

  return lines.join("\n");
}
