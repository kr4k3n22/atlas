import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    created_at: string;
};

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    // ── 1. Load case row ───────────────────────────────────────────────────────
    const { data: caseRow, error: caseErr } = await supabaseAdmin
        .from("approval_queue")
        .select("ai_summary, tool_args_redacted, user_message, tool_name, risk_label, risk_score, risk_rationale")
        .eq("id", id)
        .single();

    if (caseErr || !caseRow) {
        return new Response("Not found", { status: 404 });
    }

    // ── 2. Return cached summary if already generated ─────────────────────────
    if (caseRow.ai_summary) {
        const convId = (caseRow.tool_args_redacted as Record<string, unknown>)?.conversation_id;
        const messages = convId ? await fetchMessages(convId as string) : [];
        return Response.json({ summary: caseRow.ai_summary, messages });
    }

    // ── 3. Resolve conversation_id from tool_args_redacted ────────────────────
    const conversationId = (caseRow.tool_args_redacted as Record<string, unknown>)?.conversation_id;
    const messages: ChatMessage[] = conversationId
        ? await fetchMessages(conversationId as string)
        : [];

    // ── 4. Generate summary via OpenAI ────────────────────────────────────────
    let summary = "No conversation transcript available for this case.";

    if (messages.length > 0) {
        const transcript = messages
            .map((m) => `[${m.role === "user" ? "Claimant" : "Atlas"}]: ${m.content}`)
            .join("\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                {
                    role: "system",
                    content: `You are a case review assistant for a welfare benefits system. 
Summarise the following chat transcript for a human approval officer reviewing a escalated case.

Structure your response as follows (use these exact headings):

**What the claimant requested**
One or two sentences describing the specific request.

**Key facts from the conversation**
Bullet points of relevant details (reasons given, circumstances mentioned, urgency).

**Risk indicators**
Any signals that may be relevant to the approval decision (inconsistencies, sensitive circumstances, urgency language, etc.).

**Context for the approver**
A short concluding note with any additional context that would help the approver make a fair decision.

Keep the entire summary under 300 words. Be factual and neutral.`,
                },
                {
                    role: "user",
                    content: `Case ID: ${id}
Tool requested: ${caseRow.tool_name}
Risk label: ${caseRow.risk_label} (score: ${caseRow.risk_score}/100)
Risk rationale: ${caseRow.risk_rationale}

Chat transcript:
${transcript}`,
                },
            ],
        });

        summary = completion.choices[0]?.message?.content?.trim() ?? summary;
    }

    // ── 5. Cache the summary in the approval_queue row ────────────────────────
    await supabaseAdmin
        .from("approval_queue")
        .update({ ai_summary: summary })
        .eq("id", id);

    return Response.json({ summary, messages });
}

async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data } = await supabaseAdmin
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    return (data ?? []) as ChatMessage[];
}
