/**
 * Verifies deriveDecisionType logic for three cases:
 *   Case A: Alex unemployed + docs missing    → continue_review
 *   Case B: Alex employed                     → deny
 *   Case C: clean claimant with docs complete → approve
 *
 * Run: node scripts/test-recompute-decision-state.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── Mirror of deriveDecisionType from beneficiaryStore.ts ──────────────────
function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim())
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function deriveDecisionType(row) {
  const emp           = String(row.employment_status_declared   ?? "").trim().toLowerCase();
  const idv           = String(row.idv_status                  ?? "").trim().toLowerCase();
  const contributions = String(row.contributions_record_status ?? "").trim().toLowerCase();
  const residency     = String(row.residency_status            ?? "").trim().toLowerCase();
  const empReport     = String(row.employer_report_status      ?? "").trim().toLowerCase();
  const docsQuality   = String(row.docs_quality                ?? "").trim().toLowerCase();
  const docsRequested = toStringArray(row.docs_requested);
  const docsReceived  = toStringArray(row.docs_received);

  // 1. Hard deny
  if (emp === "employed")               return "deny";
  if (idv === "failed")                 return "deny";
  if (contributions === "insufficient") return "deny";

  // 2. continue_review — evidence gaps
  if (!idv           || ["pending", "unknown"].includes(idv))                           return "continue_review";
  if (!residency     || ["pending", "not_verified", "unknown"].includes(residency))     return "continue_review";
  if (!contributions || ["pending", "unknown"].includes(contributions))                 return "continue_review";
  if (emp === "unemployed" && empReport && ["pending", "unknown"].includes(empReport))  return "continue_review";

  if (docsRequested.length > 0) {
    const missing = docsRequested.filter((d) => !docsReceived.includes(d));
    if (missing.length > 0)                                                             return "continue_review";
  }

  const invalidQuality = ["missing", "pending_verification", "expired", "unreadable", "inconsistent", "unknown"];
  if (docsQuality && invalidQuality.includes(docsQuality))                              return "continue_review";

  // 3. approve — explicit positive confirmation of ALL required conditions
  if (
    emp === "unemployed" &&
    idv === "verified" &&
    residency === "verified" &&
    contributions === "sufficient" &&
    (!docsQuality || docsQuality === "valid")
  ) return "approve";

  return "continue_review";
}

// ── Test cases (pure in-memory, no DB write needed) ────────────────────────

const CASES = [
  {
    label: "A — Alex unemployed + docs missing → continue_review",
    row: {
      employment_status_declared: "unemployed",
      idv_status: "verified",
      residency_status: "verified",
      contributions_record_status: "sufficient",
      employer_report_status: "",
      docs_quality: "valid",
      docs_requested: ["P60", "bank_statement"],
      docs_received:  ["P60"],           // bank_statement still missing
    },
    expected: "continue_review",
  },
  {
    label: "B — Alex employed → deny",
    row: {
      employment_status_declared: "employed",
      idv_status: "verified",
      residency_status: "verified",
      contributions_record_status: "sufficient",
      employer_report_status: "",
      docs_quality: "valid",
      docs_requested: [],
      docs_received:  [],
    },
    expected: "deny",
  },
  {
    label: "C — clean claimant, docs complete → approve",
    row: {
      employment_status_declared: "unemployed",
      idv_status: "verified",
      residency_status: "verified",
      contributions_record_status: "sufficient",
      employer_report_status: "",
      docs_quality: "valid",
      docs_requested: ["P60", "bank_statement"],
      docs_received:  ["P60", "bank_statement"],
    },
    expected: "approve",
  },
];

async function run() {
  console.log("\n── deriveDecisionType test cases ────────────────────────────\n");
  let allPassed = true;
  for (const { label, row, expected } of CASES) {
    const result = deriveDecisionType(row);
    const pass = result === expected;
    console.log(`${pass ? "✓" : "✗"} ${label}`);
    if (!pass) {
      console.log(`    Expected: ${expected}  Got: ${result}`);
      allPassed = false;
    }
  }
  console.log("\n─────────────────────────────────────────────────────────────\n");
  if (!allPassed) { console.error("✗ Some cases failed"); process.exit(1); }
  console.log("✓ ALL CASES PASSED");
}

run();
