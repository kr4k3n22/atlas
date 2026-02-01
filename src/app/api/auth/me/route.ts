import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  return Response.json({ session: s });
}
