"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeInit from "@/app/_components/ThemeInit";

type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  case_id?: string;
  detail?: string;
};

type ActorFilter = "ALL" | "mcp-gateway" | "risk_engine" | "reviewer" | "system";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function actorBadge(actor: string) {
  if (actor === "mcp-gateway") return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  if (actor === "risk_engine") return "bg-purple-500/20 text-purple-300 border-purple-500/40";
  if (actor === "reviewer") return "bg-green-500/20 text-green-300 border-green-500/40";
  if (actor === "system") return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  return "bg-slate-600/20 text-slate-300 border-slate-500/40";
}

function actionBadge(action: string) {
  if (action.includes("approve") || action.includes("APPROVE"))
    return "bg-green-600/20 text-green-300 border-green-500/40";
  if (action.includes("reject") || action.includes("REJECT") || action.includes("deny"))
    return "bg-red-600/20 text-red-300 border-red-500/40";
  if (action.includes("request_info") || action.includes("NEEDS"))
    return "bg-yellow-500/20 text-yellow-300 border-yellow-400/40";
  if (action.includes("created") || action.includes("scored"))
    return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  if (action.includes("expired") || action.includes("EXPIRED"))
    return "bg-orange-500/20 text-orange-300 border-orange-400/40";
  return "bg-slate-600/20 text-slate-300 border-slate-500/40";
}

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCSV(events: AuditEvent[]): string {
  const header = "Timestamp,Actor,Action,Case ID,Detail";
  const rows = events.map((e) => {
    const detail = (e.detail ?? "").replace(/"/g, '""');
    return `"${e.ts}","${e.actor}","${e.action}","${e.case_id ?? ""}","${detail}"`;
  });
  return [header, ...rows].join("\n");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAudit(): Promise<AuditEvent[]> {
  const res = await fetch("/api/audit", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load audit log");
  return res.json();
}

export default function AuditPage() {
  const [all, setAll] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function refresh() {
    setLoading(true);
    setRefreshing(true);
    setErr(null);
    try {
      const data = await fetchAudit();
      setAll(data);
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

  // Unique actors for the filter dropdown
  const actors = useMemo(() => {
    const set = new Set(all.map((e) => e.actor));
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;

    return all.filter((e) => {
      // Actor filter
      if (actorFilter !== "ALL" && e.actor !== actorFilter) return false;

      // Date range filter
      const eventTime = new Date(e.ts).getTime();
      if (eventTime < from || eventTime > to) return false;

      // Text search
      if (!needle) return true;
      const hay = [e.actor, e.action, e.case_id ?? "", e.detail ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [all, q, actorFilter, dateFrom, dateTo]);

  const counts = useMemo(() => {
    const byActor: Record<string, number> = {};
    all.forEach((e) => {
      byActor[e.actor] = (byActor[e.actor] || 0) + 1;
    });
    return { total: all.length, byActor };
  }, [all]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ThemeInit />

      <div className="mx-auto flex min-h-screen w-full max-w-none flex-col px-4 py-6 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              Immutable Audit Log
            </div>
            <div className="text-sm text-muted-foreground">
              NIST AI RMF compliance trail — read-only, append-only.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/cases"
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60 flex items-center"
            >
              ← Cases
            </a>
            <button
              onClick={() => void refresh()}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-muted/50 bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Total Events</div>
            <div className="text-2xl font-semibold">{counts.total}</div>
          </div>
          {Object.entries(counts.byActor)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([actor, count]) => (
              <div
                key={actor}
                className="rounded-xl border border-muted/50 bg-background/40 p-4"
              >
                <div className="text-xs text-muted-foreground">{actor}</div>
                <div className="text-2xl font-semibold">{count}</div>
              </div>
            ))}
        </div>

        {err && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actor, action, case ID, detail..."
            className="h-9 w-full max-w-sm rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-foreground/30"
          />

          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value as ActorFilter)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-2 text-sm shadow-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-2 text-sm shadow-sm outline-none"
            />
          </div>

          {/* Export buttons */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const json = JSON.stringify(filtered, null, 2);
                const date = new Date().toISOString().slice(0, 10);
                downloadFile(json, `atlas-audit-log-${date}.json`, "application/json");
              }}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60"
            >
              Export JSON
            </button>
            <button
              onClick={() => {
                const csv = toCSV(filtered);
                const date = new Date().toISOString().slice(0, 10);
                downloadFile(csv, `atlas-audit-log-${date}.csv`, "text/csv");
              }}
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-1 text-xs text-muted-foreground">
          Showing {filtered.length} of {all.length} events
        </div>

        {/* Audit Table */}
        <div className="mt-4 rounded-xl border border-muted/60 bg-background/40 backdrop-blur flex min-h-0 flex-col min-w-0 h-[calc(100vh-340px)]">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-muted/60 text-muted-foreground sticky top-0 bg-background/80 backdrop-blur z-10">
                <tr>
                  <th className="px-3 py-3 text-left font-medium w-[200px]">
                    Timestamp
                  </th>
                  <th className="px-3 py-3 text-left font-medium w-[130px]">
                    Actor
                  </th>
                  <th className="px-3 py-3 text-left font-medium w-[180px]">
                    Action
                  </th>
                  <th className="px-3 py-3 text-left font-medium w-[140px]">
                    Case ID
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-muted-foreground"
                      colSpan={5}
                    >
                      Loading audit log...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-muted-foreground"
                      colSpan={5}
                    >
                      No events match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t border-muted/40 hover:bg-foreground/5"
                    >
                      <td className="px-3 py-3 text-muted-foreground align-top font-mono text-xs">
                        {new Date(e.ts).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={cx(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                            actorBadge(e.actor)
                          )}
                        >
                          {e.actor}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={cx(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                            actionBadge(e.action)
                          )}
                        >
                          {formatAction(e.action)}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {e.case_id ? (
                          <a
                            href="/cases"
                            className="font-mono text-xs text-blue-400 hover:underline"
                          >
                            {e.case_id}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground align-top whitespace-normal break-words text-xs">
                        {e.detail ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
