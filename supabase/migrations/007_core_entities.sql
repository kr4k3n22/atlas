-- Migration 007: Core entity tables
-- claimant, household, application, application_program
-- Schema: app

-- ────────────────────────────────────────────────────────────────────────────
-- app.claimant
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.claimant (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  external_claimant_ref    text        NOT NULL,     -- e.g. BEN-ATLAS-001
  schema_version           integer     NOT NULL DEFAULT 1,
  first_name               text        NOT NULL,
  middle_name              text        NULL,
  last_name                text        NOT NULL,
  date_of_birth            date        NULL,
  email                    citext      NULL,
  phone                    text        NULL,
  national_insurance_number text       NULL,         -- masked/tokenised
  preferred_language       text        NOT NULL DEFAULT 'en',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_claimant PRIMARY KEY (id),
  CONSTRAINT uq_claimant__external_ref UNIQUE (external_claimant_ref)
);
COMMENT ON TABLE app.claimant IS 'Core identity record for a welfare claimant';
COMMENT ON COLUMN app.claimant.external_claimant_ref IS 'Public-facing reference used in the chat UI (BEN-XXXX pattern)';
COMMENT ON COLUMN app.claimant.national_insurance_number IS 'Stored masked or tokenised; never store plain NI number in application tier';

-- ────────────────────────────────────────────────────────────────────────────
-- app.household
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.household (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  primary_claimant_id uuid   NOT NULL,
  schema_version  integer     NOT NULL DEFAULT 1,
  household_ref   text        NOT NULL,
  address_line_1  text        NULL,
  address_line_2  text        NULL,
  town            text        NULL,
  county          text        NULL,
  postcode        text        NULL,
  country_code    text        NOT NULL DEFAULT 'GB',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_household PRIMARY KEY (id),
  CONSTRAINT uq_household__ref UNIQUE (household_ref),
  CONSTRAINT fk_household__claimant FOREIGN KEY (primary_claimant_id)
    REFERENCES app.claimant (id)
);
COMMENT ON TABLE app.household IS 'Household unit associated with one or more claimants';

-- ────────────────────────────────────────────────────────────────────────────
-- app.household_membership
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.household_membership (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id            uuid        NOT NULL,
  claimant_id             uuid        NOT NULL,
  relationship_to_primary_code text   NOT NULL,
  is_primary              boolean     NOT NULL DEFAULT false,
  start_date              date        NULL,
  end_date                date        NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_household_membership PRIMARY KEY (id),
  CONSTRAINT fk_household_membership__household FOREIGN KEY (household_id)
    REFERENCES app.household (id),
  CONSTRAINT fk_household_membership__claimant FOREIGN KEY (claimant_id)
    REFERENCES app.claimant (id),
  CONSTRAINT fk_household_membership__relationship FOREIGN KEY (relationship_to_primary_code)
    REFERENCES ref.code_relationship_to_primary (code),
  CONSTRAINT ck_household_membership__dates CHECK (end_date IS NULL OR end_date >= start_date)
);
COMMENT ON TABLE app.household_membership IS 'Links claimants to households with their relationship role';

-- ────────────────────────────────────────────────────────────────────────────
-- app.application
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.application (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id         uuid        NOT NULL,
  household_id        uuid        NULL,
  schema_version      integer     NOT NULL DEFAULT 1,
  application_ref     text        NOT NULL,
  status_code         text        NOT NULL,
  submitted_at        timestamptz NULL,
  decision_at         timestamptz NULL,
  currency_code       text        NOT NULL DEFAULT 'GBP',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_application PRIMARY KEY (id),
  CONSTRAINT uq_application__ref UNIQUE (application_ref),
  CONSTRAINT fk_application__claimant FOREIGN KEY (claimant_id)
    REFERENCES app.claimant (id),
  CONSTRAINT fk_application__household FOREIGN KEY (household_id)
    REFERENCES app.household (id),
  CONSTRAINT fk_application__status FOREIGN KEY (status_code)
    REFERENCES ref.code_application_status (code)
);
COMMENT ON TABLE app.application IS 'Welfare benefit application record';
COMMENT ON COLUMN app.application.currency_code IS 'ISO 4217 currency; GBP by default. All monetary values in this application are in minor units (pence)';

-- ────────────────────────────────────────────────────────────────────────────
-- app.application_program
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.application_program (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  application_id  uuid    NOT NULL,
  program_type_code text  NOT NULL,
  start_date      date    NULL,
  end_date        date    NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_application_program PRIMARY KEY (id),
  CONSTRAINT fk_application_program__application FOREIGN KEY (application_id)
    REFERENCES app.application (id),
  CONSTRAINT fk_application_program__program FOREIGN KEY (program_type_code)
    REFERENCES ref.code_program_type (code),
  CONSTRAINT ck_application_program__dates CHECK (end_date IS NULL OR end_date >= start_date)
);
COMMENT ON TABLE app.application_program IS 'Welfare programmes requested within an application';
