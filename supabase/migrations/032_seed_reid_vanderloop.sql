-- Migration 032: Seed Reid Peet Van der Loop Case Data
-- Adds BEN-ATLAS-004 case data for AI grounding
INSERT INTO app.claimant_case (
        beneficiary_id,
        claimant_name,
        scenario_id,
        summary,
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
    summary = EXCLUDED.summary,
    description = EXCLUDED.description,
    intake_payload = EXCLUDED.intake_payload,
    updated_at = NOW();