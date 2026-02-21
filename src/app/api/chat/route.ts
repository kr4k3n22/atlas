import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";
import { callMcpTool } from "@/lib/mcpClient";
import { createCase } from "@/lib/caseStore";

type Message = { role: "user" | "assistant"; content: string };

interface ChatRequest {
  message: string;
  history?: Message[];
  conversation_id?: string;
}

const MAX_CONVERSATION_TITLE_LENGTH = 60;

const ESCALATION_PATTERNS = /\b(submit|file|apply now|start my claim|register my claim)\b/i;

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

  return null; // General questions still fall back to regex responses
}

const FALLBACK_RESPONSES: Array<{ pattern: RegExp; reply: string; escalate?: boolean }> = [
  {
    pattern: /\b(unemployment|unemployed|lost my job|redundan(t|cy)?|laid off)\b/i,
    reply:
      "To apply for unemployment benefit, you'll need to submit a claim within 7 days of becoming unemployed. Required documents include: your termination or redundancy notice, valid photo ID, bank account details, and your National Insurance number. You can start your application by telling me you'd like to apply, or visit your local Jobcentre.",
  },
  {
    pattern: /\b(status|check|progress|update|where is|my claim)\b/i,
    reply:
      "To check your claim status, please provide your case reference number (format: ATL-XXXXXX). I can then look up the current status and any outstanding actions required from you.",
  },
  {
    pattern: /\b(document|upload|proof|evidence|paperwork)\b/i,
    reply:
      "For your unemployment benefit claim, the following documents are required:\n\n• Termination or redundancy notice from your employer\n• Valid government-issued photo ID (passport or driving licence)\n• Bank account details (sort code and account number)\n• National Insurance number\n• Employment history for the last 2 years\n\nAll documents can be uploaded securely through this portal.",
  },
  {
    pattern: /\b(eligib|qualify|qualif|entitled|entitlement|criteria)\b/i,
    reply:
      "To be eligible for unemployment benefit, you must:\n\n• Have been employed and paid National Insurance contributions for at least 2 of the last 3 years\n• Be aged 18 or over and under State Pension age\n• Be actively seeking work\n• Be a UK resident\n• Not be in full-time education\n\nIf you're unsure about your eligibility, I can help you assess your situation.",
  },
  {
    pattern: /\b(appeal|challenge|dispute|disagree|review decision)\b/i,
    reply:
      "If you disagree with a decision about your claim, you have the right to appeal under Article 14 of the Human Rights Act. The appeals process has two stages:\n\n1. **Mandatory Reconsideration** — Request a review within one month of the decision letter\n2. **Tribunal Appeal** — If reconsideration is unsuccessful, appeal to an independent tribunal\n\nWould you like me to start a reconsideration request on your behalf?",
  },
  {
    pattern: /\b(payment|paid|money|benefit amount|how much|rate)\b/i,
    reply:
      "The standard unemployment benefit rate is reviewed annually. The current rate depends on your previous earnings and employment history. Payments are typically made every two weeks directly to your bank account. For your specific entitlement amount, please provide your case reference number.",
  },
  {
    pattern: /\b(hello|hi|hey|good morning|good afternoon|start|help)\b/i,
    reply:
      "Hello! I'm Atlas, your welfare services assistant. I can help you with:\n\n• Unemployment benefit applications\n• Checking your claim status\n• Understanding eligibility criteria\n• Document requirements\n• Appeals and reconsiderations\n\nHow can I assist you today?",
  },
];

const DEFAULT_REPLY =
  "I'm here to help with your welfare benefit queries. You can ask me about applying for unemployment benefit, checking your claim status, eligibility criteria, required documents, or the appeals process. How can I help you today?";

function getFallbackReply(message: string): { reply: string; escalated?: boolean; case_id?: string } {
  if (ESCALATION_PATTERNS.test(message)) {
    const caseId = `ATL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    return {
      reply: `I've received your request to submit a claim. I've created a case reference for you: **${caseId}**.\n\nYour application has been forwarded to a case officer for review. You will be notified by email once a decision has been made. This typically takes 3–5 working days.\n\nIs there anything else I can help you with?`,
      escalated: true,
      case_id: caseId,
    };
  }

  for (const { pattern, reply, escalate } of FALLBACK_RESPONSES) {
    if (pattern.test(message)) {
      return { reply, escalated: escalate };
    }
  }

  return { reply: DEFAULT_REPLY };
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

  const toolCall = mapMessageToTool(message, beneficiaryId);

  if (gatewayUrl && gatewaySecret && toolCall) {
    try {
      const result = await callMcpTool(
        gatewayUrl,
        gatewaySecret,
        toolCall.name,
        toolCall.arguments,
      );

      if (user && conversationId) {
        await supabaseAdmin.from("chat_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: result.reply,
        });
        await supabaseAdmin
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      // If the Gateway escalated the tool call, create a case record so Sara's
      // portal can find it and send the event_id back when she decides.
      if (result.escalated && result.case_id) {
        createCase({
          user_display: user?.user_metadata?.full_name ?? user?.email ?? "Anonymous User",
          user_message: message,
          tool_name: toolCall.name,
          tool_args_redacted: toolCall.arguments,
          risk_label: "ESCALATE",
          risk_score: 75,
          risk_rationale: "Escalated by MCP Gateway for human review.",
          policy_refs: [],
          gateway_event_id: result.case_id,
          conversation_id: conversationId ?? undefined,
        }).catch((err) => {
          console.error("[chat/route] Failed to create case record for escalated tool call:", err);
        });
      }

      return NextResponse.json({
        reply: result.reply,
        escalated: result.escalated,
        case_id: result.case_id,
        conversation_id: conversationId,
      });
    } catch (err) {
      console.error("[chat/route] MCP SSE gateway error, falling back:", err);
    }
  }

  const result = getFallbackReply(message);

  if (user && conversationId) {
    await supabaseAdmin.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.reply,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  return NextResponse.json({ ...result, conversation_id: conversationId });
}
