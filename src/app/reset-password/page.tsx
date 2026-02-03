"use client";

import React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setMsg("Password reset link sent. Check your email.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>We’ll email you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
            <Button className="w-full" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </Button>
            <div className="text-sm text-muted-foreground">
              <Link className="underline" href="/login">Back to login</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
