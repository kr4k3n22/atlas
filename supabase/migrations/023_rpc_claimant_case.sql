-- Migration 023: RPC functions for app.claimant_case
--
-- All functions are in the public schema so PostgREST can call them without
-- requiring app schema exposure.  SET search_path = public, app ensures the
-- function body can reference app.claimant_case without schema-qualifying every
-- identifier.

-- ── get_claimant_intake_payload ───────────────────────────────────────────────
-- Returns the full intake_payload JSONB for a given beneficiary_id.
CREATE OR REPLACE FUNCTION public.get_claimant_intake_payload(p_beneficiary_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT cc.intake_payload
  FROM   app.claimant_case cc
  WHERE  cc.beneficiary_id = p_beneficiary_id
  LIMIT  1;
$$;

-- ── get_claimant_profile_summary ─────────────────────────────────────────────
-- Returns parsed top-level fields from the intake_payload JSONB for UI display.
CREATE OR REPLACE FUNCTION public.get_claimant_profile_summary(p_beneficiary_id text)
RETURNS TABLE (
  beneficiary_id          text,
  claimant_name           text,
  scenario_id             text,
  label                   text,
  description             text,
  case_id                 text,
  timestamp_utc           text,
  jurisdiction            text,
  benefit_type            text,
  decision_type           text,
  payment_due_within_days integer,
  case_age_days           integer,
  channel                 text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    cc.beneficiary_id,
    cc.claimant_name,
    cc.scenario_id,
    cc.label,
    cc.description,
    (cc.intake_payload ->> 'case_id')::text,
    (cc.intake_payload ->> 'timestamp_utc')::text,
    (cc.intake_payload ->> 'jurisdiction')::text,
    (cc.intake_payload ->> 'benefit_type')::text,
    (cc.intake_payload -> 'decision_context' ->> 'decision_type')::text,
    (cc.intake_payload -> 'decision_context' ->> 'payment_due_within_days')::integer,
    (cc.intake_payload -> 'decision_context' ->> 'case_age_days')::integer,
    (cc.intake_payload -> 'decision_context' ->> 'channel')::text
  FROM app.claimant_case cc
  WHERE cc.beneficiary_id = p_beneficiary_id
  LIMIT 1;
$$;

-- ── get_claimant_case_by_beneficiary_id ──────────────────────────────────────
-- Returns the full row from app.claimant_case.
CREATE OR REPLACE FUNCTION public.get_claimant_case_by_beneficiary_id(p_beneficiary_id text)
RETURNS TABLE (
  beneficiary_id text,
  claimant_name  text,
  scenario_id    text,
  label          text,
  description    text,
  intake_payload jsonb,
  created_at     timestamptz,
  updated_at     timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    cc.beneficiary_id,
    cc.claimant_name,
    cc.scenario_id,
    cc.label,
    cc.description,
    cc.intake_payload,
    cc.created_at,
    cc.updated_at
  FROM app.claimant_case cc
  WHERE cc.beneficiary_id = p_beneficiary_id
  LIMIT 1;
$$;
