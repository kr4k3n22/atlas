import { z } from "zod";
import { createCase } from "@/lib/caseStore";
import { NextResponse } from "next/server";

/**
 * POST /api/gateway/ingest
 *
 * Called by the Atlas-MCP-Gateway when a tool call is intercepted and
 * risk-scored.  The Gateway sends the context packet + risk assessment;
 * this endpoint writes it into Supabase `approval_queue` so it appears
 * in the HITL dashboard.
 *
 * Authentication: Bearer token matching GATEWAY_SHARED_SECRET env var.
 */

const IngestBody = z.object({
  // Who triggered the action (citizen / user display name)
  user_display: z.string().min(1),
  // The original user message / intent
  user_message: z.string().min(1),
  // MCP tool that was called
  tool_name: z.string().min(1),
  // Tool arguments (PII-redacted by the Gateway)
  tool_args_redacted: z.record(z.string(), z.unknown()).default({}),
  // Risk assessment from the Brain API / Modal SLM
  risk_label: z.enum(["ROUTINE", "ESCALATE", "BLOCK"]),
  risk_score: z.number().min(0).max(100),
  risk_rationale: z.string().default(""),
  // NIST AI RMF policy references that triggered escalation
  policy_refs: z.array(z.string()).default([]),
  // Optional: Gateway-side action ID for correlation
  gateway_action_id: z.string().optional(),
  // Optional: Inngest run ID so we can resume the workflow later
  inngest_run_id: z.string().optional(),
});

function verifyGatewayAuth(request: Request): boolean {
  const secret = process.env.GATEWAY_SHARED_SECRET;
  if (!secret) {
    // If no secret is configured, reject everything (fail-safe)
    console.error("GATEWAY_SHARED_SECRET not set — rejecting ingest request");
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return token === secret;
}

export async function POST(request: Request) {
  // --- Auth ---
  if (!verifyGatewayAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // --- Parse + validate ---
  let body: z.infer<typeof IngestBody>;
  try {
    body = IngestBody.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // --- Create case in Supabase ---
  try {
    const created = await createCase({
      user_display: body.user_display,
      user_message: body.user_message,
      tool_name: body.tool_name,
      tool_args_redacted: body.tool_args_redacted,
      risk_label: body.risk_label,
      risk_score: body.risk_score,
      risk_rationale: body.risk_rationale,
      policy_refs: body.policy_refs,
    });

    return NextResponse.json(
      {
        ok: true,
        case_id: created.id,
        status: created.status,
        message: "Case created and queued for HITL review",
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Failed to create case from gateway ingest:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error creating case" },
      { status: 500 }
    );
  }
}
