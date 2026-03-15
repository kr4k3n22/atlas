import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Case } from "@/lib/schema";

const SYSTEM_PROMPT = `You are a governance action analyst for a welfare benefits system.
A high-risk case has just been escalated for human review. Based on the case metadata and any available conversation transcript, produce a concise action summary for the internal case actions log.

Structure your response using these exact headings:

**Recommended Actions**
Bullet points listing the specific actions the approver should take (e.g., verify documents, contact claimant, escalate to senior officer, apply policy rule).

**Risk Summary**
One or two sentences explaining why this case was flagged and the primary risk concern.

**Urgency & Priority**
A brief note on time sensitivity or any factors requiring expedited handling.

**Key Context**
Any facts from the conversation or case data that directly inform the decision (claimant circumstances, tool used, prior interactions).

Keep the entire summary under 400 words. Be factual, actionable, and neutral.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data } = await supabaseAdmin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (data ?? []) as ChatMessage[];
}

/**
 * Generate an AI-powered action summary for a high-risk escalated case.
 * Uses OpenAI gpt-4o-mini. Falls back to a structured plain-text summary
 * if OPENAI_API_KEY is not set or the call fails.
 */
export async function generateActionSummary(c: Case): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildFallbackSummary(c);
  }

  // Fetch conversation messages if available
  const conversationId = (c.tool_args_redacted as Record<string, unknown>)?.conversation_id;
  const messages: ChatMessage[] = conversationId
    ? await fetchMessages(conversationId as string)
    : [];

  const transcript =
    messages.length > 0
      ? messages
          .map((m) => `[${m.role === "user" ? "Claimant" : "Atlas"}]: ${m.content}`)
          .join("\n")
      : null;

  const userContent = [
    `Case ID: ${c.id}`,
    `Tool requested: ${c.tool_name}`,
    `Risk label: ${c.risk_label} (score: ${c.risk_score}/100)`,
    `Risk rationale: ${c.risk_rationale}`,
    `Claimant: ${c.user_display}`,
    `Claimant message: ${c.user_message}`,
    transcript ? `\nChat transcript:\n${transcript}` : "\n(No conversation transcript available)",
  ].join("\n");

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? buildFallbackSummary(c);
  } catch (error: any) {
    console.error("[generateActionSummary] OpenAI error:", error?.message ?? error);
    return buildFallbackSummary(c);
  }
}

function buildFallbackSummary(c: Case): string {
  return [
    `**Recommended Actions**`,
    `- Review case ${c.id} in the ATLAS dashboard and apply a decision (APPROVE / REJECT / REQUEST_INFO).`,
    `- Verify the tool request and claimant details before proceeding.`,
    ``,
    `**Risk Summary**`,
    `${c.risk_label} (score ${c.risk_score}/100): ${c.risk_rationale}`,
    ``,
    `**Urgency & Priority**`,
    `Case is in PENDING_REVIEW status awaiting approver action.`,
    ``,
    `**Key Context**`,
    `Tool: ${c.tool_name} | Claimant: ${c.user_display}`,
    `Message: ${c.user_message.slice(0, 200)}`,
  ].join("\n");
}
