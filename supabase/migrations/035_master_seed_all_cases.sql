-- Migration 035: Master Seed for All Demo Cases
-- This script ensures all demo users (Ella, Alex, Noah, Reid) are properly
-- mapped to their beneficiary IDs and that their case data is present
-- for AI grounding.
BEGIN;
-- 1. Metadata Alignment (auth.users)
-- Ensures the chatbot knows which beneficiary ID belongs to each user.
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-001"}'::jsonb
WHERE email = 'ella_gible@yahoo.com';
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-002"}'::jsonb
WHERE email = 'alex_haitel@gmail.com';
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-003"}'::jsonb
WHERE email = 'noah_chance@gmail.com';
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-004"}'::jsonb
WHERE email = 'reid_peet_van_der_loop@vanderloop.com';
-- 2. Case Seeding (app.claimant_case)
-- Ella Gible (BEN-ATLAS-001) - Clean Approve
INSERT INTO app.claimant_case (
    beneficiary_id,
    claimant_name,
    scenario_id,
    label,
    description,
    intake_payload
  )
VALUES (
    'BEN-ATLAS-001',
    'Ella Gible',
    'clean_approve',
    'Clean Approve',
    'Ella has complete docs, verified identity, and no harm signals. Low-risk auto-approve path.',
    jsonb_build_object(
      'case_id',
      'DEMO-APPROVE-001',
      'timestamp_utc',
      '2026-01-02T14:21:00Z',
      'jurisdiction',
      'EU-MS',
      'benefit_type',
      'unemployment',
      'decision_context',
      jsonb_build_object(
        'decision_type',
        'approve',
        'payment_due_within_days',
        13,
        'case_age_days',
        40,
        'channel',
        'web'
      ),
      'structured_inputs',
      jsonb_build_object(
        'idv_status',
        'verified',
        'residency_status',
        'verified',
        'employment_status_declared',
        'unemployed',
        'separation_reason_declared',
        'dismissal',
        'employer_report_status',
        'received',
        'contributions_record_status',
        'sufficient',
        'earnings_record_last_30d',
        'low',
        'income_verification',
        'partial',
        'other_benefits_overlap_check',
        'clear',
        'bank_data_access',
        'consented',
        'docs_status',
        jsonb_build_object(
          'docs_requested',
          jsonb_build_array('termination_notice'),
          'docs_received',
          jsonb_build_array('termination_notice'),
          'docs_quality',
          'valid'
        ),
        'engagement_barriers',
        jsonb_build_object(
          'language_barrier',
          'none',
          'digital_access',
          'good',
          'disability_accommodation_needed',
          'no'
        ),
        'fraud_signals',
        jsonb_build_object(
          'identity_duplicate_match',
          'none',
          'device_or_address_reuse',
          'none',
          'document_tampering',
          'none'
        )
      ),
      'free_text',
      jsonb_build_object(
        'claimant_message',
        'ok i will upload',
        'agent_chat_transcript_excerpt',
        'Routine intake completed.',
        'caseworker_note',
        ''
      ),
      'harm_rights_signals',
      jsonb_build_object(
        'signal_level',
        'none',
        'signal_type',
        jsonb_build_array(),
        'signal_source',
        'system',
        'notes',
        'No hardship, vulnerability, or rights-impact indicators detected.'
      )
    )
  ) ON CONFLICT (beneficiary_id) DO
UPDATE
SET claimant_name = EXCLUDED.claimant_name,
  scenario_id = EXCLUDED.scenario_id,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  intake_payload = EXCLUDED.intake_payload,
  updated_at = now();
-- Alex Haitel (BEN-ATLAS-002) - Escalate Missing Docs
INSERT INTO app.claimant_case (
    beneficiary_id,
    claimant_name,
    scenario_id,
    label,
    description,
    intake_payload
  )
VALUES (
    'BEN-ATLAS-002',
    'Alex Haitel',
    'alex_escalate_missing_docs',
    'Escalate — Missing Employer Docs + Livelihood Risk',
    'Alex declared unemployment after redundancy but lacks required documentation and the employer report is not received. Despite otherwise clear eligibility signals, imminent livelihood risk requires mandatory human escalation under Article 14 oversight.',
    jsonb_build_object(
      'case_id',
      'DEMO-APPROVE-002',
      'timestamp_utc',
      '2026-01-02T15:05:00Z',
      'jurisdiction',
      'EU-MS',
      'benefit_type',
      'unemployment',
      'decision_context',
      jsonb_build_object(
        'decision_type',
        'continue_review',
        'payment_due_within_days',
        NULL,
        'case_age_days',
        12,
        'channel',
        'assisted'
      ),
      'structured_inputs',
      jsonb_build_object(
        'idv_status',
        'verified',
        'residency_status',
        'verified',
        'employment_status_declared',
        'unemployed',
        'separation_reason_declared',
        'redundancy',
        'employer_report_status',
        'pending',
        'contributions_record_status',
        'sufficient',
        'earnings_record_last_30d',
        'low',
        'income_verification',
        'verified',
        'other_benefits_overlap_check',
        'clear',
        'bank_data_access',
        'consented',
        'docs_status',
        jsonb_build_object(
          'docs_requested',
          jsonb_build_array(
            'termination_notice',
            'employer_separation_certificate'
          ),
          'docs_received',
          jsonb_build_array(),
          'docs_quality',
          'missing'
        ),
        'engagement_barriers',
        jsonb_build_object(
          'language_barrier',
          'none',
          'digital_access',
          'good',
          'disability_accommodation_needed',
          'no'
        ),
        'fraud_signals',
        jsonb_build_object(
          'identity_duplicate_match',
          'none',
          'device_or_address_reuse',
          'none',
          'document_tampering',
          'none'
        )
      ),
      'free_text',
      jsonb_build_object(
        'claimant_message',
        'I was made redundant and I''m out of money for rent and groceries next week. I can''t get my employer separation letter yet.',
        'agent_chat_transcript_excerpt',
        'Claimant reports redundancy dismissal; IDV and residency verified; contributions sufficient. Employer report not yet received. Required docs outstanding. Claimant reports imminent inability to meet basic living expenses.',
        'caseworker_note',
        'Escalate for human review: hardship/livelihood risk with incomplete employer documentation.'
      ),
      'harm_rights_signals',
      jsonb_build_object(
        'signal_level',
        'high',
        'signal_type',
        jsonb_build_array('childcare_dependents', 'risk_of_homelessness'),
        'signal_source',
        'system',
        'notes',
        'Claimant reports imminent inability to pay for essentials (rent/food). High rights-impact / livelihood risk requires human oversight despite otherwise clear eligibility signals.'
      )
    )
  ) ON CONFLICT (beneficiary_id) DO
UPDATE
SET claimant_name = EXCLUDED.claimant_name,
  scenario_id = EXCLUDED.scenario_id,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  intake_payload = EXCLUDED.intake_payload,
  updated_at = now();
-- Noah Chance (BEN-ATLAS-003) - Clear Deny
INSERT INTO app.claimant_case (
    beneficiary_id,
    claimant_name,
    scenario_id,
    label,
    description,
    intake_payload
  )
VALUES (
    'BEN-ATLAS-003',
    'Noah Chance',
    'noah_chance_clear_deny',
    'Ineligible — Insufficient Contributions (No Harm Signals)',
    'Claimant''s fixed-term contract ended and a renewal was declined. Contribution history is insufficient to qualify for unemployment benefits. No hardship or rights-impact signals are present. Clear statutory ineligibility requires denial without human escalation.',
    jsonb_build_object(
      'case_id',
      'DEMO-DENY-003',
      'timestamp_utc',
      '2026-01-03T09:15:00Z',
      'jurisdiction',
      'EU-MS',
      'benefit_type',
      'unemployment',
      'decision_context',
      jsonb_build_object(
        'decision_type',
        'deny',
        'payment_due_within_days',
        NULL,
        'case_age_days',
        8,
        'channel',
        'mobile'
      ),
      'structured_inputs',
      jsonb_build_object(
        'idv_status',
        'verified',
        'residency_status',
        'verified',
        'employment_status_declared',
        'unemployed',
        'separation_reason_declared',
        'contract_ended',
        'employer_report_status',
        'received',
        'contributions_record_status',
        'insufficient',
        'earnings_record_last_30d',
        'medium',
        'income_verification',
        'verified',
        'other_benefits_overlap_check',
        'clear',
        'bank_data_access',
        'consented',
        'docs_status',
        jsonb_build_object(
          'docs_requested',
          jsonb_build_array('employment_history_statement'),
          'docs_received',
          jsonb_build_array('employment_history_statement'),
          'docs_quality',
          'valid'
        ),
        'engagement_barriers',
        jsonb_build_object(
          'language_barrier',
          'none',
          'digital_access',
          'good',
          'disability_accommodation_needed',
          'no'
        ),
        'fraud_signals',
        jsonb_build_object(
          'identity_duplicate_match',
          'none',
          'device_or_address_reuse',
          'none',
          'document_tampering',
          'none'
        )
      ),
      'free_text',
      jsonb_build_object(
        'claimant_message',
        'My fixed-term contract ended and I was offered another contract, which I chose not to accept. I have insufficient contribution history. I am financially stable and not experiencing hardship. I am only seeking clarification on eligibility.',
        'agent_chat_transcript_excerpt',
        'Fixed-term contract concluded. Renewal was offered and declined. Contribution history below statutory minimum threshold. All documentation verified.',
        'caseworker_note',
        'Clear statutory ineligibility due to insufficient contribution history. No hardship signals present.'
      ),
      'harm_rights_signals',
      jsonb_build_object(
        'signal_level',
        'none',
        'signal_type',
        jsonb_build_array(),
        'signal_source',
        'system',
        'notes',
        'No indicators of livelihood risk, dependents, disability, or fundamental rights impact requiring human oversight.'
      )
    )
  ) ON CONFLICT (beneficiary_id) DO
UPDATE
SET claimant_name = EXCLUDED.claimant_name,
  scenario_id = EXCLUDED.scenario_id,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  intake_payload = EXCLUDED.intake_payload,
  updated_at = now();
-- Reid Peet Van der Loop (BEN-ATLAS-004) - Auto Review
INSERT INTO app.claimant_case (
    beneficiary_id,
    claimant_name,
    scenario_id,
    label,
    description,
    intake_payload
  )
VALUES (
    'BEN-ATLAS-004',
    'Reid Peet Van der Loop',
    'reid_peet_van_der_loop_auto_review',
    'Auto-Review (Loop: MCP ↔ Chatbot for missing info)',
    'Claimant appears potentially eligible but key statutory elements cannot be confirmed from available inputs. No harm/rights-impact signals are present. Case must remain in an automated review loop where the chatbot gathers missing information and resubmits to the MCP Brain until eligibility can be determined (approve/deny) or escalated if risk signals emerge.',
    jsonb_build_object(
      'case_id',
      'DEMO-REVIEW-004',
      'timestamp_utc',
      '2026-01-03T10:05:00Z',
      'jurisdiction',
      'EU-MS',
      'benefit_type',
      'unemployment',
      'decision_context',
      jsonb_build_object(
        'decision_type',
        'continue_review',
        'payment_due_within_days',
        NULL,
        'case_age_days',
        6,
        'channel',
        'mobile'
      ),
      'structured_inputs',
      jsonb_build_object(
        'idv_status',
        'verified',
        'residency_status',
        'verified',
        'employment_status_declared',
        'unemployed',
        'separation_reason_declared',
        'quit_with_cause',
        'employer_report_status',
        '',
        'contributions_record_status',
        '',
        'earnings_record_last_30d',
        '',
        'income_verification',
        'partial',
        'other_benefits_overlap_check',
        'clear',
        'bank_data_access',
        'consented',
        'docs_status',
        jsonb_build_object(
          'docs_requested',
          jsonb_build_array(
            'employment_history_statement',
            'separation_statement',
            'final_payslip_or_earnings_record'
          ),
          'docs_received',
          jsonb_build_array('employment_history_statement'),
          'docs_quality',
          'pending_verification'
        ),
        'engagement_barriers',
        jsonb_build_object(
          'language_barrier',
          'none',
          'digital_access',
          'good',
          'disability_accommodation_needed',
          'no'
        ),
        'fraud_signals',
        jsonb_build_object(
          'identity_duplicate_match',
          'none',
          'device_or_address_reuse',
          'none',
          'document_tampering',
          'none'
        )
      ),
      'free_text',
      jsonb_build_object(
        'claimant_message',
        'I left my job last month and I''m currently not working. I''m not sure what you need from my employer, and I can upload whatever documents you require.',
        'agent_chat_transcript_excerpt',
        'IDV and residency verified. Claimant reports unemployment after voluntary resignation. Contribution status and recent earnings cannot be confirmed from provided records. Employer report not yet received. Partial income verification; additional documents required to determine eligibility.',
        'caseworker_note',
        'Do not escalate. Route to chatbot for targeted clarification and document collection; resubmit to MCP Brain after each response until statutory eligibility can be determined.'
      ),
      'harm_rights_signals',
      jsonb_build_object(
        'signal_level',
        'none',
        'signal_type',
        jsonb_build_array(),
        'signal_source',
        'system',
        'notes',
        'No indicators of livelihood risk, dependents, disability, coercion, or other fundamental-rights impact requiring human oversight at this time. Remain in automated review loop unless risk signals emerge.'
      )
    )
  ) ON CONFLICT (beneficiary_id) DO
UPDATE
SET claimant_name = EXCLUDED.claimant_name,
  scenario_id = EXCLUDED.scenario_id,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  intake_payload = EXCLUDED.intake_payload,
  updated_at = now();
COMMIT;