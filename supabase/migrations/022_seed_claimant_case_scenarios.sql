-- Migration 022: Seed 4 demo claimant scenarios into app.claimant_case
--
-- Dollar-quoting ($json$...$json$) is used for each intake_payload value so
-- that apostrophes inside the JSON strings need no escaping.
-- The INSERT is idempotent: ON CONFLICT updates all mutable columns.

INSERT INTO app.claimant_case
  (beneficiary_id, claimant_name, scenario_id, label, description, intake_payload)
VALUES

-- ── BEN-ATLAS-001: Ella Gible — clean_approve ─────────────────────────────
(
  'BEN-ATLAS-001',
  'Ella Gible',
  'clean_approve',
  'Clean Approve',
  'Ella has complete docs, verified identity, and no harm signals. Low-risk auto-approve path.',
  $json${
    "case_id": "DEMO-APPROVE-001",
    "timestamp_utc": "2026-01-02T14:21:00Z",
    "jurisdiction": "EU-MS",
    "benefit_type": "unemployment",
    "decision_context": {
      "decision_type": "approve",
      "payment_due_within_days": 13,
      "case_age_days": 40,
      "channel": "web"
    },
    "structured_inputs": {
      "idv_status": "verified",
      "residency_status": "verified",
      "employment_status_declared": "unemployed",
      "separation_reason_declared": "dismissal",
      "employer_report_status": "received",
      "contributions_record_status": "sufficient",
      "earnings_record_last_30d": "low",
      "income_verification": "partial",
      "other_benefits_overlap_check": "clear",
      "bank_data_access": "consented",
      "docs_status": {
        "docs_requested": ["termination_notice"],
        "docs_received": ["termination_notice"],
        "docs_quality": "valid"
      },
      "engagement_barriers": {
        "language_barrier": "none",
        "digital_access": "good",
        "disability_accommodation_needed": "no"
      },
      "fraud_signals": {
        "identity_duplicate_match": "none",
        "device_or_address_reuse": "none",
        "document_tampering": "none"
      }
    },
    "free_text": {
      "claimant_message": "ok i will upload",
      "agent_chat_transcript_excerpt": "Routine intake completed.",
      "caseworker_note": ""
    },
    "harm_rights_signals": {
      "signal_level": "none",
      "signal_type": [],
      "signal_source": "system",
      "notes": "No hardship, vulnerability, or rights-impact indicators detected."
    }
  }$json$::jsonb
),

-- ── BEN-ATLAS-002: Alex Haitel — alex_escalate_missing_docs ──────────────
(
  'BEN-ATLAS-002',
  'Alex Haitel',
  'alex_escalate_missing_docs',
  'Escalate — Missing Docs / Hardship',
  'Alex reports redundancy and imminent inability to pay rent and groceries. Employer separation certificate is outstanding.',
  $json${
    "case_id": "DEMO-APPROVE-002",
    "timestamp_utc": "2026-01-02T15:05:00Z",
    "jurisdiction": "EU-MS",
    "benefit_type": "unemployment",
    "decision_context": {
      "decision_type": "continue_review",
      "payment_due_within_days": null,
      "case_age_days": 12,
      "channel": "assisted"
    },
    "structured_inputs": {
      "idv_status": "verified",
      "residency_status": "verified",
      "employment_status_declared": "unemployed",
      "separation_reason_declared": "redundancy",
      "employer_report_status": "pending",
      "contributions_record_status": "sufficient",
      "earnings_record_last_30d": "low",
      "income_verification": "verified",
      "other_benefits_overlap_check": "clear",
      "bank_data_access": "consented",
      "docs_status": {
        "docs_requested": ["termination_notice", "employer_separation_certificate"],
        "docs_received": [],
        "docs_quality": "missing"
      },
      "engagement_barriers": {
        "language_barrier": "none",
        "digital_access": "good",
        "disability_accommodation_needed": "no"
      },
      "fraud_signals": {
        "identity_duplicate_match": "none",
        "device_or_address_reuse": "none",
        "document_tampering": "none"
      }
    },
    "free_text": {
      "claimant_message": "I was made redundant and I'm out of money for rent and groceries next week. I can't get my employer separation letter yet.",
      "agent_chat_transcript_excerpt": "Claimant reports redundancy dismissal; IDV and residency verified; contributions sufficient. Employer report not yet received. Required docs outstanding. Claimant reports imminent inability to meet basic living expenses.",
      "caseworker_note": "Escalate for human review: hardship/livelihood risk with incomplete employer documentation."
    },
    "harm_rights_signals": {
      "signal_level": "high",
      "signal_type": ["childcare_dependents", "risk_of_homelessness"],
      "signal_source": "system",
      "notes": "Claimant reports imminent inability to pay for essentials (rent/food). High rights-impact / livelihood risk requires human oversight."
    }
  }$json$::jsonb
),

-- ── BEN-ATLAS-003: Noah Chance — noah_chance_clear_deny ──────────────────
(
  'BEN-ATLAS-003',
  'Noah Chance',
  'noah_chance_clear_deny',
  'Clear Deny',
  'Noah''s fixed-term contract ended; renewal was offered and declined. Contribution history is below statutory minimum.',
  $json${
    "case_id": "DEMO-DENY-003",
    "timestamp_utc": "2026-01-03T09:15:00Z",
    "jurisdiction": "EU-MS",
    "benefit_type": "unemployment",
    "decision_context": {
      "decision_type": "deny",
      "payment_due_within_days": null,
      "case_age_days": 8,
      "channel": "mobile"
    },
    "structured_inputs": {
      "idv_status": "verified",
      "residency_status": "verified",
      "employment_status_declared": "unemployed",
      "separation_reason_declared": "contract_ended",
      "employer_report_status": "received",
      "contributions_record_status": "insufficient",
      "earnings_record_last_30d": "medium",
      "income_verification": "verified",
      "other_benefits_overlap_check": "clear",
      "bank_data_access": "consented",
      "docs_status": {
        "docs_requested": ["employment_history_statement"],
        "docs_received": ["employment_history_statement"],
        "docs_quality": "valid"
      },
      "engagement_barriers": {
        "language_barrier": "none",
        "digital_access": "good",
        "disability_accommodation_needed": "no"
      },
      "fraud_signals": {
        "identity_duplicate_match": "none",
        "device_or_address_reuse": "none",
        "document_tampering": "none"
      }
    },
    "free_text": {
      "claimant_message": "My fixed-term contract ended and I was offered another contract, which I chose not to accept. I have insufficient contribution history.",
      "agent_chat_transcript_excerpt": "Fixed-term contract concluded. Renewal offered and declined. Contribution history below statutory minimum. All documentation verified.",
      "caseworker_note": "Clear statutory ineligibility due to insufficient contribution history. No hardship signals present."
    },
    "harm_rights_signals": {
      "signal_level": "none",
      "signal_type": [],
      "signal_source": "system",
      "notes": "No indicators of livelihood risk, dependents, disability, or fundamental rights impact."
    }
  }$json$::jsonb
),

-- ── BEN-ATLAS-004: Reid Peet Van der Loop — reid_peet_van_der_loop_auto_review
(
  'BEN-ATLAS-004',
  'Reid Peet Van der Loop',
  'reid_peet_van_der_loop_auto_review',
  'Auto Review',
  'Reid left employment voluntarily. Contribution status and recent earnings cannot be confirmed. Employer report outstanding.',
  $json${
    "case_id": "DEMO-REVIEW-004",
    "timestamp_utc": "2026-01-03T10:05:00Z",
    "jurisdiction": "EU-MS",
    "benefit_type": "unemployment",
    "decision_context": {
      "decision_type": "continue_review",
      "payment_due_within_days": null,
      "case_age_days": 6,
      "channel": "mobile"
    },
    "structured_inputs": {
      "idv_status": "verified",
      "residency_status": "verified",
      "employment_status_declared": "unemployed",
      "separation_reason_declared": "quit_with_cause",
      "employer_report_status": "pending",
      "contributions_record_status": "unknown",
      "earnings_record_last_30d": "unknown",
      "income_verification": "partial",
      "other_benefits_overlap_check": "clear",
      "bank_data_access": "consented",
      "docs_status": {
        "docs_requested": [
          "employment_history_statement",
          "separation_statement",
          "final_payslip_or_earnings_record"
        ],
        "docs_received": ["employment_history_statement"],
        "docs_quality": "pending_verification"
      },
      "engagement_barriers": {
        "language_barrier": "none",
        "digital_access": "good",
        "disability_accommodation_needed": "no"
      },
      "fraud_signals": {
        "identity_duplicate_match": "none",
        "device_or_address_reuse": "none",
        "document_tampering": "none"
      }
    },
    "free_text": {
      "claimant_message": "I left my job last month and I'm currently not working. I'm not sure what you need from my employer.",
      "agent_chat_transcript_excerpt": "IDV and residency verified. Claimant reports unemployment after voluntary resignation. Contribution status and recent earnings cannot be confirmed. Employer report not yet received.",
      "caseworker_note": "Route to chatbot for targeted clarification and document collection. Resubmit to MCP Brain after each response."
    },
    "harm_rights_signals": {
      "signal_level": "none",
      "signal_type": [],
      "signal_source": "system",
      "notes": "No indicators of livelihood risk requiring human oversight. Remain in automated review loop."
    }
  }$json$::jsonb
)

ON CONFLICT (beneficiary_id) DO UPDATE SET
  claimant_name  = EXCLUDED.claimant_name,
  scenario_id    = EXCLUDED.scenario_id,
  label          = EXCLUDED.label,
  description    = EXCLUDED.description,
  intake_payload = EXCLUDED.intake_payload,
  updated_at     = now();
