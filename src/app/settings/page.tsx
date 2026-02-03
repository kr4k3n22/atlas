"use client";

import Link from "next/link";
import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import SettingsClient from "./settings-client";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
      router.push("/approver/login");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your review experience. Changes are saved locally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/cases">Back to cases</Link>
          </Button>
          <Button variant="destructive" onClick={logout} disabled={busy}>
            {busy ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </header>

      <SettingsClient />
    </div>
  );
}
