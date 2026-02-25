-- Migration 021: Create app.claimant_case table for full intake payload storage
--
-- app.set_updated_at() is already defined in migration 014.
-- This migration only creates the table, index, and trigger that reference it.

CREATE TABLE IF NOT EXISTS app.claimant_case (
  beneficiary_id text PRIMARY KEY,
  claimant_name  text NOT NULL,
  scenario_id    text NOT NULL UNIQUE,
  label          text NOT NULL,
  description    text NOT NULL,
  intake_payload jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  app.claimant_case IS 'Claimant case profiles with full intake payloads';
COMMENT ON COLUMN app.claimant_case.beneficiary_id IS 'Unique beneficiary identifier (e.g., BEN-ATLAS-001)';
COMMENT ON COLUMN app.claimant_case.scenario_id IS 'Scenario identifier for test/demo routing';
COMMENT ON COLUMN app.claimant_case.intake_payload IS 'Complete IntakePayload JSONB — source of truth for grounding';

CREATE INDEX IF NOT EXISTS idx_claimant_case_payload_gin
  ON app.claimant_case USING gin (intake_payload);

-- Re-use the existing app.set_updated_at() trigger function (defined in 014).
CREATE OR REPLACE TRIGGER trg_claimant_case_updated_at
  BEFORE UPDATE ON app.claimant_case
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
