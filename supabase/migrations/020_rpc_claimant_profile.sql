-- Migration: 020_rpc_claimant_profile.sql
--
-- Creates public-schema RPC functions that proxy queries into the app schema.
-- This ensures PostgREST can call them without requiring app schema exposure.

-- Function: get_claimant_by_ref(p_ref text)
-- Returns the claimant row from app.claimant matching external_claimant_ref
CREATE OR REPLACE FUNCTION public.get_claimant_by_ref(p_ref text)
RETURNS TABLE (
  id uuid,
  external_claimant_ref text,
  first_name text,
  last_name text,
  date_of_birth date,
  email citext,
  phone text,
  preferred_language text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, external_claimant_ref, first_name, last_name, date_of_birth, email, phone, preferred_language
  FROM app.claimant
  WHERE external_claimant_ref = p_ref
  LIMIT 1;
$$;

-- Function: get_claimant_employment(p_claimant_id uuid)
-- Returns most recent employment status
CREATE OR REPLACE FUNCTION public.get_claimant_employment(p_claimant_id uuid)
RETURNS TABLE (
  employment_status_code text,
  start_date date,
  end_date date,
  source_code text,
  verification_status_code text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT employment_status_code, start_date, end_date, source_code, verification_status_code
  FROM app.employment_fact
  WHERE claimant_id = p_claimant_id
  ORDER BY last_updated_at DESC
  LIMIT 1;
$$;

-- Function: get_claimant_household(p_claimant_id uuid)
-- Returns household info for a claimant
CREATE OR REPLACE FUNCTION public.get_claimant_household(p_claimant_id uuid)
RETURNS TABLE (
  household_id uuid,
  household_ref text,
  postcode text,
  town text,
  address_line_1 text,
  country_code text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT h.id, h.household_ref, h.postcode, h.town, h.address_line_1, h.country_code
  FROM app.household_membership hm
  JOIN app.household h ON h.id = hm.household_id
  WHERE hm.claimant_id = p_claimant_id
    AND hm.end_date IS NULL
  ORDER BY hm.start_date DESC
  LIMIT 1;
$$;

-- Function: get_claimant_household_members(p_household_id uuid)
-- Returns all current members of a household
CREATE OR REPLACE FUNCTION public.get_claimant_household_members(p_household_id uuid)
RETURNS TABLE (
  claimant_id uuid,
  first_name text,
  last_name text,
  relationship_to_primary_code text,
  is_primary boolean
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id, c.first_name, c.last_name, hm.relationship_to_primary_code, hm.is_primary
  FROM app.household_membership hm
  JOIN app.claimant c ON c.id = hm.claimant_id
  WHERE hm.household_id = p_household_id
    AND hm.end_date IS NULL;
$$;

-- Function: get_claimant_application(p_claimant_id uuid)
-- Returns most recent application
CREATE OR REPLACE FUNCTION public.get_claimant_application(p_claimant_id uuid)
RETURNS TABLE (
  id uuid,
  application_ref text,
  status_code text,
  submitted_at timestamptz,
  currency_code text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, application_ref, status_code, submitted_at, currency_code
  FROM app.application
  WHERE claimant_id = p_claimant_id
  ORDER BY submitted_at DESC NULLS LAST
  LIMIT 1;
$$;

-- Function: get_application_programs(p_application_id uuid)
CREATE OR REPLACE FUNCTION public.get_application_programs(p_application_id uuid)
RETURNS TABLE (
  program_type_code text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT program_type_code
  FROM app.application_program
  WHERE application_id = p_application_id;
$$;

-- Function: get_claimant_income_summary(p_claimant_id uuid, p_since date)
-- Returns earned income periods since a given date
CREATE OR REPLACE FUNCTION public.get_claimant_income_summary(p_claimant_id uuid, p_since date)
RETURNS TABLE (
  gross_income_minor bigint,
  net_income_minor bigint,
  currency_code text,
  period_end date
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT gross_income_minor, net_income_minor, currency_code, period_end
  FROM app.earned_income_period_fact
  WHERE claimant_id = p_claimant_id
    AND period_start >= p_since;
$$;

-- Function: get_application_decisions(p_application_id uuid)
CREATE OR REPLACE FUNCTION public.get_application_decisions(p_application_id uuid)
RETURNS TABLE (
  id uuid,
  decision_result_code text,
  decided_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, decision_result_code, decided_at
  FROM app.decision
  WHERE application_id = p_application_id
  ORDER BY decided_at DESC
  LIMIT 5;
$$;

-- Function: get_decision_reasons(p_decision_id uuid)
CREATE OR REPLACE FUNCTION public.get_decision_reasons(p_decision_id uuid)
RETURNS TABLE (
  reason_code text,
  detail text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT reason_code, detail
  FROM app.decision_reason
  WHERE decision_id = p_decision_id;
$$;

-- Function: get_claimant_housing_payments(p_claimant_id uuid)
CREATE OR REPLACE FUNCTION public.get_claimant_housing_payments(p_claimant_id uuid)
RETURNS TABLE (
  payment_type_code text,
  amount_minor bigint,
  currency_code text,
  frequency_code text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT payment_type_code, amount_minor, currency_code, frequency_code
  FROM app.housing_payment_fact
  WHERE claimant_id = p_claimant_id;
$$;

-- Function: get_claimant_employer_records(p_claimant_id uuid)
CREATE OR REPLACE FUNCTION public.get_claimant_employer_records(p_claimant_id uuid)
RETURNS TABLE (
  id uuid,
  employer_name text,
  status_code text,
  start_date date,
  end_date date
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, employer_name, status_code, start_date, end_date
  FROM app.employer_record
  WHERE claimant_id = p_claimant_id;
$$;
