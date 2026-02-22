-- Migration 017: Seed realistic UK welfare test data
-- Currency: GBP; all amounts in pence (minor units)
-- NI numbers are masked/fictional

DO $$
DECLARE
  -- Claimant IDs
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid();
  c5 uuid := gen_random_uuid();

  -- Household IDs
  h1 uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid();
  h3 uuid := gen_random_uuid();

  -- Application IDs
  a1 uuid := gen_random_uuid();
  a2 uuid := gen_random_uuid();
  a3 uuid := gen_random_uuid();

  -- Employer IDs
  e1 uuid := gen_random_uuid();
  e2 uuid := gen_random_uuid();

  -- Decision / rule IDs
  rule1 uuid := gen_random_uuid();
  rule2 uuid := gen_random_uuid();
  dec1  uuid := gen_random_uuid();
  dec2  uuid := gen_random_uuid();

  -- Document IDs
  doc1  uuid := gen_random_uuid();
  doc2  uuid := gen_random_uuid();

BEGIN

  -- ──────────────────────────────────────────────────────────────────────────
  -- Claimants
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.claimant (id, external_claimant_ref, first_name, last_name, date_of_birth,
    email, national_insurance_number, preferred_language)
  VALUES
    (c1, 'BEN-ATLAS-001', 'Alex',    'Johnson',   '1990-03-15', 'alex.johnson@example.com',   'NJ***001A', 'en'),
    (c2, 'BEN-ATLAS-002', 'Sarah',   'Williams',  '1985-07-22', 'sarah.williams@example.com', 'NE***002B', 'en'),
    (c3, 'BEN-ATLAS-003', 'Mohammed','Ahmed',     '1978-11-04', 'm.ahmed@example.com',         'NN***003C', 'en'),
    (c4, 'BEN-ATLAS-004', 'Priya',   'Patel',     '1995-05-30', 'priya.patel@example.com',    'NP***004D', 'en'),
    (c5, 'BEN-ATLAS-005', 'James',   'O''Brien',  '1965-09-12', 'james.obrien@example.com',   'NY***005E', 'en')
  ON CONFLICT (external_claimant_ref) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Households
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.household (id, primary_claimant_id, household_ref,
    address_line_1, town, postcode)
  VALUES
    (h1, c1, 'HH-001', '12 Maple Street',    'Manchester', 'M1 1AA'),
    (h2, c2, 'HH-002', '7 Oak Avenue',       'Leeds',      'LS1 2BB'),
    (h3, c3, 'HH-003', '34 Birch Road',      'Birmingham', 'B2 3CC')
  ON CONFLICT (household_ref) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Household memberships
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.household_membership
    (household_id, claimant_id, relationship_to_primary_code, is_primary, start_date)
  VALUES
    (h1, c1, 'self',            true,  '2022-01-01'),
    (h2, c2, 'self',            true,  '2021-06-01'),
    (h2, c4, 'partner',         false, '2021-06-01'),
    (h3, c3, 'self',            true,  '2020-03-01')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Applications
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.application (id, claimant_id, household_id, application_ref,
    status_code, submitted_at)
  VALUES
    (a1, c1, h1, 'APP-2024-001', 'in_review',    '2024-01-10 09:00:00+00'),
    (a2, c2, h2, 'APP-2024-002', 'approved',     '2024-02-14 11:30:00+00'),
    (a3, c3, h3, 'APP-2024-003', 'pending_evidence', '2024-03-05 14:00:00+00')
  ON CONFLICT (application_ref) DO NOTHING;

  -- Application programmes
  INSERT INTO app.application_program (application_id, program_type_code)
  VALUES
    (a1, 'universal_credit'),
    (a2, 'universal_credit'),
    (a2, 'housing_benefit'),
    (a3, 'jobseekers_allowance')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Employment facts
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.employment_fact
    (claimant_id, employment_status_code, start_date,
     source_code, verification_status_code)
  VALUES
    (c1, 'unemployed',    '2023-11-01', 'claimant_self_report', 'verified'),
    (c2, 'employed',      '2019-04-15', 'employer_feed',        'verified'),
    (c3, 'self_employed', '2018-01-01', 'claimant_self_report', 'unverified'),
    (c4, 'not_working',   '2024-01-01', 'claimant_self_report', 'verified'),
    (c5, 'retired',       '2023-09-01', 'claimant_self_report', 'not_required')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Employer records
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.employer_record (id, claimant_id, employer_name, status_code,
    start_date, end_date)
  VALUES
    (e1, c2, 'Northern Rail Ltd',    'current', '2019-04-15', NULL),
    (e2, c1, 'Manchester City Council', 'former', '2020-06-01', '2023-10-31')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Earned income periods (last 6 months for c2)
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.earned_income_period_fact
    (claimant_id, employer_record_id, period_start, period_end,
     gross_income_minor, net_income_minor, currency_code, frequency_code,
     source_code, verification_status_code)
  VALUES
    (c2, e1, '2024-08-01', '2024-08-31', 210000, 172000, 'GBP', 'monthly', 'employer_feed', 'verified'),
    (c2, e1, '2024-09-01', '2024-09-30', 210000, 172000, 'GBP', 'monthly', 'employer_feed', 'verified'),
    (c2, e1, '2024-10-01', '2024-10-31', 210000, 172000, 'GBP', 'monthly', 'employer_feed', 'verified'),
    (c2, e1, '2024-11-01', '2024-11-30', 210000, 172000, 'GBP', 'monthly', 'employer_feed', 'verified'),
    (c2, e1, '2024-12-01', '2024-12-31', 220000, 180000, 'GBP', 'monthly', 'employer_feed', 'verified'),
    (c2, e1, '2025-01-01', '2025-01-31', 210000, 172000, 'GBP', 'monthly', 'employer_feed', 'verified')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Housing payment facts
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.housing_payment_fact
    (claimant_id, payment_type_code, amount_minor, currency_code, frequency_code,
     source_code, verification_status_code, effective_date)
  VALUES
    (c1, 'rent',     95000, 'GBP', 'monthly', 'claimant_self_report', 'verified',   '2023-11-01'),
    (c2, 'mortgage', 82000, 'GBP', 'monthly', 'claimant_self_report', 'unverified', '2021-06-01'),
    (c3, 'rent',    110000, 'GBP', 'monthly', 'claimant_self_report', 'verified',   '2020-03-01')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Rule catalog
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.rule_catalog (id, rule_key, rule_version, program_type_code,
    description, effective_from)
  VALUES
    (rule1, 'UC_INCOME_THRESHOLD',   1, 'universal_credit',    'Universal Credit income threshold check', '2024-01-01'),
    (rule2, 'JSA_AVAILABILITY_CHECK',1, 'jobseekers_allowance', 'JSA availability-for-work check',       '2024-01-01')
  ON CONFLICT (rule_key, rule_version) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Decisions
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.decision (id, application_id, decision_result_code, decided_at)
  VALUES
    (dec1, a2, 'auto_approve',     '2024-02-20 10:00:00+00'),
    (dec2, a3, 'escalate_to_human','2024-03-10 09:00:00+00')
  ON CONFLICT DO NOTHING;

  -- Decision reasons
  INSERT INTO app.decision_reason (decision_id, reason_code, detail)
  VALUES
    (dec1, 'ELIGIBILITY_RULE_FAILED',   'All eligibility rules passed — auto-approval granted'),
    (dec2, 'MISSING_REQUIRED_DOCUMENT', 'P60 or payslip required to verify self-employment income')
  ON CONFLICT DO NOTHING;

  -- Rule evaluations
  INSERT INTO app.rule_evaluation
    (decision_id, rule_catalog_id, eval_result_code, score)
  VALUES
    (dec1, rule1, 'passed', 0.9500),
    (dec2, rule2, 'failed', 0.3200)
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Document evidence with extracted fields
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO app.document_evidence
    (id, claimant_id, application_id, document_type_code, document_source_code,
     file_format_code, file_name, overall_confidence)
  VALUES
    (doc1, c2, a2, 'payslip', 'claimant_upload', 'pdf', 'payslip_jan2025.pdf',  0.9200),
    (doc2, c3, a3, 'p60',     'claimant_upload', 'pdf', 'p60_2023_24.pdf',      0.7500)
  ON CONFLICT DO NOTHING;

  -- Extracted fields from payslip
  INSERT INTO app.extracted_field
    (document_evidence_id, field_name, raw_value, normalized_value, data_type, confidence_score)
  VALUES
    (doc1, 'employer_name',   'Northern Rail Ltd',      'Northern Rail Ltd',  'text',    0.9800),
    (doc1, 'pay_period_end',  '31/01/2025',             '2025-01-31',         'date',    0.9500),
    (doc1, 'gross_pay',       '£2,100.00',              '210000',             'integer', 0.9200),
    (doc1, 'net_pay',         '£1,720.00',              '172000',             'integer', 0.9200),
    (doc2, 'total_earnings',  '£25,400',                '2540000',            'integer', 0.7800),
    (doc2, 'tax_year',        '2023-24',                '2023-24',            'text',    0.9000)
  ON CONFLICT DO NOTHING;

END $$;
