/**
 * MCP Gateway Client — HTTP POST transport
 *
 * The Gateway runs on Vercel Serverless which does NOT support SSE streaming.
 * We use direct HTTP POST to call tools instead.
 *
 * Strategy (tried in order):
 * 1. POST /api/tools/call — proper JSON endpoint (if Gateway supports it)
 * 2. POST /api/test-tool — Gateway's existing test endpoint (limited mapping)
 */

export interface McpToolCallResult {
  reply: string;
  escalated: boolean;
  case_id?: string;
  // NEW — risk assessment from synchronous SLM scoring
  risk_score?: number;
  risk_label?: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_rationale?: string;
  policy_refs?: string[];
  raw?: unknown;
}

// Map our tool names to the Gateway's /api/test-tool "tool" parameter
const TOOL_NAME_MAP: Record<string, string> = {
  check_payment_status: "check_payment",
  request_payment_extension: "request_extension",
  modify_welfare_record: "modify_record",
};

export async function callMcpTool(
  gatewayBaseUrl: string,
  bearerToken: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const baseUrl = gatewayBaseUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerToken}`,
  };

  // --- Approach 1: Try /api/tools/call (proper JSON-RPC style) ---
  try {
    const response = await fetch(`${baseUrl}/api/tools/call`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: toolName,
        arguments: toolArguments,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return parseGatewayResult(data);
    }
    // If 404, the endpoint doesn't exist yet — fall through to approach 2
    if (response.status !== 404) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`/api/tools/call failed: ${response.status} ${errorText}`);
    }
  } catch (err) {
    // TypeError = network-level failure (e.g. DNS/connection error) — fall through to approach 2.
    // Any other error was thrown explicitly above (non-404 HTTP status) — rethrow it.
    if (!(err instanceof TypeError)) {
      throw err;
    }
  }

  // --- Approach 2: Fall back to /api/test-tool ---
  const mappedTool = TOOL_NAME_MAP[toolName];
  if (!mappedTool) {
    throw new Error(`No tool mapping for "${toolName}" on the Gateway's /api/test-tool endpoint`);
  }

  const response = await fetch(`${baseUrl}/api/test-tool`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool: mappedTool }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gateway /api/test-tool failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseGatewayResult(data);
}

function parseGatewayResult(
  data: Record<string, unknown>,
): McpToolCallResult {
  // The Gateway wraps /api/test-tool responses in {"result": {...}}
  // The inner result is either a string (JSON) or an object with status/risk_score/reason
  const result = (data?.result ?? data) as Record<string, unknown>;

  // Try to parse if result is a string (governance_check returns JSON.dumps())
  let parsed = result;
  if (typeof result === "string") {
    try { parsed = JSON.parse(result); } catch (e) {
      console.warn("[mcpClient] Failed to parse Gateway result string as JSON:", e);
      parsed = {};
    }
  }

  // Extract status
  const status = typeof parsed?.status === "string" ? parsed.status : "";
  const isBlocked = status === "BLOCKED_PENDING_REVIEW";
  const isApproved = status === "APPROVED";

  // Extract risk_score
  const riskScore = typeof parsed?.risk_score === "number" ? parsed.risk_score : undefined;

  // Extract reason/rationale
  const reason = typeof parsed?.reason === "string" ? parsed.reason : "";

  // Extract event_id from reason text (format: "Ref: evt_XXXXXXXX")
  const eventIdMatch = reason.match(/Ref:\s*(evt_[a-f0-9]+)/i);
  const eventId = eventIdMatch?.[1] ?? undefined;

  // Map status to risk_label
  let riskLabel: "ROUTINE" | "ESCALATE" | "BLOCK" | undefined;
  if (riskScore !== undefined) {
    if (riskScore >= 85) riskLabel = "BLOCK";
    else if (riskScore >= 70) riskLabel = "ESCALATE";
    else riskLabel = "ROUTINE";
  }

  // Build reply text
  let reply: string;
  if (isBlocked) {
    reply = `Your request is under review by a case officer. ${reason}`;
  } else if (isApproved) {
    reply = reason || "Your request has been approved.";
  } else {
    // Fallback: try to use reason or stringify
    reply = reason || (typeof result === "string" ? result : JSON.stringify(data));
  }

  return {
    reply,
    escalated: isBlocked,
    case_id: eventId,
    risk_score: riskScore,
    risk_label: riskLabel,
    risk_rationale: reason ? reason.split("\n\n")[0].trim() : undefined,
    raw: data,
  };
}
