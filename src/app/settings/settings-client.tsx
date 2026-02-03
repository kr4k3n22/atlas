"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { useSettings } from "@/components/settings-provider";
import { defaultSettings } from "@/lib/settings";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsClient() {
  const { settings, patchSettings, setSettings } = useSettings();
  const { resolvedTheme } = useTheme();

  const settingList = useMemo(() => {
    return [
      { key: "theme", desc: "Theme: system / light / dark" },
      { key: "keyboardShortcuts", desc: "Enable J/K navigation + action hotkeys" },
      { key: "defaultInboxTab", desc: "Default inbox tab on load" },
      { key: "defaultRiskFilter", desc: "Default risk filter (ALL / ROUTINE / ESCALATE / BLOCK)" },
      { key: "previewBehavior", desc: "Preview opens on click or auto on selection" },
      { key: "previewPosition", desc: "Preview display position" },
      { key: "decisionRequiresNote", desc: "Require decision notes for risk thresholds" },
      { key: "highRiskThreshold", desc: "Numeric threshold for high risk" },
      { key: "autoRefreshInterval", desc: "Auto-refresh interval for inbox" },
    ];
  }, []);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Theme preference is saved and applied immediately.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => patchSettings({ theme: v as any })}
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
            <div className="text-xs text-muted-foreground">
              Active theme: {resolvedTheme ?? "unknown"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
          <CardDescription>Defaults for reviewing queues and decisions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label>Enable keyboard shortcuts</Label>
              <div className="text-xs text-muted-foreground">J/K navigate, A approve, R reject, I request info.</div>
            </div>
            <Switch
              checked={settings.keyboardShortcuts}
              onCheckedChange={(v) => patchSettings({ keyboardShortcuts: v })}
            />
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label>Default inbox tab</Label>
            <Select
              value={settings.defaultInboxTab}
              onValueChange={(v) => patchSettings({ defaultInboxTab: v as any })}
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
            <Label>Default risk filter</Label>
            <Select
              value={settings.defaultRiskFilter}
              onValueChange={(v) => patchSettings({ defaultRiskFilter: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Risk filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ROUTINE">Routine</SelectItem>
                <SelectItem value="ESCALATE">Escalate</SelectItem>
                <SelectItem value="BLOCK">Block</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Preview behavior</Label>
            <Select
              value={settings.previewBehavior}
              onValueChange={(v) => patchSettings({ previewBehavior: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Preview behavior" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open_on_click">Open on click</SelectItem>
                <SelectItem value="auto_open_on_selection">Auto open on selection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Preview position</Label>
            <Select
              value={settings.previewPosition}
              onValueChange={(v) => patchSettings({ previewPosition: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Preview position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="right_rail">Right rail</SelectItem>
                <SelectItem value="modal_drawer">Modal drawer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Decision note policy</Label>
            <Select
              value={settings.decisionRequiresNote}
              onValueChange={(v) => patchSettings({ decisionRequiresNote: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Decision note policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="block_only">Block only</SelectItem>
                <SelectItem value="high_only">High risk only</SelectItem>
                <SelectItem value="block_or_high">Block or high risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>High risk threshold</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.highRiskThreshold}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isNaN(next)) patchSettings({ highRiskThreshold: next });
              }}
            />
            <div className="text-xs text-muted-foreground">
              Used when decision notes are required for high risk.
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Auto-refresh interval</Label>
            <Select
              value={settings.autoRefreshInterval}
              onValueChange={(v) => patchSettings({ autoRefreshInterval: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Refresh interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="30s">Every 30s</SelectItem>
                <SelectItem value="60s">Every 60s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings overview</CardTitle>
          <CardDescription>Current settings stored in local storage.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <ul className="list-disc pl-5 space-y-1">
            {settingList.map((s) => (
              <li key={s.key}>
                <span className="font-mono text-xs">{s.key}</span>:{" "}
                <span className="text-muted-foreground">{s.desc}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSettings(defaultSettings)}>
              Restore defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
