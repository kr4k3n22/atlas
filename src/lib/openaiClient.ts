import OpenAI from "openai";

const ATLAS_SYSTEM_PROMPT = `# ROLE
You are the "ATLAS Public Service Assistant," a high-empathy AI agent for the citizen 'Alex'. Your goal is to navigate public benefits while strictly adhering to NIST AI RMF governance boundaries.

# GOVERNANCE KNOWLEDGE (THE ATLAS POLICY ENGINE)
You must understand the logic your "Governor" (the Risk SLM) uses to evaluate your requests:
- auto_approve: Granted when eligibility is clear, evidence is complete, and there are NO harm or fraud signals.
- auto_deny: Only for confirmed ineligibility with NO ambiguity or harm signals. Note: Any harm signal triggers a human review.
- auto_review: Triggered when evidence is pending or low-level ambiguity exists, but fraud/harm risk is low.
- escalate_to_human: Mandatory when harm signals are present, vulnerabilities exist, or evidence is contradictory. This ensures protection from automated harm.

# CLAIMANT DATA USAGE
- When the user asks what information you have, or asks general questions about their case, PRESENT the claimant data from the CLAIMANT DATA section below.
- Summarize key facts: name, employment status, household, current application status, programmes, income history, housing costs, and any pending decisions.
- Convert all monetary amounts from pence to pounds (divide by 100) when presenting to the user. Format as £X,XXX.XX.
- If a data field is missing or null, say "not yet recorded" rather than making something up.
- When the user provides their claimant reference (e.g. BEN-ATLAS-001), confirm you found their record and offer a summary.
- You have access to the claimant's: identity, employment history, income records, housing payments, household composition, application status, decisions, and any hardship indicators.

# OPERATIONAL PROTOCOLS
1. LEAST PRIVILEGE: You cannot finalise payments. You are an information-gathering engine.
2. TOOL USAGE: All "Material Impact" actions must go through the ATLAS Hub (MCP).
3. PAUSE & ESCALATE: If the Hub returns 'escalate_to_human', stop immediately.
   3a. Tell Alex only that their request has been escalated to a case officer for review. Use the SLM rationale to explain why a safety check was triggered (e.g., "We noticed a potential impact on your housing safety, so a human expert is double-checking this now").
   3b. NEVER reveal internal reviewer names (e.g., "Sarah", "Sara", or any other individual), internal system names (e.g., "HITL dashboard", "Sarah's portal"), or any other internal operational detail.
   3c. Always refer to the reviewer generically as "a case officer", "a human reviewer", or "our review team". The user should only know their request is "under review" or "being reviewed by a case officer".

# INTERACTION STYLE
- PERSONA: Empathetic and transparent.
- TRANSPARENCY: If an action is paused, explicitly cite the "Human Oversight" requirement to reduce Alex's anxiety.
- RATIONALE: Provide clear, non-technical reasons for any system status based on the Governance Knowledge above.

# COMPLIANCE MISSION
Ensure every high-impact decision is overseen by a professional, fulfilling the ATLAS commitment to Trustworthy AI.`;

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
  claimantContext?: string,
): Promise<string> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const systemContent = claimantContext
    ? `${ATLAS_SYSTEM_PROMPT}\n\n# CLAIMANT DATA (USE THIS; DO NOT HALLUCINATE)\nOnly use the data below. If a fact is missing, ask the user to provide it. Do not make up or assume any facts.\n\n${claimantContext}`
    : ATLAS_SYSTEM_PROMPT;

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
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

// ─── Function-calling tools (MCP tool definitions) ───────────────────────────

const ATLAS_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_payment_status",
      description:
        "Check the current status of a welfare payment or claim for a beneficiary. Use when Alex asks about their claim, payment, or case progress.",
      parameters: {
        type: "object",
        properties: {
          beneficiary_id: {
            type: "string",
            description: "The unique beneficiary identifier (e.g., BEN-ATLAS-001).",
          },
        },
        required: ["beneficiary_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_payment_extension",
      description:
        "Request an extension or continuation of welfare payments or benefits. Use when Alex wants to extend, apply for, or continue receiving benefits.",
      parameters: {
        type: "object",
        properties: {
          beneficiary_id: {
            type: "string",
            description: "The unique beneficiary identifier.",
          },
          reason: {
            type: "string",
            description: "The reason for requesting the payment extension, in Alex's own words.",
          },
        },
        required: ["beneficiary_id", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_welfare_record",
      description:
        "Modify or update a welfare record for a beneficiary, such as changing personal details, updating payment information, or amending case data. Use when Alex wants to change, update, or edit their record.",
      parameters: {
        type: "object",
        properties: {
          beneficiary_id: {
            type: "string",
            description: "The unique beneficiary identifier.",
          },
          changes: {
            type: "object",
            description: "A key-value map of the fields to update in the welfare record.",
            additionalProperties: true,
          },
        },
        required: ["beneficiary_id", "changes"],
      },
    },
  },
];

export type ChatWithToolsResult =
  | { type: "tool_call"; name: string; arguments: Record<string, unknown> }
  | { type: "message"; content: string };

/**
 * Send the conversation to ChatGPT with MCP tool definitions.
 * Returns either a tool call (when ChatGPT decides an MCP action is needed)
 * or a direct text message (for safe / general questions).
 */
export async function chatWithTools(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
  beneficiaryId: string,
  claimantContext?: string,
): Promise<ChatWithToolsResult> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  // Inject beneficiary context so ChatGPT can populate tool arguments correctly.
  let systemPrompt = `${ATLAS_SYSTEM_PROMPT}\n\nThe current user's beneficiary ID is: ${beneficiaryId}. Use this ID when calling tools unless the user explicitly provides a different one.`;
  if (claimantContext) {
    systemPrompt += `\n\n# CLAIMANT DATA (USE THIS; DO NOT HALLUCINATE)\nOnly use the data below. If a fact is missing, ask the user to provide it. Do not make up or assume any facts.\n\n${claimantContext}`;
  }

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
    { role: "user", content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model,
    messages: chatMessages,
    tools: ATLAS_TOOLS,
    tool_choice: "auto",
  });

  const choice = response.choices[0];
  if (!choice) {
    throw new Error("OpenAI returned an empty response.");
  }

  // Model chose to invoke an MCP tool.
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls.find((tc) => tc.type === "function");
    if (toolCall) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      return { type: "tool_call", name: toolCall.function.name, arguments: args };
    }
  }

  // Model responded directly (safe / general question).
  const content = choice.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return { type: "message", content };
}
