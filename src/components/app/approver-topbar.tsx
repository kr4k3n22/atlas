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
import { createClient } from "@/lib/supabaseClient";

export function ApproverTopbar() {
  const [displayName, setDisplayName] = React.useState("Approver");
  const [email, setEmail] = React.useState("");
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";

  React.useEffect(() => {
    // Try Supabase Auth first (approver login flow)
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (user) {
        const name = user.user_metadata?.displayName || "";
        const userEmail = user.email || "";
        setDisplayName(name || userEmail || "Approver");
        setEmail(userEmail);
        return;
      }

      // Fallback: try JWT session (old auth flow)
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((res) => {
          if (res?.session) {
            setDisplayName(res.session.displayName || res.session.email || "Approver");
            setEmail(res.session.email || "");
          }
        })
        .catch(() => {});
    });
  }, []);

  async function logout() {
    // Sign out of Supabase Auth
    const supabase = createClient();
    await supabase.auth.signOut();

    // Also clear JWT session cookie
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});

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
                {displayName}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-semibold">{displayName}</DropdownMenuLabel>
              {email && (
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground -mt-1">
                  {email}
                </DropdownMenuLabel>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/cases">Inbox</Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/audit">Audit Log</Link>
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
