"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type UserSettings = {
  theme: "system" | "light" | "dark";
  reviewerName: string;
  autoOpenPreviewOnSelect: boolean;
  enableKeyboardShortcuts: boolean;
  defaultInboxTab: "PENDING" | "APPROVED" | "REJECTED" | "ALL";
  riskSortDefault: "RISK_DESC" | "RISK_ASC" | "NEWEST";
  showOnlyPendingByDefault: boolean;
};

const STORAGE_KEY = "atlas_user_settings_v1";

function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return {
      theme: "system",
      reviewerName: "Sarah",
      autoOpenPreviewOnSelect: true,
      enableKeyboardShortcuts: true,
      defaultInboxTab: "PENDING",
      riskSortDefault: "RISK_DESC",
      showOnlyPendingByDefault: true,
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      theme: "system",
      reviewerName: "Sarah",
      autoOpenPreviewOnSelect: true,
      enableKeyboardShortcuts: true,
      defaultInboxTab: "PENDING",
      riskSortDefault: "RISK_DESC",
      showOnlyPendingByDefault: true,
    };
  }

  try {
    return JSON.parse(raw) as UserSettings;
  } catch {
    return {
      theme: "system",
      reviewerName: "Sarah",
      autoOpenPreviewOnSelect: true,
      enableKeyboardShortcuts: true,
      defaultInboxTab: "PENDING",
      riskSortDefault: "RISK_DESC",
      showOnlyPendingByDefault: true,
    };
  }
}

export default function SettingsClient() {
  const { theme, setTheme } = useTheme();

  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());

  // Sync theme provider with saved setting
  useEffect(() => {
    const t = settings.theme;
    setTheme(t);
  }, [settings.theme, setTheme]);

  // Persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Ensure UI reflects active theme (in case user changes via system)
  useEffect(() => {
    if (!theme) return;
  }, [theme]);

  const settingList = useMemo(() => {
    return [
      { key: "theme", desc: "Theme: system / light / dark" },
      { key: "reviewerName", desc: "Displayed reviewer name (for demo/audit)" },
      { key: "autoOpenPreviewOnSelect", desc: "Auto open preview on mobile selection" },
      { key: "enableKeyboardShortcuts", desc: "Enable J/K navigation and A/R/I actions" },
      { key: "defaultInboxTab", desc: "Default inbox tab on load" },
      { key: "riskSortDefault", desc: "Default sorting mode" },
      { key: "showOnlyPendingByDefault", desc: "Start focused on pending work" },
    ];
  }, []);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => setSettings((s) => ({ ...s, theme: v as any }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Reviewer name</Label>
            <Input
              value={settings.reviewerName}
              onChange={(e) => setSettings((s) => ({ ...s, reviewerName: e.target.value }))}
              placeholder="Sarah"
            />
            <div className="text-xs text-muted-foreground">
              Demo-only. Later this maps to auth identity.
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label>Enable keyboard shortcuts</Label>
              <div className="text-xs text-muted-foreground">J/K navigate, A approve, R reject, I request info.</div>
            </div>
            <Switch
              checked={settings.enableKeyboardShortcuts}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enableKeyboardShortcuts: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label>Auto open preview on mobile</Label>
              <div className="text-xs text-muted-foreground">Opens the drawer when you select a row.</div>
            </div>
            <Switch
              checked={settings.autoOpenPreviewOnSelect}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, autoOpenPreviewOnSelect: v }))}
            />
          </div>

          <div className="grid gap-2">
            <Label>Default inbox tab</Label>
            <Select
              value={settings.defaultInboxTab}
              onValueChange={(v) => setSettings((s) => ({ ...s, defaultInboxTab: v as any }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default tab" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Default sort</Label>
            <Select
              value={settings.riskSortDefault}
              onValueChange={(v) => setSettings((s) => ({ ...s, riskSortDefault: v as any }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RISK_DESC">Risk: high to low</SelectItem>
                <SelectItem value="RISK_ASC">Risk: low to high</SelectItem>
                <SelectItem value="NEWEST">Newest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label>Focus pending by default</Label>
              <div className="text-xs text-muted-foreground">Keeps triage tight on load.</div>
            </div>
            <Switch
              checked={settings.showOnlyPendingByDefault}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, showOnlyPendingByDefault: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings list (current)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="list-disc pl-5 space-y-1">
            {settingList.map((s) => (
              <li key={s.key}>
                <span className="font-mono text-xs">{s.key}</span>:{" "}
                <span className="text-muted-foreground">{s.desc}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-muted-foreground mt-3">
            Next: store these server-side per user after auth is added.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
