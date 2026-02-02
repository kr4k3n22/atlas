"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabaseClient";
import UserMenu from "@/components/UserMenu";

export default function ChatPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [session, setSession] = React.useState<any>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return setSession(null);

      setSession({
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.displayName ?? user.email,
        role: user.user_metadata?.role ?? "user",
      });
    });
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-3 flex items-center justify-between">
          <Link href="/chat" className="font-semibold tracking-tight">
            ATLAS
          </Link>

          <UserMenu session={session} onSignOut={signOut} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Next step: wire ChatGPT API here. Send requests to ATLAS. Route high-impact actions to HITL inbox.
        </p>
      </main>
    </div>
  );
}
