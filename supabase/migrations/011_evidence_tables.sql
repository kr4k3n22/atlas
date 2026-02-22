-- Migration 011: Evidence tables — document evidence, extracted fields, field links
-- Schema: app

-- app.document_evidence
CREATE TABLE IF NOT EXISTS app.document_evidence (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  claimant_id             uuid        NOT NULL,
  application_id          uuid        NULL,
  document_type_code      text        NOT NULL,
  document_source_code    text        NOT NULL,
  file_format_code        text        NULL,
  file_name               text        NULL,
  file_size_bytes         bigint      NULL,
  storage_ref             text        NULL,           -- bucket/key or object URL
  uploaded_at             timestamptz NULL,
  extraction_run_id       text        NULL,
  overall_confidence      numeric(5,4) NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_evidence PRIMARY KEY (id),
  CONSTRAINT fk_de__claimant    FOREIGN KEY (claimant_id)          REFERENCES app.claimant (id),
  CONSTRAINT fk_de__application FOREIGN KEY (application_id)       REFERENCES app.application (id),
  CONSTRAINT fk_de__doc_type    FOREIGN KEY (document_type_code)   REFERENCES ref.code_document_type (code),
  CONSTRAINT fk_de__doc_source  FOREIGN KEY (document_source_code) REFERENCES ref.code_document_source (code),
  CONSTRAINT fk_de__file_format FOREIGN KEY (file_format_code)     REFERENCES ref.code_file_format (code),
  CONSTRAINT ck_de__confidence  CHECK (overall_confidence IS NULL OR (overall_confidence >= 0 AND overall_confidence <= 1)),
  CONSTRAINT ck_de__file_size   CHECK (file_size_bytes IS NULL OR file_size_bytes > 0)
);
COMMENT ON TABLE app.document_evidence IS 'Uploaded documents submitted as evidence for a claim';
COMMENT ON COLUMN app.document_evidence.storage_ref IS 'Reference to the object in blob storage (never store the file content here)';

-- app.extracted_field
CREATE TABLE IF NOT EXISTS app.extracted_field (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  document_evidence_id    uuid        NOT NULL,
  field_name              text        NOT NULL,
  raw_value               text        NULL,           -- exactly as extracted from document
  normalized_value        text        NULL,           -- after type coercion / cleaning
  data_type               text        NULL,           -- 'text', 'date', 'integer', 'boolean'
  confidence_score        numeric(5,4) NULL,
  page_number             integer     NULL,
  bounding_box            jsonb       NULL,           -- {x, y, width, height}
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_extracted_field PRIMARY KEY (id),
  CONSTRAINT fk_extf__document    FOREIGN KEY (document_evidence_id) REFERENCES app.document_evidence (id),
  CONSTRAINT ck_extf__confidence  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CONSTRAINT ck_extf__page        CHECK (page_number IS NULL OR page_number > 0)
);
COMMENT ON TABLE app.extracted_field IS 'Individual fields extracted from a document; raw_value preserves original, normalized_value is cleaned';
COMMENT ON COLUMN app.extracted_field.raw_value IS 'Value exactly as extracted by OCR/NLP — never modified';
COMMENT ON COLUMN app.extracted_field.normalized_value IS 'Cleaned, typed value after post-processing';

-- app.extracted_field_link
-- Links an extracted field to the fact table row it was used to populate
CREATE TABLE IF NOT EXISTS app.extracted_field_link (
  id                      uuid    NOT NULL DEFAULT gen_random_uuid(),
  extracted_field_id      uuid    NOT NULL,
  target_table            text    NOT NULL,   -- e.g. 'app.earned_income_period_fact'
  target_row_id           uuid    NOT NULL,
  target_column           text    NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_extracted_field_link PRIMARY KEY (id),
  CONSTRAINT fk_efl__field FOREIGN KEY (extracted_field_id) REFERENCES app.extracted_field (id)
);
COMMENT ON TABLE app.extracted_field_link IS 'Provenance link from an extracted document field to the fact table row it populated';
