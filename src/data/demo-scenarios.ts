/**
 * demo-scenarios.ts
 *
 * Welfare-specific demo fixtures for the ATLAS chatbot.
 *
 * Each scenario is a self-contained IntakePayload that exercises a different
 * decision path through the MCP Gateway / policy engine:
 *
 *   1. clean_approve   — Complete docs, no harm signals, low risk
 *   2. continue_review — Pending evidence, partial docs
 *   3. escalation      — Harm signals detected in transcript
 *   4. mismatch_block  — Contradictory evidence / fraud signals
 */

import type { IntakePayload } from "@/lib/intakePayloadBuilder";

export type DemoScenario = {
  id: string;
  claimant_name: string;
  label: string;
  description: string;
  payload: IntakePayload;
};

const BASE_TIMESTAMP = "2026-02-23T12:00:00.000Z";

// ─── 1. Clean approve path ────────────────────────────────────────────────────

const cleanApprove: DemoScenario = {
  id: "clean_approve",
  claimant_name: "Ella Gible",
  label: "Clean Approve",
  description:
    "Ella has complete docs, verified identity, and no harm signals. Low-risk auto-approve path.",
  payload: {
    case_id: "DEMO-APPROVE-001",
    timestamp_utc: "2026-01-02T14:21:00Z",
    jurisdiction: "EU-MS",
    benefit_type: "unemployment",
    decision_context: {
      decision_type: "approve",
      payment_due_within_days: 13,
      case_age_days: 40,
      channel: "web",
    },
    structured_inputs: {
      idv_status: "verified",
      residency_status: "verified",
      employment_status_declared: "unemployed",
      separation_reason_declared: "dismissal",
      employer_report_status: "received",
      contributions_record_status: "sufficient",
      earnings_record_last_30d: "low",
      income_verification: "partial",
      other_benefits_overlap_check: "clear",
      bank_data_access: "consented",
      docs_status: {
        docs_requested: ["termination_notice"],
        docs_received: ["termination_notice"],
        docs_quality: "valid",
      },
      engagement_barriers: {
        language_barrier: "none",
        digital_access: "good",
        disability_accommodation_needed: "no",
      },
      fraud_signals: {
        identity_duplicate_match: "none",
        device_or_address_reuse: "none",
        document_tampering: "none",
      },
    },
    free_text: {
      claimant_message: "ok i will upload",
      agent_chat_transcript_excerpt: "Routine intake completed.",
      caseworker_note: "",
    },
    harm_rights_signals: {
      signal_level: "none",
      signal_type: [],
      signal_source: "system",
      notes:
        "No hardship, vulnerability, or rights-impact indicators detected.",
    },
  },
};

// ─── 2. Continue-review path ──────────────────────────────────────────────────
const AutoReview: DemoScenario = {
  id: "reid_peet_van_der_loop_auto_review",
  claimant_name: "Reid Peet Van der Loop",
  label: "Auto-Review (Loop: MCP ↔ Chatbot for Missing Info)",
  description:
    "Claimant appears potentially eligible but key statutory elements cannot be confirmed from available inputs. No harm or rights-impact signals are present. Case remains in an automated review loop where the chatbot gathers missing information and resubmits to the MCP Brain until eligibility can be determined (approve/deny) or escalated if risk signals emerge.",
  payload: {
    case_id: "DEMO-REVIEW-004",
    timestamp_utc: "2026-01-03T10:05:00Z",
    jurisdiction: "EU-MS",
    benefit_type: "unemployment",
    decision_context: {
      decision_type: "continue_review",
      payment_due_within_days: null,
      case_age_days: 6,
      channel: "mobile",
    },
    structured_inputs: {
      idv_status: "verified",
      residency_status: "verified",
      employment_status_declared: "unemployed",
      separation_reason_declared: "quit_with_cause",
      employer_report_status: "pending",
      contributions_record_status: "unknown",
      earnings_record_last_30d: "unknown",
      income_verification: "partial",
      other_benefits_overlap_check: "clear",
      bank_data_access: "consented",
      docs_status: {
        docs_requested: [
          "employment_history_statement",
          "separation_statement",
          "final_payslip_or_earnings_record",
        ],
        docs_received: ["employment_history_statement"],
        docs_quality: "pending_verification",
      },
      engagement_barriers: {
        language_barrier: "none",
        digital_access: "good",
        disability_accommodation_needed: "no",
      },
      fraud_signals: {
        identity_duplicate_match: "none",
        device_or_address_reuse: "none",
        document_tampering: "none",
      },
    },
    free_text: {
      claimant_message:
        "I left my job last month and I’m currently not working. I’m not sure what you need from my employer, and I can upload whatever documents you require.",
      agent_chat_transcript_excerpt:
        "IDV and residency verified. Claimant reports unemployment after voluntary resignation. Contribution status and recent earnings cannot be confirmed from provided records. Employer report not yet received. Partial income verification; additional documents required to determine eligibility.",
      caseworker_note:
        "Do not escalate. Route to chatbot for targeted clarification and document collection. Resubmit to MCP Brain after each response until statutory eligibility can be determined.",
    },
    harm_rights_signals: {
      signal_level: "none",
      signal_type: [],
      signal_source: "system",
      notes:
        "No indicators of livelihood risk, dependents, disability, coercion, or other fundamental-rights impact requiring human oversight at this time. Remain in automated review loop unless risk signals emerge.",
    },
  },
};


// ─── 3. Escalation path (harm signals) ───────────────────────────────────────

const EscalateReview: DemoScenario = {
  id: "alex_escalate_missing_docs",
  claimant_name: "Alex Haitel",
  label: "Escalate — Missing Employer Docs + Livelihood Risk",
  description:
    "Alex declared unemployment after redundancy but lacks required documentation and the employer report is not received. Despite otherwise clear eligibility signals, imminent livelihood risk requires mandatory human escalation under Article 14 oversight.",
  payload: {
    case_id: "DEMO-APPROVE-002",
    timestamp_utc: "2026-01-02T15:05:00Z",
    jurisdiction: "EU-MS",
    benefit_type: "unemployment",
    decision_context: {
      decision_type: "continue_review",
      payment_due_within_days: null,
      case_age_days: 12,
      channel: "assisted",
    },
    structured_inputs: {
      idv_status: "verified",
      residency_status: "verified",
      employment_status_declared: "unemployed",
      separation_reason_declared: "redundancy",
      employer_report_status: "pending",
      contributions_record_status: "sufficient",
      earnings_record_last_30d: "low",
      income_verification: "verified",
      other_benefits_overlap_check: "clear",
      bank_data_access: "consented",
      docs_status: {
        docs_requested: [
          "termination_notice",
          "employer_separation_certificate",
        ],
        docs_received: [],
        docs_quality: "missing",
      },
      engagement_barriers: {
        language_barrier: "none",
        digital_access: "good",
        disability_accommodation_needed: "no",
      },
      fraud_signals: {
        identity_duplicate_match: "none",
        device_or_address_reuse: "none",
        document_tampering: "none",
      },
    },
    free_text: {
      claimant_message:
        "I was made redundant and I’m out of money for rent and groceries next week. I can’t get my employer separation letter yet.",
      agent_chat_transcript_excerpt:
        "Claimant reports redundancy dismissal; IDV and residency verified; contributions sufficient. Employer report not yet received. Required docs outstanding. Claimant reports imminent inability to meet basic living expenses.",
      caseworker_note:
        "Escalate for human review: hardship/livelihood risk with incomplete employer documentation.",
    },
    harm_rights_signals: {
      signal_level: "high",
      signal_type: ["childcare_dependents", "risk_of_homelessness"],
      signal_source: "system",
      notes:
        "Claimant reports imminent inability to pay for essentials (rent/food). High rights-impact / livelihood risk requires human oversight despite otherwise clear eligibility signals.",
    },
  },
};

// ─── 4. Clear Deny  ────────────────────────────────

const ClearDeny: DemoScenario = {
id: "noah_chance_clear_deny",
claimant_name: "Noah Chance",
label: "Ineligible — Insufficient Contributions (No Harm Signals)",
description:
"Claimant’s fixed-term contract ended and a renewal was declined. Contribution history is insufficient to qualify for unemployment benefits. No hardship or rights-impact signals are present. Clear statutory ineligibility requires denial without human escalation.",
payload: {
case_id: "DEMO-DENY-003",
timestamp_utc: "2026-01-03T09:15:00Z",
jurisdiction: "EU-MS",
benefit_type: "unemployment",
decision_context: {
decision_type: "deny",
payment_due_within_days: null,
case_age_days: 8,
channel: "mobile",
},
structured_inputs: {
idv_status: "verified",
residency_status: "verified",
employment_status_declared: "unemployed",
separation_reason_declared: "contract_ended",
employer_report_status: "received",
contributions_record_status: "insufficient",
earnings_record_last_30d: "medium",
income_verification: "verified",
other_benefits_overlap_check: "clear",
bank_data_access: "consented",
docs_status: {
docs_requested: ["employment_history_statement"],
docs_received: ["employment_history_statement"],
docs_quality: "valid",
},
engagement_barriers: {
language_barrier: "none",
digital_access: "good",
disability_accommodation_needed: "no",
},
fraud_signals: {
identity_duplicate_match: "none",
device_or_address_reuse: "none",
document_tampering: "none",
},
},
free_text: {
claimant_message:
"My fixed-term contract ended and I was offered another contract, which I chose not to accept. I have insufficient contribution history. I am financially stable and not experiencing hardship. I am only seeking clarification on eligibility.",
agent_chat_transcript_excerpt:
"Fixed-term contract concluded. Renewal was offered and declined. Contribution history below statutory minimum threshold. All documentation verified.",
caseworker_note:
"Clear statutory ineligibility due to insufficient contribution history. No hardship signals present.",
},
harm_rights_signals: {
signal_level: "none",
signal_type: [],
signal_source: "system",
notes:
"No indicators of livelihood risk, dependents, disability, or fundamental rights impact requiring human oversight.",
},
},
};


// ─── Exported collection ─────────────────────────────────────────────────────

export const DEMO_SCENARIOS: DemoScenario[] = [
  cleanApprove,
  AutoReview,
  EscalateReview,
  ClearDeny,
];

export default DEMO_SCENARIOS;
