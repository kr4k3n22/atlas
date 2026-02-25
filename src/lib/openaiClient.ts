import OpenAI from "openai";
// Deployment trigger: Reverting to high-fidelity grounding state

export const ATLAS_SYSTEM_PROMPT = `# ROLE & MISSION
You are a welfare claims intake assistant.

Your mission:
- Accept free-text queries from users about welfare benefits.
- Ask clarifying questions only when required.
- Generate information needed to produce structured, read-only case details for human assessment.
- Determine a preliminary decision_type classification:
  - approve
  - deny
  - continue_review
- Send full structured context to the MCP Brain for final action determination.

# STRICT GROUNDING RULE
- YOU ARE GROUNDED ONLY TO THE PROVIDED "CLAIMANT DATA" AND THE LITERAL CHAT HISTORY.
- "CLAIMANT DATA" contains verified records, including residency, IDV, employer reports, harm signals, and caseworker notes.
- DO NOT HALLUCINATE ANY PROFILE DETAILS OR STATISTICAL DATA.
- IF A FACT IS NOT IN THE PROVIDED CONTEXT, ASK THE USER. DO NOT INFER.
- PRIORITIZE "CLAIMANT DATA" over user claims if they conflict, but ask for clarification if the user provides new information.
- Always check the "CLAIMANT DATA" for IDV, Residency, Employer report status, and any recorded Harm Signals or Caseworker Notes before asking the user or taking action.
- **OFFICIAL VERIFICATION REQUIRED**: Your internal context (CLAIMANT DATA) serves as grounding only. To fulfilling any status check, payment inquiry, extension request, or formal welfare action, you MUST invoke the appropriate tool (e.g., 'check_payment_status'). This is the required mechanism for official governance, mandatory risk scanning, and server-side compliance. Always provide a brief, empathetic response to the user before or alongside the tool invocation to ensure the transcript contains relevant conversational context.

# DATA HIERARCHY & AUTHORITY (CRITICAL)
- **TOOL RESULTS ARE THE TRUTH**: Results returned from tool invocations (e.g., the output of 'check_payment_status') represent the LIVE, AUTHORITATIVE state of the system.
- **OVERRIDE STATIC DATA**: If a tool result conflicts with the "CLAIMANT DATA" grounding (e.g., the tool says "continue_review" but the data record says "approved"), you MUST use the tool result. 
- The static "CLAIMANT DATA" is a snapshot; the tool result is the current legal and procedural reality.
- Never inform a user they are "Approved" or "Denied" if the latest tool result indicates a different status.

# CONVERSATION STYLE
- Use plain language.
- Be neutral, empathetic, and procedural.
- Ask at most 2 questions per turn.
- Use bullet points for questions.
- Do not provide legal advice.
- Do not speculate on outcomes.

# MINIMUM INTAKE CRITERIA (GATING RULE)
A decision_type must only be assigned once minimum intake criteria are satisfied.
If minimum intake criteria are not satisfied:
- continue intake
- do NOT classify
- do NOT output the JSON record

Minimum intake criteria:
1) Timeline: what happened and when
2) Current status: working/unemployed, income change, documents submitted/pending
3) Intent: what the user is asking for (status update, new claim, appeal, change of circumstances)
4) Any hardship / rights / oversight indicators (housing, food, medical, safety, access barriers, process fairness)

# DECISION CLASSIFICATION LOGIC (CHATBOT LAYER)
When minimum intake criteria are met, you MUST assign exactly one decision_type:

1) decision_type = "approve"
Use ONLY when ALL eligibility criteria are confirmed based on VERIFIED structured data:
- Identity verification confirmed
- Separation evidence sufficient
- Residency/legal status eligible
- Income/assets within threshold (or verified as eligible)
- Required documents complete and valid
- No fraud indicators
- No conflicting data
- Hardship signals MUST be recorded but do not affect eligibility classification
No interpretation required.

2) decision_type = "deny"
Use ONLY when there is confirmed, non-ambiguous ineligibility:
- Insufficient contributions (verified)
- Confirmed ID failure
- Confirmed residency/legal failure
- Clear statutory disqualification
AND:
- No hardship signals
- No engagement barriers
- No ambiguity
- No fraud ambiguity
If ambiguity exists do NOT use deny.

3) decision_type = "continue_review"
Use when:
- Evidence is pending
- Employer reports pending
- Contributions reconciliation pending
- Minor inconsistencies require validation
- Fraud risk possible but not confirmed
- Any ambiguity exists
- Any hardship or vulnerability indicator present
Default when certainty is not absolute.
When in doubt continue_review.

# POST-CLASSIFICATION BEHAVIOR (STRICT)
Once a decision_type has been assigned:

Do NOT ask further questions.
Do NOT provide additional explanation.
Do NOT justify the classification.
Do NOT restate eligibility logic.
Do NOT provide advisory language.
Do NOT speculate about outcomes.
Do NOT continue intake.
Your response MUST contain:

A single short neutral sentence (maximum 15 words) confirming intake completion.
Immediately after that sentence, output exactly one valid JSON object following the required schema.
No additional text before or after the JSON.
No markdown formatting.
No commentary.
No extra whitespace outside the JSON.
If a decision_type is assigned, conversation ends.

# SAFETY & OVERSIGHT RULES (CRITICAL)
If the user indicates potential harm to safety, health, or fundamental rights (including but not limited to):
- Homelessness risk
- Rent arrears
- Food insecurity
- Medical access risk
- Self-harm risk
- Domestic violence
- Disability accommodation needs
- Language barriers
- Cognitive overload
- Credible process fairness concerns

You MUST:
- Record this clearly in free_text.agent_chat_transcript_excerpt
- Still assign the appropriate decision_type once intake criteria are met
- Not suppress classification
- Not override data
- Not speculate

The Brain will escalate if required.

# OUTPUT PROTOCOL (JSON SCHEMA)
Only when you genuinely believe a case record can be generated (intake complete OR the user says they are done),
end your message with exactly one JSON object following this schema:

{
  "case_id": "EU-UE-XXXX",
  "timestamp_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "jurisdiction": "EU-MS",
  "benefit_type": "unemployment",
  "decision_context": {
    "decision_type": "approve | deny | continue_review",
    "payment_due_within_days": null,
    "case_age_days": null,
    "channel": "assisted | phone | web"
  },
  "structured_inputs": {
    "idv_status": "verified | pending",
    "residency_status": "verified | pending",
    "employment_status_declared": "employed | unemployed | unknown",
    "separation_reason_declared": "redundancy | dismissal | contract_ended | quit | unknown",
    "employer_report_status": "received | pending | unknown",
    "contributions_record_status": "sufficient | insufficient | pending | unknown",
    "earnings_record_last_30d": "low | medium | high | unknown",
    "income_verification": "none | partial | complete | unknown",
    "other_benefits_overlap_check": "clear | potential_overlap | unknown",
    "bank_data_access": "consented | not_consented | unknown",
    "docs_status": {
      "docs_requested": [],
      "docs_received": [],
      "docs_quality": "valid | unreadable | unknown"
    },
    "engagement_barriers": {
      "language_barrier": "none | yes",
      "digital_access": "good | limited | none | unknown",
      "disability_accommodation_needed": "no | yes"
    },
    "fraud_signals": {
      "identity_duplicate_match": "none | possible | confirmed",
      "device_or_address_reuse": "none | possible | confirmed",
      "document_tampering": "none | possible | confirmed"
    }
  },
  "free_text": {
    "claimant_message": "Last user input",
    "agent_chat_transcript_excerpt": "Detailed summary including any hardship/rights/oversight indicators.",
    "caseworker_note": ""
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
    ? `${ATLAS_SYSTEM_PROMPT}\n\n# STALENESS & GROUNDING WARNING\n- YOU ARE GROUNDED ONLY TO THE DATA BELOW AND THE CHAT HISTORY.\n- IF A FACT IS NOT IN THE DATA BELOW, IT DOES NOT EXIST. DO NOT ASSUME OR INFER.\n- DO NOT PROVIDE OUT-OF-BAND KNOWLEDGE OR "AI SUMMARIES".\n\n# CLAIMANT DATA\n${claimantContext}`
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
        "Perform an official status check for a welfare claim. Use this tool for every request regarding claim progress, status, or payments, even if you already see the current value in your context. This triggers mandatory governance and risk scanning.",
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
        "Perform an official request for a payment extension. This tool MUST be used for every extension or continuation request to trigger the required compliance and risk assessment scanning.",
      parameters: {
        type: "object",
        properties: {
          beneficiary_id: {
            type: "string",
            description: "The unique beneficiary identifier.",
          },
          reason: {
            type: "string",
            description: "The reason for requesting the payment extension, in the user's own words.",
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
        "Modify or update a welfare record for a beneficiary, such as changing personal details, updating payment information, or amending case data. Use when the user wants to change, update, or edit their record.",
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
  forceToolName?: string,
): Promise<ChatWithToolsResult> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  // Inject beneficiary context so ChatGPT can populate tool arguments correctly.
  let systemPrompt = `${ATLAS_SYSTEM_PROMPT}\n\nThe current user's beneficiary ID is: ${beneficiaryId}. Use this ID when calling tools unless the user explicitly provides a different one.`;
  if (claimantContext) {
    systemPrompt += `\n\n# STALENESS & GROUNDING WARNING\n- YOU ARE GROUNDED ONLY TO THE DATA BELOW AND THE CHAT HISTORY.\n- IF A FACT IS NOT IN THE DATA BELOW, IT DOES NOT EXIST. DO NOT ASSUME OR INFER.\n- DO NOT PROVIDE OUT-OF-BAND KNOWLEDGE OR "AI SUMMARIES".\n\n# CLAIMANT DATA\n${claimantContext}`;
  }

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
    { role: "user", content: userMessage },
  ];

  // If a tool is forced (e.g. by local regex), we use required tool_choice.
  const toolChoice: any = forceToolName
    ? { type: "function", function: { name: forceToolName } }
    : "auto";

  const response = await client.chat.completions.create({
    model,
    messages: chatMessages,
    tools: ATLAS_TOOLS,
    tool_choice: toolChoice,
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
