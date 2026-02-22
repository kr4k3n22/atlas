-- Migration 015: Indexes for common query patterns

-- app.claimant
CREATE INDEX IF NOT EXISTS ix_claimant_external_ref
  ON app.claimant (external_claimant_ref);

CREATE INDEX IF NOT EXISTS ix_claimant_email
  ON app.claimant (email);

-- app.household_membership
CREATE INDEX IF NOT EXISTS ix_household_membership_household
  ON app.household_membership (household_id);

CREATE INDEX IF NOT EXISTS ix_household_membership_claimant
  ON app.household_membership (claimant_id);

-- app.application
CREATE INDEX IF NOT EXISTS ix_application_claimant
  ON app.application (claimant_id);

CREATE INDEX IF NOT EXISTS ix_application_status
  ON app.application (status_code);

CREATE INDEX IF NOT EXISTS ix_application_submitted_at
  ON app.application (submitted_at);

-- app.employment_fact
CREATE INDEX IF NOT EXISTS ix_employment_fact_claimant
  ON app.employment_fact (claimant_id);

-- app.earned_income_period_fact
CREATE INDEX IF NOT EXISTS ix_earned_income_period_fact_claimant
  ON app.earned_income_period_fact (claimant_id);

CREATE INDEX IF NOT EXISTS ix_earned_income_period_fact_period
  ON app.earned_income_period_fact (claimant_id, period_start, period_end);

-- app.other_income_fact
CREATE INDEX IF NOT EXISTS ix_other_income_fact_claimant
  ON app.other_income_fact (claimant_id);

-- app.bank_account_fact
CREATE INDEX IF NOT EXISTS ix_bank_account_fact_claimant
  ON app.bank_account_fact (claimant_id);

-- app.asset_fact
CREATE INDEX IF NOT EXISTS ix_asset_fact_claimant
  ON app.asset_fact (claimant_id);

-- app.housing_payment_fact
CREATE INDEX IF NOT EXISTS ix_housing_payment_fact_claimant
  ON app.housing_payment_fact (claimant_id);

-- app.document_evidence
CREATE INDEX IF NOT EXISTS ix_document_evidence_claimant
  ON app.document_evidence (claimant_id);

CREATE INDEX IF NOT EXISTS ix_document_evidence_application
  ON app.document_evidence (application_id);

-- app.decision
CREATE INDEX IF NOT EXISTS ix_decision_application
  ON app.decision (application_id);

CREATE INDEX IF NOT EXISTS ix_decision_decided_at
  ON app.decision (decided_at DESC);

-- app.rule_evaluation
CREATE INDEX IF NOT EXISTS ix_rule_evaluation_decision
  ON app.rule_evaluation (decision_id);

-- audit.audit_event
CREATE INDEX IF NOT EXISTS ix_audit_event_table_row
  ON audit.audit_event (schema_name, table_name, row_id);

CREATE INDEX IF NOT EXISTS ix_audit_event_occurred_at
  ON audit.audit_event (occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_event_actor
  ON audit.audit_event (actor_type_code, actor_id);
