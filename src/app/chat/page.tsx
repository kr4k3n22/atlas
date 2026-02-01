"use client";

import Link from "next/link";
import React from "react";
import { UserMenu } from "@/components/app/user-menu";

export default function ChatStub() {
  const [session, setSession] = React.useState<any>(null);

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
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

        <pre className="text-xs bg-muted/30 border rounded-md p-3 overflow-auto">
{JSON.stringify(session, null, 2)}
        </pre>
      </main>
    </div>
  );
}
