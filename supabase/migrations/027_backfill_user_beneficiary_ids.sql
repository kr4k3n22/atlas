-- Migration 027: Backfill beneficiary_id in user_metadata for pre-provisioned demo accounts
--
-- Maps each known demo login email to its corresponding beneficiary_id so that
-- the chat route resolves the correct claimant profile without requiring a
-- re-registration.
--
-- Supabase stores user metadata in auth.users.raw_user_meta_data (JSONB).
-- The || operator merges the new key into the existing metadata without
-- overwriting unrelated fields (e.g. role, displayName).
--
-- Run this once against the Supabase project via the SQL editor or CLI:
--   supabase db push  (if using local dev)
--   or paste into Supabase Dashboard → SQL Editor → Run

BEGIN;

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-002"}'::jsonb
WHERE email = 'alex_haitel@gmail.com';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-003"}'::jsonb
WHERE email = 'noah_chance@gmail.com';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-004"}'::jsonb
WHERE email = 'Reid_Peet_Van_der_Loop@vanderloop.com';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"beneficiary_id": "BEN-ATLAS-005"}'::jsonb
WHERE email = 'ella_gible@yahoo.com';

COMMIT;
