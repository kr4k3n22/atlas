import fs from "node:fs";
import path from "node:path";
import casesJson from "@/data/mock_cases.json";
import { CaseSchema } from "@/lib/schema";
import { appendAuditEvent } from "@/lib/auditStore";
import type { z } from "zod";

type CaseRecord = z.infer<typeof CaseSchema> & {
  user_name?: string;
  audit_trail?: Array<{ ts: string; actor: string; action: string; detail?: string }>;
};

type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

const nowIso = () => new Date().toISOString();
const DATA_PATH = path.join(process.cwd(), "src", "data", "approval_queue.json");

function loadCases(): CaseRecord[] {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.map((c: any) => CaseSchema.parse(c));
  } catch {
    return (casesJson as any[]).map((c) => CaseSchema.parse(c));
  }
}

function saveCases(cases: CaseRecord[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(cases, null, 2));
}

function nextCaseId(cases: CaseRecord[]) {
  const nums = cases
    .map((c) => Number(String(c.id).replace(/[^\d]/g, "")))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `CASE-${next}`;
}

export function getAllCases(): CaseRecord[] {
  return loadCases().map(stripInternal);
}

export function getCaseById(id: string): CaseRecord | null {
  const c = loadCases().find((x) => x.id === id);
  return c ? stripInternal(c) : null;
}

export function createCase(input: {
  user_display: string;
  user_message: string;
  tool_name: string;
  tool_args_redacted: Record<string, unknown>;
  risk_label: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
}) {
  const cases = loadCases();
  const id = nextCaseId(cases);
  const created_at = nowIso();

  const c: CaseRecord = CaseSchema.parse({
    id,
    created_at,
    status: "PENDING_REVIEW",
    user_display: input.user_display,
    user_message: input.user_message,
    tool_name: input.tool_name,
    tool_args_redacted: input.tool_args_redacted,
    risk_label: input.risk_label,
    risk_score: input.risk_score,
    risk_rationale: input.risk_rationale,
    policy_refs: input.policy_refs,
    history: [
      {
        ts: created_at,
        actor: "proxy",
        event: "created",
        detail: "Tool call intercepted.",
      },
      {
        ts: created_at,
        actor: "risk_engine",
        event: "scored",
        detail: `${input.risk_label} (${input.risk_score}).`,
      },
    ],
  });

  cases.unshift(c);
  saveCases(cases);

  appendAuditEvent({
    actor: "proxy",
    action: "case_created",
    case_id: id,
    detail: `Queued ${input.tool_name} for approval.`,
  });

  return stripInternal(c);
}

export function applyDecision(input: { id: string; decision: Decision; note?: string }): CaseRecord | null {
  const cases = loadCases();
  const c = cases.find((x) => x.id === input.id);
  if (!c) return null;

  const decision = input.decision;
  const note = input.note?.trim() || "";

  if (decision === "APPROVE") {
    (c as any).status = "APPROVED";
  } else if (decision === "REJECT") {
    (c as any).status = "REJECTED";
  } else if (decision === "REQUEST_INFO") {
    (c as any).status = "PENDING_REVIEW";
  }

  c.history = c.history || [];
  c.history.push({
    ts: nowIso(),
    actor: "reviewer",
    event: "decided",
    detail: `${decision}${note ? `: ${note}` : ""}`,
  });

  saveCases(cases);

  appendAuditEvent({
    actor: "reviewer",
    action: `decision_${decision.toLowerCase()}`,
    case_id: c.id,
    detail: note || undefined,
  });

  return stripInternal(c);
}

function stripInternal(c: CaseRecord): CaseRecord {
  const out: any = { ...c };
  out.user_name = c.user_display;
  out.audit_trail = (c.history ?? []).map((e) => ({
    ts: e.ts,
    actor: e.actor,
    action: e.event,
    detail: e.detail,
  }));
  return out as CaseRecord;
}
