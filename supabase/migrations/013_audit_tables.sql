-- Migration 013: Audit tables
-- Schema: audit

-- audit.audit_event — append-only audit trail
CREATE TABLE IF NOT EXISTS audit.audit_event (
  id              bigint      GENERATED ALWAYS AS IDENTITY,
  event_type_code text        NOT NULL,
  actor_type_code text        NULL,
  actor_id        text        NULL,
  request_id      text        NULL,
  schema_name     text        NOT NULL,
  table_name      text        NOT NULL,
  row_id          text        NOT NULL,
  operation       text        NOT NULL,   -- INSERT, UPDATE, DELETE
  old_row         jsonb       NULL,
  new_row         jsonb       NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_audit_event PRIMARY KEY (id),
  CONSTRAINT ck_audit_event__operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  CONSTRAINT fk_audit_event__event_type FOREIGN KEY (event_type_code)
    REFERENCES ref.code_audit_event_type (code),
  CONSTRAINT fk_audit_event__actor_type FOREIGN KEY (actor_type_code)
    REFERENCES ref.code_actor_type (code)
);
COMMENT ON TABLE audit.audit_event IS 'Append-only audit trail; rows are never updated or deleted';
COMMENT ON COLUMN audit.audit_event.old_row IS 'JSONB snapshot of the row before the change (NULL for INSERT)';
COMMENT ON COLUMN audit.audit_event.new_row IS 'JSONB snapshot of the row after the change (NULL for DELETE)';

-- Reusable audit trigger function
-- Reads actor context from session variables set by the application layer:
--   SET LOCAL app.actor_type = 'caseworker';
--   SET LOCAL app.actor_id   = '<user-uuid>';
--   SET LOCAL app.request_id = '<req-uuid>';
CREATE OR REPLACE FUNCTION audit.log_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_type  text := current_setting('app.actor_type', true);
  v_actor_id    text := current_setting('app.actor_id',   true);
  v_request_id  text := current_setting('app.request_id', true);
  v_row_id      text;
  v_old_row     jsonb := NULL;
  v_new_row     jsonb := NULL;
BEGIN
  -- Derive row id from uuid primary key named 'id' when present
  IF TG_OP = 'DELETE' THEN
    v_row_id  := OLD.id::text;
    v_old_row := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id  := NEW.id::text;
    v_new_row := to_jsonb(NEW);
  ELSE -- UPDATE
    v_row_id  := NEW.id::text;
    v_old_row := to_jsonb(OLD);
    v_new_row := to_jsonb(NEW);
  END IF;

  INSERT INTO audit.audit_event (
    event_type_code,
    actor_type_code,
    actor_id,
    request_id,
    schema_name,
    table_name,
    row_id,
    operation,
    old_row,
    new_row
  ) VALUES (
    'row_change',
    NULLIF(v_actor_type, ''),
    NULLIF(v_actor_id,   ''),
    NULLIF(v_request_id, ''),
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    v_row_id,
    TG_OP,
    v_old_row,
    v_new_row
  );

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

COMMENT ON FUNCTION audit.log_row_change() IS
  'Reusable AFTER trigger that writes a row snapshot to audit.audit_event. '
  'Apply with: CREATE TRIGGER trg_audit_<table> AFTER INSERT OR UPDATE OR DELETE ON <table> '
  'FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();';
