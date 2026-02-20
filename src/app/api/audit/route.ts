import { listAuditEvents } from "@/lib/auditStore";
import { NextResponse } from "next/server";

/**
 * GET /api/audit
 * Returns all audit events ordered by timestamp descending.
 * Read-only — no POST/PUT/DELETE.
 */
export async function GET() {
  try {
    const events = await listAuditEvents();
    return NextResponse.json(events);
  } catch (err: any) {
    console.error("Failed to fetch audit log:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to load audit log" },
      { status: 500 }
    );
  }
}
