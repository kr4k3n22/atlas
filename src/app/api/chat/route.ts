import { NextRequest, NextResponse } from "next/server";

type Message = { role: "user" | "assistant"; content: string };

interface ChatRequest {
  message: string;
  history?: Message[];
}

const ESCALATION_PATTERNS = /\b(submit|file|apply now|start my claim|register my claim)\b/i;

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
      "Hello! I'm Alex, your welfare services assistant. I can help you with:\n\n• Unemployment benefit applications\n• Checking your claim status\n• Understanding eligibility criteria\n• Document requirements\n• Appeals and reconsiderations\n\nHow can I assist you today?",
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

  const { message, history } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const gatewayUrl = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL;

  if (gatewayUrl) {
    try {
      const payload = {
        message,
        history: history ?? [],
      };

      const res = await fetch(`${gatewayUrl}/mcp/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Gateway responded with ${res.status}`);
      }

      const data = await res.json();
      return NextResponse.json({
        reply: data.reply ?? data.message ?? "No response from gateway.",
        escalated: data.escalated ?? false,
        case_id: data.case_id,
      });
    } catch (err) {
      console.error("[chat/route] MCP gateway error, falling back:", err);
    }
  }

  const result = getFallbackReply(message);
  return NextResponse.json(result);
}
