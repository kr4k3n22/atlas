import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";
import { callMcpTool } from "@/lib/mcpClient";
import { createCase } from "@/lib/caseStore";
import { chatCompletion, chatWithTools } from "@/lib/openaiClient";
import { getClaimantProfile, buildProfileContext } from "@/lib/beneficiaryStore";

type Message = { role: "user" | "assistant"; content: string };

interface ChatRequest {
  message: string;
  history?: Message[];
  conversation_id?: string;
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
      const aiResult = await chatWithTools(body.history ?? [], message, beneficiaryId, claimantContextBlock ?? undefined);
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
      const result = await callMcpTool(
        gatewayUrl,
        gatewaySecret,
        toolCall.name,
        toolCall.arguments,
      );

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
              body.history ?? [],
              `The user requested: "${message}". The ATLAS Governor has BLOCKED this request. Reason: "${result.risk_rationale ?? result.reply}". Explain this empathetically to Alex, cite the Human Oversight requirement, and let them know their request is under review by a case officer.`,
              claimantContextBlock ?? undefined,
            );
          } catch {
            // Keep the existing reply on error.
          }
        }
      } else if (!result.escalated && hasOpenAI) {
        // Allow path — pass the MCP result to ChatGPT for a friendly confirmation.
        try {
          result.reply = await chatCompletion(
            body.history ?? [],
            `The user requested: "${message}". The ATLAS system returned the following result: "${result.reply}". Provide a friendly, concise confirmation to Alex based on this outcome.`,
            claimantContextBlock ?? undefined,
          );
        } catch {
          // Keep the existing reply on error.
        }
      }

      const responseTimestamp = new Date().toISOString();

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
      });
    } catch (err) {
      console.error("[chat/route] MCP SSE gateway error, falling back:", err);
    }
  }

  // ── Step 4: General conversation fallback (no gateway or tool matched) ───
  let reply: string;
  try {
    reply = await chatCompletion(body.history ?? [], message, claimantContextBlock ?? undefined);
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
