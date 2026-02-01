import { z } from "zod";
import { findUserByEmail, verifyPassword, touchLastLogin } from "@/lib/authStore";
import { setSession } from "@/lib/auth";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  role: z.enum(["user", "approver"]),
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const body = Body.parse(await req.json());

  // Cheap timing noise to reduce super-obvious oracle behavior in dev.
  // Real deployments: add rate limiting + lockouts + monitoring.
  await sleep(80);

  const u = await findUserByEmail(body.email);
  if (!u) return new Response("Invalid credentials", { status: 401 });

  if (u.role !== body.role) return new Response("Invalid credentials", { status: 401 });

  const ok = await verifyPassword(u, body.password);
  if (!ok) return new Response("Invalid credentials", { status: 401 });

  await touchLastLogin(u.id);
  await setSession({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });

  return Response.json({ ok: true, role: u.role });
}
