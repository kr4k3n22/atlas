import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";
import { APPROVER_SLUGS } from "@/lib/approvers";

export type ConversationCaseStatus = {
  status: string;
  risk_label: string | null;
  decided_by: string | null;
  recommended_action: string | null;
};

// GET /api/chats/statuses — return case status for each of the current user's conversations
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req.headers.get("cookie") ?? "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the user's conversation IDs
  const { data: convData, error: convError } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("user_id", user.id);

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  const convIds: string[] = (convData ?? []).map((c: { id: string }) => c.id);
  if (convIds.length === 0) {
    return NextResponse.json({ statuses: {} });
  }

  // Query approval_queue for cases linked to these conversations via
  // tool_args_redacted->>'conversation_id'
  const { data: cases, error: casesError } = await supabaseAdmin
    .from("approval_queue")
    .select("id, status, risk_label, tool_args_redacted, history, created_at")
    .in("tool_args_redacted->>conversation_id", convIds)
    .order("created_at", { ascending: false });

  if (casesError) {
    return NextResponse.json({ error: casesError.message }, { status: 500 });
  }

  // Build a map: conversation_id → most-recent case status
  const statuses: Record<string, ConversationCaseStatus> = {};

  for (const c of cases ?? []) {
    const convId = (c.tool_args_redacted as Record<string, unknown>)?.conversation_id as
      | string
      | undefined;
    if (!convId) continue;

    // Only keep the first (most recent, because ordered DESC) case per conversation
    if (statuses[convId]) continue;

    // Extract recommended_action from tool_args_redacted.labels.recommended_action
    const toolArgs = c.tool_args_redacted as Record<string, unknown> | null;
    const labels = (toolArgs?.labels ?? {}) as Record<string, unknown>;
    const recommended_action =
      typeof labels.recommended_action === "string" ? labels.recommended_action : null;

    // Determine decided_by: the actor of the last history entry that is a known approver slug
    const history = Array.isArray(c.history)
      ? (c.history as Array<{ ts: string; actor: string; event: string; detail?: string }>)
      : [];
    const lastHumanEntry = [...history]
      .reverse()
      .find((e) => APPROVER_SLUGS.includes(e.actor));
    const decided_by = lastHumanEntry?.actor ?? null;

    statuses[convId] = {
      status: c.status,
      risk_label: c.risk_label ?? null,
      decided_by,
      recommended_action,
    };
  }

  return NextResponse.json({ statuses });
}
