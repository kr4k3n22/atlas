import { listAuditEvents } from "@/lib/auditStore";

export async function GET() {
  return Response.json(listAuditEvents());
}
