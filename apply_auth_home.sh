#!/usr/bin/env bash
set -euo pipefail

echo "[1/8] Install deps..."
npm i bcryptjs jose nanoid >/dev/null

echo "[2/8] Ensure shadcn components exist (safe to re-run)..."
npx shadcn@latest add button card input label separator >/dev/null || true

echo "[3/8] Create local user store helpers..."
mkdir -p src/lib .data

# Avoid committing user DB
if [ ! -f .gitignore ]; then touch .gitignore; fi
grep -qE '^\.data/?$' .gitignore || echo ".data" >> .gitignore

cat <<'TS' > src/lib/authStore.ts
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export type Role = "user" | "approver";

export type StoredUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = USERS_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, USERS_PATH);
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await readUsers();
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  return u ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const users = await readUsers();
  const u = users.find((x) => x.id === id);
  return u ?? null;
}

export async function createUser(input: {
  email: string;
  displayName: string;
  password: string;
  role: Role;
}): Promise<StoredUser> {
  const users = await readUsers();

  const emailNorm = input.email.toLowerCase().trim();
  if (users.some((x) => x.email.toLowerCase() === emailNorm)) {
    throw new Error("Email already exists");
  }

  // bcrypt cost 12 is a reasonable baseline for dev/small deployments.
  const passwordHash = await bcrypt.hash(input.password, 12);

  const u: StoredUser = {
    id: nanoid(),
    email: emailNorm,
    displayName: input.displayName.trim(),
    role: input.role,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(u);
  await writeUsers(users);
  return u;
}

export async function verifyPassword(user: StoredUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function touchLastLogin(userId: string) {
  const users = await readUsers();
  const idx = users.findIndex((x) => x.id === userId);
  if (idx === -1) return;
  users[idx].lastLoginAt = new Date().toISOString();
  await writeUsers(users);
}
TS

echo "[4/8] Create auth (JWT session cookie) helpers..."
cat <<'TS' > src/lib/auth.ts
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
TS

echo "[5/8] Add auth API routes..."
mkdir -p src/app/api/auth/login src/app/api/auth/register src/app/api/auth/logout src/app/api/auth/me

cat <<'TS' > src/app/api/auth/register/route.ts
import { z } from "zod";
import { createUser } from "@/lib/authStore";
import { setSession } from "@/lib/auth";

const Body = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(64),
  password: z.string().min(12).max(200),
});

export async function POST(req: Request) {
  const body = Body.parse(await req.json());

  // Only users can self-register. Approvers must be created via a seed script/admin flow.
  const u = await createUser({
    email: body.email,
    displayName: body.displayName,
    password: body.password,
    role: "user",
  });

  await setSession({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });
  return Response.json({ ok: true, role: u.role });
}
TS

cat <<'TS' > src/app/api/auth/login/route.ts
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
TS

cat <<'TS' > src/app/api/auth/logout/route.ts
import { clearSession } from "@/lib/auth";

export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
TS

cat <<'TS' > src/app/api/auth/me/route.ts
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  return Response.json({ session: s });
}
TS

echo "[6/8] Add middleware route protection..."
cat <<'TS' > src/middleware.ts
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
TS

echo "[7/8] Create homepage + login + register pages..."
mkdir -p src/app src/app/login src/app/register src/app/approver/login src/app/chat

cat <<'TSX' > src/app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-0px)] flex items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/30" />
      <div className="absolute inset-0 -z-10 [background:radial-gradient(700px_circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_60%),radial-gradient(900px_circle_at_80%_30%,hsl(var(--ring)/0.10),transparent_60%),radial-gradient(700px_circle_at_50%_90%,hsl(var(--secondary)/0.10),transparent_60%)]" />

      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">ATLAS</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Front door for user requests and HITL approvals. Role-based access. Session cookies only.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-muted/60 bg-background/60 backdrop-blur">
            <CardHeader>
              <CardTitle>User</CardTitle>
              <CardDescription>Log in to submit requests. Chat UI comes next.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild className="w-full">
                <Link href="/login">User login</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/register">Create account</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-muted/60 bg-background/60 backdrop-blur">
            <CardHeader>
              <CardTitle>HITL approver</CardTitle>
              <CardDescription>Review and approve actions. Access to inbox + settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/approver/login">Approver login</Link>
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Approver accounts are created by seed script for now.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-xs text-muted-foreground">
          This is a dev auth setup: bcrypt password hashing, signed session cookie, and route protection.
          Production needs rate limiting, CSRF strategy, audit logging, and a real database.
        </div>
      </div>
    </div>
  );
}
TSX

cat <<'TSX' > src/app/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function UserLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/chat";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role: "user" }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(next);
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 bg-black" />
      <div className="absolute inset-0 -z-10 [background:radial-gradient(800px_circle_at_20%_30%,hsl(var(--primary)/0.22),transparent_60%),radial-gradient(700px_circle_at_80%_40%,hsl(var(--ring)/0.14),transparent_60%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.4))]" />

      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">ATLAS access</h1>
          <p className="text-sm text-muted-foreground">User login. Requests route through HITL approvals.</p>
        </div>

        <Card className="border-muted/60 bg-background/60 backdrop-blur">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your account email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">Minimum 12 characters recommended.</p>
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <Button className="w-full" disabled={busy}>
                {busy ? "Signing in..." : "Sign in"}
              </Button>

              <Separator className="my-2" />

              <div className="flex items-center justify-between text-sm">
                <Link className="underline text-muted-foreground" href="/register">
                  Create account
                </Link>
                <Link className="underline text-muted-foreground" href="/">
                  Home
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Passwords are hashed with bcrypt. Session uses a signed, httpOnly cookie.
        </p>
      </div>
    </div>
  );
}
TSX

cat <<'TSX' > src/app/approver/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function ApproverLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/cases";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role: "approver" }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(next);
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 bg-background" />
      <div className="absolute inset-0 -z-10 [background:radial-gradient(900px_circle_at_60%_20%,hsl(var(--destructive)/0.12),transparent_55%),radial-gradient(800px_circle_at_20%_70%,hsl(var(--primary)/0.14),transparent_55%)]" />

      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">HITL approver</h1>
          <p className="text-sm text-muted-foreground">Privileged access. Review carefully.</p>
        </div>

        <Card className="border-muted/60 bg-background/60 backdrop-blur">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Approver accounts are seeded for now.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <Button className="w-full" disabled={busy} variant="destructive">
                {busy ? "Signing in..." : "Sign in as approver"}
              </Button>

              <Separator className="my-2" />

              <div className="flex items-center justify-between text-sm">
                <Link className="underline text-muted-foreground" href="/">
                  Home
                </Link>
                <Link className="underline text-muted-foreground" href="/login">
                  User login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          This role gates /cases and /settings. Keep it tight.
        </p>
      </div>
    </div>
  );
}
TSX

cat <<'TSX' > src/app/register/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function RegisterPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/chat");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/30" />

      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">User accounts only. Approvers are seeded.</p>
        </div>

        <Card className="border-muted/60 bg-background/70 backdrop-blur">
          <CardHeader>
            <CardTitle>Register</CardTitle>
            <CardDescription>We store a bcrypt hash only. Never plaintext.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Use 12+ chars. In production, enforce complexity and use breach checks.
                </p>
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <Button className="w-full" disabled={busy}>
                {busy ? "Creating..." : "Create account"}
              </Button>

              <Separator className="my-2" />

              <div className="flex items-center justify-between text-sm">
                <Link className="underline text-muted-foreground" href="/login">
                  Back to login
                </Link>
                <Link className="underline text-muted-foreground" href="/">
                  Home
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Local dev store: .data/users.json (gitignored).
        </p>
      </div>
    </div>
  );
}
TSX

cat <<'TSX' > src/app/chat/page.tsx
"use client";

import Link from "next/link";
import React from "react";
import { Button } from "@/components/ui/button";

export default function ChatStub() {
  const [session, setSession] = React.useState<any>(null);

  React.useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setSession).catch(() => setSession(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">User chat (stub)</h1>
        <div className="flex gap-2">
          <Button asChild variant="secondary"><Link href="/">Home</Link></Button>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Next step: wire ChatGPT API here. Send requests to ATLAS. Route high-impact actions to HITL inbox.
      </p>

      <pre className="text-xs bg-muted/30 border rounded-md p-3 overflow-auto">
{JSON.stringify(session, null, 2)}
      </pre>
    </div>
  );
}
TSX

echo "[8/8] Add approver seed script..."
mkdir -p scripts

cat <<'JS' > scripts/create-approver.mjs
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] || "Approver";

if (!email || !password) {
  console.error("Usage: node scripts/create-approver.mjs <email> <password> [displayName]");
  process.exit(2);
}

if (password.length < 12) {
  console.error("Refusing: password must be at least 12 chars.");
  process.exit(2);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = USERS_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, USERS_PATH);
}

const users = await readUsers();
const emailNorm = email.toLowerCase().trim();

if (users.some((u) => String(u.email).toLowerCase() === emailNorm)) {
  console.error("Email already exists.");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

users.push({
  id: nanoid(),
  email: emailNorm,
  displayName,
  role: "approver",
  passwordHash,
  createdAt: new Date().toISOString(),
});

await writeUsers(users);
console.log("Created approver:", emailNorm);
JS

echo "OK: Auth + homepage + login/register + middleware installed."
echo "Next: seed an approver account, then run dev."
