"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Session = {
  session: null | {
    id: string;
    email: string;
    displayName: string;
    role: "user" | "approver";
  };
};

export function ApproverTopbar() {
  const [session, setSession] = React.useState<Session | null>(null);
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  const email = session?.session?.email || "Approver";
  const isDark = (resolvedTheme ?? "dark") === "dark";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/approver/login";
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-none px-6 py-3 flex items-center justify-between">
        <Link href="/cases" className="font-semibold tracking-tight">
          ATLAS
        </Link>

        <div className="flex items-center gap-2">
          <div
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-muted/60 bg-background/40 text-foreground"
            aria-label={isDark ? "Dark mode" : "Light mode"}
            title={isDark ? "Dark mode" : "Light mode"}
          >
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 px-3 max-w-[320px] truncate">
                {email}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/cases">Inbox</Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void logout();
                }}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
