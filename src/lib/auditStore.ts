// NOTE: For NIST AI RMF compliance, the audit_log table must be immutable.
// Run the following SQL in the Supabase SQL Editor to revoke UPDATE/DELETE:
//   REVOKE UPDATE, DELETE ON audit_log FROM anon;
//   REVOKE UPDATE, DELETE ON audit_log FROM authenticated;
//   REVOKE UPDATE, DELETE ON audit_log FROM service_role;
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  case_id?: string;
  detail?: string;
};

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .select("*")
    .order("ts", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function appendAuditEvent(
  input: Omit<AuditEvent, "id" | "ts"> & { id?: string; ts?: string }
) {
  const payload = {
    id: input.id,
    ts: input.ts,
    actor: input.actor,
    action: input.action,
    case_id: input.case_id,
    detail: input.detail,
  };

  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AuditEvent;
}
