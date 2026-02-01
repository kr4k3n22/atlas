import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/lib/authStore";

const COOKIE_NAME = "atlas_session";
const ISSUER = "atlas-hitl-ui";
const AUDIENCE = "atlas-hitl-ui";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    // In production, require a strong secret. In dev, we still need something.
    throw new Error("AUTH_SECRET missing or too short. Set it in .env.local");
  }
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

export async function setSession(user: SessionUser) {
  const secret = getSecret();

  const token = await new SignJWT({
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const id = String(payload.sub || "");
    const email = String(payload.email || "");
    const displayName = String(payload.displayName || "");
    const role = String(payload.role || "") as any;

    if (!id || !email || !displayName) return null;
    if (role !== "user" && role !== "approver") return null;

    return { id, email, displayName, role };
  } catch {
    return null;
  }
}
