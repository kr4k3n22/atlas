import { z } from "zod";
import { createUser } from "@/lib/authStore";
import { setSession } from "@/lib/auth";

const Body = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(64),
  password: z.string().min(12).max(200),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    const u = await createUser({
      email: body.email,
      displayName: body.displayName,
      password: body.password,
      role: "user",
    });

    await setSession({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });
    return Response.json({ ok: true, role: u.role });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      const msg = e.issues?.[0]?.message || "Invalid input";
      return new Response(msg, { status: 400 });
    }
    return new Response("Registration failed", { status: 500 });
  }
}
