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
  // The Gateway returns different shapes depending on the endpoint:
  // /api/test-tool: { "result": "PENDING REVIEW (Ref: evt_xxx)..." }
  // /api/tools/call: { "result": "..." } or MCP-style { "content": [{ "type": "text", "text": "..." }] }

  // Try MCP JSON-RPC format first
  const content = Array.isArray(data?.content)
    ? (data.content as Array<{ type: string; text?: string }>)
    : undefined;
  const textFromContent = content?.find((c) => c.type === "text")?.text;

  // Try nested result with content
  const result = data?.result as Record<string, unknown> | string | undefined;
  let textFromResult: string | undefined;
  if (typeof result === "string") {
    textFromResult = result;
  } else if (result && typeof result === "object") {
    const resultContent = Array.isArray(result.content)
      ? (result.content as Array<{ type: string; text?: string }>)
      : undefined;
    textFromResult = resultContent?.find((c) => c.type === "text")?.text;
    if (!textFromResult) {
      textFromResult = (result.text as string) ?? (result.message as string);
    }
  }

  const reply =
    textFromContent ??
    textFromResult ??
    (typeof data?.reply === "string" ? data.reply : undefined) ??
    (typeof data?.message === "string" ? data.message : undefined) ??
    (typeof data?.result === "string" ? data.result : undefined) ??
    "No response from gateway.";

  const replyStr = typeof reply === "string" ? reply : JSON.stringify(reply);

  // Check for escalation / PENDING REVIEW pattern
  const pendingMatch = replyStr.match(/PENDING REVIEW \(Ref: ([^)]+)\)/i);
  const escalated = !!pendingMatch || data?.escalated === true;
  const case_id = pendingMatch?.[1] ?? (data?.case_id as string | undefined);

  return {
    reply: replyStr,
    escalated,
    case_id,
    raw: data,
  };
}
