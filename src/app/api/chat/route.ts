import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";
import { callMcpTool, callIntake } from "@/lib/mcpClient";
import { createCase } from "@/lib/caseStore";
import { chatCompletion, chatWithTools } from "@/lib/openaiClient";
import { getClaimantProfile, buildProfileContext } from "@/lib/beneficiaryStore";
import { buildIntakePayload, validateIntakePayload } from "@/lib/intakePayloadBuilder";

type Message = { role: "user" | "assistant"; content: string };

interface ChatRequest {
  message: string;
  history?: Message[];
  conversation_id?: string;
}

interface DecisionTrace {
  proposed_decision_type: string;
  effective_decision_type: string;
  gateway_action: string;
  risk_score?: number;
  risk_label?: string;
  harm_signal_override: boolean;
  mismatch_detected: boolean;
  schema_aligned: boolean;
  structured_inputs_summary: Record<string, string>;
  free_text_excerpt: string;
  escalation_reasons: string[];
}

const MAX_CONVERSATION_TITLE_LENGTH = 60;

const BENEFICIARY_ID_PATTERN = /\b(BEN-[A-Z0-9]+|ATL-[A-Z0-9-]+)\b/i;

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function extractBeneficiaryId(message: string): string | null {
  const match = BENEFICIARY_ID_PATTERN.exec(message);
  return match ? match[1].toUpperCase() : null;
}

function mapMessageToTool(message: string, defaultBeneficiaryId: string): ToolCall | null {
  const beneficiaryId = extractBeneficiaryId(message) ?? defaultBeneficiaryId;

  if (/\b(check|status|claim status|payment status|progress|where is|my claim)\b/i.test(message)) {
    return { name: "check_payment_status", arguments: { beneficiary_id: beneficiaryId } };
  }
  if (/\b(apply|extend|extension|request extension|requesting extension)\b/i.test(message)) {
    return { name: "request_payment_extension", arguments: { beneficiary_id: beneficiaryId, reason: message } };
  }
  if (/\b(modify|update|change|edit|amend|alter)\b/i.test(message)) {
    return { name: "modify_welfare_record", arguments: { beneficiary_id: beneficiaryId, changes: {} } };
  }

  return null; // General questions fall through to ChatGPT
}


export async function POST(req: NextRequest) {
  let body: ChatRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, conversation_id: incomingConvId } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const user = await getAuthUser(req.headers.get("cookie") ?? "");

  // Resolve beneficiary ID from user profile or default
  const beneficiaryId = (user?.user_metadata?.beneficiary_id as string | undefined) ?? "BEN-ATLAS-001";

  // Resolve / create conversation for persistence
  let conversationId = incomingConvId ?? null;
  if (user) {
    if (!conversationId) {
      const title = message.slice(0, MAX_CONVERSATION_TITLE_LENGTH) || "New conversation";
      const { data } = await supabaseAdmin
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      conversationId = data?.id ?? null;
    }

    if (conversationId) {
      await supabaseAdmin.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: message,
      });
    }
  }

  // ── Step 0.5: Load persisted conversation history ───────────────────────
  // Fetch recent messages from DB so the AI sees decision messages
  // that were inserted server-side by caseStore.applyDecision().
  let serverHistory: Message[] = [];
  if (conversationId) {
    try {
      const { data: dbMessages } = await supabaseAdmin
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dbMessages && dbMessages.length > 0) {
        // Reverse to restore chronological order (oldest → newest).
        // The last entry is the user message we just inserted; remove it so
        // it is not duplicated when passed as the separate `message` parameter.
        const ordered = [...dbMessages].reverse();
        serverHistory = (ordered as Message[])
          .filter(m => m.role === "user" || m.role === "assistant")
          .slice(0, -1);
      }
    } catch (err) {
      console.error("[chat/route] Failed to load conversation history:", err);
      // Fall back to client-sent history
    }
  }

  // Use server history if available, otherwise fall back to client-sent history
  const effectiveHistory = serverHistory.length > 0 ? serverHistory : (body.history ?? []);

  const gatewayUrl = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL;
  const gatewaySecret = process.env.GATEWAY_SHARED_SECRET;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  // ── Step 0: Look up claimant profile from the SQL database ───────────────
  // This grounds the agent's responses in real data and prevents hallucination.
  let claimantContextBlock: string | null = null;
  try {
    const profile = await getClaimantProfile(beneficiaryId);
    if (profile) {
      claimantContextBlock = buildProfileContext(profile);
    } else {
      claimantContextBlock =
        `No records found for claimant reference ${beneficiaryId}. ` +
        `Ask the user to confirm their claimant reference or provide identifying information.`;
    }
  } catch (err) {
    console.error("[chat/route] Failed to fetch claimant profile:", err);
    // Non-fatal — continue without grounding context
  }

  // ── Step 1: Determine intent (tool call vs direct reply) ──────────────────
  // When OPENAI_API_KEY is set, use ChatGPT function calling to decide.
  // Otherwise fall back to regex pattern matching.
  let toolCall: ToolCall | null = null;
  let openaiDirectReply: string | null = null;

  if (hasOpenAI) {
    try {
      const aiResult = await chatWithTools(effectiveHistory, message, beneficiaryId, claimantContextBlock ?? undefined);
      if (aiResult.type === "tool_call") {
        toolCall = { name: aiResult.name, arguments: aiResult.arguments };
      } else {
        openaiDirectReply = aiResult.content;
      }
    } catch (err) {
      console.error("[chat/route] OpenAI function-calling error, falling back to regex:", err);
      toolCall = mapMessageToTool(message, beneficiaryId);
    }
  } else {
    toolCall = mapMessageToTool(message, beneficiaryId);
  }

  // ── Step 2: Direct reply (no MCP tool needed) ────────────────────────────
  if (openaiDirectReply !== null) {
    if (user && conversationId) {
      await supabaseAdmin.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: openaiDirectReply,
      });
      await supabaseAdmin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
    return NextResponse.json({ reply: openaiDirectReply, conversation_id: conversationId });
  }

  // ── Step 3: MCP Gateway tool call ────────────────────────────────────────
  if (gatewayUrl && gatewaySecret && toolCall) {
    try {
      // ── Step 3a: Build + validate the structured IntakePayload ──────────
      let result;
      const claimantProfile = await getClaimantProfile(beneficiaryId).catch(() => null);

      if (claimantProfile) {
        const intakePayload = buildIntakePayload({
          profile: claimantProfile,
          userMessage: message,
          history: effectiveHistory,
          toolName: toolCall.name,
          caseId: conversationId ?? undefined,
        });

        const validation = validateIntakePayload(intakePayload);
        if (!validation.valid) {
          console.error("[chat/route] IntakePayload validation failed:", validation.errors);
          // Return a user-friendly error and do not proceed to the gateway
          return NextResponse.json(
            {
              reply:
                "I'm sorry, I couldn't process your request because some required information is missing. " +
                "Please check your profile details and try again.",
              conversation_id: conversationId,
            },
            { status: 422 },
          );
        }

        // Try /api/intake first; fall back to callMcpTool on any error
        try {
          result = await callIntake(gatewayUrl, gatewaySecret, intakePayload);
        } catch (intakeErr) {
          console.warn("[chat/route] /api/intake unavailable, falling back to callMcpTool:", intakeErr);
        }
      }

      // ── Step 3b: Fallback to generic tool call if intake was skipped/failed
      if (!result) {
        result = await callMcpTool(
          gatewayUrl,
          gatewaySecret,
          toolCall.name,
          toolCall.arguments,
        );
      }

      // If the Gateway escalated the tool call, create a case record so the
      // case officer portal can find it and send the event_id back when they decide.
      if (result.escalated && result.case_id) {
        createCase({
          user_display: user?.user_metadata?.full_name ?? user?.email ?? "Anonymous User",
          user_message: message,
          tool_name: toolCall.name,
          tool_args_redacted: toolCall.arguments,
          risk_label: result.risk_label ?? "ESCALATE",
          risk_score: result.risk_score ?? 75,
          risk_rationale: result.risk_rationale ?? "Escalated by MCP Gateway for human review.",
          policy_refs: result.policy_refs ?? [],
          gateway_event_id: result.case_id,
          conversation_id: conversationId ?? undefined,
        }).catch((err) => {
          console.error("[chat/route] Failed to create case record for escalated tool call:", err);
        });

        // For BLOCK decisions, let ChatGPT explain empathetically using the
        // new system prompt's governance knowledge.
        if (hasOpenAI && result.risk_label === "BLOCK") {
          try {
            result.reply = await chatCompletion(
              effectiveHistory,
              `The user requested: "${message}". The ATLAS Governor has BLOCKED this request. Reason: "${result.risk_rationale ?? result.reply}". Explain this empathetically to Alex, cite the Human Oversight requirement, and let them know their request is under review by a case officer.`,
              claimantContextBlock ?? undefined,
            );
          } catch {
            // Keep the existing reply on error.
          }
        }
      } else if (!result.escalated && !result.transient_error && hasOpenAI) {
        // Allow path — pass the MCP result to ChatGPT for a friendly confirmation.
        try {
          result.reply = await chatCompletion(
            effectiveHistory,
            `The user requested: "${message}". The ATLAS system returned the following result: "${result.reply}". Provide a friendly, concise confirmation to Alex based on this outcome.`,
            claimantContextBlock ?? undefined,
          );
        } catch {
          // Keep the existing reply on error.
        }
      }

      const responseTimestamp = new Date().toISOString();

      // ── Build decision trace ──────────────────────────────────────────────
      const gatewayAction = result.transient_error
        ? "SYSTEM_ERROR"
        : result.escalated
          ? result.risk_label === "BLOCK"
            ? "BLOCK"
            : "NEEDS_HUMAN"
          : "ALLOW";

      const harmSignalOverride =
        result.risk_label === "BLOCK" || (result.risk_score !== undefined && result.risk_score >= 85);

      // Build structured_inputs_summary from tool arguments (exclude long free-text fields)
      const structuredInputsSummary: Record<string, string> = {};
      for (const [k, v] of Object.entries(toolCall.arguments)) {
        if (k !== "reason" && k !== "changes") {
          structuredInputsSummary[k] = String(v);
        }
      }

      // Schema is aligned when the required beneficiary_id field is present
      const schemaAligned = typeof toolCall.arguments.beneficiary_id === "string" && toolCall.arguments.beneficiary_id.length > 0;

      const decisionTrace: DecisionTrace = {
        proposed_decision_type: result.proposed_decision_type ?? toolCall.name,
        effective_decision_type: result.effective_decision_type ?? gatewayAction,
        gateway_action: gatewayAction,
        risk_score: result.risk_score,
        risk_label: result.risk_label,
        harm_signal_override: result.harm_signals_detected ?? harmSignalOverride,
        mismatch_detected: result.decision_validated !== undefined ? !result.decision_validated : result.escalated,
        schema_aligned: schemaAligned,
        structured_inputs_summary: structuredInputsSummary,
        free_text_excerpt: message.slice(0, 200),
        escalation_reasons: result.risk_rationale ? [result.risk_rationale] : [],
      };

      if (user && conversationId) {
        const escalationMeta =
          result.escalated && result.case_id
            ? {
              escalation: {
                case_id: result.case_id,
                risk_score: result.risk_score,
                risk_label: result.risk_label,
                risk_rationale: result.risk_rationale,
                policy_refs: result.policy_refs,
                recommended_action: result.recommended_action,
                timestamp: responseTimestamp,
              },
            }
            : undefined;
        await supabaseAdmin.from("chat_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: result.reply,
          ...(escalationMeta ? { metadata: escalationMeta } : {}),
          decision_trace: decisionTrace,
        });
        await supabaseAdmin
          .from("conversations")
          .update({ updated_at: responseTimestamp })
          .eq("id", conversationId);
      }

      return NextResponse.json({
        reply: result.reply,
        escalated: result.escalated,
        case_id: result.case_id,
        conversation_id: conversationId,
        risk_score: result.risk_score,
        risk_label: result.risk_label,
        risk_rationale: result.risk_rationale,
        policy_refs: result.policy_refs,
        recommended_action: result.recommended_action,
        timestamp: responseTimestamp,
        decision_trace: decisionTrace,
      });
    } catch (err) {
      console.error("[chat/route] MCP SSE gateway error, falling back:", err);
    }
  }

  // ── Step 4: General conversation fallback (no gateway or tool matched) ───
  let reply: string;
  try {
    reply = await chatCompletion(effectiveHistory, message, claimantContextBlock ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat/route] OpenAI API error:", message);
    reply = "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.";
  }

  if (user && conversationId) {
    await supabaseAdmin.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  return NextResponse.json({ reply, conversation_id: conversationId });
}
