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
  // New source of truth: app.claimant_case (via RPCs created in 020/021/022 migrations)
  // We fetch:
  //  - profile summary (common UI fields + decision_context parsing)
  //  - full intake payload (for structured_inputs grounding)
  const [{ data: summaryRows, error: summaryError }, { data: intakePayload, error: payloadError }] =
    await Promise.all([
      supabaseAdmin.rpc("get_claimant_profile_summary", { p_beneficiary_id: beneficiaryId }),
      supabaseAdmin.rpc("get_claimant_intake_payload", { p_beneficiary_id: beneficiaryId }),
    ]);

  if (summaryError) {
    console.error("[beneficiaryStore] Error fetching claimant summary:", summaryError.message);
    return null;
  }
  if (payloadError) {
    console.error("[beneficiaryStore] Error fetching claimant intake payload:", payloadError.message);
    return null;
  }

  const summary = summaryRows?.[0] ?? null;
  if (!summary) return null;

  // Best-effort extraction from intake_payload (schema-aligned with your training data)
  const payload = (intakePayload ?? null) as any;
  const structured = payload?.structured_inputs ?? null;

  const employmentStatus =
    structured?.employment_status_declared ??
    structured?.employment_status ??
    null;

  const dateOfBirth =
    structured?.dob ??
    structured?.date_of_birth ??
    null;

  const householdSize =
    structured?.household_size ??
    structured?.dependants_count ??
    structured?.dependents_count ??
    1;

  // Preserve the original ClaimantProfile shape for downstream callers, but populate from the new payload.
  // claimantId now maps to beneficiaryId (there is no separate claimant PK in the consolidated table).
  return {
    claimantId: summary.beneficiary_id,
    externalRef: summary.beneficiary_id,
    fullName: summary.claimant_name,
    dateOfBirth,
    employmentStatus,
    householdSize: Number.isFinite(Number(householdSize)) ? Number(householdSize) : 1,

    // Map "application" concepts onto the case payload
    currentApplicationStatus: summary.decision_type ?? null,
    currentApplicationRef: summary.case_id ?? null,
    programs: summary.benefit_type ? [summary.benefit_type] : [],

    // These were formerly pulled from normalized tables; keep empty unless you later embed them in intake_payload.
    incomeSummary: null,
    pendingDecisions: [],
    housingPayments: [],
    employerRecords: [],
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
  // New consolidated schema does not maintain a separate income ledger in SQL (unless you add it).
  // We return null to preserve backwards compatibility with callers that optionally display income context.
  // If you later embed income periods in intake_payload.structured_inputs, you can compute a summary here.
  void claimantId;
  return null;
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
  // Under the consolidated claimant_case model, "application" state maps to the case decision_context.
  // Treat claimantId as beneficiaryId.
  const { data: rows, error } = await supabaseAdmin.rpc("get_claimant_profile_summary", {
    p_beneficiary_id: claimantId,
  });

  if (error || !rows?.length) return null;

  const r: any = rows[0];
  return {
    applicationId: r.case_id ?? r.beneficiary_id,
    applicationRef: r.case_id ?? null,
    statusCode: r.decision_type ?? null,
    submittedAt: r.timestamp_utc ?? null,
    programs: r.benefit_type ? [r.benefit_type] : [],
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
  // Consolidated schema: household details (if any) should come from intake_payload.structured_inputs.
  // Treat claimantId as beneficiaryId.
  const { data: payload, error } = await supabaseAdmin.rpc("get_claimant_intake_payload", {
    p_beneficiary_id: claimantId,
  });

  if (error || !payload) {
    return { householdId: null, householdRef: null, postcode: null, town: null, members: [] };
  }

  const structured: any = (payload as any)?.structured_inputs ?? null;

  const postcode = structured?.address?.postcode ?? structured?.postcode ?? null;
  const town = structured?.address?.town ?? structured?.town ?? null;

  // If you include household members in payload, map them; otherwise default to single-member household.
  const membersRaw = structured?.household_members ?? structured?.household?.members ?? null;

  const members: HouseholdMember[] = Array.isArray(membersRaw)
    ? membersRaw.map((m: any, idx: number) => ({
        claimantId: m.claimant_id ?? m.id ?? `${claimantId}::member_${idx + 1}`,
        fullName: m.full_name ?? m.name ?? null,
        relationship: m.relationship ?? null,
        dateOfBirth: m.date_of_birth ?? m.dob ?? null,
      }))
    : [
        {
          claimantId,
          fullName: (structured?.claimant_name as string) ?? null,
          relationship: "self",
          dateOfBirth: structured?.dob ?? structured?.date_of_birth ?? null,
        },
      ];

  return {
    householdId: structured?.household_id ?? null,
    householdRef: structured?.household_ref ?? null,
    postcode,
    town,
    members,
  };
}


// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────


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
