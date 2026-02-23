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

/**
 * Sanitize rationale/reason text to remove internal operational details
 * before displaying to citizens.
 */
export function sanitizeRationale(text: string): string {
  return text
    // Replace "Sara's portal" / "Sarah's portal" / "HITL dashboard" with "our review team"
    .replace(/\bSarah?'s\s+portal\b/gi, "our review team")
    .replace(/\bHITL\s+dashboard\b/gi, "our review team")
    // Replace possessive form "Sara's" / "Sarah's" with "a case officer's"
    .replace(/\bSarah?'s\b/gi, "a case officer's")
    // Replace non-possessive "Sara" / "Sarah" with "a case officer"
    .replace(/\bSarah?\b/gi, "a case officer")
    // Strip "Ref: evt_*" suffixes
    .replace(/\s*Ref:\s*evt_[a-f0-9]+/gi, "")
    .trim();
}

/**
 * Matches rationale strings that indicate a transient system/infrastructure
 * error rather than a genuine governance decision.
 */
const SYSTEM_ERROR_PATTERN =
  /system\s+error|timeout|timed\s+out|read\s+operation/i;

function isSystemError(text: string): boolean {
  return SYSTEM_ERROR_PATTERN.test(text);
}

export interface McpToolCallResult {
  reply: string;
  escalated: boolean;
  case_id?: string;
  // NEW — risk assessment from synchronous SLM scoring
  risk_score?: number;
  risk_label?: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_rationale?: string;
  policy_refs?: string[];
  recommended_action?: string;
  // NEW — /api/intake response fields
  harm_signals_detected?: boolean;
  decision_validated?: boolean;
  proposed_decision_type?: string;
  effective_decision_type?: string;
  raw?: unknown;
}

/** Timeout for MCP Gateway calls — long enough for the Risk SLM to respond */
const MCP_GATEWAY_TIMEOUT_MS = 60_000;

/**
 * POST a structured welfare IntakePayload to the MCP Gateway's `/api/intake`
 * endpoint (MCP Gateway v2.1.0).
 *
 * Maps the gateway response back to `McpToolCallResult` so downstream code
 * (case creation, chat persistence) continues to work unchanged.
 *
 * Throws on network/non-2xx errors so the caller can fall back to
 * `callMcpTool()`.
 */
export async function callIntake(
  gatewayBaseUrl: string,
  bearerToken: string,
  payload: unknown,
): Promise<McpToolCallResult> {
  const baseUrl = gatewayBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(MCP_GATEWAY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`/api/intake failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseGatewayResult(data);
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
      signal: AbortSignal.timeout(MCP_GATEWAY_TIMEOUT_MS),
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
    // TypeError = network-level failure (e.g. DNS/connection error)
    // DOMException (AbortError) = timeout — fall through to approach 2.
    if (!(err instanceof TypeError) && !(err instanceof DOMException && err.name === "AbortError")) {
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
    signal: AbortSignal.timeout(MCP_GATEWAY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gateway /api/test-tool failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseGatewayResult(data);
}

/**
 * Extract the first embedded JSON object from a text string.
 * Returns the clean text (with the JSON block removed) and the parsed JSON data.
 */
function extractInlineJson(text: string): { cleanText: string; jsonData: Record<string, unknown> | null } {
  const match = text.match(/\{(?:[^{}]|\{[^{}]*\})*\}/);
  if (!match) return { cleanText: text.trim(), jsonData: null };
  try {
    const jsonData = JSON.parse(match[0]) as Record<string, unknown>;
    const cleanText = text.replace(match[0], "").trim();
    return { cleanText, jsonData };
  } catch {
    return { cleanText: text.trim(), jsonData: null };
  }
}

function parseGatewayResult(
  data: Record<string, unknown>,
): McpToolCallResult {
  // --- SLM unavailable — tell user to try later ---
  if (data?.gateway_decision === "SLM_UNAVAILABLE" || data?.status === "SLM_UNAVAILABLE") {
    return {
      reply: "Our assessment service is temporarily unavailable. Please check back shortly — your request has not been lost.",
      escalated: false,
      case_id: typeof data.case_id === "string" ? data.case_id : undefined,
      raw: data,
    };
  }

  // --- /api/intake response format ---
  // Identified by the presence of the `gateway_decision` field.
  if (typeof data?.gateway_decision === "string") {
    const gatewayDecision = data.gateway_decision as string;
    const isBlocked = gatewayDecision === "BLOCKED_PENDING_REVIEW";
    const isApproved = gatewayDecision === "approve";

    const riskScore = typeof data.risk_score === "number" ? data.risk_score : undefined;
    const rationale = typeof data.rationale === "string" ? data.rationale : "";

    // If the gateway itself timed out or threw a system error, treat this as
    // a transient failure — not a governance BLOCK decision.
    if (isBlocked && isSystemError(rationale)) {
      return {
        reply: "Our system is temporarily busy. Please try again in a moment — your request has not been lost.",
        escalated: false,
        raw: data,
      };
    }

    const harmSignalsDetected = typeof data.harm_signals_detected === "boolean" ? data.harm_signals_detected : undefined;
    const decisionValidated = typeof data.decision_validated === "boolean" ? data.decision_validated : undefined;
    const proposedDecisionType = typeof data.proposed_decision_type === "string" ? data.proposed_decision_type : undefined;
    const effectiveDecisionType = typeof data.effective_decision_type === "string" ? data.effective_decision_type : undefined;
    const caseId = typeof data.case_id === "string" ? data.case_id : undefined;
    const eventId = typeof data.event_id === "string" ? data.event_id : caseId;

    const isEscalated = isBlocked || (riskScore !== undefined && riskScore >= 70);

    let riskLabel: "ROUTINE" | "ESCALATE" | "BLOCK" | undefined;
    if (riskScore !== undefined) {
      if (riskScore >= 85 || isBlocked) riskLabel = "BLOCK";
      else if (riskScore >= 70) riskLabel = "ESCALATE";
      else riskLabel = "ROUTINE";
    }

    const sanitizedRationale = rationale ? sanitizeRationale(rationale) : "";
    let reply: string;
    if (isBlocked) {
      reply = `Your request is under review by a case officer.${sanitizedRationale ? ` ${sanitizedRationale}` : ""}`;
    } else if (isApproved) {
      reply = sanitizedRationale || "Your request has been approved.";
    } else {
      reply = sanitizedRationale || "Your request is being processed.";
    }

    return {
      reply: sanitizeRationale(reply),
      escalated: isEscalated,
      case_id: eventId,
      risk_score: riskScore,
      risk_label: riskLabel,
      risk_rationale: sanitizedRationale || undefined,
      harm_signals_detected: harmSignalsDetected,
      decision_validated: decisionValidated,
      proposed_decision_type: proposedDecisionType,
      effective_decision_type: effectiveDecisionType,
      raw: data,
    };
  }

  // --- New format: Inngest event-structured response from /api/tools/call ---
  if (
    data?.name === "atlas/tool.execution_requested" &&
    data?.data !== null &&
    typeof data?.data === "object" &&
    (data.data as Record<string, unknown>)?.pre_computed_risk !== undefined
  ) {
    const eventData = data.data as Record<string, unknown>;
    const preRisk = eventData.pre_computed_risk as Record<string, unknown>;

    const riskScore = typeof preRisk?.risk_score === "number" ? preRisk.risk_score : undefined;
    const rationale = typeof preRisk?.rationale === "string" ? preRisk.rationale : "";
    const decision = typeof preRisk?.decision === "string" ? preRisk.decision : "";
    const eventId = typeof data?.id === "string" ? data.id : undefined;

    // Extract policy_refs if present
    const policyRefs: string[] | undefined = Array.isArray(preRisk?.policy_refs)
      ? (preRisk.policy_refs as unknown[]).filter((r): r is string => typeof r === "string")
      : undefined;

    // Map decision to escalation state
    const isEscalated = decision === "MANUAL_REVIEW" || decision === "BLOCK" || decision === "DENIED";
    const isBlock = decision === "BLOCK" || decision === "DENIED";

    // Map decision to risk_label
    let riskLabel: "ROUTINE" | "ESCALATE" | "BLOCK" | undefined;
    if (isBlock) {
      riskLabel = "BLOCK";
    } else if (riskScore !== undefined) {
      if (riskScore >= 85) riskLabel = "BLOCK";
      else if (riskScore >= 70) riskLabel = "ESCALATE";
      else riskLabel = "ROUTINE";
    }

    // Build reply text
    const sanitizedRationale = rationale ? sanitizeRationale(rationale) : "";
    let reply: string;
    if (isEscalated) {
      reply = `Your request is under review by a case officer.${sanitizedRationale ? ` ${sanitizedRationale}` : ""}`;
    } else {
      reply = sanitizedRationale || "Your request has been approved.";
    }

    return {
      reply,
      escalated: isEscalated,
      case_id: eventId,
      risk_score: riskScore,
      risk_label: riskLabel,
      risk_rationale: sanitizedRationale || undefined,
      policy_refs: policyRefs,
      raw: data,
    };
  }

  // --- Legacy flat format (old /api/tools/call and /api/test-tool responses) ---

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

  if (status === "SLM_UNAVAILABLE") {
    return {
      reply: "Our assessment service is temporarily unavailable. Please check back shortly — your request has not been lost.",
      escalated: false,
      case_id: typeof parsed?.event_id === "string" ? parsed.event_id : undefined,
      raw: data,
    };
  }

  const isBlocked = status === "BLOCKED_PENDING_REVIEW";
  const isApproved = status === "APPROVED";

  // Extract risk_score
  const riskScore = typeof parsed?.risk_score === "number" ? parsed.risk_score : undefined;

  // Check early for system errors in the legacy flat format too
  const rawReasonEarly = typeof parsed?.reason === "string" ? parsed.reason : "";
  if (isBlocked && isSystemError(rawReasonEarly)) {
    return {
      reply: "Our system is temporarily busy. Please try again in a moment — your request has not been lost.",
      escalated: false,
      raw: data,
    };
  }

  // Extract reason/rationale — strip any inline JSON metadata embedded in the string
  const rawReason = typeof parsed?.reason === "string" ? parsed.reason : "";
  const { cleanText: reason, jsonData: reasonMeta } = extractInlineJson(rawReason);

  // Extract structured risk metadata from top-level fields or inline JSON in reason
  const policyRationale: string | undefined =
    (typeof parsed?.policy_rationale === "string" ? parsed.policy_rationale : undefined) ??
    (typeof reasonMeta?.policy_rationale === "string" ? reasonMeta.policy_rationale : undefined);
  const recommendedAction: string | undefined =
    (typeof parsed?.recommended_action === "string" ? parsed.recommended_action : undefined) ??
    (typeof reasonMeta?.recommended_action === "string" ? reasonMeta.recommended_action : undefined);
  const riskLabelRaw: string | undefined =
    (typeof parsed?.label === "string" ? parsed.label : undefined) ??
    (typeof reasonMeta?.label === "string" ? reasonMeta.label : undefined);

  // Extract event_id — try top-level first, then from reason text (format: "Ref: evt_XXXXXXXX")
  const topLevelEventId = typeof parsed?.event_id === "string" ? parsed.event_id : undefined;
  const eventIdMatch = reason.match(/Ref:\s*(evt_[a-f0-9]+)/i);
  const eventId = topLevelEventId ?? eventIdMatch?.[1] ?? undefined;
  // Strip Ref: evt_* from reason so it doesn't leak into rationale or reply
  const cleanReason = reason.replace(/\s*Ref:\s*evt_[a-f0-9]+/gi, "").trim();

  // Map status to risk_label
  let riskLabel: "ROUTINE" | "ESCALATE" | "BLOCK" | undefined;
  if (riskScore !== undefined) {
    if (riskScore >= 85) riskLabel = "BLOCK";
    else if (riskScore >= 70) riskLabel = "ESCALATE";
    else riskLabel = "ROUTINE";
  }

  // Build clean reply text (reason is already stripped of inline JSON)
  let reply: string;
  if (isBlocked) {
    reply = `Your request is under review by a case officer. ${cleanReason}`;
  } else if (isApproved) {
    reply = cleanReason || "Your request has been approved.";
  } else {
    // Fallback: try to use reason or stringify
    reply = cleanReason || (typeof result === "string" ? result : JSON.stringify(data));
  }

  // Build policy_refs from risk label if available
  const policyRefs: string[] | undefined = riskLabelRaw ? [riskLabelRaw] : undefined;

  // Build risk_rationale: prefer policy_rationale, fall back to first paragraph of reason
  const riskRationale = policyRationale ?? (cleanReason ? cleanReason.split("\n\n")[0].trim() : undefined);

  // Expose recommended_action in policy_refs as a fallback when no risk label is available
  const finalPolicyRefs = policyRefs ??
    (recommendedAction ? [recommendedAction] : undefined);

  return {
    reply: sanitizeRationale(reply),
    escalated: isBlocked,
    case_id: eventId,
    risk_score: riskScore,
    risk_label: riskLabel,
    risk_rationale: riskRationale ? sanitizeRationale(riskRationale) : undefined,
    policy_refs: finalPolicyRefs,
    recommended_action: recommendedAction,
    raw: data,
  };
}
