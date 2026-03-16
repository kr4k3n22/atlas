/**
 * Smoke-test for updateEmploymentStatus.
 * Run from the atlas/ directory:
 *   node scripts/test-update-employment-status.mjs [beneficiaryId] [newStatus]
 *
 * Defaults:
 *   beneficiaryId = "BEN-ATLAS-001"
 *   newStatus     = "employed"
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 1. Load .env.local manually (no dotenv dependency needed in Node 20+)
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const rawEnv = readFileSync(envPath, "utf-8");
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// 2. Inline helpers (mirrors beneficiaryStore.ts without needing a TS build)
// ---------------------------------------------------------------------------

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function fetchDetailedRow(beneficiaryId) {
  const { data, error } = await supabase
    .schema("app")
    .from("claimant_case_detailed")
    .select("*")
    .eq("beneficiary_id", beneficiaryId)
    .single();
  if (error || !data) return null;
  return data;
}

function rowToProfile(row) {
  const docsRequested = toStringArray(row.docs_requested);
  const docsReceived  = toStringArray(row.docs_received);
  const docsQuality   = row.docs_quality ?? "unknown";
  const hasDocsData   = docsRequested.length > 0 || docsReceived.length > 0 || docsQuality !== "unknown";
  const harmTypes     = toStringArray(row.harm_signal_type);
  const harmLevel     = row.harm_signal_level ?? "none";

  return {
    claimantId:               row.beneficiary_id,
    externalRef:              row.beneficiary_id,
    fullName:                 row.claimant_name,
    dateOfBirth:              null,
    employmentStatus:         row.employment_status_declared ?? null,
    currentApplicationStatus: row.decision_type ?? null,
    currentApplicationRef:    row.case_id ?? null,
    programs:                 row.benefit_type ? [row.benefit_type] : [],
    idvStatus:                row.idv_status,
    residencyStatus:          row.residency_status,
    employerReportStatus:     row.employer_report_status,
    contributionRecordStatus: row.contributions_record_status,
    docsStatus: hasDocsData
      ? { requested: docsRequested, received: docsReceived, quality: docsQuality }
      : undefined,
    harmSignals: harmLevel !== "none"
      ? { level: harmLevel, types: harmTypes, notes: row.harm_signal_notes ?? "" }
      : undefined,
    caseworkerNote: row.caseworker_note,
  };
}

async function updateEmploymentStatus(beneficiaryId, employmentStatus) {
  const { error } = await supabase
    .schema("app")
    .from("claimant_case_detailed")
    .update({ employment_status_declared: employmentStatus })
    .eq("beneficiary_id", beneficiaryId);

  if (error) {
    return { ok: false, error: `DB update failed for beneficiary_id=${beneficiaryId}: ${error.message}` };
  }

  const row = await fetchDetailedRow(beneficiaryId);
  if (!row) {
    return { ok: false, error: `Update succeeded but re-read returned no row for beneficiary_id=${beneficiaryId}` };
  }

  return { ok: true, data: rowToProfile(row) };
}

// ---------------------------------------------------------------------------
// 3. Run
// ---------------------------------------------------------------------------

const beneficiaryId  = process.argv[2] ?? "BEN-ATLAS-001";
const newStatus      = process.argv[3] ?? "employed";

console.log(`\n→ updateEmploymentStatus("${beneficiaryId}", "${newStatus}")\n`);

const result = await updateEmploymentStatus(beneficiaryId, newStatus);

if (result.ok) {
  console.log("✓ SUCCESS");
  console.log("  claimantId:      ", result.data.claimantId);
  console.log("  fullName:        ", result.data.fullName);
  console.log("  employmentStatus:", result.data.employmentStatus);
} else {
  console.error("✗ FAILED:", result.error);
  process.exit(1);
}
