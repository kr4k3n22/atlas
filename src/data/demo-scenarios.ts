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
  label: string;
  description: string;
  payload: IntakePayload;
};

const BASE_TIMESTAMP = "2026-02-23T12:00:00.000Z";

// ─── 1. Clean approve path ────────────────────────────────────────────────────

const cleanApprove: DemoScenario = {
  id: "clean_approve",
  label: "Clean Approve",
  description: "Alex has complete docs, verified identity, and no harm signals. Low-risk auto-approve path.",
  payload: {
    case_id: "DEMO-APPROVE-001",
    timestamp_utc: BASE_TIMESTAMP,
    jurisdiction: "GB",
    benefit_type: "universal_credit",
    decision_context: {
      decision_type: "approve",
      channel: "assisted",
    },
    structured_inputs: {
      idv_status: "verified",
      residency_status: "verified",
      docs_status: { docs_requested: [], docs_received: [], docs_quality: "valid" },
      engagement_barriers: { language_barrier: "none", disability_accommodation_needed: "no" },
      fraud_signals: { identity_duplicate_match: "none", document_tampering: "none" },
    },
    free_text: {
      claimant_message: "I'd like to confirm my Universal Credit payment extension.",
      agent_chat_transcript_excerpt:
        "[user]: I'd like to confirm my Universal Credit payment extension.\n" +
        "[assistant]: I can see your account is verified and documents are in order. Let me process that for you.",
    },
  },
};

// ─── 2. Continue-review path ──────────────────────────────────────────────────

const continueReview: DemoScenario = {
  id: "continue_review",
  label: "Continue Review",
  description: "Alex has pending evidence and partial docs. Case requires further information before a decision.",
  payload: {
    case_id: "DEMO-REVIEW-001",
    timestamp_utc: BASE_TIMESTAMP,
    jurisdiction: "GB",
    benefit_type: "universal_credit",
    decision_context: {
      decision_type: "continue_review",
      channel: "assisted",
    },
    structured_inputs: {
      idv_status: "pending",
      residency_status: "pending",
      docs_status: { docs_requested: ["supporting_documents"], docs_received: [], docs_quality: "missing" },
      engagement_barriers: { language_barrier: "none", disability_accommodation_needed: "no" },
      fraud_signals: { identity_duplicate_match: "none", document_tampering: "none" },
    },
    free_text: {
      claimant_message: "Can you check the status of my claim? I submitted documents last week.",
      agent_chat_transcript_excerpt:
        "[user]: Can you check the status of my claim? I submitted documents last week.\n" +
        "[assistant]: I can see your case is currently under review. Some documents are still being verified.",
    },
  },
};

// ─── 3. Escalation path (harm signals) ───────────────────────────────────────

const escalation: DemoScenario = {
  id: "escalation",
  label: "Escalation — Harm Signals",
  description: "Alex's transcript contains housing and food insecurity signals. Case is escalated for human oversight.",
  payload: {
    case_id: "DEMO-ESCALATE-001",
    timestamp_utc: BASE_TIMESTAMP,
    jurisdiction: "GB",
    benefit_type: "housing_benefit",
    decision_context: {
      decision_type: "continue_review",
      channel: "assisted",
    },
    structured_inputs: {
      idv_status: "verified",
      residency_status: "verified",
      docs_status: { docs_requested: ["supporting_documents"], docs_received: [], docs_quality: "missing" },
      engagement_barriers: { language_barrier: "none", disability_accommodation_needed: "no" },
      fraud_signals: { identity_duplicate_match: "none", document_tampering: "none" },
    },
    free_text: {
      claimant_message:
        "I'm really worried — I might be evicted if my housing benefit doesn't come through. " +
        "We're also struggling to afford food for the children.",
      agent_chat_transcript_excerpt:
        "[user]: I'm really worried — I might be evicted if my housing benefit doesn't come through. " +
        "We're also struggling to afford food for the children.\n" +
        "[assistant]: I understand your situation is urgent. I'm escalating this to a case officer immediately.",
    },
  },
};

// ─── 4. Mismatch / block path (fraud signals) ────────────────────────────────

const mismatchBlock: DemoScenario = {
  id: "mismatch_block",
  label: "Mismatch / Block",
  description: "Contradictory evidence and fraud signals detected. Case is blocked pending investigation.",
  payload: {
    case_id: "DEMO-BLOCK-001",
    timestamp_utc: BASE_TIMESTAMP,
    jurisdiction: "GB",
    benefit_type: "universal_credit",
    decision_context: {
      decision_type: "deny",
      channel: "assisted",
    },
    structured_inputs: {
      idv_status: "failed",
      residency_status: "not_verified",
      docs_status: { docs_requested: ["supporting_documents"], docs_received: [], docs_quality: "invalid" },
      engagement_barriers: { language_barrier: "none", disability_accommodation_needed: "no" },
      fraud_signals: { identity_duplicate_match: "identity_duplicate_match", document_tampering: "document_tampering" },
    },
    free_text: {
      claimant_message: "I want to update my bank details and increase my payment amount.",
      agent_chat_transcript_excerpt:
        "[user]: I want to update my bank details and increase my payment amount.\n" +
        "[assistant]: I'm unable to process this request. There are discrepancies in your account that need to be reviewed.",
    },
  },
};

// ─── Exported collection ─────────────────────────────────────────────────────

export const DEMO_SCENARIOS: DemoScenario[] = [
  cleanApprove,
  continueReview,
  escalation,
  mismatchBlock,
];

export default DEMO_SCENARIOS;
