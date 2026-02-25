-- Migration 034: Seed Alex Haitel Case Data
-- Adds BEN-ATLAS-002 case data for AI grounding
INSERT INTO app.claimant_case (
        beneficiary_id,
        claimant_name,
        scenario_id,
        summary,
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
    summary = EXCLUDED.summary,
    description = EXCLUDED.description,
    intake_payload = EXCLUDED.intake_payload,
    updated_at = NOW();