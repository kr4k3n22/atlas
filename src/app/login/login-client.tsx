"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabaseClient";

export default function UserLoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/chat";
  const supabase = React.useMemo(() => createClient(), []);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const role = data.user?.user_metadata?.role ?? "user";
      if (role !== "user") {
        await supabase.auth.signOut();
        throw new Error("This email is registered as a staff account. Use the approver login instead.");
      }

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
        <div className="flex flex-col items-center space-y-2 text-center">
          <span className="text-5xl" role="img" aria-label="Government portal">🏛️</span>
          <h1 className="text-3xl font-semibold tracking-tight">Welfare Services Portal</h1>
          <p className="text-sm text-muted-foreground">Sign in to access your benefits, claims, and support services.</p>
        </div>

        <Card className="border-muted/60 bg-background/60 backdrop-blur">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your registered email and password to access welfare services.</CardDescription>
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
                <div className="text-xs">
                  <Link className="underline text-muted-foreground" href="/reset-password">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={busy}>
                {busy ? "Signing in..." : "Sign in to portal"}
              </Button>

              <Separator className="my-2" />

              <div className="text-sm text-center">
                <p className="text-muted-foreground">
                  New to the portal?{" "}
                  <Link className="underline font-medium text-foreground" href="/register">
                    Register for an account
                  </Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          <Link className="underline hover:text-foreground" href="/approver/login">
            Staff &amp; approver access →
          </Link>
        </p>

        <p className="text-xs text-center text-muted-foreground">
          © 2026 Social Benefits Administration · Privacy Policy · Accessibility
        </p>
      </div>
    </div>
  );
}
