-- Migration 018: Reporting views
-- Schema: reporting

-- ────────────────────────────────────────────────────────────────────────────
-- v_application_current_profile
-- A flat, per-application summary joining claimant, household, and status.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW reporting.v_application_current_profile AS
SELECT
  a.id                        AS application_id,
  a.application_ref,
  a.status_code               AS application_status,
  a.submitted_at,
  a.currency_code,
  c.id                        AS claimant_id,
  c.external_claimant_ref,
  c.first_name,
  c.last_name,
  c.first_name || ' ' || c.last_name AS full_name,
  c.date_of_birth,
  c.email,
  h.id                        AS household_id,
  h.household_ref,
  h.postcode,
  h.town,
  COUNT(DISTINCT hm.claimant_id) AS household_size,
  string_agg(DISTINCT ap.program_type_code, ', ') AS programs
FROM app.application a
JOIN app.claimant c ON c.id = a.claimant_id
LEFT JOIN app.household h ON h.id = a.household_id
LEFT JOIN app.household_membership hm ON hm.household_id = h.id
LEFT JOIN app.application_program ap ON ap.application_id = a.id
GROUP BY a.id, c.id, h.id;

COMMENT ON VIEW reporting.v_application_current_profile IS
  'Flat application summary with claimant and household details for reporting';

-- ────────────────────────────────────────────────────────────────────────────
-- v_claimant_income_summary_6m
-- Aggregated earned income for the past 6 calendar months per claimant.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW reporting.v_claimant_income_summary_6m AS
SELECT
  c.id                            AS claimant_id,
  c.external_claimant_ref,
  c.first_name || ' ' || c.last_name AS full_name,
  eipf.currency_code,
  SUM(eipf.gross_income_minor)    AS total_gross_6m_minor,
  SUM(eipf.net_income_minor)      AS total_net_6m_minor,
  COUNT(*)                        AS period_count,
  MAX(eipf.period_end)            AS latest_period_end
FROM app.claimant c
JOIN app.earned_income_period_fact eipf ON eipf.claimant_id = c.id
WHERE eipf.period_start >= (date_trunc('month', now()) - interval '6 months')::date
GROUP BY c.id, eipf.currency_code;

COMMENT ON VIEW reporting.v_claimant_income_summary_6m IS
  'Aggregated earned income (gross and net) for the past 6 months; amounts in minor units (pence)';

-- ────────────────────────────────────────────────────────────────────────────
-- v_decision_explainability
-- Joins decisions with their reasons and rule evaluation results.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW reporting.v_decision_explainability AS
SELECT
  d.id                        AS decision_id,
  d.application_id,
  d.decision_result_code,
  d.decided_at,
  a.application_ref,
  c.external_claimant_ref,
  c.first_name || ' ' || c.last_name AS claimant_name,
  dr.reason_code,
  dr.detail                   AS reason_detail,
  re.eval_result_code,
  rc.rule_key,
  rc.rule_version,
  re.score                    AS rule_score
FROM app.decision d
JOIN app.application a ON a.id = d.application_id
JOIN app.claimant c ON c.id = a.claimant_id
LEFT JOIN app.decision_reason dr ON dr.decision_id = d.id
LEFT JOIN app.rule_evaluation re ON re.decision_id = d.id
LEFT JOIN app.rule_catalog rc ON rc.id = re.rule_catalog_id;

COMMENT ON VIEW reporting.v_decision_explainability IS
  'Decision outcomes with explainability codes and rule evaluation details';

-- ────────────────────────────────────────────────────────────────────────────
-- v_document_extraction_quality
-- Per-document extraction confidence metrics.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW reporting.v_document_extraction_quality AS
SELECT
  de.id                       AS document_evidence_id,
  de.claimant_id,
  c.external_claimant_ref,
  de.document_type_code,
  de.file_name,
  de.overall_confidence,
  COUNT(ef.id)                AS field_count,
  AVG(ef.confidence_score)    AS avg_field_confidence,
  MIN(ef.confidence_score)    AS min_field_confidence,
  SUM(CASE WHEN ef.confidence_score < 0.7 THEN 1 ELSE 0 END) AS low_confidence_fields
FROM app.document_evidence de
JOIN app.claimant c ON c.id = de.claimant_id
LEFT JOIN app.extracted_field ef ON ef.document_evidence_id = de.id
GROUP BY de.id, c.external_claimant_ref;

COMMENT ON VIEW reporting.v_document_extraction_quality IS
  'Per-document extraction quality metrics; flag documents with low-confidence fields';
