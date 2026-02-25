-- Migration 037: Purge and Reset DB for Pure Grounding
-- Clears all transient chat, case, and legacy fact data.
BEGIN;
-- 1. Clear Transient Chat and Decision Data
TRUNCATE public.chat_messages CASCADE;
TRUNCATE public.conversations CASCADE;
TRUNCATE public.approval_queue CASCADE;
TRUNCATE public.audit_log CASCADE;
-- 2. Clear App Schema Case Data
TRUNCATE app.claimant_case CASCADE;
-- 3. Drop Legacy Shadow Tables (Conflicting Alex Johnson data, etc.)
DROP TABLE IF EXISTS app.claimant CASCADE;
DROP TABLE IF EXISTS app.household CASCADE;
DROP TABLE IF EXISTS app.household_membership CASCADE;
DROP TABLE IF EXISTS app.application CASCADE;
DROP TABLE IF EXISTS app.application_program CASCADE;
DROP TABLE IF EXISTS app.employment_fact CASCADE;
DROP TABLE IF EXISTS app.employer_record CASCADE;
DROP TABLE IF EXISTS app.earned_income_period_fact CASCADE;
DROP TABLE IF EXISTS app.housing_payment_fact CASCADE;
DROP TABLE IF EXISTS app.document_evidence CASCADE;
DROP TABLE IF EXISTS app.extracted_field CASCADE;
DROP TABLE IF EXISTS app.decision CASCADE;
DROP TABLE IF EXISTS app.decision_reason CASCADE;
DROP TABLE IF EXISTS app.rule_evaluation CASCADE;
DROP TABLE IF EXISTS app.rule_catalog CASCADE;
-- 4. Drop Legacy RPCs (Cleaning up PostgREST footprint)
DROP FUNCTION IF EXISTS public.get_claimant_household(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_household_members(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_by_ref(text);
DROP FUNCTION IF EXISTS public.get_claimant_employment(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_application(uuid);
DROP FUNCTION IF EXISTS public.get_application_programs(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_income_summary(uuid, date);
DROP FUNCTION IF EXISTS public.get_application_decisions(uuid);
DROP FUNCTION IF EXISTS public.get_decision_reasons(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_housing_payments(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_employer_records(uuid);
COMMIT;