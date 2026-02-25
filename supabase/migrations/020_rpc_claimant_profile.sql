-- Migration: 020_rpc_claimant_profile.sql
--
-- Creates public-schema RPC functions that proxy queries into the app schema.
-- This ensures PostgREST can call them without requiring app schema exposure.
-- Function: get_claimant_profile_summary(p_beneficiary_id text)
CREATE OR REPLACE FUNCTION public.get_claimant_profile_summary(p_beneficiary_id text) RETURNS SETOF app.claimant_case LANGUAGE sql STABLE SECURITY DEFINER AS $$
SELECT *
FROM app.claimant_case
WHERE beneficiary_id = p_beneficiary_id;
$$;
-- Function: get_claimant_intake_payload(p_beneficiary_id text)
CREATE OR REPLACE FUNCTION public.get_claimant_intake_payload(p_beneficiary_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
SELECT intake_payload
FROM app.claimant_case
WHERE beneficiary_id = p_beneficiary_id;
$$;