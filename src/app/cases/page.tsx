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

      <div className="mx-auto flex min-h-screen max-w-screen-2xl flex-col px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-2xl font-semibold">{counts.pending}</div>
          </div>
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Escalated</div>
            <div className="text-2xl font-semibold">{metrics.escalated}</div>
          </div>
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">SLA 24h breach</div>
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
        </div>

        <div className="mt-6 grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-muted/60 bg-background/40 backdrop-blur flex min-h-0 flex-col min-w-0">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium w-[120px]">Status</th>
                    <th className="px-3 py-3 text-left font-medium w-[120px]">Risk</th>
                    <th className="px-3 py-3 text-left font-medium hidden md:table-cell w-[180px]">Created</th>
                    <th className="px-3 py-3 text-left font-medium hidden lg:table-cell w-[140px]">User</th>
                    <th className="px-3 py-3 text-left font-medium w-[180px]">Tool</th>
                    <th className="px-3 py-3 text-left font-medium">Message</th>
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
                          <td className="px-3 py-3 align-top break-words">{c.tool_name}</td>
                          <td className="px-3 py-3 text-muted-foreground align-top whitespace-normal break-words">
                            {c.user_message}
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
                                Open
                              </button>
                              <button
                                className="h-7 rounded-md border border-green-500/60 bg-green-500/15 px-2 text-xs hover:bg-green-500/25"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setSelectedId(c.id);
                                  setBusy(true);
                                  setErr(null);
                                  try {
                                    await decideCase(c.id, "APPROVE", "");
                                    await refresh();
                                  } catch (err: any) {
                                    setErr(err?.message ?? "Failed to submit decision");
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                disabled={busy}
                              >
                                Approve
                              </button>
                              <button
                                className="h-7 rounded-md border border-red-500/60 bg-red-500/15 px-2 text-xs hover:bg-red-500/25"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setSelectedId(c.id);
                                  setBusy(true);
                                  setErr(null);
                                  try {
                                    await decideCase(c.id, "REJECT", "");
                                    await refresh();
                                  } catch (err: any) {
                                    setErr(err?.message ?? "Failed to submit decision");
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                disabled={busy}
                              >
                                Reject
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

          <div className="rounded-xl border border-muted/60 bg-background/40 p-4 backdrop-blur h-full overflow-auto min-w-0">
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

                <div className="mt-4 grid gap-4">
                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">User message</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm">{selected.user_message}</pre>
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Risk rationale</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm">{selected.risk_rationale}</pre>
                  </div>

                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Tool args (redacted)</div>
                    <pre className="mt-2 overflow-auto text-xs">
                      {JSON.stringify(selected.tool_args_redacted ?? {}, null, 2)}
                    </pre>
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
                </div>

                <div className="mt-4 rounded-lg border border-muted/60 bg-background/30 p-3">
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

                <div className="mt-4 rounded-lg border border-muted/60 bg-background/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Decision note</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reasoning, next steps, or info request..."
                    className="mt-2 h-24 w-full resize-y rounded-md border border-muted/60 bg-background/40 p-2 text-sm outline-none focus:ring-2 focus:ring-foreground/30"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => onDecision("APPROVE")}
                      className={cx(
                        "h-9 rounded-md border px-3 text-sm shadow-sm",
                        "border-green-500/60 bg-green-500/20 hover:bg-green-500/30",
                        busy && "opacity-50"
                      )}
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDecision("REJECT")}
                      className={cx(
                        "h-9 rounded-md border px-3 text-sm shadow-sm",
                        "border-red-500/60 bg-red-500/20 hover:bg-red-500/30",
                        busy && "opacity-50"
                      )}
                    >
                      Reject
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDecision("REQUEST_INFO")}
                      className={cx(
                        "h-9 rounded-md border px-3 text-sm shadow-sm",
                        "border-yellow-500/60 bg-yellow-500/20 hover:bg-yellow-500/30",
                        busy && "opacity-50"
                      )}
                    >
                      Request info
                    </button>
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
