-- Migration 021: Demo scenarios table
-- Schema: app
-- Stores demo case scenarios with full intake payloads for testing/reference

CREATE TABLE IF NOT EXISTS app.claimant_case (
  beneficiary_id text PRIMARY KEY,
  claimant_name text NOT NULL,
  scenario_id text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL,
  intake_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_claimant_case__scenario UNIQUE (scenario_id)
);

COMMENT ON TABLE app.claimant_case IS 'Demo case scenarios with full intake payloads for testing and reference';
COMMENT ON COLUMN app.claimant_case.beneficiary_id IS 'Unique beneficiary identifier (e.g., BEN-ATLAS-001)';
COMMENT ON COLUMN app.claimant_case.scenario_id IS 'Scenario identifier (e.g., clean_approve)';
COMMENT ON COLUMN app.claimant_case.intake_payload IS 'Complete IntakePayload structure as JSONB for flexible querying';

-- GIN index for JSONB queries on intake_payload
CREATE INDEX IF NOT EXISTS idx_claimant_case_payload_gin
  ON app.claimant_case USING gin (intake_payload);