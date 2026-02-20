/**
 * Client for communicating with the Atlas-MCP-Gateway (Python/FastMCP).
 *
 * Used by the HITL dashboard to:
 *  - Notify the Gateway when a case is approved/rejected (resumes Inngest workflow)
 *  - Query Gateway health
 *
 * Env vars required:
 *   GATEWAY_URL            – e.g. https://atlas-mcp-gateway.vercel.app
 *   GATEWAY_SHARED_SECRET  – shared Bearer token (same one the Gateway uses to POST here)
 */

const GATEWAY_URL = process.env.GATEWAY_URL ?? "";
const GATEWAY_SECRET = process.env.GATEWAY_SHARED_SECRET ?? "";

export type GatewayDecisionPayload = {
  case_id: string;
  decision: "APPROVED" | "REJECTED" | "NEEDS_INFO";
  note?: string;
  approver?: string;
};

/**
 * Sends the reviewer's decision back to the MCP Gateway so it can:
 *  1. Fire an Inngest event (`atlas/sarah.decision`) to resume the paused workflow
 *  2. Execute the authorized action if APPROVED
 *  3. Log to its own audit trail
 *
 * If the Gateway is unreachable, we log the error but do NOT block the
 * Supabase update — the case status in the UI is the source of truth.
 */
export async function notifyGatewayDecision(
  payload: GatewayDecisionPayload
): Promise<{ ok: boolean; error?: string }> {
  if (!GATEWAY_URL) {
    console.warn(
      "GATEWAY_URL not configured — skipping Gateway notification for case:",
      payload.case_id
    );
    return { ok: false, error: "GATEWAY_URL not configured" };
  }

  const url = `${GATEWAY_URL.replace(/\/+$/, "")}/webhook/approval`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_SECRET}`,
      },
      body: JSON.stringify({
        case_id: payload.case_id,
        decision: payload.decision,
        note: payload.note ?? "",
        approver: payload.approver ?? "hitl_reviewer",
        timestamp: new Date().toISOString(),
      }),
      // Don't let a slow Gateway block the UI response
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `Gateway webhook returned ${res.status}: ${text}`
      );
      return { ok: false, error: `Gateway returned ${res.status}` };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Failed to notify Gateway:", err?.message ?? err);
    return { ok: false, error: err?.message ?? "Network error" };
  }
}

/**
 * Health check — useful for the settings page / status indicator.
 */
export async function checkGatewayHealth(): Promise<{
  reachable: boolean;
  latencyMs?: number;
}> {
  if (!GATEWAY_URL) return { reachable: false };

  const start = Date.now();
  try {
    const res = await fetch(
      `${GATEWAY_URL.replace(/\/+$/, "")}/health`,
      { signal: AbortSignal.timeout(5_000) }
    );
    return { reachable: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { reachable: false, latencyMs: Date.now() - start };
  }
}
