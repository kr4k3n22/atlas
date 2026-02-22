-- Migration 012: Rules and decisions
-- Schema: app

-- app.rule_catalog
CREATE TABLE IF NOT EXISTS app.rule_catalog (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  rule_key        text        NOT NULL,
  rule_version    integer     NOT NULL DEFAULT 1,
  program_type_code text      NULL,
  description     text        NOT NULL,
  rule_logic_ref  text        NULL,   -- e.g. git SHA or doc URL
  is_active       boolean     NOT NULL DEFAULT true,
  effective_from  date        NOT NULL,
  effective_to    date        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_rule_catalog PRIMARY KEY (id),
  CONSTRAINT uq_rule_catalog__key_version UNIQUE (rule_key, rule_version),
  CONSTRAINT fk_rule_catalog__program FOREIGN KEY (program_type_code)
    REFERENCES ref.code_program_type (code),
  CONSTRAINT ck_rule_catalog__dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
COMMENT ON TABLE app.rule_catalog IS 'Versioned registry of eligibility and policy rules';

-- app.decision
CREATE TABLE IF NOT EXISTS app.decision (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  application_id          uuid        NOT NULL,
  schema_version          integer     NOT NULL DEFAULT 1,
  decision_result_code    text        NOT NULL,
  decided_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NULL,
  rule_version_snapshot   jsonb       NULL,   -- snapshot of active rule versions at decision time
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_decision PRIMARY KEY (id),
  CONSTRAINT fk_decision__application FOREIGN KEY (application_id)
    REFERENCES app.application (id),
  CONSTRAINT fk_decision__result FOREIGN KEY (decision_result_code)
    REFERENCES ref.code_decision_result (code)
);
COMMENT ON TABLE app.decision IS 'Automated eligibility decision for an application';

-- app.decision_reason
CREATE TABLE IF NOT EXISTS app.decision_reason (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  decision_id     uuid    NOT NULL,
  reason_code     text    NOT NULL,
  detail          text    NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_decision_reason PRIMARY KEY (id),
  CONSTRAINT fk_dr__decision    FOREIGN KEY (decision_id)  REFERENCES app.decision (id),
  CONSTRAINT fk_dr__reason_code FOREIGN KEY (reason_code)  REFERENCES ref.code_reason_code (code)
);
COMMENT ON TABLE app.decision_reason IS 'One or more explainability codes attached to a decision';

-- app.rule_evaluation
CREATE TABLE IF NOT EXISTS app.rule_evaluation (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  decision_id     uuid        NOT NULL,
  rule_catalog_id uuid        NOT NULL,
  eval_result_code text       NOT NULL,
  score           numeric(5,4) NULL,
  detail          text        NULL,
  evaluated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_rule_evaluation PRIMARY KEY (id),
  CONSTRAINT fk_re__decision    FOREIGN KEY (decision_id)     REFERENCES app.decision (id),
  CONSTRAINT fk_re__rule        FOREIGN KEY (rule_catalog_id) REFERENCES app.rule_catalog (id),
  CONSTRAINT fk_re__result      FOREIGN KEY (eval_result_code) REFERENCES ref.code_rule_eval_result (code),
  CONSTRAINT ck_re__score       CHECK (score IS NULL OR (score >= 0 AND score <= 1))
);
COMMENT ON TABLE app.rule_evaluation IS 'Individual rule evaluation result within a decision';

-- app.adverse_action_explanation
CREATE TABLE IF NOT EXISTS app.adverse_action_explanation (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  decision_id     uuid    NOT NULL,
  explanation     text    NOT NULL,
  appeal_deadline date    NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_adverse_action_explanation PRIMARY KEY (id),
  CONSTRAINT fk_aae__decision FOREIGN KEY (decision_id) REFERENCES app.decision (id)
);
COMMENT ON TABLE app.adverse_action_explanation IS 'Statutory adverse action notice text for decisions that deny or restrict benefit';
