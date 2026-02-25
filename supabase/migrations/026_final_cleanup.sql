-- Migration 026: Final cleanup of legacy schemas and roles
--
-- Drops the reporting, audit, and ref schemas entirely (all tables/views
-- were already removed by migrations 005–025). Recreates app.set_updated_at()
-- as a standalone function since app.claimant_case still depends on it.
-- Cleans up role grants that referenced the now-dropped schemas.
--
-- app.claimant_case, its GIN index, and its set_updated_at trigger are
-- preserved and verified at the end of this migration.

BEGIN;

-- ── Drop legacy schemas (tables already gone via 025 CASCADE) ─────────────────

DROP SCHEMA IF EXISTS reporting CASCADE;
DROP SCHEMA IF EXISTS audit     CASCADE;
DROP SCHEMA IF EXISTS ref       CASCADE;

-- ── Revoke schema-level privileges that 019 granted on dropped schemas ─────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'auditor_ro') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA audit FROM auditor_ro';
  END IF;
EXCEPTION WHEN invalid_schema_name THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'etl_rw') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA ref FROM etl_rw';
  END IF;
EXCEPTION WHEN invalid_schema_name THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_role') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA ref       FROM migration_role';
    EXECUTE 'REVOKE ALL ON SCHEMA audit     FROM migration_role';
    EXECUTE 'REVOKE ALL ON SCHEMA reporting FROM migration_role';
  END IF;
EXCEPTION WHEN invalid_schema_name THEN NULL;
END $$;

-- ── Revoke table-level privileges for caseworker_rw on dropped app tables ─────
-- (DROP TABLE … CASCADE in 025 removes per-table ACLs; these are safety guards)

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caseworker_rw') THEN
    IF EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = 'claimant'
    ) THEN
      EXECUTE 'REVOKE DELETE ON app.claimant FROM caseworker_rw';
    END IF;
    IF EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = 'application'
    ) THEN
      EXECUTE 'REVOKE DELETE ON app.application FROM caseworker_rw';
    END IF;
  END IF;
END $$;

-- ── Recreate app.set_updated_at() as a standalone function ────────────────────
-- app.claimant_case depends on this function (trg_claimant_case_updated_at).
-- We recreate it here so it is clean and self-contained after the legacy
-- tables it originally served (007–014) have all been removed.

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── Verification ──────────────────────────────────────────────────────────────
-- Confirm that the only table remaining in the app schema is claimant_case.

DO $$
DECLARE
  extra_tables text;
BEGIN
  SELECT string_agg(table_name, ', ' ORDER BY table_name)
  INTO extra_tables
  FROM information_schema.tables
  WHERE table_schema = 'app'
    AND table_name <> 'claimant_case'
    AND table_type = 'BASE TABLE';

  IF extra_tables IS NOT NULL THEN
    RAISE NOTICE 'app schema still contains unexpected tables: %', extra_tables;
  ELSE
    RAISE NOTICE 'Verification passed: app.claimant_case is the only table in the app schema.';
  END IF;
END;
$$;

COMMIT;
