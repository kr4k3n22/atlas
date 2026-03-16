import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";
import { callMcpTool, callIntake, extractInlineJson } from "@/lib/mcpClient";
import { createCase } from "@/lib/caseStore";
import { chatCompletion, chatWithTools } from "@/lib/openaiClient";
import { getClaimantProfile, buildProfileContext, updateEmploymentStatus, recomputeDecisionState, extractAndPersistCaseSignals } from "@/lib/beneficiaryStore";
import { buildIntakePayload, validateIntakePayload, buildTranscriptExcerpt, getStoredIntakePayload } from "@/lib/intakePayloadBuilder";

type Message = { role: "user" | "assistant"; content: string };

/** Strip any embedded JSON objects from a text string.
 * Iterates until no more top-level or nested {…} blocks remain. */
function stripInlineJson(text: string): string {
  let result = text;
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(/\s*\{[^{}]*\}\s*/g, " ");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

interface ChatRequest {
  message: string;
  history?: Message[];
  conversation_id?: string;
}

const MAX_CONVERSATION_TITLE_LENGTH = 60;

const BENEFICIARY_ID_PATTERN = /\b(BEN-[A-Z0-9]+|ATL-[A-Z0-9-]+)\b/i;

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/,|;/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeDocName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeDocuments(existing: string[], incoming: string[]): string[] {
  const merged = new Map<string, string>();
  for (const doc of [...existing, ...incoming]) {
    const clean = doc.trim();
    if (!clean) continue;
    const key = normalizeDocName(clean);
    if (!merged.has(key)) merged.set(key, clean);
  }
  return [...merged.values()];
}

function documentsEqual(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeDocName));
  const rightSet = new Set(right.map(normalizeDocName));
  if (leftSet.size !== rightSet.size) return false;
  for (const item of leftSet) {
    if (!rightSet.has(item)) return false;
  }
  return true;
}

function isDocumentRemovalIntent(message: string): boolean {
  const explicitRemoval = /\b(remove|delete|clear|withdraw|retract|undo|unsubmit|didn'?t provide|did not provide|never provided|haven'?t provided|have not provided|not submitted|wasn'?t submitted|were not submitted)\b/i.test(message);
  const missingDocsStatement =
    /\bmissing\b/i.test(message) &&
    /\b(doc|docs|document|documents|paperwork|proof|certificate|notice)\b/i.test(message);
  return explicitRemoval || missingDocsStatement;
}

function shouldClearAllDocuments(message: string): boolean {
  return /\b(never provided (the )?(documents|docs|paperwork)|didn'?t provide (any )?(documents|docs|paperwork)|have not provided (any )?(documents|docs|paperwork)|remove all (documents|docs|paperwork)|clear all (documents|docs|paperwork))\b/i.test(message);
}

function extractDocumentNamesFromMessage(message: string): string[] {
  const candidates = new Set<string>();

  const snakeOrKebab = message.match(/\b[a-z0-9]+(?:[_-][a-z0-9]+)+\b/gi) ?? [];
  for (const token of snakeOrKebab) {
    candidates.add(token.trim());
  }

  return [...candidates];
}

function hasPotentialHarmSignal(message: string): boolean {
  return /\b(evict|evicted|eviction|homeless|rent|arrears|food|hungry|medical|medicine|unsafe|violence|abuse|harm|safety)\b/i.test(message);
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
  // Employment update — explicit employment-status intent only.
  const explicitEmploymentIntent =
    /\b(employment status|i am employed|i'm employed|im employed|i am unemployed|i'm unemployed|im unemployed)\b/i.test(message) ||
    /\b(i have a job|i've got a job|i got a job|i found a job|i started (a )?job|i started working|i am working|i'm working|im working)\b/i.test(message) ||
    /\b(i lost my job|i no longer work|i am not working|i'm not working|im not working|i don't have a job|i do not have a job|i was laid off|i got laid off)\b/i.test(message);

  if (explicitEmploymentIntent) {
    let detectedStatus = "";
    if (/\b(unemployed|no longer work|not working|don't have a job|do not have a job|lost my job|laid off)\b/i.test(message)) {
      detectedStatus = "unemployed";
    } else if (/\b(employed|have a job|got a job|found a job|started (a )?job|started working|am working|working)\b/i.test(message)) {
      detectedStatus = "employed";
    }
    return { name: "update_employment_status", arguments: { beneficiary_id: beneficiaryId, employment_status: detectedStatus } };
  }
  // Document intent — must be before the broad 'update' catch-all below.
  if (/\bdocs?\b|\bdocuments?\b|\bpaperwork\b/i.test(message)) {
    return { name: "update_document_status", arguments: { beneficiary_id: beneficiaryId } };
  }
  if (/\bemployer\b.{0,50}\b(sent|report|pending|waiting|received)\b/i.test(message)) {
    return { name: "update_document_status", arguments: { beneficiary_id: beneficiaryId } };
  }
  if (/\b(modify|update|change|edit|amend|alter)\b/i.test(message)) {
    return { name: "modify_welfare_record", arguments: { beneficiary_id: beneficiaryId, changes: {} } };
  }

  return null; // General questions fall through to ChatGPT
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

  // Resolve beneficiary ID from user metadata — must be explicitly set at registration
  const beneficiaryId = user?.user_metadata?.beneficiary_id as string | undefined;
  if (!beneficiaryId) {
    return NextResponse.json(
      {
        reply:
          "Your account does not have a claimant profile linked. " +
          "Please update your profile in Settings to select your claimant reference before using the chat.",
      },
      { status: 422 },
    );
  }

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

  // ── Step 0.5: Load persisted conversation history ───────────────────────
  // Fetch recent messages from DB so the AI sees decision messages
  // that were inserted server-side by caseStore.applyDecision().
  let serverHistory: Message[] = [];
  if (conversationId) {
    try {
      const { data: dbMessages } = await supabaseAdmin
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dbMessages && dbMessages.length > 0) {
        // Reverse to restore chronological order (oldest → newest).
        // The last entry is the user message we just inserted; remove it so
        // it is not duplicated when passed as the separate `message` parameter.
        const ordered = [...dbMessages].reverse();
        serverHistory = (ordered as Message[])
          .filter(m => m.role === "user" || m.role === "assistant")
          .slice(0, -1);
      }
    } catch (err) {
      console.error("[chat/route] Failed to load conversation history:", err);
      // Fall back to client-sent history
    }
  }

  // Use server history if available, otherwise fall back to client-sent history
  const effectiveHistory = serverHistory.length > 0 ? serverHistory : (body.history ?? []);

  const gatewayUrl = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL;
  const gatewaySecret = process.env.GATEWAY_SHARED_SECRET;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  // ── Step 0: Look up claimant profile from the SQL database ───────────────
  // This grounds the agent's responses in real data and prevents hallucination.
  let claimantContextBlock: string | null = null;
  try {
    const profile = await getClaimantProfile(beneficiaryId);
    if (profile) {
      claimantContextBlock = buildProfileContext(profile);
    } else {
      claimantContextBlock =
        `No records found for claimant reference ${beneficiaryId}. ` +
        `Ask the user to confirm their claimant reference or provide identifying information.`;
    }
  } catch (err) {
    console.error("[chat/route] Failed to fetch claimant profile:", err);
    // Non-fatal — continue without grounding context
  }

  // ── Step 1: Determine intent (tool call vs direct reply) ──────────────────
  // When OPENAI_API_KEY is set, use ChatGPT function calling to decide.
  // Otherwise fall back to regex pattern matching.
  let toolCall: ToolCall | null = null;
  let openaiDirectReply: string | null = null;
  let assistantContentOverride: string | undefined = undefined;

  if (hasOpenAI) {
    try {
      // Step 1: Detect specific tool intent locally via regex
      const localTool = mapMessageToTool(message, beneficiaryId);

      const aiResult = await chatWithTools(
        effectiveHistory,
        message,
        beneficiaryId,
        claimantContextBlock ?? undefined,
        localTool?.name // Force the tool if detected locally
      );

      if (aiResult.type === "tool_call") {
        toolCall = { name: aiResult.name, arguments: aiResult.arguments };
        assistantContentOverride = aiResult.content;
      } else {
        // Strip any JSON the AI appended via its output protocol before storing
        openaiDirectReply = stripInlineJson(aiResult.content);
      }
    } catch (err) {
      console.error("[chat/route] OpenAI function-calling error, falling back to regex:", err);
      toolCall = mapMessageToTool(message, beneficiaryId);
    }
  } else {
    toolCall = mapMessageToTool(message, beneficiaryId);
  }

  // ── Step 2: Direct reply (no MCP tool needed) ────────────────────────────
  if (openaiDirectReply !== null) {
    if (hasPotentialHarmSignal(message)) {
      const recompute = await recomputeDecisionState(beneficiaryId, {
        claimantMessage: message,
        transcriptExcerpt: buildTranscriptExcerpt([{ role: "user", content: message }]),
      });
      if (!recompute.ok) {
        console.warn("[chat/route] recomputeDecisionState error (Step 2 direct reply):", recompute.error);
      }
    }

    if (user && conversationId) {
      await supabaseAdmin.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: openaiDirectReply,
      });
      await supabaseAdmin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
    return NextResponse.json({ reply: openaiDirectReply, conversation_id: conversationId });
  }

  // ── Step 2.5: Local write — update_employment_status ───────────────────────────
  if (toolCall?.name === "update_employment_status") {
    const newStatus = (toolCall.arguments.employment_status as string | undefined)?.trim();
    let reply: string;
    if (!newStatus) {
      reply = "I wasn't able to determine the new employment status from your message. Could you be more specific — for example: \"I am now employed\" or \"I am unemployed\"?";
    } else {
      const updateResult = await updateEmploymentStatus(beneficiaryId, newStatus);
      if (!updateResult.ok) {
        reply = "I wasn't able to update your employment status right now. Please try again or contact your caseworker.";
      } else {
        const recompute = await recomputeDecisionState(beneficiaryId, {
          claimantMessage:   message,
          transcriptExcerpt: buildTranscriptExcerpt(effectiveHistory),
        });
        if (recompute.ok && recompute.changed && gatewayUrl && gatewaySecret) {
          const frozenDecisionType = recompute.newDecisionType;
          getClaimantProfile(beneficiaryId).then(async (freshProfile) => {
            if (!freshProfile) return;
            try {
              const payload = buildIntakePayload({
                profile: freshProfile,
                userMessage: message,
                history: effectiveHistory,
                toolName: "update_employment_status",
                caseId: conversationId ?? undefined,
                decisionType: frozenDecisionType as "approve" | "deny" | "continue_review",
              });
              await callIntake(gatewayUrl, gatewaySecret, payload);
            } catch (err) {
              console.warn("[chat/route] Background Brain reassessment failed (non-fatal):", err);
            }
          });
        }
        reply = `Your employment status has been updated to **${updateResult.data.employmentStatus}**.`;
      }
    }
    if (user && conversationId) {
      await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply });
      await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    }
    return NextResponse.json({ reply, conversation_id: conversationId });
  }

  // ── Step 2.6: Local write — update_document_status ───────────────────────────
  if (toolCall?.name === "update_document_status") {
    const employerStatus   = (toolCall.arguments.employer_report_status as string | undefined)?.trim();
    const docsQuality      = (toolCall.arguments.docs_quality           as string | undefined)?.trim();
    const docsReceivedRaw  = (toolCall.arguments.docs_received          as string | undefined)?.trim();
    const incomingDocsReceived = docsReceivedRaw
      ? docsReceivedRaw.split(/,|;/).map((s) => s.trim()).filter(Boolean)
      : [];
    const removalIntent = isDocumentRemovalIntent(message);

    const { data: existingRow, error: existingRowErr } = await (supabaseAdmin as any)
      .schema("app")
      .from("claimant_case_detailed")
      .select("docs_requested, docs_received, docs_quality, employer_report_status")
      .eq("beneficiary_id", beneficiaryId)
      .maybeSingle();

    if (existingRowErr) {
      console.error("[chat/route][Step2.6] Failed to load existing document row:", existingRowErr);
    }

    const docsRequested = toStringArray(existingRow?.docs_requested);
    const existingDocsReceived = toStringArray(existingRow?.docs_received);
    const messageExtractedDocs = removalIntent ? extractDocumentNamesFromMessage(message) : [];
    const removalTargets = incomingDocsReceived.length > 0 ? incomingDocsReceived : messageExtractedDocs;

    let finalDocsReceived = mergeDocuments(existingDocsReceived, incomingDocsReceived);
    if (removalIntent) {
      if (removalTargets.length > 0) {
        const removalSet = new Set(removalTargets.map(normalizeDocName));
        finalDocsReceived = existingDocsReceived.filter((doc) => !removalSet.has(normalizeDocName(doc)));
      } else if (shouldClearAllDocuments(message)) {
        finalDocsReceived = [];
      }
    }

    const normalizedReceived = new Set(finalDocsReceived.map(normalizeDocName));
    const docsComplete =
      docsRequested.length > 0 &&
      docsRequested.every((requestedDoc) => normalizedReceived.has(normalizeDocName(requestedDoc)));

    let finalEmployerStatus = employerStatus;
    let finalDocsQuality = docsQuality;

    if (docsComplete) {
      finalEmployerStatus = "received";
      finalDocsQuality = "valid";
    } else if (docsRequested.length > 0) {
      finalEmployerStatus = "pending";
      if (removalIntent) {
        finalDocsQuality = finalDocsQuality ?? "pending_verification";
      }
    } else if (removalIntent) {
      finalEmployerStatus = finalEmployerStatus ?? "pending";
      finalDocsQuality = finalDocsQuality ?? "pending_verification";
    }

    const updateFields: Record<string, unknown> = { claimant_message: message };
    if (incomingDocsReceived.length > 0 || !documentsEqual(existingDocsReceived, finalDocsReceived)) {
      updateFields.docs_received = finalDocsReceived;
    }
    if (finalEmployerStatus) updateFields.employer_report_status = finalEmployerStatus;
    if (finalDocsQuality) updateFields.docs_quality = finalDocsQuality;

    console.log("[chat/route][Step2.6] updateFields:", JSON.stringify(updateFields));
    console.log("[chat/route][Step2.6] beneficiaryId:", beneficiaryId);
    console.log("[chat/route][Step2.6] docsComplete:", docsComplete);
    console.log("[chat/route][Step2.6] removalIntent:", removalIntent);

    const { data: updatedRows, error: docErr } = await (supabaseAdmin as any)
      .schema("app")
      .from("claimant_case_detailed")
      .update(updateFields)
      .eq("beneficiary_id", beneficiaryId)
      .select("beneficiary_id, docs_requested, docs_received, docs_quality, employer_report_status");

    if (docErr) {
      console.error("[chat/route][Step2.6] DB write error — code:", docErr.code, "message:", docErr.message);
    } else if (!updatedRows || updatedRows.length === 0) {
      console.warn("[chat/route][Step2.6] UPDATE matched 0 rows for beneficiaryId:", beneficiaryId);
    } else {
      console.log("[chat/route][Step2.6] DB write succeeded:", JSON.stringify(updatedRows[0]));

      const recompute = await recomputeDecisionState(beneficiaryId, {
        claimantMessage: message,
        transcriptExcerpt: buildTranscriptExcerpt(effectiveHistory),
      });

      if (!recompute.ok) {
        console.warn("[chat/route][Step2.6] recomputeDecisionState failed:", recompute.error);
      } else if (recompute.changed && gatewayUrl && gatewaySecret) {
        const frozenDecisionType = recompute.newDecisionType;
        getClaimantProfile(beneficiaryId).then(async (freshProfile) => {
          if (!freshProfile) return;
          try {
            const payload = buildIntakePayload({
              profile: freshProfile,
              userMessage: message,
              history: effectiveHistory,
              toolName: "update_document_status",
              caseId: conversationId ?? undefined,
              decisionType: frozenDecisionType as "approve" | "deny" | "continue_review",
            });
            await callIntake(gatewayUrl, gatewaySecret, payload);
          } catch (err) {
            console.warn("[chat/route] Background Brain reassessment failed (non-fatal):", err);
          }
        });
      }
    }

    const parts: string[] = [];
    if (finalEmployerStatus === "received") parts.push("employer report received");
    else if (finalEmployerStatus === "pending") parts.push("employer report still pending");
    if (finalDocsQuality === "valid") parts.push("documents marked complete");
    else if (finalDocsQuality === "missing") parts.push("documents noted as missing");
    else if (finalDocsQuality === "pending_verification") parts.push("documents pending review");
    if (!removalIntent && incomingDocsReceived.length > 0) parts.push(`received: ${incomingDocsReceived.join(", ")}`);
    if (removalIntent && removalTargets.length > 0) parts.push(`removed: ${removalTargets.join(", ")}`);
    if (removalIntent && removalTargets.length === 0 && shouldClearAllDocuments(message)) parts.push("all documents removed");

    const reply = parts.length > 0
      ? `I’ve noted your document update: ${parts.join(", ")}. Thank you for letting us know.`
      : "Thank you for the update. I’ve noted your document information.";

    if (user && conversationId) {
      await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply });
      await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    }
    return NextResponse.json({ reply, conversation_id: conversationId });
  }

  // ── Step 2.4: check_payment_status routing ────────────────────────────────
  if (toolCall?.name === "check_payment_status") {
    if (hasPotentialHarmSignal(message)) {
      const recompute = await recomputeDecisionState(beneficiaryId, {
        claimantMessage: message,
        transcriptExcerpt: buildTranscriptExcerpt([{ role: "user", content: message }]),
      });
      if (!recompute.ok) {
        console.warn("[chat/route] recomputeDecisionState error (Step 2.4 check_payment_status):", recompute.error);
      }
    }

    const statusProfile = await getClaimantProfile(beneficiaryId).catch(() => null);
    const storedDecision = statusProfile?.currentApplicationStatus ?? "continue_review";
    if (storedDecision === "approve") {
      const empStatus = statusProfile?.employmentStatus
        ? ` Your employment status on record is **${statusProfile.employmentStatus}**.`
        : "";
      const reply = `Your claim is currently **approved**.${empStatus} No further action is needed from you at this time.`;
      if (user && conversationId) {
        await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply });
        await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      }
      return NextResponse.json({ reply, conversation_id: conversationId });
    }
    // deny / continue_review: fall through to Step 3 (MCP) below.
  }

  // ── Step 2.9: Persist case signals before MCP ────────────────────────────────
  // Skipped for update_employment_status and update_document_status (those paths
  // already own their DB writes and return early above). Also skipped for
  // check_payment_status so neutral status checks do not clear previously
  // recorded harm signals.
  if (
    toolCall &&
    toolCall.name !== "update_employment_status" &&
    toolCall.name !== "update_document_status" &&
    toolCall.name !== "check_payment_status"
  ) {
    const transcriptExcerpt = buildTranscriptExcerpt([{ role: "user" as const, content: message }]);

    // Legacy writer (disabled for determinism):
    // extractAndPersistCaseSignals(
    //   beneficiaryId,
    //   message,
    //   transcriptExcerpt,
    // ).then((result) => {
    //   if (!result.ok) console.warn("[chat/route] extractAndPersistCaseSignals error:", result.error);
    // }).catch((err) => console.warn("[chat/route] extractAndPersistCaseSignals threw:", err));

    const recompute = await recomputeDecisionState(beneficiaryId, {
      claimantMessage: message,
      transcriptExcerpt,
    });
    if (!recompute.ok) {
      console.warn("[chat/route] recomputeDecisionState error (Step 2.9):", recompute.error);
    }
  }

  // ── Step 3: MCP Gateway tool call ────────────────────────────────────────
  if (gatewayUrl && gatewaySecret && toolCall) {
    try {
      // ── Step 3a: Build + validate the structured IntakePayload ──────────
      let result;
      const claimantProfile = await getClaimantProfile(beneficiaryId).catch(() => null);

      if (claimantProfile) {
        const storedPayload = await getStoredIntakePayload(beneficiaryId).catch(() => null);

        // Extract decision_type from assistantContentOverride if available
        let decisionTypeOverride: any = undefined;
        if (assistantContentOverride) {
          const { jsonData } = extractInlineJson(assistantContentOverride);
          if (jsonData?.decision_type) {
            decisionTypeOverride = jsonData.decision_type;
          }
        }

        const intakePayload = buildIntakePayload({
          profile: claimantProfile,
          userMessage: message,
          history: effectiveHistory,
          toolName: toolCall.name,
          caseId: conversationId ?? undefined,
          storedPayload,
          decisionType: decisionTypeOverride,
        });

        const validation = validateIntakePayload(intakePayload);
        if (!validation.valid) {
          console.error("[chat/route] IntakePayload validation failed:", validation.errors);
          // Return a user-friendly error and do not proceed to the gateway
          return NextResponse.json(
            {
              reply:
                "I'm sorry, I couldn't process your request because some required information is missing. " +
                "Please check your profile details and try again.",
              conversation_id: conversationId,
            },
            { status: 422 },
          );
        }

        // Try /api/intake first; fall back to callMcpTool on any error
        try {
          result = await callIntake(gatewayUrl, gatewaySecret, intakePayload);
        } catch (intakeErr) {
          console.warn("[chat/route] /api/intake unavailable, falling back to callMcpTool:", intakeErr);
        }
      }

      // ── Step 3b: Fallback to generic tool call if intake was skipped/failed
      if (!result) {
        result = await callMcpTool(
          gatewayUrl,
          gatewaySecret,
          toolCall.name,
          toolCall.arguments,
        );
      }

      // If the Gateway escalated the tool call, create a case record so the
      // case officer portal can find it and send the event_id back when they decide.
      if (result.escalated && result.case_id) {
        createCase({
          user_display: user?.user_metadata?.full_name ?? user?.email ?? "Anonymous User",
          user_message: message,
          tool_name: toolCall.name,
          tool_args_redacted: toolCall.arguments,
          risk_label: result.risk_label ?? "ESCALATE",
          risk_score: result.risk_score ?? 75,
          risk_rationale: result.risk_rationale ?? "Escalated by MCP Gateway for human review.",
          policy_refs: result.policy_refs ?? [],
          gateway_event_id: result.case_id,
          conversation_id: conversationId ?? undefined,
        }).catch((err) => {
          console.error("[chat/route] Failed to create case record for escalated tool call:", err);
        });

        // For BLOCK decisions, let ChatGPT explain empathetically using the
        // new system prompt's governance knowledge.
        if (hasOpenAI && result.risk_label === "BLOCK") {
          try {
            const explanation = await chatCompletion(
              effectiveHistory,
              `The user requested: "${message}". The ATLAS Governor has BLOCKED this request. Reason: "${result.risk_rationale ?? result.reply}". Explain this empathetically to the claimant, cite the Human Oversight requirement, and let them know their request is under review by a case officer.`,
              claimantContextBlock ?? undefined,
            );
            // Strip any JSON the AI model may have appended via its output protocol
            result.reply = stripInlineJson(explanation);
          } catch {
            // Keep the existing reply on error.
          }
        }
      } else if (!result.escalated && !result.transient_error && hasOpenAI) {
        // Allow path — pass the MCP result to ChatGPT for a friendly confirmation.
        try {
          const confirmation = await chatCompletion(
            effectiveHistory,
            `The user requested: "${message}". \n\n` +
            `### AUTHORITATIVE RESULT ###\n` +
            `The ATLAS system (Governance) has returned the following official result: "${result.reply}". \n\n` +
            `### INSTRUCTIONS ###\n` +
            `- Provide a friendly, concise confirmation to the claimant based EXCLUSIVELY on the result above.\n` +
            `- If this result contradicts the static "CLAIMANT DATA" (e.g., the data says they are approved but the system says they are still being reviewed), you MUST prioritize the system result.\n` +
            `- Do NOT mention the static data if it conflicts.\n` +
            `- Be neutral and empathetic.`,
            claimantContextBlock ?? undefined,
          );
          // Strip any JSON the AI model may have appended via its output protocol
          result.reply = stripInlineJson(confirmation);
        } catch {
          // Keep the existing reply on error.
        }
      }

      const responseTimestamp = new Date().toISOString();

      if (user && conversationId) {
        const escalationMeta =
          result.escalated && result.case_id
            ? {
              escalation: {
                case_id: result.case_id,
                risk_score: result.risk_score,
                risk_label: result.risk_label,
                risk_rationale: result.risk_rationale,
                policy_refs: result.policy_refs,
                recommended_action: result.recommended_action,
                timestamp: responseTimestamp,
              },
            }
            : undefined;
        await supabaseAdmin.from("chat_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: result.reply,
          ...(escalationMeta ? { metadata: escalationMeta } : {}),
        });
        await supabaseAdmin
          .from("conversations")
          .update({ updated_at: responseTimestamp })
          .eq("id", conversationId);
      }

      return NextResponse.json({
        reply: result.reply,
        escalated: result.escalated,
        case_id: result.case_id,
        conversation_id: conversationId,
        risk_score: result.risk_score,
        risk_label: result.risk_label,
        risk_rationale: result.risk_rationale,
        policy_refs: result.policy_refs,
        recommended_action: result.recommended_action,
        timestamp: responseTimestamp,
      });
    } catch (err) {
      console.error("[chat/route] MCP SSE gateway error, falling back:", err);
    }
  }

  // ── Step 4: General conversation fallback (no gateway or tool matched) ───
  let reply: string;
  try {
    reply = await chatCompletion(effectiveHistory, message, claimantContextBlock ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat/route] OpenAI API error:", message);
    reply = "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.";
  }

  if (hasPotentialHarmSignal(message)) {
    const recompute = await recomputeDecisionState(beneficiaryId, {
      claimantMessage: message,
      transcriptExcerpt: buildTranscriptExcerpt([{ role: "user", content: message }]),
    });
    if (!recompute.ok) {
      console.warn("[chat/route] recomputeDecisionState error (Step 4 fallback):", recompute.error);
    }
  }

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

  return NextResponse.json({ reply, conversation_id: conversationId });
}
