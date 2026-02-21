import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function mapMessageToTool(message: string): ToolCall | null {
  const beneficiaryId = extractBeneficiaryId(message);
  if (!beneficiaryId) return null;

  if (/\b(check|status|claim status|payment status|progress|where is|my claim)\b/i.test(message)) {
    return { name: "check_payment_status", arguments: { beneficiary_id: beneficiaryId } };
  }
  if (/\b(apply|extend|extension|request extension|requesting extension)\b/i.test(message)) {
    return { name: "request_payment_extension", arguments: { beneficiary_id: beneficiaryId, reason: message } };
  }
  if (/\b(modify|update|change|edit|amend|alter)\b/i.test(message)) {
    return { name: "modify_welfare_record", arguments: { beneficiary_id: beneficiaryId, changes: {} } };
  }

  return null;
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

/**
 * Extract the Supabase auth token from cookies.
 * The browser client stores it as `sb-<projectRef>-auth-token`.
 * The value is a JSON-encoded object with access_token inside.
 */
function extractAccessToken(cookieHeader: string, supabaseUrl: string): string | null {
  const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  // Find the cookie
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const match = cookies.find((c) => c.startsWith(`${storageKey}=`));
  if (!match) return null;

  try {
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(value);
    // Could be the full session object or just the token string
    if (typeof parsed === "string") return parsed;
    return parsed?.access_token ?? parsed?.[0] ?? null;
  } catch {
    return null;
  }
}

async function getAuthUser(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Try to extract the access token from the cookie
  const accessToken = extractAccessToken(cookieHeader, supabaseUrl);

  if (accessToken) {
    // Use supabaseAdmin (service role) to validate the token — this always works
    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
    if (user) return user;
  }

  // Fallback: try the standard cookie-based approach
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { cookie: cookieHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
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

  const user = await getAuthUser(req);

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

  const toolCall = mapMessageToTool(message);

  if (gatewayUrl && toolCall) {
    try {
      const mcpPayload = {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (gatewaySecret) {
        headers["Authorization"] = `Bearer ${gatewaySecret}`;
      }

      const res = await fetch(`${gatewayUrl}/mcp/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(mcpPayload),
      });

      if (!res.ok) {
        throw new Error(`Gateway responded with ${res.status}`);
      }

      const data = await res.json();
      const textContent = data?.result?.content?.find(
        (c: { type: string; text?: string }) => c.type === "text"
      )?.text;
      const reply = textContent ?? data.reply ?? data.message ?? "No response from gateway.";

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

      return NextResponse.json({
        reply,
        escalated: data.escalated ?? false,
        case_id: data.case_id,
        conversation_id: conversationId,
      });
    } catch (err) {
      console.error("[chat/route] MCP gateway error, falling back:", err);
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
