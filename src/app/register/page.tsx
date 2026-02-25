"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabaseClient";

const DEMO_NAME_MAP: Record<string, string> = {
  "ella gible": "BEN-ATLAS-001",
  "alex haitel": "BEN-ATLAS-002",
  "noah chance": "BEN-ATLAS-003",
  "reid peet van der loop": "BEN-ATLAS-004",
};

export default function RegisterPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

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
      const resolvedBeneficiaryId = DEMO_NAME_MAP[displayName.trim().toLowerCase()];
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role: "user", displayName, beneficiary_id: resolvedBeneficiaryId },
        },
      });
      if (error) throw error;

      if (!data.session) {
        setErr("Check your email to confirm your account.");
        return;
      }

      router.push("/chat");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
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
        </div>

        <Card className="border-muted/60 bg-background/60 backdrop-blur">
          <CardHeader>
            <CardTitle>Create your portal account</CardTitle>
            <CardDescription>Register to access unemployment benefits, claims tracking, and support services.</CardDescription>
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
              </div>
              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={busy}>
                {busy ? "Creating..." : "Create account"}
              </Button>

              <Separator className="my-2" />

              <div className="text-sm text-center">
                <Link className="underline text-muted-foreground" href="/login">
                  Already registered? Sign in
                </Link>
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
