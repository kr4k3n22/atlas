-- Migration 031: Seed Noah Chance Case Data (Corrected)
-- Adds BEN-ATLAS-003 case data for AI grounding
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
    updated_at = NOW();