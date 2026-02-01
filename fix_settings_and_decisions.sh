#!/usr/bin/env bash
set -euo pipefail

echo "[0/7] Sanity checks..."
test -f package.json
test -d src/app

echo "[1/7] Install deps (theme + UI helpers)..."
npm i next-themes >/dev/null

echo "[2/7] Add shadcn components used by Settings UI (safe to re-run)..."
npx shadcn@latest add button card select switch label input separator tabs textarea >/dev/null || true

echo "[3/7] Write settings model (default + storage helpers)..."
mkdir -p src/lib
cat <<'TS' > src/lib/settings.ts
export type ThemeMode = "light" | "dark" | "system";
export type InboxTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
export type RiskFilter = "ALL" | "ROUTINE" | "ESCALATE" | "BLOCK";
export type PreviewBehavior = "open_on_click" | "auto_open_on_selection";
export type PreviewPosition = "right_rail" | "modal_drawer";
export type DecisionNotePolicy = "off" | "block_only" | "high_only" | "block_or_high";
export type AutoRefreshInterval = "off" | "30s" | "60s";

export type UserSettings = {
  theme: ThemeMode;
  keyboardShortcuts: boolean;
  defaultInboxTab: InboxTab;
  defaultRiskFilter: RiskFilter;
  previewBehavior: PreviewBehavior;
  previewPosition: PreviewPosition;
  decisionRequiresNote: DecisionNotePolicy;
  highRiskThreshold: number; // used when decisionRequiresNote involves "high"
  autoRefreshInterval: AutoRefreshInterval;
};

export const defaultSettings: UserSettings = {
  theme: "system",
  keyboardShortcuts: true,
  defaultInboxTab: "PENDING",
  defaultRiskFilter: "ALL",
  previewBehavior: "open_on_click",
  previewPosition: "right_rail",
  decisionRequiresNote: "block_or_high",
  highRiskThreshold: 80,
  autoRefreshInterval: "off",
};

const KEY = "atlas_hitl_user_settings_v1";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}
TS

echo "[4/7] Write SettingsProvider (app-wide settings state)..."
mkdir -p src/components
cat <<'TSX' > src/components/settings-provider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultSettings, loadSettings, saveSettings, type UserSettings } from "@/lib/settings";

type Ctx = {
  settings: UserSettings;
  setSettings: (next: UserSettings) => void;
  patchSettings: (patch: Partial<UserSettings>) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const setSettings = (next: UserSettings) => {
    setSettingsState(next);
    saveSettings(next);
  };

  const patchSettings = (patch: Partial<UserSettings>) => {
    setSettings({ ...settings, ...patch });
  };

  const value = useMemo(() => ({ settings, setSettings, patchSettings }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
TSX

echo "[5/7] Add app-level Providers (ThemeProvider + SettingsProvider)..."
mkdir -p src/app
cat <<'TSX' > src/app/providers.tsx
"use client";

import React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { SettingsProvider, useSettings } from "@/components/settings-provider";

function ThemeSync() {
  const { settings } = useSettings();
  const { setTheme } = useTheme();

  React.useEffect(() => {
    setTheme(settings.theme);
  }, [settings.theme, setTheme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SettingsProvider>
        <ThemeSync />
        {children}
      </SettingsProvider>
    </ThemeProvider>
  );
}
TSX

echo "[6/7] Overwrite layout.tsx to wrap app in Providers (stable, no brittle patching)..."
cat <<'TSX' > src/app/layout.tsx
import "./globals.css";
import React from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "ATLAS HITL UI",
  description: "Human-in-the-loop governance UI for high-impact tool calls.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
TSX

echo "[7/7] Create a real Settings page (no longer a stub)..."
mkdir -p src/app/settings
cat <<'TSX' > src/app/settings/page.tsx
"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useSettings } from "@/components/settings-provider";
import { defaultSettings } from "@/lib/settings";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { settings, patchSettings, setSettings } = useSettings();
  const { resolvedTheme } = useTheme();

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">User settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preferences for review workflow and UI behavior. Stored locally for now.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Current theme: <span className="font-mono">{String(resolvedTheme)}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" onClick={() => setSettings(defaultSettings)}>
            Reset defaults
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme is applied immediately and persisted.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={settings.theme} onValueChange={(v: any) => patchSettings({ theme: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label>Keyboard shortcuts</Label>
              <p className="text-xs text-muted-foreground">J/K navigate. A approve. R reject. I request info.</p>
            </div>
            <Switch
              checked={settings.keyboardShortcuts}
              onCheckedChange={(v) => patchSettings({ keyboardShortcuts: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbox defaults</CardTitle>
          <CardDescription>Applied on load. You can still change filters inside the inbox.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Default inbox tab</Label>
            <Select value={settings.defaultInboxTab} onValueChange={(v: any) => patchSettings({ defaultInboxTab: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default risk filter</Label>
            <Select value={settings.defaultRiskFilter} onValueChange={(v: any) => patchSettings({ defaultRiskFilter: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ROUTINE">Routine</SelectItem>
                <SelectItem value="ESCALATE">Escalate</SelectItem>
                <SelectItem value="BLOCK">Block</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="md:col-span-2" />

          <div className="space-y-2">
            <Label>Preview behavior</Label>
            <Select
              value={settings.previewBehavior}
              onValueChange={(v: any) => patchSettings({ previewBehavior: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open_on_click">Open on click</SelectItem>
                <SelectItem value="auto_open_on_selection">Auto-open on selection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Preview position</Label>
            <Select
              value={settings.previewPosition}
              onValueChange={(v: any) => patchSettings({ previewPosition: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="right_rail">Right rail</SelectItem>
                <SelectItem value="modal_drawer">Modal drawer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision rules</CardTitle>
          <CardDescription>Client-side guardrails for reviewer notes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Decision requires note for</Label>
            <Select
              value={settings.decisionRequiresNote}
              onValueChange={(v: any) => patchSettings({ decisionRequiresNote: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="block_only">Block only</SelectItem>
                <SelectItem value="high_only">High score only</SelectItem>
                <SelectItem value="block_or_high">Block OR high score</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>High score threshold</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.highRiskThreshold}
              onChange={(e) => patchSettings({ highRiskThreshold: Number(e.target.value || 0) })}
            />
            <p className="text-xs text-muted-foreground">Used when note policy includes "high score".</p>
          </div>

          <Separator className="md:col-span-2" />

          <div className="space-y-2">
            <Label>Auto-refresh interval</Label>
            <Select
              value={settings.autoRefreshInterval}
              onValueChange={(v: any) => patchSettings({ autoRefreshInterval: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="30s">30s</SelectItem>
                <SelectItem value="60s">60s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Note: This persists in localStorage only. Wire to a real backend later.
      </p>
    </div>
  );
}
TSX

echo "OK: Settings + Theme wiring complete."
echo "Next: Fix decision POST so Approve/Reject updates cases."
echo ""
echo "Now writing caseStore + API routes..."

mkdir -p src/lib src/app/api/cases src/app/api/cases/\[id\]

cat <<'TS' > src/lib/caseStore.ts
import casesJson from "@/data/mock_cases.json";
import { CaseSchema, type CaseRecord } from "@/lib/schema";

type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  note?: string;
};

type MutableCase = CaseRecord & { audit?: AuditEvent[] };

const nowIso = () => new Date().toISOString();

let CASES: MutableCase[] = (casesJson as any[]).map((c) => {
  const parsed = CaseSchema.parse(c);
  return { ...parsed, audit: [{ ts: nowIso(), actor: "proxy", action: "created" }] };
});

export function getAllCases(): CaseRecord[] {
  return CASES.map(stripInternal);
}

export function getCaseById(id: string): CaseRecord | null {
  const c = CASES.find((x) => x.id === id);
  return c ? stripInternal(c) : null;
}

export function applyDecision(input: { id: string; decision: Decision; note?: string }): CaseRecord | null {
  const c = CASES.find((x) => x.id === input.id);
  if (!c) return null;

  const decision = input.decision;
  const note = input.note?.trim() || "";

  if (decision === "APPROVE") {
    (c as any).status = "APPROVED";
  } else if (decision === "REJECT") {
    (c as any).status = "REJECTED";
  } else if (decision === "REQUEST_INFO") {
    (c as any).status = "PENDING_REVIEW";
  }

  c.audit = c.audit || [];
  c.audit.push({
    ts: nowIso(),
    actor: "reviewer",
    action: decision.toLowerCase(),
    note: note || undefined,
  });

  return stripInternal(c);
}

function stripInternal(c: MutableCase): CaseRecord {
  const out: any = { ...c };
  // expose audit trail in a stable key if your UI expects it
  if (c.audit) out.history = c.audit.map((e) => ({ ts: e.ts, actor: e.actor, event: e.action, note: e.note }));
  delete out.audit;
  return out as CaseRecord;
}
TS

cat <<'TS' > src/app/api/cases/route.ts
import { getAllCases } from "@/lib/caseStore";

export async function GET() {
  return Response.json(getAllCases());
}
TS

cat <<'TS' > src/app/api/cases/\[id\]/route.ts
import { z } from "zod";
import { applyDecision, getCaseById } from "@/lib/caseStore";

const DecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  note: z.string().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const c = getCaseById(id);
  if (!c) return new Response("Not found", { status: 404 });
  return Response.json(c);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = DecisionBody.parse(await request.json());

  const updated = applyDecision({ id, decision: body.decision, note: body.note });
  if (!updated) return new Response("Not found", { status: 404 });

  return Response.json(updated);
}
TS

echo "OK: Decisions now persist in-memory via POST /api/cases/:id"
echo "Done."
