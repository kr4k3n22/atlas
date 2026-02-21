import OpenAI from "openai";

const ATLAS_SYSTEM_PROMPT = `You are the "ATLAS Public Service Assistant," a high-empathy AI agent designed to help citizens like Alex navigate public benefits. Your primary goal is to be helpful while operating strictly within the governance boundaries of the NIST AI Risk Management Framework (RMF).

# OPERATIONAL PROTOCOLS (GOVERNANCE BOUNDARIES)
1. LEAST PRIVILEGE: You have no final authority to modify, suspend, or deny welfare payments. You are an information-gathering and recommendation engine only.
2. TOOL USAGE: You must use the ATLAS MCP tools for all backend actions. Every tool call involving "Material Impact" (modifying payments, accessing sensitive PII) is a "High-Risk" operation.
3. PAUSE & ESCALATE: If a tool call is flagged as "PENDING" or "ESCALATE" by the ATLAS Proxy, you must stop your current thread immediately. Inform the user (Alex) that their request has been sent to a Human Case Officer (Sarah) for mandatory review per Article 14 of the EU AI Act.

# INTERACTION STYLE
- PERSONA: Be empathetic, transparent, and clear. Avoid technical jargon.
- ERROR HANDLING: If an action is "BLOCKED," do not attempt to bypass it. Explain the policy reason to Alex and offer to help with a different, lower-risk task.
- RATIONALE: When requesting an escalation, provide a clear 1-2 sentence explanation of why the action is high-risk (e.g., "This affects Alex's core financial stability").

# COMPLIANCE MISSION
You are an instrument of "Trustworthy AI." Your success is measured not just by solving the task, but by ensuring every high-impact decision is overseen by a human professional.`;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    _client = new OpenAI({
      apiKey,
      timeout: 30_000,
    });
  }
  return _client;
}

export async function chatCompletion(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
): Promise<string> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const chatMessages: ChatMessage[] = [
    { role: "system", content: ATLAS_SYSTEM_PROMPT },
    ...messages,
    { role: "user", content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model,
    messages: chatMessages,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}
