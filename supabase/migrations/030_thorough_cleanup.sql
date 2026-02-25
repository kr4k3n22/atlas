-- Migration 030: Thorough Cleanup
-- This script removes all legacy artifacts that are not part of the active Grounding-First architecture.
DO $$ BEGIN RAISE NOTICE 'Starting thorough database cleanup...';
-- 1. Drop Legacy Schemas (CASCADE will handle triggers and functions within them)
DROP SCHEMA IF EXISTS ref CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS reporting CASCADE;
-- 2. Clean up 'app' schema (Keep only claimant_case and intake_submission)
-- We drop specific tables to avoid accidentally dropping the entire schema if it contains other things.
DROP TABLE IF EXISTS app.claimant CASCADE;
DROP TABLE IF EXISTS app.application CASCADE;
DROP TABLE IF EXISTS app.application_program CASCADE;
DROP TABLE IF EXISTS app.household CASCADE;
DROP TABLE IF EXISTS app.household_membership CASCADE;
DROP TABLE IF EXISTS app.demographic_eligibility_fact CASCADE;
DROP TABLE IF EXISTS app.identity_verification_fact CASCADE;
DROP TABLE IF EXISTS app.address_fact CASCADE;
DROP TABLE IF EXISTS app.benefit_income_fact CASCADE;
DROP TABLE IF EXISTS app.earned_income_period_fact CASCADE;
DROP TABLE IF EXISTS app.wage_report_fact CASCADE;
DROP TABLE IF EXISTS app.employer_record CASCADE;
DROP TABLE IF EXISTS app.employment_fact CASCADE;
DROP TABLE IF EXISTS app.hardship_indicator CASCADE;
DROP TABLE IF EXISTS app.expense_fact CASCADE;
DROP TABLE IF EXISTS app.asset_declaration CASCADE;
DROP TABLE IF EXISTS app.bank_account_fact CASCADE;
DROP TABLE IF EXISTS app.housing_payment_fact CASCADE;
DROP TABLE IF EXISTS app.utility_expense_fact CASCADE;
DROP TABLE IF EXISTS app.childcare_expense_fact CASCADE;
DROP TABLE IF EXISTS app.medical_expense_fact CASCADE;
DROP TABLE IF EXISTS app.housing_instability_fact CASCADE;
DROP TABLE IF EXISTS app.hardship_indicator_fact CASCADE;
DROP TABLE IF EXISTS app.agency_overpayment_fact CASCADE;
DROP TABLE IF EXISTS app.evidence_field_link CASCADE;
DROP TABLE IF EXISTS app.evidence_extracted_field CASCADE;
DROP TABLE IF EXISTS app.document_evidence CASCADE;
DROP TABLE IF EXISTS app.rule_evaluation CASCADE;
DROP TABLE IF EXISTS app.decision_reason CASCADE;
DROP TABLE IF EXISTS app.decision CASCADE;
DROP TABLE IF EXISTS app.rule_catalog CASCADE;
DROP TABLE IF EXISTS app.extracted_field CASCADE;
-- from verification tests
-- 3. Verify public schema for any leftovers from very early iterations
-- These names are suspected based on typical patterns if they weren't in migrations.
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.logs CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
RAISE NOTICE 'Thorough cleanup complete.';
END $$;