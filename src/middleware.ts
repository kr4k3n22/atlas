import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "atlas_session";
const ISSUER = "atlas-hitl-ui";
const AUDIENCE = "atlas-hitl-ui";

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

async function readRole(req: NextRequest): Promise<"user" | "approver" | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const secret = getSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    const role = String(payload.role || "");
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
