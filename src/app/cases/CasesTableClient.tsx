"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getCaseAgeInHours, getHoursUntilExpiration } from "@/lib/slaChecker";

type CaseRow = {
  id: string;
  user_display: string;
  tool_name: string;
  user_message: string;
  tool_args_redacted: any;
  risk_label: "ROUTINE" | "ESCALATE" | "BLOCK";
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO" | "EXPIRED";
  created_at: string;
  history: { ts: string; actor: string; event: string; detail: string }[];
};

type UserSettings = {
  theme: "system" | "light" | "dark";
  reviewerName: string;
  autoOpenPreviewOnSelect: boolean;
  enableKeyboardShortcuts: boolean;
  defaultInboxTab: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "ALL";
  riskSortDefault: "RISK_DESC" | "RISK_ASC" | "NEWEST";
  showOnlyPendingByDefault: boolean;
};

const SETTINGS_KEY = "atlas_user_settings_v1";

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

  const raw = window.localStorage.getItem(SETTINGS_KEY);
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
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      theme: parsed.theme ?? "system",
      reviewerName: parsed.reviewerName ?? "Sarah",
      autoOpenPreviewOnSelect: parsed.autoOpenPreviewOnSelect ?? true,
      enableKeyboardShortcuts: parsed.enableKeyboardShortcuts ?? true,
      defaultInboxTab: parsed.defaultInboxTab ?? "PENDING",
      riskSortDefault: parsed.riskSortDefault ?? "RISK_DESC",
      showOnlyPendingByDefault: parsed.showOnlyPendingByDefault ?? true,
    };
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

function riskBadge(label: CaseRow["risk_label"]) {
  if (label === "BLOCK") return <Badge variant="destructive">BLOCK</Badge>;
  if (label === "ESCALATE")
    return (
      <Badge className="bg-orange-500 text-white hover:bg-orange-500">
        ESCALATE
      </Badge>
    );
  return <Badge variant="secondary">ROUTINE</Badge>;
}

function statusBadge(status: CaseRow["status"]) {
  if (status === "APPROVED")
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600">
        APPROVED
      </Badge>
    );
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  if (status === "NEEDS_MORE_INFO")
    return (
      <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">
        NEEDS_MORE_INFO
      </Badge>
    );
  if (status === "EXPIRED")
    return (
      <Badge className="bg-gray-500 text-white hover:bg-gray-500">
        EXPIRED
      </Badge>
    );
  return <Badge variant="secondary">PENDING_REVIEW</Badge>;
}

function rowTone(status: CaseRow["status"]) {
  if (status === "APPROVED") return "bg-green-50/40 dark:bg-green-950/20";
  if (status === "REJECTED") return "bg-red-50/40 dark:bg-red-950/20";
  if (status === "NEEDS_MORE_INFO") return "bg-yellow-50/40 dark:bg-yellow-950/20";
  if (status === "EXPIRED") return "bg-gray-50/40 dark:bg-gray-950/20";
  return "";
}

function riskPanelTone(label: CaseRow["risk_label"]) {
  if (label === "BLOCK")
    return "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/30";
  if (label === "ESCALATE")
    return "border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-950/30";
  return "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40";
}

function fmtTs(iso: string) {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(".000Z", "Z");
  } catch {
    return iso;
  }
}

function getSlaWarning(createdAt: string, status: string) {
  if (status !== "PENDING_REVIEW" && status !== "NEEDS_MORE_INFO") {
    return null;
  }

  const hoursRemaining = getHoursUntilExpiration(createdAt);
  const ageHours = getCaseAgeInHours(createdAt);

  if (hoursRemaining <= 0) {
    return {
      level: "expired",
      message: `⚠️ SLA EXPIRED (${Math.round(ageHours)}h old)`,
      className: "bg-red-600 text-white",
    };
  } else if (hoursRemaining <= 6) {
    return {
      level: "critical",
      message: `⚠️ ${Math.round(hoursRemaining)}h until SLA expires`,
      className: "bg-orange-500 text-white",
    };
  } else if (hoursRemaining <= 24) {
    return {
      level: "warning",
      message: `${Math.round(hoursRemaining)}h until SLA expires`,
      className: "bg-yellow-500 text-white",
    };
  }

  return null;
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

type Props = {
  cases: CaseRow[];
};

export default function CasesTableClient({ cases }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<CaseRow[]>(cases);
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "ALL">(
    settings.showOnlyPendingByDefault ? "PENDING" : settings.defaultInboxTab
  );
  const [riskFilter, setRiskFilter] = useState<"ALL" | "ROUTINE" | "ESCALATE" | "BLOCK">(
    "ALL"
  );
  const [sortKey, setSortKey] = useState<"NEWEST" | "RISK_DESC" | "RISK_ASC">(
    settings.riskSortDefault
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);

  // Desktop preview toggle (this is what you asked for).
  // Default: closed. Opens when you click a row.
  const [previewOpen, setPreviewOpen] = useState(false);

  const filteredIdsRef = useRef<string[]>([]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SETTINGS_KEY) return;
      setSettings(loadSettings());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setSortKey(settings.riskSortDefault);
    setTab(settings.showOnlyPendingByDefault ? "PENDING" : settings.defaultInboxTab);
  }, [settings.riskSortDefault, settings.defaultInboxTab, settings.showOnlyPendingByDefault]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    let list = rows.slice();

    if (tab === "PENDING") {
      list = list.filter(
        (c) => c.status === "PENDING_REVIEW" || c.status === "NEEDS_MORE_INFO"
      );
    } else if (tab === "APPROVED") {
      list = list.filter((c) => c.status === "APPROVED");
    } else if (tab === "REJECTED") {
      list = list.filter((c) => c.status === "REJECTED");
    } else if (tab === "EXPIRED") {
      list = list.filter((c) => c.status === "EXPIRED");
    }

    if (riskFilter !== "ALL") list = list.filter((c) => c.risk_label === riskFilter);

    if (needle) {
      list = list.filter((c) => {
        return (
          c.id.toLowerCase().includes(needle) ||
          c.user_display.toLowerCase().includes(needle) ||
          c.tool_name.toLowerCase().includes(needle)
        );
      });
    }

    list.sort((a, b) => {
      if (sortKey === "NEWEST") return b.created_at.localeCompare(a.created_at);
      if (sortKey === "RISK_ASC") return a.risk_score - b.risk_score;
      return b.risk_score - a.risk_score;
    });

    filteredIdsRef.current = list.map((c) => c.id);
    return list;
  }, [rows, q, tab, riskFilter, sortKey]);

  const counts = useMemo(() => {
    const pending = rows.filter(
      (c) => c.status === "PENDING_REVIEW" || c.status === "NEEDS_MORE_INFO"
    ).length;
    const approved = rows.filter((c) => c.status === "APPROVED").length;
    const rejected = rows.filter((c) => c.status === "REJECTED").length;
    const expired = rows.filter((c) => c.status === "EXPIRED").length;
    return { pending, approved, rejected, expired, all: rows.length };
  }, [rows]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((c) => c.id === selectedId) ?? null;
  }, [rows, selectedId]);

  // openPreview controls whether the desktop preview should pop open.
  function selectCase(id: string, openPreview: boolean) {
    setSelectedId(id);
    setToast(null);

    if (openPreview) setPreviewOpen(true);

    // Mobile drawer behavior stays optional via settings.
    if (typeof window !== "undefined" && window.innerWidth < 768 && settings.autoOpenPreviewOnSelect) {
      setSheetOpen(true);
    }
  }

  async function decide(decision: "APPROVE" | "REJECT" | "REQUEST_INFO") {
    if (!selectedId) return;

    setToast(null);

    const res = await fetch(`/api/cases/${selectedId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        comment: note.trim() ? note.trim() : undefined,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setToast(`Decision failed (${res.status}). ${t}`.trim());
      return;
    }

    const updated = (await res.json().catch(() => null)) as CaseRow | null;
    if (!updated) {
      setToast("Saved, but response parsing failed.");
      return;
    }

    setRows((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setToast(`Saved. New status: ${updated.status}`);
    setNote("");

    router.refresh();
  }

  // Shortcuts: J/K navigate selection ONLY (no auto-preview), A/R/I act, Esc closes.
  useEffect(() => {
    if (!settings.enableKeyboardShortcuts) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === "escape") {
        setSheetOpen(false);
        setPreviewOpen(false);
        return;
      }

      const ids = filteredIdsRef.current;
      if (ids.length === 0) return;

      const idx = selectedId ? ids.indexOf(selectedId) : -1;

      if (key === "j") {
        const next = idx >= 0 ? Math.min(ids.length - 1, idx + 1) : 0;
        selectCase(ids[next], false);
        return;
      }

      if (key === "k") {
        const prev = idx >= 0 ? Math.max(0, idx - 1) : 0;
        selectCase(ids[prev], false);
        return;
      }

      if (!selectedId) return;

      if (key === "a") {
        decide("APPROVE");
        return;
      }

      if (key === "r") {
        decide("REJECT");
        return;
      }

      if (key === "i") {
        decide("REQUEST_INFO");
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, note, settings.enableKeyboardShortcuts, settings.autoOpenPreviewOnSelect]);

  function PreviewContent({ c }: { c: CaseRow }) {
    const slaWarning = getSlaWarning(c.created_at, c.status);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold">{c.id}</div>
            <div className="text-xs text-muted-foreground">Created: {fmtTs(c.created_at)}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {riskBadge(c.risk_label)}
              {statusBadge(c.status)}
            </div>
            <Link className="text-xs underline" href={`/cases/${c.id}`}>
              Open full page
            </Link>
          </div>
        </div>

        {slaWarning && (
          <div className={`rounded-md px-3 py-2 text-sm font-semibold ${slaWarning.className}`}>
            {slaWarning.message}
          </div>
        )}

        <div className="rounded-md border bg-background p-3 text-sm space-y-2">
          <div><span className="text-muted-foreground">User:</span> {c.user_display}</div>
          <div>
            <span className="text-muted-foreground">Tool:</span>{" "}
            <span className="font-mono text-xs">{c.tool_name}</span>
          </div>
          <div><span className="text-muted-foreground">Message:</span> {c.user_message}</div>
        </div>

        <div className={"rounded-md border p-3 space-y-3 " + riskPanelTone(c.risk_label)}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Risk Assessment</div>
            <Badge variant="secondary" className="tabular-nums">Score: {c.risk_score}</Badge>
          </div>
          <div className="text-sm">
            <div className="font-semibold">Reason</div>
            <div className="text-muted-foreground">{c.risk_rationale}</div>
          </div>
          <div className="text-sm">
            <div className="font-semibold">Policy refs</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(c.policy_refs || []).map((p) => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Decision note</div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a short note to the audit trail (optional)."
            className="min-h-[90px]"
          />
          <div className="grid gap-2">
            <Button onClick={() => decide("APPROVE")} className="bg-green-600 text-white hover:bg-green-600">
              Approve {settings.enableKeyboardShortcuts ? "(A)" : ""}
            </Button>
            <Button onClick={() => decide("REJECT")} variant="destructive">
              Reject {settings.enableKeyboardShortcuts ? "(R)" : ""}
            </Button>
            <Button onClick={() => decide("REQUEST_INFO")} variant="secondary">
              Request info {settings.enableKeyboardShortcuts ? "(I)" : ""}
            </Button>
          </div>
          {toast ? <div className="text-xs text-muted-foreground">{toast}</div> : null}
          <div className="text-xs text-muted-foreground">
            {settings.enableKeyboardShortcuts
              ? "Shortcuts: J/K navigate, A approve, R reject, I request info, Esc close."
              : "Keyboard shortcuts disabled in Settings."}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-sm font-semibold">Tool args (redacted)</div>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">
            {JSON.stringify(c.tool_args_redacted, null, 2)}
          </pre>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Audit trail</div>
          <div className="space-y-2">
            {c.history.map((h, idx) => (
              <div key={idx} className="rounded-md border bg-background p-2">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="w-44">{h.ts}</span>
                  <span className="font-mono w-24">{h.actor}</span>
                  <span className="font-mono w-24">{h.event}</span>
                </div>
                <div className="text-sm mt-1">{h.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const gridCols = previewOpen ? "md:grid-cols-3" : "md:grid-cols-1";
  const leftSpan = previewOpen ? "md:col-span-2" : "md:col-span-1";

  return (
    <div className={"grid gap-4 " + gridCols}>
      <div className={leftSpan + " space-y-4 min-w-0"}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="PENDING">Pending ({counts.pending})</TabsTrigger>
              <TabsTrigger value="APPROVED">Approved ({counts.approved})</TabsTrigger>
              <TabsTrigger value="REJECTED">Rejected ({counts.rejected})</TabsTrigger>
              <TabsTrigger value="EXPIRED">Expired ({counts.expired})</TabsTrigger>
              <TabsTrigger value="ALL">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search case id, user, tool..."
              className="md:w-[320px]"
            />

            <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as any)}>
              <SelectTrigger className="md:w-[170px]">
                <SelectValue placeholder="Risk filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All risk</SelectItem>
                <SelectItem value="ROUTINE">Routine</SelectItem>
                <SelectItem value="ESCALATE">Escalate</SelectItem>
                <SelectItem value="BLOCK">Block</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortKey} onValueChange={(v) => setSortKey(v as any)}>
              <SelectTrigger className="md:w-[190px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RISK_DESC">Risk: high to low</SelectItem>
                <SelectItem value="RISK_ASC">Risk: low to high</SelectItem>
                <SelectItem value="NEWEST">Newest first</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="secondary"
              onClick={() => setPreviewOpen((v) => !v)}
              className="md:w-[130px]"
            >
              {previewOpen ? "Hide preview" : "Show preview"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-4 py-3 text-xs font-semibold">
            <div className="col-span-2">Case ID</div>
            <div className="col-span-2">User</div>
            <div className="col-span-4">Tool</div>
            <div className="col-span-2">Verdict</div>
            <div className="col-span-1 text-right">Score</div>
            <div className="col-span-1">Status</div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">
              No cases match your filters.
            </div>
          ) : (
            <div>
              {filtered.map((c) => {
                const isSelected = c.id === selectedId;
                const slaWarning = getSlaWarning(c.created_at, c.status);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCase(c.id, true)}
                    className={
                      "w-full text-left grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b last:border-b-0 " +
                      rowTone(c.status) +
                      (isSelected
                        ? " outline-none ring-2 ring-sky-500 ring-inset bg-sky-50/30 dark:bg-sky-950/20"
                        : " hover:bg-muted/20")
                    }
                  >
                    <div className="col-span-2 underline flex items-center gap-1">
                      {c.id}
                      {slaWarning && slaWarning.level === "critical" && (
                        <span className="text-orange-500 font-bold" title={slaWarning.message}>⚠️</span>
                      )}
                      {slaWarning && slaWarning.level === "expired" && (
                        <span className="text-red-500 font-bold" title={slaWarning.message}>🔴</span>
                      )}
                    </div>
                    <div className="col-span-2">{c.user_display}</div>
                    <div className="col-span-4 font-mono text-xs leading-5">{c.tool_name}</div>
                    <div className="col-span-2">{riskBadge(c.risk_label)}</div>
                    <div className="col-span-1 text-right tabular-nums">{c.risk_score}</div>
                    <div className="col-span-1">{statusBadge(c.status)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Click a row to preview.
          {settings.enableKeyboardShortcuts
            ? " Shortcuts: J/K navigate, A approve, R reject, I request info, Esc close."
            : " Shortcuts disabled."}
        </div>
      </div>

      {previewOpen ? (
        <div className="hidden md:block md:col-span-1 min-w-0">
          <div className="rounded-lg border bg-background overflow-hidden">
            <div className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Preview</span>
              <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
                X
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-320px)] px-4 py-4">
              {selected ? (
                <PreviewContent c={selected} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a case to preview it here.
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Preview</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ScrollArea className="h-[calc(100vh-140px)] pr-4">
              {selected ? (
                <PreviewContent c={selected} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a case to preview it here.
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
