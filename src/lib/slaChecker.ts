import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { appendAuditEvent } from "@/lib/auditStore";

const SLA_HOURS = 72;

/**
 * Check for cases that have exceeded the 72-hour SLA
 * and mark them as EXPIRED
 */
export async function checkAndExpireStaleCases(): Promise<{
  expired: number;
  cases: string[];
}> {
  const now = new Date();
  const slaThreshold = new Date(now.getTime() - SLA_HOURS * 60 * 60 * 1000);

  // Find cases that are PENDING_REVIEW or NEEDS_MORE_INFO and older than 72 hours
  const { data: staleCases, error } = await supabaseAdmin
    .from("approval_queue")
    .select("*")
    .in("status", ["PENDING_REVIEW", "NEEDS_MORE_INFO"])
    .lt("created_at", slaThreshold.toISOString());

  if (error) {
    console.error("Error querying stale cases:", error);
    return { expired: 0, cases: [] };
  }

  if (!staleCases || staleCases.length === 0) {
    return { expired: 0, cases: [] };
  }

  const expiredCaseIds: string[] = [];

  // Update each case to EXPIRED status
  for (const caseRecord of staleCases) {
    const history = Array.isArray(caseRecord.history) ? caseRecord.history : [];
    const ageInHours = Math.round((now.getTime() - new Date(caseRecord.created_at).getTime()) / (1000 * 60 * 60));
    
    history.push({
      ts: now.toISOString(),
      actor: "system",
      event: "expired",
      detail: `Case expired after ${ageInHours} hours without resolution (SLA: ${SLA_HOURS} hours).`,
    });

    const { error: updateError } = await supabaseAdmin
      .from("approval_queue")
      .update({
        status: "EXPIRED",
        history,
      })
      .eq("id", caseRecord.id);

    if (updateError) {
      console.error(`Error updating case ${caseRecord.id} to EXPIRED:`, updateError);
      continue;
    }

    // Add audit entry
    await appendAuditEvent({
      actor: "system",
      action: "case_expired",
      case_id: caseRecord.id,
      detail: `Case expired after ${ageInHours} hours (SLA: ${SLA_HOURS} hours). Previous status: ${caseRecord.status}.`,
    });

    expiredCaseIds.push(caseRecord.id);
  }

  return {
    expired: expiredCaseIds.length,
    cases: expiredCaseIds,
  };
}

/**
 * Get cases that are approaching the SLA threshold (within last 6 hours)
 */
export async function getCasesApproachingSLA(): Promise<Array<{
  id: string;
  created_at: string;
  status: string;
  hours_remaining: number;
}>> {
  const now = new Date();
  const slaThreshold = new Date(now.getTime() - SLA_HOURS * 60 * 60 * 1000);
  const warningThreshold = new Date(now.getTime() - (SLA_HOURS - 6) * 60 * 60 * 1000);

  const { data: approachingCases, error } = await supabaseAdmin
    .from("approval_queue")
    .select("id, created_at, status")
    .in("status", ["PENDING_REVIEW", "NEEDS_MORE_INFO"])
    .lt("created_at", warningThreshold.toISOString())
    .gte("created_at", slaThreshold.toISOString());

  if (error) {
    console.error("Error querying cases approaching SLA:", error);
    return [];
  }

  if (!approachingCases) {
    return [];
  }

  return approachingCases.map((c) => {
    const createdAt = new Date(c.created_at);
    const ageMs = now.getTime() - createdAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, SLA_HOURS - ageHours);

    return {
      id: c.id,
      created_at: c.created_at,
      status: c.status,
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
    };
  });
}

/**
 * Get the age of a case in hours
 */
export function getCaseAgeInHours(createdAt: string): number {
  const now = new Date();
  const created = new Date(createdAt);
  const ageMs = now.getTime() - created.getTime();
  return ageMs / (1000 * 60 * 60);
}

/**
 * Check if a case has exceeded the SLA
 */
export function isCaseExpired(createdAt: string): boolean {
  return getCaseAgeInHours(createdAt) > SLA_HOURS;
}

/**
 * Get hours remaining before SLA expiration
 */
export function getHoursUntilExpiration(createdAt: string): number {
  const ageHours = getCaseAgeInHours(createdAt);
  return Math.max(0, SLA_HOURS - ageHours);
}
