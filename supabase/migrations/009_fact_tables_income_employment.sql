-- Migration 009: Fact tables — income and employment
-- Schema: app
-- All monetary amounts stored as bigint in minor units (pence for GBP)

-- app.employment_fact
CREATE TABLE IF NOT EXISTS app.employment_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  employment_status_code      text        NOT NULL,
  start_date                  date        NULL,
  end_date                    date        NULL,
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
  CONSTRAINT pk_employment_fact PRIMARY KEY (id),
  CONSTRAINT fk_ef__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_ef__emp_status  FOREIGN KEY (employment_status_code)     REFERENCES ref.code_employment_status (code),
  CONSTRAINT fk_ef__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_ef__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_ef__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_ef__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_ef__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_ef__dates       CHECK (end_date IS NULL OR end_date >= start_date)
);
COMMENT ON TABLE app.employment_fact IS 'Employment status facts for a claimant';

-- app.employer_record
CREATE TABLE IF NOT EXISTS app.employer_record (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id           uuid        NOT NULL,
  employer_name         text        NOT NULL,
  employer_ref          text        NULL,
  status_code           text        NOT NULL,
  start_date            date        NULL,
  end_date              date        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_employer_record PRIMARY KEY (id),
  CONSTRAINT fk_employer_record__claimant FOREIGN KEY (claimant_id) REFERENCES app.claimant (id),
  CONSTRAINT fk_employer_record__status   FOREIGN KEY (status_code) REFERENCES ref.code_employer_record_status (code),
  CONSTRAINT ck_employer_record__dates    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- app.wage_rate_fact
CREATE TABLE IF NOT EXISTS app.wage_rate_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  employer_record_id          uuid        NOT NULL,
  claimant_id                 uuid        NOT NULL,
  wage_amount_minor           bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  wage_unit_code              text        NOT NULL,
  hours_per_week              numeric(5,2) NULL,
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
  CONSTRAINT pk_wage_rate_fact PRIMARY KEY (id),
  CONSTRAINT fk_wrf__employer   FOREIGN KEY (employer_record_id)          REFERENCES app.employer_record (id),
  CONSTRAINT fk_wrf__claimant   FOREIGN KEY (claimant_id)                 REFERENCES app.claimant (id),
  CONSTRAINT fk_wrf__wage_unit  FOREIGN KEY (wage_unit_code)              REFERENCES ref.code_wage_unit (code),
  CONSTRAINT fk_wrf__source     FOREIGN KEY (source_code)                 REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_wrf__verif      FOREIGN KEY (verification_status_code)    REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_wrf__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_wrf__actor_type FOREIGN KEY (entered_by_actor_type_code)  REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_wrf__confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_wrf__wage_positive CHECK (wage_amount_minor >= 0),
  CONSTRAINT ck_wrf__hours      CHECK (hours_per_week IS NULL OR (hours_per_week > 0 AND hours_per_week <= 168))
);
COMMENT ON TABLE app.wage_rate_fact IS 'Wage rate facts; wage_amount_minor is in currency minor units (pence)';

-- app.earned_income_period_fact
CREATE TABLE IF NOT EXISTS app.earned_income_period_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  employer_record_id          uuid        NULL,
  period_start                date        NOT NULL,
  period_end                  date        NOT NULL,
  gross_income_minor          bigint      NOT NULL,   -- pence
  net_income_minor            bigint      NULL,
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
  CONSTRAINT pk_earned_income_period_fact PRIMARY KEY (id),
  CONSTRAINT fk_eipf__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_eipf__employer    FOREIGN KEY (employer_record_id)          REFERENCES app.employer_record (id),
  CONSTRAINT fk_eipf__frequency   FOREIGN KEY (frequency_code)              REFERENCES ref.code_money_frequency (code),
  CONSTRAINT fk_eipf__source      FOREIGN KEY (source_code)                 REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_eipf__verif       FOREIGN KEY (verification_status_code)    REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_eipf__null_status FOREIGN KEY (value_null_status_code)      REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_eipf__actor_type  FOREIGN KEY (entered_by_actor_type_code)  REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_eipf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_eipf__dates       CHECK (period_end >= period_start),
  CONSTRAINT ck_eipf__gross_positive CHECK (gross_income_minor >= 0)
);
COMMENT ON TABLE app.earned_income_period_fact IS 'Earned income for a specific period; amounts in minor currency units (pence)';

-- app.self_employment_fact
CREATE TABLE IF NOT EXISTS app.self_employment_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  business_name               text        NULL,
  period_start                date        NOT NULL,
  period_end                  date        NOT NULL,
  gross_profit_minor          bigint      NOT NULL,
  allowable_expenses_minor    bigint      NOT NULL DEFAULT 0,
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
  CONSTRAINT pk_self_employment_fact PRIMARY KEY (id),
  CONSTRAINT fk_sef__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_sef__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_sef__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_sef__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_sef__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_sef__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_sef__dates       CHECK (period_end >= period_start)
);

-- app.unemployment_benefit_fact
CREATE TABLE IF NOT EXISTS app.unemployment_benefit_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  benefit_type                text        NOT NULL,
  weekly_amount_minor         bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  start_date                  date        NULL,
  end_date                    date        NULL,
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
  CONSTRAINT pk_unemployment_benefit_fact PRIMARY KEY (id),
  CONSTRAINT fk_ubf__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_ubf__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_ubf__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_ubf__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_ubf__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_ubf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_ubf__dates       CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_ubf__amount      CHECK (weekly_amount_minor >= 0)
);

-- app.other_income_fact
CREATE TABLE IF NOT EXISTS app.other_income_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  income_type_code            text        NOT NULL,
  amount_minor                bigint      NOT NULL,   -- pence
  currency_code               text        NOT NULL DEFAULT 'GBP',
  frequency_code              text        NULL,
  period_start                date        NULL,
  period_end                  date        NULL,
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
  CONSTRAINT pk_other_income_fact PRIMARY KEY (id),
  CONSTRAINT fk_oif__claimant    FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_oif__income_type FOREIGN KEY (income_type_code)           REFERENCES ref.code_income_type (code),
  CONSTRAINT fk_oif__frequency   FOREIGN KEY (frequency_code)             REFERENCES ref.code_money_frequency (code),
  CONSTRAINT fk_oif__source      FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_oif__verif       FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_oif__null_status FOREIGN KEY (value_null_status_code)     REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_oif__actor_type  FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_oif__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_oif__amount      CHECK (amount_minor >= 0)
);

-- app.income_volatility_fact
CREATE TABLE IF NOT EXISTS app.income_volatility_fact (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id                 uuid        NOT NULL,
  pattern_code                text        NOT NULL,
  assessment_date             date        NOT NULL,
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
  CONSTRAINT pk_income_volatility_fact PRIMARY KEY (id),
  CONSTRAINT fk_ivf__claimant   FOREIGN KEY (claimant_id)                REFERENCES app.claimant (id),
  CONSTRAINT fk_ivf__pattern    FOREIGN KEY (pattern_code)               REFERENCES ref.code_income_volatility_pattern (code),
  CONSTRAINT fk_ivf__source     FOREIGN KEY (source_code)                REFERENCES ref.code_source_type (code),
  CONSTRAINT fk_ivf__verif      FOREIGN KEY (verification_status_code)   REFERENCES ref.code_verification_status (code),
  CONSTRAINT fk_ivf__null_status FOREIGN KEY (value_null_status_code)    REFERENCES ref.code_value_null_status (code),
  CONSTRAINT fk_ivf__actor_type FOREIGN KEY (entered_by_actor_type_code) REFERENCES ref.code_actor_type (code),
  CONSTRAINT ck_ivf__confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
