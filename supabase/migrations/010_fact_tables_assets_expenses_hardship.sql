-- Migration 010: Fact tables — assets, expenses, hardship
-- Schema: app
-- All monetary amounts stored as bigint in minor units (pence for GBP)

-- app.bank_account_fact
CREATE TABLE IF NOT EXISTS app.bank_account_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  account_type_code           text        NOT NULL,
  institution_name            text        NULL,
  balance_minor               bigint      NULL,       -- pence; NULL when unknown
  currency_code               text        NOT NULL DEFAULT 'GBP',
  as_of_date                  date        NULL,
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
  CONSTRAINT pk_bank_account_fact PRIMARY KEY (id),
  CONSTRAINT fk_baf__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_baf__acct_type   FOREIGN KEY (account_type_code)          REFERENCES ref.code_account_type (code),
  CONSTRAINT fk_baf__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_baf__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_baf__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_baf__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_baf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
COMMENT ON TABLE app.bank_account_fact IS 'Bank account balance facts; balance_minor is in pence';

-- app.asset_fact
CREATE TABLE IF NOT EXISTS app.asset_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  asset_type_code             text        NOT NULL,
  description                 text        NULL,
  value_minor                 bigint      NULL,       -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  countability_status_code    text        NULL,
  as_of_date                  date        NULL,
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
  CONSTRAINT pk_asset_fact PRIMARY KEY (id),
  CONSTRAINT fk_af__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_af__asset_type  FOREIGN KEY (asset_type_code)            REFERENCES ref.code_asset_type (code),
  CONSTRAINT fk_af__countable   FOREIGN KEY (countability_status_code)   REFERENCES ref.code_asset_countability_status (code),
  CONSTRAINT fk_af__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_af__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_af__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_af__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_af__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- app.housing_payment_fact
CREATE TABLE IF NOT EXISTS app.housing_payment_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  payment_type_code           text        NOT NULL,
  amount_minor                bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  frequency_code              text        NULL,
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
  CONSTRAINT pk_housing_payment_fact PRIMARY KEY (id),
  CONSTRAINT fk_hpf__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_hpf__pay_type    FOREIGN KEY (payment_type_code)          REFERENCES ref.code_housing_payment_type (code),
  CONSTRAINT fk_hpf__frequency   FOREIGN KEY (frequency_code)             REFERENCES ref.code_money_frequency (code),
  CONSTRAINT fk_hpf__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_hpf__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_hpf__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_hpf__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_hpf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_hpf__amount      CHECK (amount_minor >= 0)
);

-- app.utility_expense_fact
CREATE TABLE IF NOT EXISTS app.utility_expense_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  utility_type_code           text        NOT NULL,
  monthly_amount_minor        bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
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
  CONSTRAINT pk_utility_expense_fact PRIMARY KEY (id),
  CONSTRAINT fk_uef__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_uef__utility     FOREIGN KEY (utility_type_code)          REFERENCES ref.code_utility_type (code),
  CONSTRAINT fk_uef__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_uef__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_uef__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_uef__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_uef__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_uef__amount      CHECK (monthly_amount_minor >= 0)
);

-- app.childcare_expense_fact
CREATE TABLE IF NOT EXISTS app.childcare_expense_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  provider_type_code          text        NULL,
  weekly_amount_minor         bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  number_of_children          integer     NULL,
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
  CONSTRAINT pk_childcare_expense_fact PRIMARY KEY (id),
  CONSTRAINT fk_cef__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_cef__provider    FOREIGN KEY (provider_type_code)         REFERENCES ref.code_provider_type (code),
  CONSTRAINT fk_cef__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_cef__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_cef__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_cef__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_cef__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_cef__amount      CHECK (weekly_amount_minor >= 0),
  CONSTRAINT ck_cef__children    CHECK (number_of_children IS NULL OR number_of_children > 0)
);

-- app.medical_expense_fact
CREATE TABLE IF NOT EXISTS app.medical_expense_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  description                 text        NULL,
  monthly_amount_minor        bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
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
  CONSTRAINT pk_medical_expense_fact PRIMARY KEY (id),
  CONSTRAINT fk_mef__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_mef__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_mef__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_mef__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_mef__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_mef__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_mef__amount      CHECK (monthly_amount_minor >= 0)
);

-- app.housing_instability_fact
CREATE TABLE IF NOT EXISTS app.housing_instability_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  instability_status_code     text        NOT NULL,
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
  CONSTRAINT pk_housing_instability_fact PRIMARY KEY (id),
  CONSTRAINT fk_hif__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_hif__status      FOREIGN KEY (instability_status_code)    REFERENCES ref.code_housing_instability_status (code),
  CONSTRAINT fk_hif__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_hif__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_hif__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_hif__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_hif__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- app.hardship_indicator_fact
CREATE TABLE IF NOT EXISTS app.hardship_indicator_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  hardship_value_code         text        NOT NULL,
  urgency_level_code          text        NULL,
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
  CONSTRAINT pk_hardship_indicator_fact PRIMARY KEY (id),
  CONSTRAINT fk_hidf__claimant   FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_hidf__hardship   FOREIGN KEY (hardship_value_code)        REFERENCES ref.code_hardship_value (code),
  CONSTRAINT fk_hidf__urgency    FOREIGN KEY (urgency_level_code)         REFERENCES ref.code_urgency_level (code),
  CONSTRAINT fk_hidf__source     FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_hidf__verif      FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_hidf__null_status FOREIGN KEY (value_null_status_code)    REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_hidf__actor_type FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_hidf__confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- app.agency_overpayment_fact
CREATE TABLE IF NOT EXISTS app.agency_overpayment_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  overpayment_amount_minor    bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  repayment_status_code       text        NOT NULL,
  identified_date             date        NULL,
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
  CONSTRAINT pk_agency_overpayment_fact PRIMARY KEY (id),
  CONSTRAINT fk_aof__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_aof__repay_status FOREIGN KEY (repayment_status_code)     REFERENCES ref.code_repayment_status (code),
  CONSTRAINT fk_aof__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_aof__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_aof__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_aof__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_aof__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_aof__amount      CHECK (overpayment_amount_minor >= 0)
);
