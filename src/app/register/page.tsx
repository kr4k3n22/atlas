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
