-- Seed data for policy_rules table
-- These rules define risk scoring criteria and policy references for different tools

-- Rule 1: Fraud detection for any benefit tool
INSERT INTO policy_rules (rule_name, tool_name, description, risk_threshold, risk_weight, pattern_regex, pattern_field, policy_refs, conditions, priority, enabled) VALUES
(
  'fraud_confirmed_rule',
  'benefit_%', -- Applies to all benefit tools
  'Confirmed fraud signals require immediate escalation',
  90,
  2.0,
  '(confirmed|verified)',
  'fraud_signals',
  '["POLICY-FRAUD-005", "POLICY-BLOCK-006"]'::jsonb,
  '{"fraud_signals": {"match_any": ["confirmed"]}}'::jsonb,
  10,
  true
),

-- Rule 2: Harm/rights signals require human review
(
  'harm_rights_escalation',
  'benefit_%',
  'Cases with harm or rights signals require human oversight',
  70,
  1.5,
  '(moderate|strong)',
  'harm_signal_present',
  '["POLICY-HARM-RIGHTS-001", "POLICY-OVERSIGHT-002"]'::jsonb,
  '{"harm_signal_present": {"not": "none"}}'::jsonb,
  20,
  true
),

-- Rule 3: Incomplete evidence for negative decisions
(
  'incomplete_evidence_deny',
  'benefit_deny',
  'Denial with incomplete evidence requires escalation',
  75,
  1.8,
  '(pending|partial|unknown)',
  'structured_inputs',
  '["POLICY-EVIDENCE-003", "POLICY-OVERSIGHT-002"]'::jsonb,
  '{"decision_context": {"decision_type": "deny"}}'::jsonb,
  30,
  true
),

-- Rule 4: Document quality issues
(
  'document_quality_issue',
  'benefit_%',
  'Missing or poor quality documents require information request',
  60,
  1.3,
  '(expired|unreadable|inconsistent|missing)',
  'docs_quality',
  '["POLICY-DOCUMENTATION-007", "POLICY-OVERSIGHT-002"]'::jsonb,
  '{"docs_quality": {"match_any": ["expired", "unreadable", "inconsistent", "missing"]}}'::jsonb,
  40,
  true
),

-- Rule 5: Engagement barriers present
(
  'engagement_barrier_rule',
  'benefit_%',
  'Language, digital, or disability barriers require special handling',
  65,
  1.4,
  '(limited|barrier|accommodation)',
  'ability_to_engage',
  '["POLICY-ACCESSIBILITY-008", "POLICY-HARM-RIGHTS-001"]'::jsonb,
  '{"ability_to_engage": {"not": "normal"}}'::jsonb,
  50,
  true
),

-- Rule 6: Benefits overlap check
(
  'benefits_overlap_check',
  'benefit_approve',
  'Possible benefits overlap requires verification',
  70,
  1.5,
  '(possible|confirmed)',
  'other_benefits_overlap_check',
  '["POLICY-OVERLAP-009", "POLICY-OVERSIGHT-002"]'::jsonb,
  '{"structured_inputs": {"other_benefits_overlap_check": {"match_any": ["possible", "confirmed"]}}}'::jsonb,
  60,
  true
),

-- Rule 7: Identity verification failures
(
  'identity_verification_failed',
  'benefit_%',
  'Failed identity verification requires blocking',
  85,
  1.9,
  '(failed)',
  'idv_status',
  '["POLICY-INELIGIBLE-004", "POLICY-IDV-010"]'::jsonb,
  '{"structured_inputs": {"idv_status": "failed"}}'::jsonb,
  15,
  true
),

-- Rule 8: Routine low-risk cases
(
  'routine_low_risk',
  'benefit_approve',
  'Routine approval with verified evidence',
  20,
  1.0,
  '(verified|confirmed)',
  'idv_status',
  '["POLICY-LOW-RISK-001", "POLICY-ROUTINE-011"]'::jsonb,
  '{"structured_inputs": {"idv_status": "verified"}, "harm_signal_present": "none"}'::jsonb,
  100,
  true
),

-- Rule 9: Appeal or review requested
(
  'appeal_requested_rule',
  'benefit_%',
  'Appeals must be handled by human reviewer',
  70,
  1.6,
  '(yes)',
  'appeal_or_review_requested',
  '["POLICY-APPEALS-012", "POLICY-HARM-RIGHTS-001"]'::jsonb,
  '{"appeal_or_review_requested": "yes"}'::jsonb,
  25,
  true
),

-- Rule 10: Payment deadline approaching
(
  'deadline_approaching_rule',
  'benefit_%',
  'Cases with approaching deadlines require expedited review',
  65,
  1.3,
  null,
  null,
  '["POLICY-TIMELINESS-013", "POLICY-OVERSIGHT-002"]'::jsonb,
  '{"decision_context": {"payment_due_within_days": {"lte": 7}}}'::jsonb,
  35,
  true
);

-- Add a note about the seed data
COMMENT ON TABLE policy_rules IS 'Policy rules for risk scoring and decision-making. Seeded with 10 default rules covering fraud, harm/rights, evidence quality, and accessibility.';
