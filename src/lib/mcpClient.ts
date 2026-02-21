/**
 * MCP SSE Client
 *
 * Implements the MCP SSE transport protocol:
 * 1. GET /mcp/sse with Authorization header → SSE stream
 * 2. Read the "endpoint" event from SSE stream to get the POST URL
 * 3. POST JSON-RPC tool calls to that endpoint URL with Authorization header
 * 4. Gateway returns 202 Accepted (acknowledgment only)
 * 5. Read the JSON-RPC result from the SSE stream "message" event
 */

export interface McpToolCallResult {
  reply: string;
  escalated: boolean;
  case_id?: string;
  raw?: unknown;
}

export async function callMcpTool(
  gatewayBaseUrl: string,
  bearerToken: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const baseUrl = gatewayBaseUrl.replace(/\/+$/, "");
  const sseUrl = `${baseUrl}/mcp/sse`;

  // Step 1: Connect to SSE endpoint
  const sseResponse = await fetch(sseUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "text/event-stream",
    },
  });

  if (!sseResponse.ok) {
    throw new Error(`SSE connect failed: ${sseResponse.status}`);
  }

  const reader = sseResponse.body?.getReader();
  if (!reader) throw new Error("No SSE stream body");

  const decoder = new TextDecoder();
  let buffer = "";
  const requestId = crypto.randomUUID();

  // Helper to read SSE events from the stream
  function parseSSELines(lines: string[]): Array<{ event: string; data: string }> {
    const events: Array<{ event: string; data: string }> = [];
    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        events.push({ event: currentEvent || "message", data: line.slice(5).trim() });
        currentEvent = "";
      }
    }
    return events;
  }

  // 15 second timeout for the whole operation
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout waiting for MCP response")), 15000),
  );

  try {
    // Step 2: Read SSE stream until we get the "endpoint" event
    let messagesUrl = "";
    while (!messagesUrl) {
      const { done, value } = await Promise.race([reader.read(), timeoutPromise]);
      if (done) throw new Error("SSE stream closed before endpoint event");

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const { event, data } of parseSSELines(lines)) {
        if (event === "endpoint") {
          if (data.startsWith("http")) {
            messagesUrl = data;
          } else {
            messagesUrl = `${baseUrl}${data.startsWith("/") ? "" : "/"}${data}`;
          }
        }
      }
    }

    // Step 3: POST the JSON-RPC tool call (do NOT close SSE stream yet!)
    const mcpPayload = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArguments,
      },
    };

    const postResponse = await fetch(messagesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(mcpPayload),
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text().catch(() => "");
      throw new Error(`MCP POST failed: ${postResponse.status} ${errorText}`);
    }

    // Step 4: The POST returns 202 Accepted (plain text) — do NOT parse as JSON.
    // Instead, read the SSE stream for the "message" event containing the JSON-RPC result.

    // First, check if the POST response itself is JSON (some gateways return inline)
    const postContentType = postResponse.headers.get("content-type") ?? "";
    if (postContentType.includes("application/json")) {
      const data = await postResponse.json();
      return parseJsonRpcResult(data);
    }

    // Otherwise, wait for the result on the SSE stream
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeoutPromise]);
      if (done) throw new Error("SSE stream closed before receiving response");

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const { event, data } of parseSSELines(lines)) {
        if (event === "message" && data) {
          try {
            const parsed = JSON.parse(data);
            // Check if this is our response by matching the request ID
            if (parsed.id === requestId) {
              return parseJsonRpcResult(parsed);
            }
          } catch {
            // Not JSON, skip this SSE event
          }
        }
      }
    }
  } finally {
    // Always clean up the SSE stream
    reader.cancel().catch(() => {});
  }
}

function parseJsonRpcResult(data: Record<string, unknown>): McpToolCallResult {
  // Extract text from MCP JSON-RPC response
  // Format: { jsonrpc: "2.0", id: "...", result: { content: [{ type: "text", text: "..." }] } }
  const result = data?.result as Record<string, unknown> | undefined;
  const content = Array.isArray(result?.content)
    ? (result.content as Array<{ type: string; text?: string }>)
    : undefined;
  const textContent = content?.find((c) => c.type === "text")?.text;

  const reply = textContent ?? result ?? data?.reply ?? data?.message ?? "No response from gateway.";
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
