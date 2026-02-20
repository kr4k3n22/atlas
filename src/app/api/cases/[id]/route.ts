import { z } from "zod";
import { applyDecision, getCaseById } from "@/lib/caseStore";
import { APPROVER_SLUGS, getApprover } from "@/lib/approvers";

const DecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  note: z.string().min(1, "A note is required before making a decision."),
  approver: z.string().refine(
    (val) => APPROVER_SLUGS.includes(val),
    { message: "Invalid approver." }
  ),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const c = await getCaseById(id);
  if (!c) return new Response("Not found", { status: 404 });
  return Response.json(c);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let body: z.infer<typeof DecisionBody>;
  try {
    body = DecisionBody.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return new Response(err.issues[0]?.message ?? "Invalid request.", { status: 400 });
    }
    return new Response("Invalid request.", { status: 400 });
  }

  const profile = getApprover(body.approver);
  const fullName = profile?.fullName ?? body.approver;

  const updated = await applyDecision({
    id,
    decision: body.decision,
    note: body.note,
    approver: fullName,
  });
  if (!updated) return new Response("Not found", { status: 404 });

  return Response.json(updated);
}
