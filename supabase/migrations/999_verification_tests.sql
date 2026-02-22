-- Migration 999: Verification tests
-- Validates schema correctness and data integrity
-- Run after all migrations and seed data have been applied.

DO $$
DECLARE
  v_count    integer;
  v_id       uuid;
  v_claimant_id uuid;
  v_app_id   uuid;
  v_decision_id uuid;
  v_rule_id  uuid;
  v_doc_id   uuid;
  v_field_id uuid;
  v_error    boolean := false;
  v_msg      text;
BEGIN

  RAISE NOTICE '=== ATLAS Schema Verification Tests ===';

  -- ── Test 1: Code tables have expected values ──────────────────────────────
  SELECT count(*) INTO v_count FROM ref.code_value_null_status;
  IF v_count < 4 THEN
    RAISE WARNING 'FAIL Test 1a: code_value_null_status has only % rows (expected >=4)', v_count;
    v_error := true;
  ELSE
    RAISE NOTICE 'PASS Test 1a: code_value_null_status has % rows', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM ref.code_verification_status;
  IF v_count < 5 THEN
    RAISE WARNING 'FAIL Test 1b: code_verification_status has only % rows', v_count;
    v_error := true;
  ELSE
    RAISE NOTICE 'PASS Test 1b: code_verification_status has % rows', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM ref.code_decision_result;
  IF v_count < 4 THEN
    RAISE WARNING 'FAIL Test 1c: code_decision_result has only % rows', v_count;
    v_error := true;
  ELSE
    RAISE NOTICE 'PASS Test 1c: code_decision_result has % rows', v_count;
  END IF;

  -- ── Test 2: Can create claimant/household/application ────────────────────
  v_id := gen_random_uuid();
  INSERT INTO app.claimant (id, external_claimant_ref, first_name, last_name)
  VALUES (v_id, 'BEN-TEST-999', 'Test', 'User');
  v_claimant_id := v_id;
  RAISE NOTICE 'PASS Test 2a: Created test claimant %', v_claimant_id;

  INSERT INTO app.application (id, claimant_id, application_ref, status_code)
  VALUES (gen_random_uuid(), v_claimant_id, 'APP-TEST-999', 'draft')
  RETURNING id INTO v_app_id;
  RAISE NOTICE 'PASS Test 2b: Created test application %', v_app_id;

  -- ── Test 3: FK rejects invalid status code ───────────────────────────────
  BEGIN
    INSERT INTO app.application (claimant_id, application_ref, status_code)
    VALUES (v_claimant_id, 'APP-TEST-INVALID', 'NOT_A_REAL_STATUS');
    RAISE WARNING 'FAIL Test 3: FK did not reject invalid status_code';
    v_error := true;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS Test 3: FK correctly rejected invalid status_code';
  END;

  -- ── Test 4: Check constraint rejects negative wage ───────────────────────
  INSERT INTO app.employer_record (id, claimant_id, employer_name, status_code)
  VALUES (gen_random_uuid(), v_claimant_id, 'Test Employer', 'current')
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO app.wage_rate_fact
      (employer_record_id, claimant_id, wage_amount_minor, wage_unit_code,
       source_code, verification_status_code)
    VALUES (v_id, v_claimant_id, -100, 'hourly', 'claimant_self_report', 'unverified');
    RAISE WARNING 'FAIL Test 4: Check constraint did not reject negative wage';
    v_error := true;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS Test 4: Check constraint correctly rejected negative wage';
  END;

  -- ── Test 5: Document extraction stores raw + normalized values ────────────
  INSERT INTO app.document_evidence
    (id, claimant_id, document_type_code, document_source_code)
  VALUES (gen_random_uuid(), v_claimant_id, 'payslip', 'claimant_upload')
  RETURNING id INTO v_doc_id;

  INSERT INTO app.extracted_field
    (document_evidence_id, field_name, raw_value, normalized_value, data_type, confidence_score)
  VALUES (v_doc_id, 'gross_pay', '£2,100.00', '210000', 'integer', 0.9200)
  RETURNING id INTO v_field_id;

  SELECT count(*) INTO v_count
  FROM app.extracted_field
  WHERE id = v_field_id AND raw_value IS NOT NULL AND normalized_value IS NOT NULL;

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS Test 5: Document extraction stored raw and normalized values';
  ELSE
    RAISE WARNING 'FAIL Test 5: Document extraction values not stored correctly';
    v_error := true;
  END IF;

  -- ── Test 6: Decision rows require valid decision_result_code ─────────────
  BEGIN
    INSERT INTO app.decision (application_id, decision_result_code)
    VALUES (v_app_id, 'INVALID_RESULT_CODE');
    RAISE WARNING 'FAIL Test 6: FK did not reject invalid decision_result_code';
    v_error := true;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS Test 6: FK correctly rejected invalid decision_result_code';
  END;

  -- ── Test 7: Audit trigger writes events on update ────────────────────────
  -- Count audit events before update
  SELECT count(*) INTO v_count FROM audit.audit_event
  WHERE schema_name = 'app' AND table_name = 'claimant' AND row_id = v_claimant_id::text;

  UPDATE app.claimant SET preferred_language = 'cy' WHERE id = v_claimant_id;

  SELECT count(*) INTO v_count FROM audit.audit_event
  WHERE schema_name = 'app' AND table_name = 'claimant' AND row_id = v_claimant_id::text
    AND operation = 'UPDATE';

  IF v_count >= 1 THEN
    RAISE NOTICE 'PASS Test 7: Audit trigger wrote % UPDATE event(s) for claimant', v_count;
  ELSE
    RAISE WARNING 'FAIL Test 7: Audit trigger did not write UPDATE event for claimant';
    v_error := true;
  END IF;

  -- ── Cleanup ───────────────────────────────────────────────────────────────
  DELETE FROM app.extracted_field     WHERE document_evidence_id = v_doc_id;
  DELETE FROM app.document_evidence   WHERE id = v_doc_id;
  DELETE FROM app.application         WHERE id = v_app_id;
  DELETE FROM app.employer_record     WHERE claimant_id = v_claimant_id;
  DELETE FROM app.claimant            WHERE id = v_claimant_id;

  -- ── Summary ───────────────────────────────────────────────────────────────
  IF v_error THEN
    RAISE EXCEPTION 'One or more verification tests FAILED — see WARNINGS above';
  ELSE
    RAISE NOTICE '=== All verification tests PASSED ===';
  END IF;

END $$;
