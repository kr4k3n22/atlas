import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
const AUTH_COOKIE = PROJECT_REF ? `sb-${PROJECT_REF}-auth-token` : "";
const ISSUER = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : "";
const JWKS = SUPABASE_URL ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/keys`)) : null;

type Role = "user" | "approver";

async function readRole(req: NextRequest): Promise<Role | null> {
  if (!AUTH_COOKIE || !JWKS || !ISSUER) return null;

  const raw = req.cookies.get(AUTH_COOKIE)?.value;
  if (!raw) return null;

  let accessToken = raw;

  // Supabase stores JSON in the cookie: {"access_token": "...", ...}
  try {
    const parsed = JSON.parse(raw);
    accessToken = parsed.access_token || parsed?.[0]?.access_token || raw;
  } catch {
    // If it's not JSON, use raw as token
  }

  try {
    const { payload } = await jwtVerify(accessToken, JWKS, { issuer: ISSUER });
    const role = (payload as any)?.user_metadata?.role;
    if (role === "user" || role === "approver") return role;
    return null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isApproverArea = path.startsWith("/cases") || path.startsWith("/settings");
  const isUserArea = path.startsWith("/chat");

  if (!isApproverArea && !isUserArea) return NextResponse.next();

  const role = await readRole(req);

  if (isApproverArea) {
    if (role === "approver") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/approver/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isUserArea) {
    if (role === "user") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cases/:path*", "/settings/:path*", "/chat/:path*"],
};
