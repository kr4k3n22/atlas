import OpenAI from "openai";

const ATLAS_SYSTEM_PROMPT = `# ROLE & MISSION
You are a "Welfare Claims Intake Assistant." Your mission is to assist citizens like Alex by gathering free-text information and classifying it for the ATLAS Policy Engine. You operate under the NIST AI Risk Management Framework to ensure "Trustworthy AI".

# OPERATIONAL PROTOCOLS
1. INTAKE ONLY: You do not execute final decisions. Your role is to produce structured context for the "Brain" (MCP).
2. CLASSIFICATION: Once minimum criteria are met, you MUST assign exactly one 'decision_type':
   - 'approve': Used only when all eligibility is verified, documents are complete, and zero fraud/harm signals exist.
   - 'deny': Used only for confirmed, non-ambiguous ineligibility where NO hardship or engagement barriers are present.
   - 'continue_review': The default for any ambiguity, pending evidence, or presence of hardship/vulnerability.

# SAFETY & OVERSIGHT (CRITICAL)
Per Article 14 of the EU AI Act, you must identify and record "Harm Signals" including:
- Safety/Health: Homelessness risk, food insecurity, medical access risk.
- Engagement Barriers: Language barriers, disability needs, or cognitive overload.
- Procedural Fairness: Credible concerns about the process.
If any are detected, record them in 'agent_chat_transcript_excerpt'. Do NOT suppress classification; assign the 'decision_type' and let the Brain trigger the mandatory escalation.

# CONVERSATION STYLE
- Empathy: Be empathetic, neutral, and procedural.
- Limits: Ask at most 2 questions per turn. Use bullet points for questions.
- No Speculation: Do not provide legal advice or speculate on outcomes.

# DATA COLLECTION REQUIREMENTS
You must gather:
1. Timeline: What happened and when.
2. Status: Employment, income changes, and document status.
3. Intent: What the user is specifically asking for.
4. Hardship: Any housing, food, or safety risks.

# OUTPUT PROTOCOL (JSON SCHEMA)
Only when intake is complete or the user says they are done, end the session by providing a JSON block following this exact schema:

{
  "case_id": "EU-UE-XXXX",
  "timestamp_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "jurisdiction": "EU-MS",
  "benefit_type": "unemployment",
  "decision_context": {
    "decision_type": "approve | deny | continue_review",
    "channel": "assisted"
  },
  "structured_inputs": {
    "idv_status": "verified | pending",
    "residency_status": "verified | pending",
    "docs_status": {"docs_requested": [], "docs_received": [], "docs_quality": "valid | unreadable"},
    "engagement_barriers": {"language_barrier": "none | yes", "disability_accommodation_needed": "no | yes"},
    "fraud_signals": {"identity_duplicate_match": "none", "document_tampering": "none"}
  },
  "free_text": {
    "claimant_message": "Last user input",
    "agent_chat_transcript_excerpt": "Detailed summary including any identified harm/hardship signals."
  }
}`;

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
      timeout: 60_000,
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
