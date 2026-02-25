-- Migration 036: Delete Duplicate Ella and Final Legacy Tables
-- Removes BEN-ATLAS-005 and cleans up lingering app schema tables.
BEGIN;
-- 1. Remove the redundant Ella record
DELETE FROM app.claimant_case
WHERE beneficiary_id = 'BEN-ATLAS-005';
-- 2. Definitive removal of remaining legacy tables in 'app' schema
DROP TABLE IF EXISTS app.asset_fact CASCADE;
DROP TABLE IF EXISTS app.extracted_field_link CASCADE;
DROP TABLE IF EXISTS app.government_identifier_fact CASCADE;
DROP TABLE IF EXISTS app.income_volatility_fact CASCADE;
DROP TABLE IF EXISTS app.other_income_fact CASCADE;
DROP TABLE IF EXISTS app.self_employment_fact CASCADE;
DROP TABLE IF EXISTS app.unemployment_benefit_fact CASCADE;
DROP TABLE IF EXISTS app.wage_rate_fact CASCADE;
DROP TABLE IF EXISTS app.adverse_action_explanation CASCADE;
COMMIT;