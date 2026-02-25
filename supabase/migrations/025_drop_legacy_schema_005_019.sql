-- Migration 025: Drop legacy schema tables from migrations 005–019
--
-- Drops all old normalized tables in reverse dependency order.
-- app.claimant_case (021), its trigger, and the new RPCs (023) are NOT dropped.
--
-- Wrapped in a transaction so the entire drop is atomic.

BEGIN;

-- ── 018: reporting views ──────────────────────────────────────────────────────
DROP VIEW IF EXISTS reporting.v_active_claimants CASCADE;
DROP VIEW IF EXISTS reporting.v_application_summary CASCADE;
DROP VIEW IF EXISTS reporting.v_decision_summary CASCADE;
DROP VIEW IF EXISTS reporting.v_income_summary CASCADE;
DROP VIEW IF EXISTS reporting.v_household_summary CASCADE;

-- ── Drop all triggers that call audit.log_row_change ─────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT trigger_schema, trigger_name, event_object_schema, event_object_table
    FROM information_schema.triggers
    WHERE action_statement ILIKE '%audit.log_row_change%'
       OR action_statement ILIKE '%log_row_change%'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      r.trigger_name,
      r.event_object_schema,
      r.event_object_table
    );
  END LOOP;
END;
$$;

-- ── 013–014: audit tables and trigger function ────────────────────────────────
DROP TABLE IF EXISTS audit.audit_event CASCADE;
DROP FUNCTION IF EXISTS audit.log_row_change() CASCADE;

-- ── 012: rules and decisions ──────────────────────────────────────────────────
DROP TABLE IF EXISTS app.rule_evaluation CASCADE;
DROP TABLE IF EXISTS app.decision_reason CASCADE;
DROP TABLE IF EXISTS app.decision CASCADE;
DROP TABLE IF EXISTS app.rule_catalog CASCADE;

-- ── 011: evidence tables ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS app.evidence_field_link CASCADE;
DROP TABLE IF EXISTS app.evidence_extracted_field CASCADE;
DROP TABLE IF EXISTS app.document_evidence CASCADE;

-- ── 010: assets, expenses, hardship ──────────────────────────────────────────
DROP TABLE IF EXISTS app.hardship_indicator CASCADE;
DROP TABLE IF EXISTS app.expense_fact CASCADE;
DROP TABLE IF EXISTS app.asset_declaration CASCADE;
DROP TABLE IF EXISTS app.bank_account_fact CASCADE;

-- ── 009: income and employment facts ─────────────────────────────────────────
DROP TABLE IF EXISTS app.benefit_income_fact CASCADE;
DROP TABLE IF EXISTS app.earned_income_period_fact CASCADE;
DROP TABLE IF EXISTS app.wage_report_fact CASCADE;
DROP TABLE IF EXISTS app.employer_record CASCADE;
DROP TABLE IF EXISTS app.employment_fact CASCADE;

-- ── 008: identity, household facts ───────────────────────────────────────────
DROP TABLE IF EXISTS app.demographic_eligibility_fact CASCADE;
DROP TABLE IF EXISTS app.identity_verification_fact CASCADE;
DROP TABLE IF EXISTS app.address_fact CASCADE;

-- ── 007: core entities ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS app.application_program CASCADE;
DROP TABLE IF EXISTS app.application CASCADE;
DROP TABLE IF EXISTS app.household_membership CASCADE;
DROP TABLE IF EXISTS app.household CASCADE;
DROP TABLE IF EXISTS app.claimant CASCADE;

-- ── 006: ref.code_* tables (dynamic drop) ────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'ref'
      AND table_name LIKE 'code_%'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
  END LOOP;
END;
$$;

COMMIT;
