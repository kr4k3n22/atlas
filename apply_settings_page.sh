#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] Adding shadcn components used by Settings UI (safe to re-run)..."
npx shadcn@latest add button card switch select label separator input textarea >/dev/null || true

echo "[2/6] Writing settings model + storage helpers..."
mkdir -p src/lib
cat > src/lib/settings.ts <<'TS'
export type ThemeMode = "light" | "dark" | "system";
export type InboxTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
export type RiskFilter = "ALL" | "ROUTINE" | "ESCALATE" | "BLOCK";
export type PreviewBehavior = "open_on_click" | "auto_open_on_selection";
export type PreviewPosition = "right_rail" | "modal_drawer";
export type DecisionRequiresNote = "off" | "block_only" | "high_only" | "block_or_high";
export type AutoRefreshInterval = 0 | 30 | 60;

export type UserSettings = {
  theme: ThemeMode;
  keyboardShortcuts: boolean;

  defaultInboxTab: InboxTab;
  defaultRiskFilter: RiskFilter;

  previewBehavior: PreviewBehavior;
  previewPosition: PreviewPosition;

  decisionRequiresNote: DecisionRequiresNote;
  highRiskThreshold: number;

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

  autoRefreshInterval: 0,
};

const KEY = "atlas.hitl.userSettings.v1";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;

    // merge with defaults (keeps forward-compat)
    return {
      ...defaultSettings,
      ...parsed,
      highRiskThreshold:
        typeof parsed.highRiskThreshold === "number" ? parsed.highRiskThreshold : defaultSettings.highRiskThreshold,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  // system
  if (typeof window === "undefined") return "dark";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const actual = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", actual === "dark");
}
TS

echo "[3/6] Writing SettingsProvider (app-wide settings state)..."
mkdir -p src/components
cat > src/components/settings-provider.tsx <<'TSX'
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { UserSettings, applyTheme, defaultSettings, loadSettings, saveSettings } from "@/lib/settings";

type Ctx = {
  settings: UserSettings;
  setSettings: (next: UserSettings) => void;
  patchSettings: (patch: Partial<UserSettings>) => void;
  resetSettings: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    const loaded = loadSettings();
    setSettingsState(loaded);
    applyTheme(loaded.theme);

    // if system theme, react to OS changes
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onChange = () => {
      const s = loadSettings();
      if (s.theme === "system") applyTheme("system");
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    saveSettings(settings);
    applyTheme(settings.theme);
  }, [settings]);

  const api = useMemo<Ctx>(() => {
    return {
      settings,
      setSettings: (next) => setSettingsState(next),
      patchSettings: (patch) => setSettingsState((cur) => ({ ...cur, ...patch })),
      resetSettings: () => setSettingsState(defaultSettings),
    };
  }, [settings]);

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}

export function useUserSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useUserSettings must be used inside <SettingsProvider>");
  return ctx;
}
TSX

echo "[4/6] Patching src/app/layout.tsx to wrap app in SettingsProvider..."
# Insert import if missing
if ! grep -q 'from "@/components/settings-provider"' src/app/layout.tsx; then
  perl -0777 -i -pe 's/^/import { SettingsProvider } from "\\@\\/components\\/settings-provider";\n/ if $. == 1' src/app/layout.tsx
fi

# Wrap {children} if not already wrapped
if ! grep -q '<SettingsProvider>' src/app/layout.tsx; then
  perl -0777 -i -pe 's/\{children\}/<SettingsProvider>{children}<\/SettingsProvider>/g' src/app/layout.tsx
fi

echo "[5/6] Writing real Settings page UI..."
mkdir -p src/app/settings
cat > src/app/settings/page.tsx <<'TSX'
"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useUserSettings } from "@/components/settings-provider";
import type {
  AutoRefreshInterval,
  DecisionRequiresNote,
  InboxTab,
  PreviewBehavior,
  PreviewPosition,
  RiskFilter,
  ThemeMode,
} from "@/lib/settings";

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <div className="sm:min-w-[260px]">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, patchSettings, resetSettings } = useUserSettings();

  const shortcutsPreview = useMemo(() => {
    if (!settings.keyboardShortcuts) return "Disabled";
    return "J/K navigate, A approve, R reject, I request info, Esc close preview";
  }, [settings.keyboardShortcuts]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">User settings</h1>
            <p className="text-sm text-muted-foreground">
              Preferences for review workflow and UI behavior. Stored locally for now.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/">Home</Link>
            </Button>
            <Button variant="outline" onClick={() => resetSettings()}>
              Reset to defaults
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Theme applies immediately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row title="Theme" desc="Light, dark, or follow your OS setting.">
              <Select
                value={settings.theme}
                onValueChange={(v) => patchSettings({ theme: v as ThemeMode })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow</CardTitle>
            <CardDescription>Defaults used when opening the inbox.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row title="Keyboard shortcuts" desc={shortcutsPreview}>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-sm">Enabled</Label>
                <Switch
                  checked={settings.keyboardShortcuts}
                  onCheckedChange={(checked) => patchSettings({ keyboardShortcuts: checked })}
                />
              </div>
            </Row>

            <Separator />

            <Row title="Default inbox tab" desc="Which queue opens first.">
              <Select
                value={settings.defaultInboxTab}
                onValueChange={(v) => patchSettings({ defaultInboxTab: v as InboxTab })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="ALL">All</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <Row title="Default risk filter" desc="Pre-filter the queue by risk label.">
              <Select
                value={settings.defaultRiskFilter}
                onValueChange={(v) => patchSettings({ defaultRiskFilter: v as RiskFilter })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select risk filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="ESCALATE">Escalate</SelectItem>
                  <SelectItem value="BLOCK">Block</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview behavior</CardTitle>
            <CardDescription>How the case preview opens and where it appears.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row title="Preview behavior" desc="Open only when clicked, or auto-open when selection changes.">
              <Select
                value={settings.previewBehavior}
                onValueChange={(v) => patchSettings({ previewBehavior: v as PreviewBehavior })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select behavior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open_on_click">Open on click</SelectItem>
                  <SelectItem value="auto_open_on_selection">Auto-open on selection</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <Row title="Preview position" desc="Right rail keeps context. Modal drawer focuses attention.">
              <Select
                value={settings.previewPosition}
                onValueChange={(v) => patchSettings({ previewPosition: v as PreviewPosition })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="right_rail">Right rail</SelectItem>
                  <SelectItem value="modal_drawer">Modal drawer</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision controls</CardTitle>
            <CardDescription>Guardrails to improve audit quality.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row title="Decision requires note" desc="Force a note for certain decisions.">
              <Select
                value={settings.decisionRequiresNote}
                onValueChange={(v) => patchSettings({ decisionRequiresNote: v as DecisionRequiresNote })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select requirement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="block_only">Block only</SelectItem>
                  <SelectItem value="high_only">High score only</SelectItem>
                  <SelectItem value="block_or_high">Block or high score</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <Row title="High score threshold" desc="Used when note requirement includes high score.">
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.highRiskThreshold}
                onChange={(e) => patchSettings({ highRiskThreshold: Number(e.target.value || 0) })}
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-refresh</CardTitle>
            <CardDescription>Polling interval for inbox refresh (will be wired in next).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row title="Auto-refresh interval" desc="Off, 30 seconds, or 60 seconds.">
              <Select
                value={String(settings.autoRefreshInterval)}
                onValueChange={(v) => patchSettings({ autoRefreshInterval: Number(v) as AutoRefreshInterval })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Off</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          Note: This is persisted to localStorage. Later we will swap storage to a backend user profile.
        </div>
      </div>
    </div>
  );
}
TSX

echo "[6/6] Done."
echo "Next: run 'npm run build' and open /settings."
