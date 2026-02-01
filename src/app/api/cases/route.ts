import { getAllCases } from "@/lib/caseStore";

export async function GET() {
  return Response.json(getAllCases());
}
