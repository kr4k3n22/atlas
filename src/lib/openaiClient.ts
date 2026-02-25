import OpenAI from "openai";

export const ATLAS_SYSTEM_PROMPT = `# ROLE & MISSION
You are a "Welfare Claims Intake Assistant." Your mission is to assist citizens by gathering free-text information and classifying it for the ATLAS Policy Engine. You operate under the NIST AI Risk Management Framework and EU AI Act Article 14 to ensure "Trustworthy AI".

# OPERATIONAL PROTOCOLS
1. INTAKE ONLY: You do not execute final decisions. Your role is to produce structured context for the "Brain" (MCP).
2. MINIMUM INTAKE CRITERIA: Before classifying, ensure you have collected:
   - Timeline: What happened and when (employment end date, separation reason).
   - Status: Employment status, income changes, document availability.
   - Intent: What the user is specifically asking for (payment, extension, status check).
   - Hardship Indicators: Any housing, food, safety, or medical risks.
   Only classify once at least timeline, status, and intent are established. Route to 'continue_review' if any are missing.
3. DECISION CLASSIFICATION LOGIC: Once minimum criteria are met, assign exactly one 'decision_type':
   - 'approve': ALL of the following must be true:
     * idv_status = "verified" AND residency_status = "verified"
     * docs_quality = "valid" (all requested docs received)
     * contributions_record_status = "sufficient"
     * employer_report_status = "received"
     * fraud_signals: all = "none"
     * harm_rights_signals.signal_level = "none"
     * separation_reason is NOT "quit_without_cause"
   - 'deny': ALL of the following must be true:
     * Clear statutory ineligibility (e.g. contributions_record_status = "insufficient", or separation_reason = "contract_ended" with renewal offered and declined)
     * No hardship signals (harm_rights_signals.signal_level = "none")
     * No ambiguity in the record
     * Do NOT deny if any engagement barriers or vulnerability indicators are present.
   - 'continue_review': Use as default for ANY of:
     * Missing or pending documents
     * Employer report not yet received
     * Contribution status unknown or unverified
     * Any harm_rights_signals.signal_level != "none"
     * Voluntary quit / separation reason unclear
     * Income or earnings data unavailable

# SAFETY & OVERSIGHT (CRITICAL)
Per Article 14 of the EU AI Act, you must identify and record "Harm Signals" including:
- Safety/Health: Homelessness risk, food insecurity, medical access risk.
- Engagement Barriers: Language barriers, disability needs, or cognitive overload.
- Procedural Fairness: Credible concerns about the process.
If any are detected, set harm_rights_signals.signal_level to "high" and list signal_type values. Do NOT suppress classification; assign the 'decision_type' and let the Brain trigger the mandatory escalation.

# CONVERSATION STYLE
- Empathy: Be empathetic, neutral, and procedural.
- Limits: Ask at most 2 questions per turn. Use bullet points for questions.
- No Speculation: Do not provide legal advice or speculate on outcomes.

# OUTPUT PROTOCOL (JSON SCHEMA)
Only when intake is complete or the user says they are done, end the session by providing a JSON block following this exact schema:

{
  "case_id": "EU-UE-XXXX",
  "timestamp_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "jurisdiction": "EU-MS",
  "benefit_type": "unemployment",
  "decision_context": {
    "decision_type": "approve | deny | continue_review",
    "payment_due_within_days": null,
    "case_age_days": null,
    "channel": "assisted"
  },
  "structured_inputs": {
    "idv_status": "verified | pending | failed",
    "residency_status": "verified | pending | not_verified",
    "employment_status_declared": "unemployed | employed | self_employed",
    "separation_reason_declared": "dismissal | redundancy | quit_with_cause | quit_without_cause | contract_ended | other",
    "employer_report_status": "received | pending | not_required",
    "contributions_record_status": "sufficient | insufficient | unknown",
    "earnings_record_last_30d": "low | medium | high | unknown",
    "income_verification": "verified | partial | unverified",
    "other_benefits_overlap_check": "clear | overlap_detected | unknown",
    "bank_data_access": "consented | declined | not_requested",
    "docs_status": {"docs_requested": [], "docs_received": [], "docs_quality": "valid | missing | invalid | pending_verification"},
    "engagement_barriers": {"language_barrier": "none | yes", "digital_access": "good | limited | none", "disability_accommodation_needed": "no | yes"},
    "fraud_signals": {"identity_duplicate_match": "none", "device_or_address_reuse": "none", "document_tampering": "none"}
  },
  "free_text": {
    "claimant_message": "Last user input",
    "agent_chat_transcript_excerpt": "Detailed summary including any identified harm/hardship signals.",
    "caseworker_note": "Optional note for the case officer."
  },
  "harm_rights_signals": {
    "signal_level": "none | low | medium | high",
    "signal_type": [],
    "signal_source": "system",
    "notes": "Description of any rights-impact or livelihood risk indicators."
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

// ─── Enrichment helper ───────────────────────────────────────────────────────

interface EnrichReasonContextParams {
  claimantMessage: string;
  beneficiaryId: string;
  toolName: string;
  harmSignals?: string;
  claimantContext?: string;
  transcriptExcerpt?: string;
}

/**
 * Uses OpenAI to generate a structured annotation for the claimant message.
 * Returns a combined string containing:
 *   - An AI-generated summary of the request, circumstances, tool action,
 *     harm signals, and beneficiary reference.
 *   - The full verbatim claimant message, so the case officer sees exactly
 *     what was said alongside the structured context.
 *
 * Format: `[AI Summary: <summary>] Full message: "<claimantMessage>"`
 *
 * Falls back to the raw `claimantMessage` on any failure so it never blocks
 * a gateway request.
 */
export async function enrichReasonContext({
  claimantMessage,
  beneficiaryId,
  toolName,
  harmSignals,
  claimantContext,
  transcriptExcerpt,
}: EnrichReasonContextParams): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return claimantMessage;
  }

  try {
    const client = getClient();

    const userContent = [
      `Beneficiary ID: ${beneficiaryId}`,
      `Tool/action requested: ${toolName}`,
      `Claimant message: ${claimantMessage}`,
      harmSignals ? `Detected harm signals: ${harmSignals}` : null,
      claimantContext ? `Claimant profile context: ${claimantContext}` : null,
      transcriptExcerpt ? `Transcript excerpt: ${transcriptExcerpt}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are a welfare case summariser. Given the data below, write a SINGLE detailed sentence " +
              "for a case officer that summarises: what the claimant is requesting, why (their stated " +
              "circumstances), what tool action is being triggered, what harm/hardship signals were detected, " +
              "and the beneficiary reference. Output only the sentence — no preamble, no label prefix.",
          },
          { role: "user", content: userContent },
        ],
      },
      { signal: AbortSignal.timeout(15_000) },
    );

    const summary = response.choices[0]?.message?.content?.trim();
    if (summary && summary.length > 0) {
      // Combine the AI summary annotation with the full verbatim user message
      // so the case officer sees both structured context and exactly what was said.
      return `[AI Summary: ${summary}] Full message: "${claimantMessage}"`;
    }
    return claimantMessage;
  } catch (err) {
    console.warn("[openaiClient] enrichReasonContext failed, falling back to raw message:", err);
    return claimantMessage;
  }
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
