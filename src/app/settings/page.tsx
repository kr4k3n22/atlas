"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AtlasMe = {
  session?: {
    email?: string;
  };
};

export default function SettingsPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [atlasMe, setAtlasMe] = useState<AtlasMe | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setAtlasMe)
      .catch(() => setAtlasMe(null));
  }, []);

  const atlasEmail = atlasMe?.session?.email ?? "approver";

  async function logout() {
    try {
      setBusy(true);
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setBusy(false);
      router.push("/approver/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/cases" className="text-sm font-semibold tracking-wide">
          ATLAS
        </Link>

        <div className="flex items-center gap-3">
          <div className="rounded-md border border-muted/30 bg-background/40 px-3 py-1 text-xs">
            {atlasEmail}
          </div>

          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/cases">
            Home
          </Link>

          <button
            className="rounded-md border border-muted/30 bg-background/40 px-3 py-1 text-xs hover:bg-background/60 disabled:opacity-60"
            onClick={logout}
            disabled={busy}
            type="button"
          >
            {busy ? "Signing out..." : "Logout"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-10">
        <h1 className="mt-2 text-2xl font-semibold">Settings</h1>

        <div className="mt-6 max-w-2xl rounded-2xl border border-muted/20 bg-background/40 p-6 backdrop-blur">
          <div className="text-sm font-semibold">Theme</div>
          <div className="mt-2 text-xs text-muted-foreground">Current: dark</div>

          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Theme preference</div>

            <select
              className="mt-2 w-full rounded-md border border-muted/30 bg-background/40 px-3 py-2 text-sm"
              value="dark"
              disabled
              aria-label="Theme preference"
            >
              <option value="dark">Dark (locked)</option>
            </select>

            <div className="mt-3 text-xs text-muted-foreground">
              Dark mode is enforced for now.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
