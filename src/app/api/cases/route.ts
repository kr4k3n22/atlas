import { getAllCases } from "@/lib/caseStore";

export async function GET() {
  const cases = await getAllCases();
  return Response.json(cases);
}
