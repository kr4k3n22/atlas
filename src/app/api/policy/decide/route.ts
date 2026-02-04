import { z } from "zod";
import { evaluatePolicy } from "@/lib/policyEngine";
import { createCase } from "@/lib/caseStore";
import { appendAuditEvent } from "@/lib/auditStore";
import { executeAction } from "@/lib/actionExecutionStore";

const PolicyRequest = z.object({
  user: z
    .object({
      id: z.string().optional(),
      display: z.string().optional(),
    })
    .optional(),
  tool: z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
  message: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const body = PolicyRequest.parse(await request.json());
  const decision = evaluatePolicy({
    tool_name: body.tool.name,
    tool_args: body.tool.args ?? {},
    user_message: body.message,
  });

  let caseRecord = null;
  let execution = null;

  if (decision.decision !== "ALLOW") {
    caseRecord = await createCase({
      user_display: body.user?.display ?? "Unknown",
      user_message: body.message ?? "No message provided.",
      tool_name: body.tool.name,
      tool_args_redacted: body.tool.args ?? {},
      risk_label: decision.risk_label,
      risk_score: decision.risk_score,
      risk_rationale: decision.risk_rationale,
      policy_refs: decision.policy_refs,
    });
  } else {
    execution = await executeAction({
      tool_name: body.tool.name,
      tool_args: body.tool.args ?? {},
      requested_by: body.user?.display ?? null,
      decision_source: "ALLOW",
    });
  }

  await appendAuditEvent({
    actor: "policy_engine",
    action: "policy_decision",
    case_id: caseRecord?.id,
    detail: `${decision.decision} (${decision.risk_label} ${decision.risk_score})`,
  });

  return Response.json({
    decision: decision.decision,
    case_id: caseRecord?.id ?? null,
    execution_id: execution?.id ?? null,
    risk_label: decision.risk_label,
    risk_score: decision.risk_score,
    risk_rationale: decision.risk_rationale,
    policy_refs: decision.policy_refs,
  });
}
