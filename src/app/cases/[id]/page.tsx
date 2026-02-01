import Link from "next/link";
import { notFound } from "next/navigation";

type RiskLabel = "ROUTINE" | "ESCALATE" | "BLOCK";
type CaseStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "CLOSED";

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

async function getCase(id: string): Promise<CaseRecord | null> {
  const res = await fetch(`http://localhost:3000/api/cases/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load case");
  return res.json();
}

function badge(label: string) {
  if (label === "BLOCK") return "bg-red-600/90 text-white border-red-500/60";
  if (label === "ESCALATE") return "bg-orange-500/90 text-white border-orange-400/60";
  if (label === "APPROVED") return "bg-green-600/90 text-white border-green-500/60";
  if (label === "REJECTED") return "bg-red-700/90 text-white border-red-600/60";
  if (label === "PENDING_REVIEW") return "bg-slate-700/70 text-slate-100 border-slate-600/60";
  if (label === "NEEDS_INFO") return "bg-yellow-500/90 text-black border-yellow-400/60";
  return "bg-slate-600/60 text-slate-100 border-slate-500/60";
}

export default async function CaseDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  const c = await getCase(id);
  if (!c) return notFound();

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Case</div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.id}</h1>
            <div className="text-xs text-muted-foreground">Created: {c.created_at}</div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/cases"
              className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm hover:bg-background"
            >
              Back to Inbox
            </Link>
            <Link
              href="/"
              className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm hover:bg-background"
            >
              Home
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/40 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " + badge(c.risk_label)}>
              {c.risk_label}
            </span>
            <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold " + badge(c.status)}>
              {c.status}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-1 text-xs font-semibold">
              Score: <span className="ml-1 tabular-nums">{c.risk_score}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/50 p-4 text-sm space-y-2">
              <div>
                <span className="text-muted-foreground">User:</span> {c.user_name}
              </div>
              <div>
                <span className="text-muted-foreground">Tool:</span>{" "}
                <span className="font-mono text-xs">{c.tool_name}</span>
              </div>
              <div className="break-words">
                <span className="text-muted-foreground">User message:</span> {c.user_message}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-gradient-to-b from-foreground/5 to-transparent p-4 text-sm space-y-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Risk rationale</div>
                <div className="mt-1 whitespace-pre-wrap break-words">{c.risk_rationale}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground">Policy refs</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(c.policy_refs ?? []).map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-1 text-xs font-semibold"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="text-sm font-semibold">Tool args (redacted)</div>
            <pre className="mt-2 overflow-auto rounded-md bg-black/30 p-3 text-xs leading-relaxed">
{JSON.stringify(c.tool_args_redacted ?? {}, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="text-sm font-semibold">Audit trail</div>
            <div className="mt-3 space-y-2">
              {(c.audit_trail ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No audit entries yet.</div>
              ) : (
                c.audit_trail.map((h, idx) => (
                  <div
                    key={`${h.ts}-${idx}`}
                    className="rounded-md border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-semibold">{h.ts}</div>
                      <div className="text-muted-foreground">
                        <span className="font-mono">{h.actor}</span> -{" "}
                        <span className="font-mono">{h.action}</span>
                      </div>
                    </div>
                    {h.detail ? (
                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {h.detail}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
