import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ActionExecution = {
  id: string;
  case_id?: string | null;
  requested_by?: string | null;
  approver?: string | null;
  tool_name: string;
  tool_args: Record<string, unknown>;
  decision_source: "ALLOW" | "APPROVED";
  status: "EXECUTED";
  response: Record<string, unknown>;
  created_at: string;
};

type ExecuteInput = {
  case_id?: string | null;
  requested_by?: string | null;
  approver?: string | null;
  tool_name: string;
  tool_args: Record<string, unknown>;
  decision_source: "ALLOW" | "APPROVED";
};

function stubTargetSystem(input: ExecuteInput) {
  return {
    ok: true,
    executed: true,
    message: "executed",
    tool_name: input.tool_name,
    tool_args: input.tool_args,
    executed_at: new Date().toISOString(),
  };
}

export async function executeAction(input: ExecuteInput): Promise<ActionExecution> {
  const response = stubTargetSystem(input);

  const { data, error } = await supabaseAdmin
    .from("action_executions")
    .insert({
      case_id: input.case_id ?? null,
      requested_by: input.requested_by ?? null,
      approver: input.approver ?? null,
      tool_name: input.tool_name,
      tool_args: input.tool_args,
      decision_source: input.decision_source,
      status: "EXECUTED",
      response,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to log action execution");
  }

  return data as ActionExecution;
}
