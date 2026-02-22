-- Migration 014: Triggers — set_updated_at() and audit triggers on high-impact tables

-- ────────────────────────────────────────────────────────────────────────────
-- set_updated_at() trigger function
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Apply set_updated_at to all mutable app tables
CREATE OR REPLACE TRIGGER trg_set_updated_at_claimant
  BEFORE UPDATE ON app.claimant
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_household
  BEFORE UPDATE ON app.household
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_household_membership
  BEFORE UPDATE ON app.household_membership
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_application
  BEFORE UPDATE ON app.application
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_employer_record
  BEFORE UPDATE ON app.employer_record
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_document_evidence
  BEFORE UPDATE ON app.document_evidence
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_decision
  BEFORE UPDATE ON app.decision
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_updated_at_rule_catalog
  BEFORE UPDATE ON app.rule_catalog
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Audit triggers on high-impact tables
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_audit_claimant
  AFTER INSERT OR UPDATE OR DELETE ON app.claimant
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_application
  AFTER INSERT OR UPDATE OR DELETE ON app.application
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_household_membership
  AFTER INSERT OR UPDATE OR DELETE ON app.household_membership
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_earned_income_period_fact
  AFTER INSERT OR UPDATE OR DELETE ON app.earned_income_period_fact
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_bank_account_fact
  AFTER INSERT OR UPDATE OR DELETE ON app.bank_account_fact
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_document_evidence
  AFTER INSERT OR UPDATE OR DELETE ON app.document_evidence
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_decision
  AFTER INSERT OR UPDATE OR DELETE ON app.decision
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();

CREATE OR REPLACE TRIGGER trg_audit_rule_evaluation
  AFTER INSERT OR UPDATE OR DELETE ON app.rule_evaluation
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();
