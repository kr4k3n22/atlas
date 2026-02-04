"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeInit from "@/app/_components/ThemeInit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RiskLabel = "ROUTINE" | "ESCALATE" | "BLOCK";
type CaseStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "CLOSED";
type QuickFilter = "ALL" | "HIGH_RISK" | "WAITING_24H";

type CaseRecord = {
  id: string;
  user_name: string;
  user_message: string;
  tool_name: string;
  tool_args_redacted: Record<string, unknown>;
  risk_label: RiskLabel;
  risk_score: number;
  risk_rationale: string;
  policy_refs: string[];
  status: CaseStatus;
  created_at: string;
  audit_trail: Array<{
    ts: string;
    actor: string;
    action: string;
    detail?: string;
  }>;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function badgeClass(label: string) {
  if (label === "BLOCK") return "bg-red-600/90 text-white border-red-500/60";
  if (label === "ESCALATE") return "bg-orange-500/90 text-white border-orange-400/60";
  if (label === "APPROVED") return "bg-green-600/90 text-white border-green-500/60";
  if (label === "REJECTED") return "bg-red-700/90 text-white border-red-600/60";
  if (label === "PENDING_REVIEW") return "bg-slate-700/70 text-slate-100 border-slate-600/60";
  if (label === "NEEDS_INFO") return "bg-yellow-500/90 text-black border-yellow-400/60";
  return "bg-slate-600/60 text-slate-100 border-slate-500/60";
}

async function fetchCases(): Promise<CaseRecord[]> {
  const res = await fetch("/api/cases", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load cases");
  return res.json();
}

async function decideCase(
  id: string,
  decision: "APPROVE" | "REJECT" | "REQUEST_INFO",
  note: string
) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, note }),
  });
  if (!res.ok) throw new Error("Failed to submit decision");
  return res.json();
}

function ApproverUserMenu() {
  const [email, setEmail] = useState("approver");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setEmail(j?.session?.email ?? "approver"))
      .catch(() => setEmail("approver"));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/approver/login";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-9 max-w-[320px] items-center justify-center truncate rounded-md border border-muted/60 bg-background/40 px-3 text-sm text-foreground shadow-sm backdrop-blur hover:bg-background/60">
          {email}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings">Settings</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            logout();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CasesPage() {
  const [all, setAll] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<"ALL" | RiskLabel>("ALL");
  const [quick, setQuick] = useState<QuickFilter>("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const hoursSince = (iso: string) =>
    Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60));

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchCases();
      setAll(data);

      if (selectedId && !data.some((c) => c.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const pending = all.filter((c) => c.status === "PENDING_REVIEW").length;
    const approved = all.filter((c) => c.status === "APPROVED").length;
    const rejected = all.filter((c) => c.status === "REJECTED").length;
    return { pending, approved, rejected, all: all.length };
  }, [all]);

  const metrics = useMemo(() => {
    const escalated = all.filter((c) => c.risk_label === "ESCALATE" || c.risk_label === "BLOCK").length;
    const waiting24h = all.filter(
      (c) => c.status === "PENDING_REVIEW" && hoursSince(c.created_at) >= 24
    ).length;
    const oldestPending = all
      .filter((c) => c.status === "PENDING_REVIEW")
      .reduce((max, c) => Math.max(max, hoursSince(c.created_at)), 0);

    return { escalated, waiting24h, oldestPending };
  }, [all, now]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return all
      .filter((c) => {
        if (tab === "PENDING" && c.status !== "PENDING_REVIEW") return false;
        if (tab === "APPROVED" && c.status !== "APPROVED") return false;
        if (tab === "REJECTED" && c.status !== "REJECTED") return false;
        if (risk !== "ALL" && c.risk_label !== risk) return false;

        if (quick === "HIGH_RISK" && !(c.risk_label === "ESCALATE" || c.risk_label === "BLOCK")) {
          return false;
        }
        if (quick === "WAITING_24H" && hoursSince(c.created_at) < 24) return false;

        if (!needle) return true;

        const hay = [
          c.id,
          c.user_name,
          c.user_message,
          c.tool_name,
          c.risk_label,
          c.status,
          c.risk_rationale,
          (c.policy_refs ?? []).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(needle);
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [all, tab, risk, q, quick, now]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return all.find((c) => c.id === selectedId) ?? null;
  }, [all, selectedId]);

  async function onDecision(decision: "APPROVE" | "REJECT" | "REQUEST_INFO") {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      await decideCase(selected.id, decision, note);
      setNote("");
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ThemeInit />

      <div className="mx-auto flex min-h-screen w-full max-w-none flex-col px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Cases</div>
            <div className="text-sm text-muted-foreground">Review queue and decisions.</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refresh()}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60"
            >
              Refresh
            </button>
            <ApproverUserMenu />
          </div>
        </div>

        {/* rest unchanged */}
      </div>
    </div>
  );
}
