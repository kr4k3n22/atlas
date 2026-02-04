import { listAuditEvents } from "@/lib/auditStore";

export async function GET() {
  const audit = await listAuditEvents();
  return Response.json(audit);
}
