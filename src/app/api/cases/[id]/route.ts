import { z } from "zod";
import { applyDecision, getCaseById } from "@/lib/caseStore";

const DecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  note: z.string().optional(),
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
  const body = DecisionBody.parse(await request.json());

  const updated = await applyDecision({ id, decision: body.decision, note: body.note });
  if (!updated) return new Response("Not found", { status: 404 });

  return Response.json(updated);
}
