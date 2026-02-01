import casesJson from "@/data/mock_cases.json";
import { CaseSchema } from "@/lib/schema";
import type { z } from "zod";

type CaseRecord = z.infer<typeof CaseSchema>;

type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  note?: string;
};

type MutableCase = CaseRecord & { audit?: AuditEvent[] };

const nowIso = () => new Date().toISOString();

let CASES: MutableCase[] = (casesJson as any[]).map((c) => {
  const parsed = CaseSchema.parse(c);
  return { ...parsed, audit: [{ ts: nowIso(), actor: "proxy", action: "created" }] };
});

export function getAllCases(): CaseRecord[] {
  return CASES.map(stripInternal);
}

export function getCaseById(id: string): CaseRecord | null {
  const c = CASES.find((x) => x.id === id);
  return c ? stripInternal(c) : null;
}

export function applyDecision(input: { id: string; decision: Decision; note?: string }): CaseRecord | null {
  const c = CASES.find((x) => x.id === input.id);
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

  c.audit = c.audit || [];
  c.audit.push({
    ts: nowIso(),
    actor: "reviewer",
    action: decision.toLowerCase(),
    note: note || undefined,
  });

  return stripInternal(c);
}

function stripInternal(c: MutableCase): CaseRecord {
  const out: any = { ...c };
  // expose audit trail in a stable key if your UI expects it
  if (c.audit) out.history = c.audit.map((e) => ({ ts: e.ts, actor: e.actor, event: e.action, note: e.note }));
  delete out.audit;
  return out as CaseRecord;
}
