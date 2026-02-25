-- Migration 024: Drop legacy RPC functions from migration 020
--
-- These RPC functions queried the old normalized tables (migrations 005–019).
-- All claimant data now lives in app.claimant_case; these functions are no
-- longer needed and their continued presence causes confusion.
--
-- The new consolidated RPCs (get_claimant_profile_summary,
-- get_claimant_intake_payload, get_claimant_case_by_beneficiary_id) are
-- defined in migration 023 and must NOT be dropped here.

DROP FUNCTION IF EXISTS public.get_claimant_by_ref(text);
DROP FUNCTION IF EXISTS public.get_claimant_employment(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_household(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_household_members(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_application(uuid);
DROP FUNCTION IF EXISTS public.get_application_programs(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_income_summary(uuid, date);
DROP FUNCTION IF EXISTS public.get_application_decisions(uuid);
DROP FUNCTION IF EXISTS public.get_decision_reasons(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_housing_payments(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_employer_records(uuid);
DROP FUNCTION IF EXISTS public.get_claimant_by_ref_case(text);
DROP FUNCTION IF EXISTS public.get_claimant_case_by_scenario_id(text);
