import {
  getPolicyRulesForTool,
  matchRulesAgainstInput,
  computeAggregateRiskScore,
} from "@/lib/policyRulesStore";

export type PolicyDecision = {
  decision: "ALLOW" | "NEEDS_HUMAN" | "BLOCK";
  risk_label: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
  harm_rights_signals: {
    signal_level: "none" | "weak" | "moderate" | "strong";
    signal_type: Array<
      "housing_risk" | "food_insecurity" | "medical_access" | "safety_risk" | "rights_process_concern" | "other"
    >;
    signal_source: "claimant" | "caseworker" | "third_party" | "system";
    notes: string;
  };
  labels: {
    label: "ROUTINE" | "ESCALATE" | "BLOCK";
    recommended_action: "auto_approve" | "request_info" | "escalate_to_human" | "freeze_payment" | "refer_fraud";
    policy_rationale: string;
  };
};

export type PolicyInput = {
  case_id?: string;
  timestamp_utc?: string;
  jurisdiction?: string;
  benefit_type?: string;
  decision_context: {
    decision_type: "approve" | "deny" | "reduce" | "suspend" | "continue_review";
    payment_due_within_days?: number;
    case_age_days?: number;
    channel?: "web" | "phone" | "in_person" | "chat";
  };
  structured_inputs: {
    idv_status?: string;
    residency_status?: string;
    address_stability?: string;

    employment_status_declared?: string;
    separation_reason_declared?: string;
    reason_for_unemployment?: string;

    employer_report_status?: string;
    last_employer_report?: string;

    contributions_record_status?: string;
    contributions_record?: string;

    earnings_record_last_30d?: string;
    recent_earnings_record?: string;

    declared_income?: string;
    income_verification?: string;

    other_benefits_overlap_check?: string;
    bank_data_access?: string;

    docs_status?: {
      docs_requested?: string[];
      docs_received?: string[];
      docs_quality?: string;
    };

    engagement_barriers?: {
      language_barrier?: string;
      digital_access?: string;
      disability_accommodation_needed?: string;
    };

    fraud_signals?: {
      identity_duplicate_match?: string;
      device_or_address_reuse?: string;
      document_tampering?: string;
    };

    claim_history?: string;
  };
  free_text?: {
    claimant_message?: string;
    agent_chat_transcript_excerpt?: string;
    caseworker_note?: string;
  };

  harm_signal_present?: "none" | "weak" | "moderate" | "strong";
  harm_signal_source?: "claimant message" | "call notes" | "third-party" | "system flag";
  ability_to_engage?: "normal" | "limited digital access" | "language barrier" | "disability accommodation needed";
  appeal_or_review_requested?: "yes" | "no";
};

const normalize = (value?: string) =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "") || "";

const normalizeOverlap = (value?: string) => {
  const v = normalize(value);
  if (v === "possible_overlap") return "possible";
  return v;
};

const normalizeResidency = (value?: string) => {
  const v = normalize(value);
  if (v === "not_verified" || v === "notverified") return "not_verified";
  return v;
};

const normalizeBankAccess = (value?: string) => {
  const v = normalize(value);
  if (v === "unavailable_technical") return "unavailable";
  return v;
};

const normalizeDocsQuality = (value?: string) => {
  const v = normalize(value);
  if (v === "not_verified") return "missing";
  return v;
};

const normalizeSignalSource = (value?: string) => {
  const v = normalize(value);
  if (v === "claimant_message") return "claimant";
  if (v === "call_notes") return "caseworker";
  if (v === "third_party") return "third_party";
  if (v === "system_flag") return "system";
  return v || "system";
};

const normalizeAbility = (value?: string) => {
  const v = normalize(value);
  if (v === "limited_digital_access") return "limited_digital_access";
  if (v === "language_barrier") return "language_barrier";
  if (v === "disability_accommodation_needed") return "disability_accommodation_needed";
  return v || "normal";
};

export async function evaluatePolicy(input: PolicyInput): Promise<PolicyDecision> {
  const decisionType = input.decision_context.decision_type;
  const negativeDecision = ["deny", "reduce", "suspend"].includes(decisionType);

  const structured = input.structured_inputs ?? {};
  const freeText = input.free_text ?? {};

  const idvStatus = normalize(structured.idv_status);
  const residencyStatus = normalizeResidency(structured.residency_status);
  const employerReportStatus = normalize(structured.employer_report_status ?? structured.last_employer_report);
  const separationReason = normalize(structured.separation_reason_declared ?? structured.reason_for_unemployment);
  const contributionsStatus = normalize(structured.contributions_record_status ?? structured.contributions_record);
  const earningsStatus = normalize(structured.earnings_record_last_30d ?? structured.recent_earnings_record);
  const incomeVerification = normalize(structured.income_verification);
  const overlapCheck = normalizeOverlap(structured.other_benefits_overlap_check);
  const bankAccess = normalizeBankAccess(structured.bank_data_access);
  const docsStatus = structured.docs_status ?? {};
  const docsQuality = normalizeDocsQuality(docsStatus.docs_quality);
  const docsRequested = docsStatus.docs_requested ?? [];
  const docsReceived = docsStatus.docs_received ?? [];
  const fraudSignals = structured.fraud_signals ?? {};

  const paymentDue = input.decision_context.payment_due_within_days ?? 999;
  const caseAge = input.decision_context.case_age_days ?? 0;
  const deadlineApproaching = paymentDue <= 7 || caseAge >= 21;

  const harmSignalPresent = input.harm_signal_present ?? "none";
  const harmSignalSource = normalizeSignalSource(input.harm_signal_source);
  const abilityToEngage = normalizeAbility(input.ability_to_engage);
  const appealRequested = normalize(input.appeal_or_review_requested) === "yes";

  const engagement = structured.engagement_barriers ?? {};
  const languageBarrier = normalize(engagement.language_barrier);
  const digitalAccess = normalize(engagement.digital_access);
  const disabilityNeeds = normalize(engagement.disability_accommodation_needed);

  const barrierPresent =
    abilityToEngage !== "normal" ||
    languageBarrier === "some" ||
    languageBarrier === "significant" ||
    digitalAccess === "limited" ||
    digitalAccess === "none" ||
    disabilityNeeds === "yes";

  const harmSignal =
    harmSignalPresent !== "none" || barrierPresent || appealRequested;

  const evidenceIncomplete =
    ["partial", "pending", "failed"].includes(idvStatus) ||
    ["pending", "unknown"].includes(residencyStatus) ||
    ["pending", "unknown"].includes(contributionsStatus) ||
    ["pending", "disputed", "not_provided"].includes(employerReportStatus) ||
    ["partial", "missing", "unknown"].includes(incomeVerification) ||
    ["not_consented", "unavailable", "partial"].includes(bankAccess);

  const docsMissing =
    docsRequested.length > docsReceived.length ||
    ["expired", "unreadable", "inconsistent", "missing"].includes(docsQuality);

  const contradictions =
    employerReportStatus === "disputed" || separationReason === "unknown";

  const overlapPossible = overlapCheck === "possible";
  const overlapConfirmed = overlapCheck === "confirmed";

  const fraudConfirmed =
    normalize(fraudSignals.identity_duplicate_match) === "confirmed" ||
    normalize(fraudSignals.device_or_address_reuse) === "confirmed" ||
    normalize(fraudSignals.document_tampering) === "confirmed";

  const confirmedIneligible =
    contributionsStatus === "insufficient" &&
    (residencyStatus === "not_verified" || idvStatus === "failed");

  let label: "ROUTINE" | "ESCALATE" | "BLOCK";

  if ((fraudConfirmed || overlapConfirmed) && !harmSignal && !barrierPresent) {
    label = "BLOCK";
  } else if (confirmedIneligible && !harmSignal && !barrierPresent) {
    label = "BLOCK";
  } else if (negativeDecision && (evidenceIncomplete || contradictions || harmSignal || barrierPresent)) {
    label = "ESCALATE";
  } else if (overlapPossible) {
    label = "ESCALATE";
  } else if (contributionsStatus === "pending" && deadlineApproaching) {
    label = "ESCALATE";
  } else if (employerReportStatus === "disputed") {
    label = "ESCALATE";
  } else if (harmSignal || barrierPresent) {
    label = "ESCALATE";
  } else {
    label = "ROUTINE";
  }

  // Phase 3: Load applicable policy rules from database and compute risk score
  const toolName = `benefit_${decisionType}`;
  let risk_score = 20;
  let risk_rationale = "Routine case with verified evidence and no harm/rights indicators.";
  let policy_refs = ["POLICY-LOW-RISK-001"];

  try {
    // Load rules for this tool
    const allRules = await getPolicyRulesForTool(toolName);
    
    // Match rules against current input
    const matchedRules = matchRulesAgainstInput(allRules, {
      decision_context: input.decision_context,
      structured_inputs: input.structured_inputs,
      harm_signal_present: harmSignalPresent,
      appeal_or_review_requested: input.appeal_or_review_requested,
      ability_to_engage: abilityToEngage,
      fraud_signals: fraudSignals,
      docs_status: docsStatus,
      docs_quality: docsQuality,
      idv_status: idvStatus,
    });

    // Compute aggregate risk score from matched rules
    if (matchedRules.length > 0) {
      const ruleResult = computeAggregateRiskScore(matchedRules, {
        decision_context: input.decision_context,
        structured_inputs: input.structured_inputs,
        fraud_signals: fraudSignals,
        harm_signal_present: harmSignalPresent,
        docs_quality: docsQuality,
        idv_status: idvStatus,
      });
      risk_score = ruleResult.score;
      risk_rationale = ruleResult.rationale;
      policy_refs = ruleResult.policy_refs;
    }
  } catch (error) {
    console.error("Error loading policy rules, falling back to heuristic:", error);
    // Fallback to original heuristic if database query fails
    risk_score =
      label === "BLOCK"
        ? Math.min(98, 90 + (fraudConfirmed ? 6 : 0))
        : label === "ESCALATE"
          ? 70 + (harmSignalPresent === "strong" ? 10 : harmSignalPresent === "moderate" ? 6 : harmSignalPresent === "weak" ? 3 : 0)
          : 20;

    policy_refs =
      label === "BLOCK"
        ? ["POLICY-INELIGIBLE-004", "POLICY-FRAUD-005"]
        : label === "ESCALATE"
          ? ["POLICY-HARM-RIGHTS-001", "POLICY-OVERSIGHT-002"]
          : ["POLICY-LOW-RISK-001"];

    risk_rationale =
      label === "BLOCK"
        ? "Confirmed ineligibility or verified fraud with no harm/rights flags."
        : label === "ESCALATE"
          ? "Human oversight required due to harm/rights risk or incomplete/contradictory evidence."
          : "Routine case with verified evidence and no harm/rights indicators.";
  }

  const recommended_action =
    label === "BLOCK"
      ? fraudConfirmed || overlapConfirmed
        ? "refer_fraud"
        : "freeze_payment"
      : label === "ESCALATE"
        ? "escalate_to_human"
        : docsMissing || decisionType === "continue_review" || evidenceIncomplete
          ? "request_info"
          : "auto_approve";

  const policy_rationale =
    label === "BLOCK"
      ? "Confirmed ineligibility or verified fraud with no harm/rights flags."
      : label === "ESCALATE"
        ? "Human oversight required due to harm/rights risk or incomplete/contradictory evidence."
        : "Routine case with verified evidence and no harm/rights indicators.";

  const signal_level =
    harmSignalPresent !== "none"
      ? harmSignalPresent
      : barrierPresent || appealRequested
        ? "weak"
        : "none";

  const notesText = `${freeText.claimant_message ?? ""} ${freeText.caseworker_note ?? ""}`.toLowerCase();
  const signal_type: Array<
    "housing_risk" | "food_insecurity" | "medical_access" | "safety_risk" | "rights_process_concern" | "other"
  > = [];

  if (notesText.includes("rent") || notesText.includes("evict") || notesText.includes("housing")) {
    signal_type.push("housing_risk");
  }
  if (notesText.includes("food") || notesText.includes("hungry")) {
    signal_type.push("food_insecurity");
  }
  if (notesText.includes("medical") || notesText.includes("medicine")) {
    signal_type.push("medical_access");
  }
  if (notesText.includes("unsafe") || notesText.includes("violence")) {
    signal_type.push("safety_risk");
  }
  if (appealRequested) {
    signal_type.push("rights_process_concern");
  }
  if (signal_level !== "none" && signal_type.length === 0) {
    signal_type.push("other");
  }

  return {
    decision: label === "ROUTINE" ? "ALLOW" : label === "ESCALATE" ? "NEEDS_HUMAN" : "BLOCK",
    risk_label: label,
    risk_score,
    risk_rationale,
    policy_refs,
    harm_rights_signals: {
      signal_level,
      signal_type,
      signal_source: harmSignalSource as "claimant" | "caseworker" | "third_party" | "system",
      notes:
        signal_level === "none"
          ? "No harm/rights signals detected."
          : "Harm/rights signal detected or inferred from engagement barriers or appeal request.",
    },
    labels: {
      label,
      recommended_action,
      policy_rationale,
    },
  };
}
