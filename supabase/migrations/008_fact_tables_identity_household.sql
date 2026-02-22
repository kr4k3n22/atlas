-- Migration 008: Fact tables — identity, address, household demographics
-- Schema: app

-- ────────────────────────────────────────────────────────────────────────────
-- Reusable fact metadata columns are defined inline on each table.
-- Pattern: source_code, verification_status_code, value_null_status_code,
--          effective_date, observed_at, last_updated_at, confidence_score,
--          entered_by_actor_type_code, entered_by_actor_id, notes
-- ────────────────────────────────────────────────────────────────────────────

-- app.address_fact
CREATE TABLE IF NOT EXISTS app.address_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  address_type_code           text        NOT NULL,
  address_line_1              text        NULL,
  address_line_2              text        NULL,
  town                        text        NULL,
  county                      text        NULL,
  postcode                    text        NULL,
  country_code                text        NOT NULL DEFAULT 'GB',
  -- fact metadata
  source_code                 text        NOT NULL,
  verification_status_code    text        NOT NULL,
  value_null_status_code      text        NULL,
  effective_date              date        NULL,
  observed_at                 timestamptz NULL,
  last_updated_at             timestamptz NOT NULL DEFAULT now(),
  confidence_score            numeric(5,4) NULL,
  entered_by_actor_type_code  text        NULL,
  entered_by_actor_id         text        NULL,
  notes                       text        NULL,
  CONSTRAINT pk_address_fact PRIMARY KEY (id),
  CONSTRAINT fk_address_fact__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_address_fact__addr_type   FOREIGN KEY (address_type_code)          REFERENCES ref.code_address_type (code),
  CONSTRAINT fk_address_fact__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_address_fact__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_address_fact__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_address_fact__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_address_fact__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
COMMENT ON TABLE app.address_fact IS 'Recorded address facts for a claimant (current, postal, previous)';

-- app.identity_verification_fact
CREATE TABLE IF NOT EXISTS app.identity_verification_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  idv_status_code             text        NOT NULL,
  provider                    text        NULL,
  verified_at                 timestamptz NULL,
  -- fact metadata
  source_code                 text        NOT NULL,
  verification_status_code    text        NOT NULL,
  value_null_status_code      text        NULL,
  effective_date              date        NULL,
  observed_at                 timestamptz NULL,
  last_updated_at             timestamptz NOT NULL DEFAULT now(),
  confidence_score            numeric(5,4) NULL,
  entered_by_actor_type_code  text        NULL,
  entered_by_actor_id         text        NULL,
  notes                       text        NULL,
  CONSTRAINT pk_identity_verification_fact PRIMARY KEY (id),
  CONSTRAINT fk_idvf__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_idvf__idv_status  FOREIGN KEY (idv_status_code)            REFERENCES ref.code_identity_verification_status (code),
  CONSTRAINT fk_idvf__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_idvf__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_idvf__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_idvf__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_idvf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- app.government_identifier_fact
CREATE TABLE IF NOT EXISTS app.government_identifier_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  identifier_type             text        NOT NULL,   -- 'NI', 'PASSPORT', 'DL', etc.
  identifier_value_masked     text        NOT NULL,   -- always masked/tokenised
  -- fact metadata
  source_code                 text        NOT NULL,
  verification_status_code    text        NOT NULL,
  value_null_status_code      text        NULL,
  effective_date              date        NULL,
  observed_at                 timestamptz NULL,
  last_updated_at             timestamptz NOT NULL DEFAULT now(),
  confidence_score            numeric(5,4) NULL,
  entered_by_actor_type_code  text        NULL,
  entered_by_actor_id         text        NULL,
  notes                       text        NULL,
  CONSTRAINT pk_government_identifier_fact PRIMARY KEY (id),
  CONSTRAINT fk_gif__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_gif__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_gif__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_gif__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_gif__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_gif__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
COMMENT ON COLUMN app.government_identifier_fact.identifier_value_masked IS 'Always stored masked or tokenised — never plain text';

-- app.demographic_eligibility_fact
CREATE TABLE IF NOT EXISTS app.demographic_eligibility_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  residency_status_code       text        NULL,
  citizenship_status_code     text        NULL,
  age_flag_code               text        NULL,
  disability_status_code      text        NULL,
  student_status_code         text        NULL,
  caregiver_status_code       text        NULL,
  pregnancy_status_code       text        NULL,
  custody_arrangement_code    text        NULL,
  -- fact metadata
  source_code                 text        NOT NULL,
  verification_status_code    text        NOT NULL,
  value_null_status_code      text        NULL,
  effective_date              date        NULL,
  observed_at                 timestamptz NULL,
  last_updated_at             timestamptz NOT NULL DEFAULT now(),
  confidence_score            numeric(5,4) NULL,
  entered_by_actor_type_code  text        NULL,
  entered_by_actor_id         text        NULL,
  notes                       text        NULL,
  CONSTRAINT pk_demographic_eligibility_fact PRIMARY KEY (id),
  CONSTRAINT fk_def__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_def__residency   FOREIGN KEY (residency_status_code)      REFERENCES ref.code_residency_eligibility_status (code),
  CONSTRAINT fk_def__citizenship FOREIGN KEY (citizenship_status_code)    REFERENCES ref.code_citizenship_eligibility_status (code),
  CONSTRAINT fk_def__age_flag    FOREIGN KEY (age_flag_code)              REFERENCES ref.code_age_flag (code),
  CONSTRAINT fk_def__disability  FOREIGN KEY (disability_status_code)     REFERENCES ref.code_disability_status (code),
  CONSTRAINT fk_def__student     FOREIGN KEY (student_status_code)        REFERENCES ref.code_student_status (code),
  CONSTRAINT fk_def__caregiver   FOREIGN KEY (caregiver_status_code)      REFERENCES ref.code_caregiver_status (code),
  CONSTRAINT fk_def__pregnancy   FOREIGN KEY (pregnancy_status_code)      REFERENCES ref.code_pregnancy_status (code),
  CONSTRAINT fk_def__custody     FOREIGN KEY (custody_arrangement_code)   REFERENCES ref.code_custody_arrangement_status (code),
  CONSTRAINT fk_def__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_def__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_def__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_def__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_def__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
COMMENT ON TABLE app.demographic_eligibility_fact IS 'Demographic eligibility flags that affect benefit entitlement';
