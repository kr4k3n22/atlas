-- Migration 019: Database roles with least-privilege access

-- app_rw — read/write on app schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_rw;

-- app_ro — read-only on app schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_ro;

-- caseworker_rw — read/write on app schema; no access to sensitive columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'caseworker_rw') THEN
    CREATE ROLE caseworker_rw NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO caseworker_rw;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO caseworker_rw;
-- Restrict DELETE on claimant and application to protect data integrity
REVOKE DELETE ON app.claimant     FROM caseworker_rw;
REVOKE DELETE ON app.application  FROM caseworker_rw;

-- auditor_ro — read-only on audit schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auditor_ro') THEN
    CREATE ROLE auditor_ro NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA audit TO auditor_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO auditor_ro;

-- etl_rw — read/write for data pipeline (app + ref schemas)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'etl_rw') THEN
    CREATE ROLE etl_rw NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO etl_rw;
GRANT USAGE ON SCHEMA ref TO etl_rw;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO etl_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA ref TO etl_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO etl_rw;

-- migration_role — DDL privileges
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_role') THEN
    CREATE ROLE migration_role NOLOGIN;
  END IF;
END $$;
GRANT ALL ON SCHEMA app     TO migration_role;
GRANT ALL ON SCHEMA ref     TO migration_role;
GRANT ALL ON SCHEMA audit   TO migration_role;
GRANT ALL ON SCHEMA reporting TO migration_role;
