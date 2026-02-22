-- Migration 006: Reference/lookup code tables
-- All code tables share the same column structure.
-- Schema: ref

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: every code table has the same shape
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ref.code_value_null_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_value_null_status IS 'Encodes why a value may be absent: unknown, not applicable, not provided, or pending verification';

CREATE TABLE IF NOT EXISTS ref.code_verification_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_verification_status IS 'Verification lifecycle status for a fact or document';

CREATE TABLE IF NOT EXISTS ref.code_source_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_source_type IS 'Origin of a recorded fact (self-report, employer feed, tax record, etc.)';

CREATE TABLE IF NOT EXISTS ref.code_identity_verification_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_relationship_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_relationship_to_primary (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_program_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_program_type IS 'Welfare programme types (Universal Credit, Jobseeker''s Allowance, etc.)';

CREATE TABLE IF NOT EXISTS ref.code_residency_eligibility_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_citizenship_eligibility_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_age_flag (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_disability_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_student_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_caregiver_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_pregnancy_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_custody_arrangement_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_household_change_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_shared_housing_arrangement (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_money_frequency (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_money_frequency IS 'Payment frequency codes (weekly, monthly, annual, etc.)';

CREATE TABLE IF NOT EXISTS ref.code_contribution_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_employment_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_employer_record_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_wage_unit (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_income_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_income_volatility_pattern (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_account_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_asset_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_asset_countability_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_housing_payment_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_utility_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_provider_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_housing_instability_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_hardship_value (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_urgency_level (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_repayment_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_document_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_document_source (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_file_format (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_decision_result (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_decision_result IS 'Outcome of an automated eligibility decision';

CREATE TABLE IF NOT EXISTS ref.code_rule_eval_result (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_reason_code (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_reason_code IS 'Explainability reason codes attached to decisions';

CREATE TABLE IF NOT EXISTS ref.code_actor_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_audit_event_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.code_application_status (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ref.code_application_status IS 'Lifecycle status of a welfare application';

CREATE TABLE IF NOT EXISTS ref.code_address_type (
  code        text        PRIMARY KEY,
  label       text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
