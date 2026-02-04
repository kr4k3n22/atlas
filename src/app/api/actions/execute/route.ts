import { z } from "zod";
import { executeAction } from "@/lib/actionExecutionStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  case_id: z.string().optional(),
  requested_by: z.string().optional(),
  approver: z.string().optional(),
  tool: z
    .object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const body = Body.parse(await req.json());

  if (body.case_id) {
    const { data, error } = await supabaseAdmin
      .from("approval_queue")
      .select("*")
      .eq("id", body.case_id)
      .single();

    if (error || !data) {
      return new Response("Case not found", { status: 404 });
    }

    if (data.status !== "APPROVED") {
      return new Response("Case not approved", { status: 409 });
    }

    const execution = await executeAction({
      case_id: data.id,
      requested_by: data.user_display ?? null,
      approver: body.approver ?? "reviewer",
      tool_name: data.tool_name,
      tool_args: data.tool_args_redacted ?? {},
      decision_source: "APPROVED",
    });

    return Response.json(execution);
  }

  if (!body.tool) {
    return new Response("Missing tool or case_id", { status: 400 });
  }

  const execution = await executeAction({
    tool_name: body.tool.name,
    tool_args: body.tool.args ?? {},
    requested_by: body.requested_by ?? null,
    approver: body.approver ?? null,
    decision_source: "ALLOW",
  });

  return Response.json(execution);
}
