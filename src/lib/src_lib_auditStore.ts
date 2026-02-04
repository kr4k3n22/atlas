import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  case_id?: string;
  detail?: string;
};

const AUDIT_PATH = path.join(process.cwd(), "src", "data", "audit_log.json");

function loadAudit(): AuditEvent[] {
  try {
    const raw = fs.readFileSync(AUDIT_PATH, "utf8");
    return JSON.parse(raw) as AuditEvent[];
  } catch {
    return [];
  }
}

function saveAudit(entries: AuditEvent[]) {
  fs.writeFileSync(AUDIT_PATH, JSON.stringify(entries, null, 2));
}

export function listAuditEvents(): AuditEvent[] {
  return loadAudit();
}

export function appendAuditEvent(input: Omit<AuditEvent, "id" | "ts"> & { id?: string; ts?: string }) {
  const entries = loadAudit();
  const entry: AuditEvent = {
    id: input.id ?? crypto.randomUUID(),
    ts: input.ts ?? new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    case_id: input.case_id,
    detail: input.detail,
  };

  entries.unshift(entry);
  saveAudit(entries);
  return entry;
}