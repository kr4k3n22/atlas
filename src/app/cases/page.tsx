"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeInit from "@/app/_components/ThemeInit";
import { APPROVERS } from "@/lib/approvers";
import { createClient } from "@/lib/supabaseClient";

type RiskLabel = "ROUTINE" | "ESCALATE" | "BLOCK";
type CaseStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "CLOSED";
type QuickFilter = "ALL" | "HIGH_RISK" | "WAITING_24H" | "ARTICLE14";
type SignalLevel = "none" | "low" | "moderate" | "strong";
type RecommendedAction = "auto_approve" | "auto_deny" | "auto_review" | "escalate_to_human";

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
  // New training data fields
  signal_level?: SignalLevel;
  signal_types?: string[];
  signal_source?: string;
  signal_notes?: string;
  recommended_action?: RecommendedAction;
  policy_rationale?: string;
  decision_type?: string;
  payment_due_within_days?: number | null;
  case_age_days?: number;
  channel?: string;
  language_barrier?: string;
  digital_access?: string;
  disability_accommodation_needed?: string;
  fraud_identity_duplicate?: string;
  fraud_device_reuse?: string;
  fraud_document_tampering?: string;
  idv_status?: string;
  residency_status?: string;
  employment_status?: string;
  separation_reason?: string;
  employer_report_status?: string;
  contributions_status?: string;
  income_verification?: string;
  overlap_check?: string;
  claimant_message?: string;
  agent_transcript?: string;
  caseworker_note?: string;
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
  // signal_level
  if (label === "none") return "bg-slate-600/60 text-slate-100 border-slate-500/60";
  if (label === "low") return "bg-yellow-500/80 text-black border-yellow-400/60";
  if (label === "moderate") return "bg-orange-500/90 text-white border-orange-400/60";
  if (label === "strong") return "bg-red-600/90 text-white border-red-500/60";
  // recommended_action
  if (label === "auto_approve") return "bg-green-600/90 text-white border-green-500/60";
  if (label === "auto_deny") return "bg-red-600/90 text-white border-red-500/60";
  if (label === "auto_review") return "bg-blue-500/90 text-white border-blue-400/60";
  if (label === "escalate_to_human") return "bg-orange-500/90 text-white border-orange-400/60";
  return "bg-slate-600/60 text-slate-100 border-slate-500/60";
}

function formatKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderInlineValue(value: unknown) {
  if (value === null || value === undefined) {
    return <div className="text-xs text-muted-foreground">—</div>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-4 text-sm">
        {value.map((item, i) => (
          <li key={`${String(item)}-${i}`} className="break-words">
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (isPlainObject(value)) {
    return (
      <pre className="mt-1 overflow-auto rounded-md bg-black/30 p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <div className="text-sm break-words">{String(value)}</div>;
}

function renderObjectGrid(obj: Record<string, unknown>) {
  const entries = Object.entries(obj);
  if (!entries.length) {
    return <div className="text-xs text-muted-foreground">—</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatKey(key)}
          </div>
          <div>{renderInlineValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function barrierClass(val: string | undefined) {
  if (!val) return "bg-slate-600/60 text-slate-100 border-slate-500/60";
  if (["none", "good", "no"].includes(val)) return "bg-green-600/80 text-white border-green-500/60";
  if (["some", "limited"].includes(val)) return "bg-yellow-500/80 text-black border-yellow-400/60";
  return "bg-red-500/80 text-white border-red-400/60";
}

function fraudClass(val: string | undefined) {
  if (!val || val === "unknown") return "bg-slate-600/60 text-slate-100 border-slate-500/60";
  if (val === "none") return "bg-green-600/80 text-white border-green-500/60";
  if (val === "possible") return "bg-orange-500/80 text-white border-orange-400/60";
  if (val === "confirmed") return "bg-red-600/90 text-white border-red-500/60";
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
  note: string,
  approver: string
) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, note, approver }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to submit decision"));
  return res.json();
}

export default function CasesPage() {
  const [all, setAll] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<"ALL" | RiskLabel>("ALL");
  const [quick, setQuick] = useState<QuickFilter>("ALL");
  const [signalFilter, setSignalFilter] = useState<"ALL" | SignalLevel>("ALL");
  const [actionFilter, setActionFilter] = useState<"ALL" | RecommendedAction>("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [approverSlug, setApproverSlug] = useState("");
  const [approverName, setApproverName] = useState("");
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const hoursSince = (iso: string) =>
    Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60));

  // Auto-detect the logged-in approver from Supabase Auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) return;

      const email = user.email?.toLowerCase() ?? "";
      const displayName = user.user_metadata?.displayName ?? "";

      // Match by email against the approver registry
      const match = APPROVERS.find((a) => a.email.toLowerCase() === email);
      if (match) {
        setApproverSlug(match.slug);
        setApproverName(match.fullName);
      } else if (displayName) {
        // Not in registry but has a name — use it directly
        setApproverSlug(displayName);
        setApproverName(displayName);
      }
    });
  }, []);

  async function refresh() {
    setLoading(true);
    setRefreshing(true);
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
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const pending = all.filter((c) => c.status === "PENDING_REVIEW").length;
    const approved = all.filter((c) => c.status === "APPROVED").length;
    const rejected = all.filter((c) => c.status === "REJECTED").length;
    return { pending, approved, rejected, all: all.length };
  }, [all]);

  const metrics = useMemo(() => {
    const article14Risk = all.filter(
      (c) => c.signal_level === "moderate" || c.signal_level === "strong"
    ).length;
    const escalateToHuman = all.filter(
      (c) => c.recommended_action === "escalate_to_human"
    ).length;
    const waiting24h = all.filter(
      (c) => c.status === "PENDING_REVIEW" && hoursSince(c.created_at) >= 24
    ).length;
    const oldestPending = all
      .filter((c) => c.status === "PENDING_REVIEW")
      .reduce((max, c) => Math.max(max, hoursSince(c.created_at)), 0);

    return { article14Risk, escalateToHuman, waiting24h, oldestPending };
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
        if (quick === "ARTICLE14" && c.signal_level !== "moderate" && c.signal_level !== "strong") {
          return false;
        }

        if (signalFilter !== "ALL" && c.signal_level !== signalFilter) return false;
        if (actionFilter !== "ALL" && c.recommended_action !== actionFilter) return false;

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
  }, [all, tab, risk, q, quick, signalFilter, actionFilter, now]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return all.find((c) => c.id === selectedId) ?? null;
  }, [all, selectedId]);

  const canDecide = note.trim().length > 0 && approverSlug !== "";

  async function onDecision(decision: "APPROVE" | "REJECT" | "REQUEST_INFO") {
    if (!selected || !canDecide) return;
    setBusy(true);
    setErr(null);
    try {
      await decideCase(selected.id, decision, note, approverSlug);
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
            <a
              href="/audit"
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60 flex items-center"
            >
              Audit Log
            </a>
            <button
              onClick={() => void refresh()}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-2xl font-semibold">{counts.pending}</div>
          </div>
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Article 14 Risk</div>
            <div className="text-2xl font-semibold">{metrics.article14Risk}</div>
            <div className="text-xs text-muted-foreground mt-1">Moderate or strong signal</div>
          </div>
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Escalate to Human</div>
            <div className="text-2xl font-semibold">{metrics.escalateToHuman}</div>
            <div className="text-xs text-muted-foreground mt-1">MCP Brain recommendation</div>
          </div>
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">SLA Breach (24h)</div>
            <div className="text-2xl font-semibold">{metrics.waiting24h}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Oldest pending: {metrics.oldestPending}h
            </div>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-muted/60 bg-background/40 p-1 backdrop-blur">
            <button
              className={cx("h-8 rounded px-3 text-sm", tab === "PENDING" && "bg-foreground text-background")}
              onClick={() => setTab("PENDING")}
            >
              Pending ({counts.pending})
            </button>
            <button
              className={cx("h-8 rounded px-3 text-sm", tab === "APPROVED" && "bg-foreground text-background")}
              onClick={() => setTab("APPROVED")}
            >
              Approved ({counts.approved})
            </button>
            <button
              className={cx("h-8 rounded px-3 text-sm", tab === "REJECTED" && "bg-foreground text-background")}
              onClick={() => setTab("REJECTED")}
            >
              Rejected ({counts.rejected})
            </button>
            <button
              className={cx("h-8 rounded px-3 text-sm", tab === "ALL" && "bg-foreground text-background")}
              onClick={() => setTab("ALL")}
            >
              All ({counts.all})
            </button>
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              className={cx(
                "h-8 rounded-full border px-3 text-xs",
                quick === "HIGH_RISK" ? "border-amber-400/60 bg-amber-400/15" : "border-muted/60 bg-background/40"
              )}
              onClick={() => setQuick(quick === "HIGH_RISK" ? "ALL" : "HIGH_RISK")}
            >
              High risk only
            </button>
            <button
              className={cx(
                "h-8 rounded-full border px-3 text-xs",
                quick === "WAITING_24H" ? "border-rose-400/60 bg-rose-400/15" : "border-muted/60 bg-background/40"
              )}
              onClick={() => setQuick(quick === "WAITING_24H" ? "ALL" : "WAITING_24H")}
            >
              Waiting &gt; 24h
            </button>
            <button
              className={cx(
                "h-8 rounded-full border px-3 text-xs",
                quick === "ARTICLE14" ? "border-orange-400/60 bg-orange-400/15" : "border-muted/60 bg-background/40"
              )}
              onClick={() => setQuick(quick === "ARTICLE14" ? "ALL" : "ARTICLE14")}
            >
              Article 14 Risk
            </button>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search id, user, tool, text, policy refs..."
            className="h-9 w-full max-w-md rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-foreground/30"
          />

          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as any)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All risk</option>
            <option value="ROUTINE">Routine</option>
            <option value="ESCALATE">Escalate</option>
            <option value="BLOCK">Block</option>
          </select>

          <select
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value as "ALL" | SignalLevel)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All signals</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="strong">Strong</option>
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "ALL" | RecommendedAction)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All actions</option>
            <option value="auto_approve">Auto-Approve</option>
            <option value="auto_deny">Auto-Deny</option>
            <option value="auto_review">Auto-Review</option>
            <option value="escalate_to_human">Escalate</option>
          </select>
        </div>

        <div className="mt-6 grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] items-start">
          <div className="rounded-xl border border-muted/60 bg-background/40 backdrop-blur flex min-h-0 flex-col min-w-0 h-[calc(100vh-320px)]">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium w-[120px]">Status</th>
                    <th className="px-3 py-3 text-left font-medium w-[120px]">Risk</th>
                    <th className="px-3 py-3 text-left font-medium hidden md:table-cell w-[180px]">Created</th>
                    <th className="px-3 py-3 text-left font-medium hidden lg:table-cell w-[140px]">User</th>
                    <th className="px-3 py-3 text-left font-medium w-[160px]">Action</th>
                    <th className="px-3 py-3 text-left font-medium w-[100px]">Signal</th>
                    <th className="px-3 py-3 text-right font-medium w-[150px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
                        Loading...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
                        No cases match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const active = c.id === selectedId;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={cx(
                            "cursor-pointer border-t border-muted/40 hover:bg-foreground/5 group",
                            active && "bg-foreground/10"
                          )}
                        >
                          <td className="px-3 py-3 align-top">
                            <span
                              className={cx(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                                badgeClass(c.status)
                              )}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={cx(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                                badgeClass(c.risk_label)
                              )}
                            >
                              {c.risk_label} ({Math.round(c.risk_score)})
                            </span>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground align-top hidden md:table-cell">
                            {new Date(c.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 align-top hidden lg:table-cell">{c.user_name}</td>
                          <td className="px-3 py-3 align-top break-words">
                            {c.recommended_action ? (
                              <span
                                className={cx(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                                  badgeClass(c.recommended_action)
                                )}
                              >
                                {c.recommended_action.replace(/_/g, " ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">{c.tool_name}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {c.signal_level ? (
                              <span
                                className={cx(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                                  badgeClass(c.signal_level)
                                )}
                              >
                                {c.signal_level}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                              <button
                                className="h-7 rounded-md border border-muted/60 px-2 text-xs hover:bg-background/60"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(c.id);
                                }}
                              >
                                Review
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-muted/60 bg-background/40 p-4 backdrop-blur h-[calc(100vh-320px)] min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Case details</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      ID: <span className="font-mono">{selected.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                        badgeClass(selected.status)
                      )}
                    >
                      {selected.status}
                    </span>
                    <span
                      className={cx(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                        badgeClass(selected.risk_label)
                      )}
                    >
                      {selected.risk_label} ({Math.round(selected.risk_score)})
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">

                  {/* A. Signal Level & Recommended Action banner */}
                  {selected.recommended_action && (
                    <div
                      className={cx(
                        "rounded-lg border p-3",
                        selected.recommended_action === "escalate_to_human"
                          ? "border-orange-500/60 bg-orange-500/10"
                          : selected.recommended_action === "auto_approve"
                          ? "border-green-500/60 bg-green-500/10"
                          : selected.recommended_action === "auto_deny"
                          ? "border-red-500/60 bg-red-500/10"
                          : "border-blue-500/60 bg-blue-500/10"
                      )}
                    >
                      <div className="text-sm font-semibold">
                        {selected.recommended_action === "escalate_to_human" &&
                          `⚠️ MCP Brain recommends: Escalate to Human — Signal Level: ${selected.signal_level ?? "—"}`}
                        {selected.recommended_action === "auto_approve" && "✅ MCP Brain recommends: Auto-Approve"}
                        {selected.recommended_action === "auto_deny" && "🚫 MCP Brain recommends: Auto-Deny"}
                        {selected.recommended_action === "auto_review" && "🔄 MCP Brain recommends: Auto-Review"}
                      </div>
                      {selected.policy_rationale && (
                        <div className="mt-1 text-xs text-muted-foreground">{selected.policy_rationale}</div>
                      )}
                    </div>
                  )}

                  {/* G. Free Text (replaces old "User message") */}
                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Messages</div>
                    <div className="mt-2 space-y-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Claimant message</div>
                        <pre className="mt-1 whitespace-pre-wrap text-sm">{selected.claimant_message ?? selected.user_message}</pre>
                      </div>
                      {selected.agent_transcript && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent transcript</div>
                          <pre className="mt-1 whitespace-pre-wrap text-sm">{selected.agent_transcript}</pre>
                        </div>
                      )}
                      {selected.caseworker_note && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Caseworker note</div>
                          <pre className="mt-1 whitespace-pre-wrap text-sm">{selected.caseworker_note}</pre>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Risk rationale</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm">{selected.risk_rationale}</pre>
                  </div>

                  {/* B. Decision Context */}
                  {(selected.decision_type || selected.channel || selected.payment_due_within_days != null || selected.case_age_days != null) && (
                    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">Decision Context</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {selected.decision_type && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Type</span><div>{selected.decision_type}</div></div>
                        )}
                        {selected.channel && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Channel</span><div>{selected.channel}</div></div>
                        )}
                        {selected.payment_due_within_days != null && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Payment due (days)</span><div>{selected.payment_due_within_days ?? "—"}</div></div>
                        )}
                        {selected.case_age_days != null && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Case age (days)</span><div>{selected.case_age_days}</div></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* C. Harm / Rights Signals */}
                  {(selected.signal_level || (selected.signal_types?.length ?? 0) > 0 || selected.signal_source || selected.signal_notes) && (
                    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">Harm / Rights Signals</div>
                      <div className="mt-2 space-y-2">
                        {selected.signal_level && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-24">Level</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", badgeClass(selected.signal_level))}>
                              {selected.signal_level}
                            </span>
                          </div>
                        )}
                        {(selected.signal_types?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-24">Types</span>
                            {selected.signal_types!.map((t) => (
                              <span key={t} className="inline-flex items-center rounded-full border border-muted/60 bg-background/40 px-2 py-0.5 text-xs">{t}</span>
                            ))}
                          </div>
                        )}
                        {selected.signal_source && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-24">Source</span>
                            <span className="text-sm">{selected.signal_source}</span>
                          </div>
                        )}
                        {selected.signal_notes && (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-24">Notes</span>
                            <span className="text-sm">{selected.signal_notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* D. Engagement Barriers */}
                  {(selected.language_barrier || selected.digital_access || selected.disability_accommodation_needed) && (
                    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">Engagement Barriers</div>
                      <div className="mt-2 space-y-2">
                        {selected.language_barrier && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-32">Language barrier</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", barrierClass(selected.language_barrier))}>
                              {selected.language_barrier}
                            </span>
                          </div>
                        )}
                        {selected.digital_access && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-32">Digital access</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", barrierClass(selected.digital_access))}>
                              {selected.digital_access}
                            </span>
                          </div>
                        )}
                        {selected.disability_accommodation_needed && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-32">Disability accom.</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", barrierClass(selected.disability_accommodation_needed))}>
                              {selected.disability_accommodation_needed}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* E. Fraud Signals */}
                  {(selected.fraud_identity_duplicate || selected.fraud_device_reuse || selected.fraud_document_tampering) && (
                    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">Fraud Signals</div>
                      <div className="mt-2 space-y-2">
                        {selected.fraud_identity_duplicate && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-36">Identity duplicate</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", fraudClass(selected.fraud_identity_duplicate))}>
                              {selected.fraud_identity_duplicate}
                            </span>
                          </div>
                        )}
                        {selected.fraud_device_reuse && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-36">Device reuse</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", fraudClass(selected.fraud_device_reuse))}>
                              {selected.fraud_device_reuse}
                            </span>
                          </div>
                        )}
                        {selected.fraud_document_tampering && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-36">Doc. tampering</span>
                            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", fraudClass(selected.fraud_document_tampering))}>
                              {selected.fraud_document_tampering}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* F. Verification Status */}
                  {(selected.idv_status || selected.residency_status || selected.employment_status ||
                    selected.employer_report_status || selected.contributions_status ||
                    selected.income_verification || selected.overlap_check) && (
                    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">Verification Status</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {selected.idv_status && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">IDV</span><div>{selected.idv_status}</div></div>
                        )}
                        {selected.residency_status && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Residency</span><div>{selected.residency_status}</div></div>
                        )}
                        {selected.employment_status && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Employment</span><div>{selected.employment_status}</div></div>
                        )}
                        {selected.separation_reason && (
                          <div className="col-span-2"><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Separation reason</span><div>{selected.separation_reason}</div></div>
                        )}
                        {selected.employer_report_status && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Employer report</span><div>{selected.employer_report_status}</div></div>
                        )}
                        {selected.contributions_status && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Contributions</span><div>{selected.contributions_status}</div></div>
                        )}
                        {selected.income_verification && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Income</span><div>{selected.income_verification}</div></div>
                        )}
                        {selected.overlap_check && (
                          <div><span className="text-[11px] text-muted-foreground uppercase tracking-wide">Overlap check</span><div>{selected.overlap_check}</div></div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Tool args (redacted)</div>
                    {Object.keys(selected.tool_args_redacted ?? {}).length ? (
                      <div className="mt-2 grid gap-3">
                        {Object.entries(selected.tool_args_redacted ?? {}).map(([key, value]) => (
                          <div key={key} className="rounded-lg border border-muted/40 bg-background/40 p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {formatKey(key)}
                            </div>
                            {isPlainObject(value) ? renderObjectGrid(value) : <div className="mt-2">{renderInlineValue(value)}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">None</div>
                    )}
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Policy refs</div>
                    {selected.policy_refs?.length ? (
                      <ul className="mt-2 list-disc pl-5 text-sm">
                        {selected.policy_refs.map((p, i) => (
                          <li key={p + ":" + i} className="break-words">
                            {p}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">None</div>
                    )}
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Audit trail</div>
                    {selected.audit_trail?.length ? (
                      <div className="mt-2 space-y-2 text-sm">
                        {selected.audit_trail.map((a, i) => (
                          <div key={a.ts + ":" + i} className="rounded-md border border-muted/40 p-2">
                            <div className="text-xs text-muted-foreground">
                              {new Date(a.ts).toLocaleString()} - {a.actor} - {a.action}
                            </div>
                            {a.detail ? (
                              <div className="mt-1 whitespace-pre-wrap text-sm">{a.detail}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">No audit entries.</div>
                    )}
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Decision</div>

                    {/* Auto-detected approver identity */}
                    {approverName ? (
                      <div className="mt-3 rounded-md border border-muted/40 bg-background/40 px-3 py-2 text-xs">
                        Deciding as: <strong className="text-foreground">{approverName}</strong>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        Unable to identify your approver account. Log out and back in.
                      </div>
                    )}

                    {/* Required note */}
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Reasoning, next steps, or info request... (required)"
                      className="mt-3 h-24 w-full resize-y rounded-md border border-muted/60 bg-background/40 p-2 text-sm outline-none focus:ring-2 focus:ring-foreground/30"
                    />

                    {approverName && !note.trim() && (
                      <div className="mt-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
                        Enter a note before making a decision.
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={busy || !canDecide}
                        onClick={() => onDecision("APPROVE")}
                        className={cx(
                          "h-9 rounded-md border px-3 text-sm shadow-sm",
                          "border-green-500/60 bg-green-500/20 hover:bg-green-500/30",
                          (busy || !canDecide) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy || !canDecide}
                        onClick={() => onDecision("REJECT")}
                        className={cx(
                          "h-9 rounded-md border px-3 text-sm shadow-sm",
                          "border-red-500/60 bg-red-500/20 hover:bg-red-500/30",
                          (busy || !canDecide) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Reject
                      </button>
                      <button
                        disabled={busy || !canDecide}
                        onClick={() => onDecision("REQUEST_INFO")}
                        className={cx(
                          "h-9 rounded-md border px-3 text-sm shadow-sm",
                          "border-yellow-500/60 bg-yellow-500/20 hover:bg-yellow-500/30",
                          (busy || !canDecide) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Request info
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Select a case to see details.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
