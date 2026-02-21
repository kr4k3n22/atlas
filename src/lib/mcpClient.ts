/**
 * MCP SSE Client
 *
 * Implements the MCP SSE transport protocol:
 * 1. GET /mcp/sse with Authorization header → SSE stream
 * 2. Read the "endpoint" event from SSE stream to get the POST URL
 * 3. POST JSON-RPC tool calls to that endpoint URL with Authorization header
 * 4. Parse JSON-RPC response
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
  // Step 1: Connect to SSE endpoint to get the messages URL
  const sseUrl = `${gatewayBaseUrl.replace(/\/+$/, "")}/mcp/sse`;

  const sseResponse = await fetch(sseUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "text/event-stream",
    },
  });

  if (!sseResponse.ok) {
    throw new Error(`SSE connect failed: ${sseResponse.status}`);
  }

  // Read the SSE stream to find the "endpoint" event
  // The endpoint event contains the URL to POST messages to
  const reader = sseResponse.body?.getReader();
  if (!reader) throw new Error("No SSE stream body");

  const decoder = new TextDecoder();
  let messagesUrl = "";
  let buffer = "";

  // Read SSE events until we get the endpoint event, with a 10s timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout waiting for SSE endpoint event")), 10000),
  );

  while (!messagesUrl) {
    const { done, value } = await Promise.race([reader.read(), timeoutPromise]);
    if (done) throw new Error("SSE stream closed before endpoint event");

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:") && currentEvent === "endpoint") {
        const endpointPath = line.slice(5).trim();
        // The endpoint may be a relative path or full URL
        if (endpointPath.startsWith("http")) {
          messagesUrl = endpointPath;
        } else {
          messagesUrl = `${gatewayBaseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;
        }
      }
    }
  }

  // Cancel the SSE reader (we have our endpoint, don't need to keep streaming)
  reader.cancel().catch(() => {});

  // Step 2: POST the MCP JSON-RPC tool call to the messages endpoint
  const mcpPayload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
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
    throw new Error(`MCP tool call failed: ${postResponse.status}`);
  }

  // Step 3: Parse the response
  const data = await postResponse.json();

  // Extract text from MCP JSON-RPC response
  // Format: { jsonrpc: "2.0", id: "...", result: { content: [{ type: "text", text: "..." }] } }
  const textContent = data?.result?.content?.find(
    (c: { type: string; text?: string }) => c.type === "text",
  )?.text;
  const reply =
    textContent ?? data?.result ?? data?.reply ?? data?.message ?? "No response from gateway.";
  const replyStr = typeof reply === "string" ? reply : JSON.stringify(reply);

  // Check for escalation / PENDING REVIEW pattern
  const pendingMatch = replyStr.match(/PENDING REVIEW \(Ref: ([^)]+)\)/i);
  const escalated = !!pendingMatch || data?.escalated === true;
  const case_id = pendingMatch?.[1] ?? data?.case_id;

  return {
    reply: replyStr,
    escalated,
    case_id,
    raw: data,
  };
}
