-- Migration 016: Seed all code table values

-- ref.code_value_null_status
INSERT INTO ref.code_value_null_status (code, label, sort_order) VALUES
  ('unknown',              'Unknown',               1),
  ('not_applicable',       'Not Applicable',        2),
  ('not_provided',         'Not Provided',          3),
  ('pending_verification', 'Pending Verification',  4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_verification_status
INSERT INTO ref.code_verification_status (code, label, sort_order) VALUES
  ('verified',              'Verified',             1),
  ('unverified',            'Unverified',           2),
  ('failed_verification',   'Failed Verification',  3),
  ('pending_verification',  'Pending Verification', 4),
  ('not_required',          'Not Required',         5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_source_type
INSERT INTO ref.code_source_type (code, label, sort_order) VALUES
  ('claimant_self_report', 'Claimant Self-Report',       1),
  ('employer_feed',        'Employer Feed',               2),
  ('tax_record',           'Tax Record',                  3),
  ('wage_database',        'Wage Database',               4),
  ('identity_provider',    'Identity Provider',           5),
  ('caseworker_entry',     'Caseworker Entry',            6),
  ('court_order',          'Court Order',                 7),
  ('prior_case_record',    'Prior Case Record',           8),
  ('document_upload',      'Document Upload',             9),
  ('third_party_agency',   'Third-Party Agency',         10),
  ('system_derived',       'System Derived',             11)
ON CONFLICT (code) DO NOTHING;

-- ref.code_identity_verification_status
INSERT INTO ref.code_identity_verification_status (code, label, sort_order) VALUES
  ('verified',            'Verified',            1),
  ('pending',             'Pending',             2),
  ('failed',              'Failed',              3),
  ('not_attempted',       'Not Attempted',       4),
  ('manual_review',       'Manual Review',       5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_relationship_status
INSERT INTO ref.code_relationship_status (code, label, sort_order) VALUES
  ('single',    'Single',    1),
  ('married',   'Married',   2),
  ('civil_partnership', 'Civil Partnership', 3),
  ('cohabiting','Cohabiting',4),
  ('separated', 'Separated', 5),
  ('divorced',  'Divorced',  6),
  ('widowed',   'Widowed',   7)
ON CONFLICT (code) DO NOTHING;

-- ref.code_relationship_to_primary
INSERT INTO ref.code_relationship_to_primary (code, label, sort_order) VALUES
  ('self',            'Self (Primary)',       1),
  ('partner',         'Partner / Spouse',    2),
  ('dependent_child', 'Dependent Child',     3),
  ('non_dep_adult',   'Non-Dependent Adult', 4),
  ('other',           'Other',               5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_program_type
INSERT INTO ref.code_program_type (code, label, sort_order) VALUES
  ('universal_credit',        'Universal Credit',         1),
  ('jobseekers_allowance',    'Jobseeker''s Allowance',   2),
  ('employment_support',      'Employment and Support Allowance', 3),
  ('housing_benefit',         'Housing Benefit',          4),
  ('child_benefit',           'Child Benefit',            5),
  ('personal_independence',   'Personal Independence Payment', 6),
  ('attendance_allowance',    'Attendance Allowance',     7),
  ('pension_credit',          'Pension Credit',           8),
  ('carer_allowance',         'Carer''s Allowance',       9)
ON CONFLICT (code) DO NOTHING;

-- ref.code_residency_eligibility_status
INSERT INTO ref.code_residency_eligibility_status (code, label, sort_order) VALUES
  ('eligible',          'Eligible',            1),
  ('ineligible',        'Ineligible',          2),
  ('pending_review',    'Pending Review',      3),
  ('exempt',            'Exempt',              4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_citizenship_eligibility_status
INSERT INTO ref.code_citizenship_eligibility_status (code, label, sort_order) VALUES
  ('uk_citizen',        'UK Citizen',          1),
  ('eea_national',      'EEA National',        2),
  ('settled_status',    'Settled Status',      3),
  ('pre_settled',       'Pre-Settled Status',  4),
  ('leave_to_remain',   'Leave to Remain',     5),
  ('no_recourse',       'No Recourse to Public Funds', 6),
  ('other',             'Other',               7)
ON CONFLICT (code) DO NOTHING;

-- ref.code_age_flag
INSERT INTO ref.code_age_flag (code, label, sort_order) VALUES
  ('under_16',          'Under 16',            1),
  ('16_to_17',          '16-17',               2),
  ('18_to_24',          '18-24',               3),
  ('25_to_pension',     '25 to Pension Age',   4),
  ('pension_age_plus',  'Pension Age+',        5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_disability_status
INSERT INTO ref.code_disability_status (code, label, sort_order) VALUES
  ('none',              'None',                1),
  ('limited_capability','Limited Capability for Work', 2),
  ('lcwra',             'LCWRA',               3),
  ('pip_standard',      'PIP Standard Rate',  4),
  ('pip_enhanced',      'PIP Enhanced Rate',  5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_student_status
INSERT INTO ref.code_student_status (code, label, sort_order) VALUES
  ('not_student',       'Not a Student',       1),
  ('part_time',         'Part-Time Student',   2),
  ('full_time',         'Full-Time Student',   3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_caregiver_status
INSERT INTO ref.code_caregiver_status (code, label, sort_order) VALUES
  ('not_caregiver',     'Not a Caregiver',     1),
  ('informal_carer',    'Informal Carer',      2),
  ('carer_allowance',   'Receiving Carer''s Allowance', 3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_pregnancy_status
INSERT INTO ref.code_pregnancy_status (code, label, sort_order) VALUES
  ('not_applicable',    'Not Applicable',      1),
  ('pregnant',          'Pregnant',            2),
  ('recently_pregnant', 'Recently Pregnant',   3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_custody_arrangement_status
INSERT INTO ref.code_custody_arrangement_status (code, label, sort_order) VALUES
  ('not_applicable',    'Not Applicable',      1),
  ('sole_custody',      'Sole Custody',        2),
  ('shared_custody',    'Shared Custody',      3),
  ('no_custody',        'No Custody',          4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_household_change_type
INSERT INTO ref.code_household_change_type (code, label, sort_order) VALUES
  ('member_added',      'Member Added',        1),
  ('member_removed',    'Member Removed',      2),
  ('address_changed',   'Address Changed',     3),
  ('relationship_changed', 'Relationship Changed', 4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_shared_housing_arrangement
INSERT INTO ref.code_shared_housing_arrangement (code, label, sort_order) VALUES
  ('sole_occupant',     'Sole Occupant',       1),
  ('joint_tenancy',     'Joint Tenancy',       2),
  ('lodger',            'Lodger',              3),
  ('living_with_family','Living with Family',  4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_money_frequency
INSERT INTO ref.code_money_frequency (code, label, sort_order) VALUES
  ('weekly',            'Weekly',              1),
  ('fortnightly',       'Fortnightly',         2),
  ('four_weekly',       'Four-Weekly',         3),
  ('monthly',           'Monthly',             4),
  ('quarterly',         'Quarterly',           5),
  ('annual',            'Annual',              6),
  ('one_off',           'One-Off',             7)
ON CONFLICT (code) DO NOTHING;

-- ref.code_contribution_type
INSERT INTO ref.code_contribution_type (code, label, sort_order) VALUES
  ('earnings',          'Earnings',            1),
  ('ni_credits',        'NI Credits',          2),
  ('voluntary',         'Voluntary',           3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_employment_status
INSERT INTO ref.code_employment_status (code, label, sort_order) VALUES
  ('employed',          'Employed',            1),
  ('self_employed',     'Self-Employed',       2),
  ('unemployed',        'Unemployed',          3),
  ('not_working',       'Not Working',         4),
  ('retired',           'Retired',             5),
  ('student',           'Student',             6),
  ('sick_or_disabled',  'Sick or Disabled',    7)
ON CONFLICT (code) DO NOTHING;

-- ref.code_employer_record_status
INSERT INTO ref.code_employer_record_status (code, label, sort_order) VALUES
  ('current',           'Current',             1),
  ('former',            'Former',              2),
  ('pending_verify',    'Pending Verification',3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_wage_unit
INSERT INTO ref.code_wage_unit (code, label, sort_order) VALUES
  ('hourly',            'Per Hour',            1),
  ('daily',             'Per Day',             2),
  ('weekly',            'Per Week',            3),
  ('monthly',           'Per Month',           4),
  ('annual',            'Per Year',            5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_income_type
INSERT INTO ref.code_income_type (code, label, sort_order) VALUES
  ('earned',            'Earned Income',       1),
  ('pension',           'Pension',             2),
  ('rental',            'Rental Income',       3),
  ('maintenance',       'Maintenance / CSA',   4),
  ('savings_interest',  'Savings Interest',    5),
  ('student_loan',      'Student Loan',        6),
  ('other_benefit',     'Other Benefit',       7),
  ('other',             'Other',               8)
ON CONFLICT (code) DO NOTHING;

-- ref.code_income_volatility_pattern
INSERT INTO ref.code_income_volatility_pattern (code, label, sort_order) VALUES
  ('stable',            'Stable',              1),
  ('variable',          'Variable',            2),
  ('seasonal',          'Seasonal',            3),
  ('zero_hours',        'Zero-Hours Contract', 4),
  ('intermittent',      'Intermittent',        5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_account_type
INSERT INTO ref.code_account_type (code, label, sort_order) VALUES
  ('current',           'Current Account',     1),
  ('savings',           'Savings Account',     2),
  ('basic_bank',        'Basic Bank Account',  3),
  ('credit_union',      'Credit Union',        4),
  ('isa',               'ISA',                 5),
  ('other',             'Other',               6)
ON CONFLICT (code) DO NOTHING;

-- ref.code_asset_type
INSERT INTO ref.code_asset_type (code, label, sort_order) VALUES
  ('property',          'Property',            1),
  ('vehicle',           'Vehicle',             2),
  ('savings_bonds',     'Savings / Bonds',     3),
  ('shares',            'Shares',              4),
  ('other',             'Other',               5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_asset_countability_status
INSERT INTO ref.code_asset_countability_status (code, label, sort_order) VALUES
  ('countable',         'Countable',           1),
  ('exempt',            'Exempt',              2),
  ('pending_review',    'Pending Review',      3)
ON CONFLICT (code) DO NOTHING;

-- ref.code_housing_payment_type
INSERT INTO ref.code_housing_payment_type (code, label, sort_order) VALUES
  ('rent',              'Rent',                1),
  ('mortgage',          'Mortgage',            2),
  ('service_charge',    'Service Charge',      3),
  ('ground_rent',       'Ground Rent',         4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_utility_type
INSERT INTO ref.code_utility_type (code, label, sort_order) VALUES
  ('electricity',       'Electricity',         1),
  ('gas',               'Gas',                 2),
  ('water',             'Water',               3),
  ('broadband',         'Broadband',           4),
  ('council_tax',       'Council Tax',         5),
  ('other',             'Other',               6)
ON CONFLICT (code) DO NOTHING;

-- ref.code_provider_type
INSERT INTO ref.code_provider_type (code, label, sort_order) VALUES
  ('ofsted_registered', 'Ofsted-Registered',   1),
  ('childminder',       'Childminder',         2),
  ('nursery',           'Nursery',             3),
  ('after_school_club', 'After-School Club',   4),
  ('informal',          'Informal',            5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_housing_instability_status
INSERT INTO ref.code_housing_instability_status (code, label, sort_order) VALUES
  ('stable',            'Stable',              1),
  ('at_risk',           'At Risk',             2),
  ('facing_eviction',   'Facing Eviction',     3),
  ('homeless',          'Homeless',            4),
  ('temporary_housing', 'Temporary Housing',   5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_hardship_value
INSERT INTO ref.code_hardship_value (code, label, sort_order) VALUES
  ('food_insecurity',   'Food Insecurity',     1),
  ('fuel_poverty',      'Fuel Poverty',        2),
  ('unable_to_pay_bills','Unable to Pay Bills',3),
  ('debt_crisis',       'Debt Crisis',         4),
  ('none',              'None',                5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_urgency_level
INSERT INTO ref.code_urgency_level (code, label, sort_order) VALUES
  ('low',               'Low',                 1),
  ('medium',            'Medium',              2),
  ('high',              'High',                3),
  ('critical',          'Critical',            4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_repayment_status
INSERT INTO ref.code_repayment_status (code, label, sort_order) VALUES
  ('pending',           'Pending',             1),
  ('agreed',            'Agreed',              2),
  ('in_progress',       'In Progress',         3),
  ('settled',           'Settled',             4),
  ('written_off',       'Written Off',         5),
  ('disputed',          'Disputed',            6)
ON CONFLICT (code) DO NOTHING;

-- ref.code_document_type
INSERT INTO ref.code_document_type (code, label, sort_order) VALUES
  ('passport',          'Passport',            1),
  ('driving_licence',   'Driving Licence',     2),
  ('birth_certificate', 'Birth Certificate',   3),
  ('payslip',           'Payslip',             4),
  ('p60',               'P60',                 5),
  ('bank_statement',    'Bank Statement',      6),
  ('tenancy_agreement', 'Tenancy Agreement',   7),
  ('utility_bill',      'Utility Bill',        8),
  ('tax_return',        'Tax Return',          9),
  ('other',             'Other',              10)
ON CONFLICT (code) DO NOTHING;

-- ref.code_document_source
INSERT INTO ref.code_document_source (code, label, sort_order) VALUES
  ('claimant_upload',   'Claimant Upload',     1),
  ('employer_submission','Employer Submission',2),
  ('third_party',       'Third Party',         3),
  ('government_system', 'Government System',   4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_file_format
INSERT INTO ref.code_file_format (code, label, sort_order) VALUES
  ('pdf',               'PDF',                 1),
  ('jpg',               'JPEG',                2),
  ('png',               'PNG',                 3),
  ('tiff',              'TIFF',                4),
  ('docx',              'DOCX',                5),
  ('csv',               'CSV',                 6),
  ('xml',               'XML',                 7)
ON CONFLICT (code) DO NOTHING;

-- ref.code_decision_result
INSERT INTO ref.code_decision_result (code, label, description, sort_order) VALUES
  ('auto_approve',      'Auto-Approve',    'System automatically approves without human review',  1),
  ('auto_deny',         'Auto-Deny',       'System automatically denies without human review',    2),
  ('auto_review',       'Auto-Review',     'System refers to caseworker for review',              3),
  ('escalate_to_human', 'Escalate to Human','High-risk decision escalated to senior caseworker', 4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_rule_eval_result
INSERT INTO ref.code_rule_eval_result (code, label, sort_order) VALUES
  ('passed',        'Passed',        1),
  ('failed',        'Failed',        2),
  ('warning',       'Warning',       3),
  ('not_applicable','Not Applicable',4),
  ('error',         'Error',         5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_reason_code
INSERT INTO ref.code_reason_code (code, label, sort_order) VALUES
  ('INCOME_CONFLICTING_SOURCES',      'Income from Conflicting Sources',           1),
  ('HOUSEHOLD_COMPOSITION_RECENT_CHANGE','Recent Household Composition Change',    2),
  ('RIGHTS_IMPACT_HIGH',              'High Rights Impact Decision',               3),
  ('MISSING_REQUIRED_DOCUMENT',       'Missing Required Document',                 4),
  ('IDENTITY_VERIFICATION_FAILED',    'Identity Verification Failed',              5),
  ('LOW_CONFIDENCE_EXTRACTION',       'Low-Confidence Document Extraction',        6),
  ('MANUAL_REVIEW_POLICY_TRIGGER',    'Manual Review Policy Trigger',              7),
  ('ELIGIBILITY_RULE_FAILED',         'Eligibility Rule Failed',                   8),
  ('INSUFFICIENT_HISTORY',            'Insufficient History',                      9),
  ('DATA_INCONSISTENCY_DETECTED',     'Data Inconsistency Detected',              10)
ON CONFLICT (code) DO NOTHING;

-- ref.code_actor_type
INSERT INTO ref.code_actor_type (code, label, sort_order) VALUES
  ('user',            'User',            1),
  ('system',          'System',          2),
  ('caseworker',      'Caseworker',      3),
  ('service_account', 'Service Account', 4)
ON CONFLICT (code) DO NOTHING;

-- ref.code_audit_event_type
INSERT INTO ref.code_audit_event_type (code, label, sort_order) VALUES
  ('row_change',        'Row Change',          1),
  ('login',             'Login',               2),
  ('logout',            'Logout',              3),
  ('data_export',       'Data Export',         4),
  ('schema_migration',  'Schema Migration',    5)
ON CONFLICT (code) DO NOTHING;

-- ref.code_application_status
INSERT INTO ref.code_application_status (code, label, sort_order) VALUES
  ('draft',             'Draft',               1),
  ('submitted',         'Submitted',           2),
  ('in_review',         'In Review',           3),
  ('pending_evidence',  'Pending Evidence',    4),
  ('approved',          'Approved',            5),
  ('denied',            'Denied',              6),
  ('withdrawn',         'Withdrawn',           7),
  ('appealed',          'Appealed',            8)
ON CONFLICT (code) DO NOTHING;

-- ref.code_address_type
INSERT INTO ref.code_address_type (code, label, sort_order) VALUES
  ('current_home',      'Current Home',        1),
  ('postal',            'Postal',              2),
  ('previous_home',     'Previous Home',       3),
  ('employer',          'Employer',            4)
ON CONFLICT (code) DO NOTHING;
