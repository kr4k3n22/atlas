"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ThemeInit from "@/app/_components/ThemeInit";
import { APPROVERS } from "@/lib/approvers";
import { createClient } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { playNotificationChime } from "@/lib/notificationSound";
import { loadSettings, onSettingsChange } from "@/lib/userSettings";

type RiskLabel = "ROUTINE" | "ESCALATE" | "BLOCK";
type CaseStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "CLOSED";
type SignalLevel = "none" | "low" | "moderate" | "strong" | "medium" | "high" | "weak";
type RecommendedAction =
  | "auto_approve"
  | "auto_deny"
  | "auto_review"
  | "escalate_to_human"
  | "request_info"
  | "freeze_payment"
  | "refer_fraud";

type HarmRightsSignals = {
  signal_level: SignalLevel;
  signal_type?: string[];
  signal_source?: string;
  notes?: string;
};

type DecisionContext = {
  decision_type?: string;
  payment_due_within_days?: number | null;
  case_age_days?: number;
  channel?: string;
};

type FreeText = {
  claimant_message?: string;
  agent_chat_transcript_excerpt?: string;
  caseworker_note?: string;
};

type EngagementBarriers = {
  language_barrier?: string;
  digital_access?: string;
  disability_accommodation_needed?: string;
};

type FraudSignals = {
  identity_duplicate_match?: string;
  device_or_address_reuse?: string;
  document_tampering?: string;
};

type StructuredInputs = {
  idv_status?: string;
  residency_status?: string;
  employment_status_declared?: string;
  separation_reason_declared?: string;
  employer_report_status?: string;
  contributions_record_status?: string;
  earnings_record_last_30d?: string;
  income_verification?: string;
  other_benefits_overlap_check?: string;
  bank_data_access?: string;
  docs_status?: {
    docs_requested?: string[];
    docs_received?: string[];
    docs_quality?: string;
  };
  engagement_barriers?: EngagementBarriers;
  fraud_signals?: FraudSignals;
};

type CaseLabels = {
  label?: string;
  recommended_action?: RecommendedAction;
  policy_rationale?: string;
};

type ToolArgs = {
  decision_context?: DecisionContext;
  structured_inputs?: StructuredInputs;
  free_text?: FreeText;
  harm_rights_signals?: HarmRightsSignals;
  labels?: CaseLabels;
  [key: string]: unknown;
};

type CaseRecord = {
  id: string;
  user_name: string;
  user_message: string;
  tool_name: string;
  tool_args_redacted: ToolArgs;
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

function fmtTs(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  } catch {
    return iso;
  }
}

function badgeClass(label: string) {
  if (label === "BLOCK") return "bg-red-600/90 text-white border-red-500/40";
  if (label === "ESCALATE") return "bg-orange-500/90 text-white border-orange-400/40";
  if (label === "APPROVED") return "bg-green-600/90 text-white border-green-500/40";
  if (label === "REJECTED") return "bg-red-700/90 text-white border-red-600/40";
  if (label === "PENDING_REVIEW") return "bg-slate-700/70 text-slate-100 border-slate-600/40";
  if (label === "NEEDS_INFO") return "bg-yellow-500/90 text-black border-yellow-400/40";
  if (label === "NEEDS_MORE_INFO") return "bg-yellow-500/90 text-black border-yellow-400/40";
  return "bg-slate-600/60 text-slate-100 border-slate-500/40";
}

function normalizeSignalLevel(level?: string): SignalLevel {
  if (!level) return "none";
  if (level === "weak") return "low";
  if (level === "medium" || level === "high") return level as SignalLevel;
  return level as SignalLevel;
}

function signalLevelBadge(rawLevel?: string) {
  const level = normalizeSignalLevel(rawLevel);
  if (level === "strong" || level === "high")
    return { cls: "bg-red-600/90 text-white border-red-500/60", label: level };
  if (level === "moderate" || level === "medium")
    return { cls: "bg-orange-500/90 text-white border-orange-400/60", label: level };
  if (level === "low" || level === "weak")
    return { cls: "bg-yellow-500/90 text-black border-yellow-400/60", label: "low" };
  return { cls: "bg-slate-600/60 text-slate-100 border-slate-500/60", label: "none" };
}

function recommendedActionBadge(action?: string) {
  if (!action) return { cls: "bg-slate-600/60 text-slate-100 border-slate-500/60", label: "—" };
  if (action === "auto_approve")
    return { cls: "bg-green-600/90 text-white border-green-500/60", label: "✅ Auto-Approve" };
  if (action === "auto_deny")
    return { cls: "bg-red-600/90 text-white border-red-500/60", label: "🚫 Auto-Deny" };
  if (action === "escalate_to_human")
    return { cls: "bg-orange-500/90 text-white border-orange-400/60", label: "⚠️ Escalate" };
  if (action === "auto_review" || action === "request_info")
    return { cls: "bg-blue-600/90 text-white border-blue-500/60", label: "🔄 Auto-Review" };
  if (action === "refer_fraud")
    return { cls: "bg-red-700/90 text-white border-red-600/60", label: "🚫 Refer Fraud" };
  if (action === "freeze_payment")
    return { cls: "bg-red-800/90 text-white border-red-700/60", label: "🚫 Freeze Payment" };
  return { cls: "bg-slate-600/60 text-slate-100 border-slate-500/60", label: action };
}

function trafficLight(
  value: string | undefined,
  map: Partial<Record<string, "green" | "yellow" | "red">>
): string {
  const v = (value ?? "").toLowerCase();
  const color = map[v] ?? "yellow";
  if (color === "green") return "text-green-400";
  if (color === "red") return "text-red-400";
  return "text-yellow-400";
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

// ──────────────────────────────────────────────
// Sub-panels for the detail view
// ──────────────────────────────────────────────

function RecommendationBanner({ labels, rationale }: { labels?: CaseLabels; rationale?: string }) {
  if (!labels?.recommended_action) return null;
  const { cls, label } = recommendedActionBadge(labels.recommended_action);
  const dangerActions = new Set<RecommendedAction>(["auto_deny", "refer_fraud", "freeze_payment"]);
  const bannerBg =
    labels.recommended_action === "auto_approve"
      ? "border-green-500/60 bg-green-500/15"
      : dangerActions.has(labels.recommended_action)
        ? "border-red-500/60 bg-red-500/15"
        : labels.recommended_action === "escalate_to_human"
          ? "border-orange-500/60 bg-orange-500/15"
          : "border-blue-500/60 bg-blue-500/15";

  return (
    <div className={cx("rounded-lg border p-3", bannerBg)}>
      <div className="flex items-center gap-2">
        <span className={cx("inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase", cls)}>
          {label}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">MCP Brain Recommendation</span>
      </div>
      {(labels.policy_rationale || rationale) && (
        <div className="mt-2 text-sm">{labels.policy_rationale || rationale}</div>
      )}
    </div>
  );
}

function DecisionContextPanel({ ctx }: { ctx?: DecisionContext }) {
  if (!ctx) return null;
  const paymentDue = ctx.payment_due_within_days;
  const paymentUrgent = paymentDue !== null && paymentDue !== undefined && paymentDue <= 7;
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Decision Context</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {ctx.decision_type && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Type</div>
            <div className="capitalize">{ctx.decision_type.replace(/_/g, " ")}</div>
          </div>
        )}
        {ctx.channel && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Channel</div>
            <div className="capitalize">{ctx.channel}</div>
          </div>
        )}
        {paymentDue !== undefined && paymentDue !== null && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment Due</div>
            <div className={cx("font-medium", paymentUrgent ? "text-red-400" : "")}>
              {paymentDue} days{paymentUrgent ? " ⚠️" : ""}
            </div>
          </div>
        )}
        {ctx.case_age_days !== undefined && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Case Age</div>
            <div>{ctx.case_age_days} days</div>
          </div>
        )}
      </div>
    </div>
  );
}

function HarmSignalsPanel({ signals }: { signals?: HarmRightsSignals }) {
  if (!signals) return null;
  const { cls, label } = signalLevelBadge(signals.signal_level);
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Harm / Rights Signals</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cx("inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase", cls)}>
          {label}
        </span>
        {signals.signal_source && (
          <span className="text-xs text-muted-foreground">Source: {signals.signal_source}</span>
        )}
      </div>
      {signals.signal_type && signals.signal_type.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {signals.signal_type.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded border border-muted/60 bg-background/40 px-2 py-0.5 text-[11px]"
            >
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
      {signals.notes && (
        <div className="mt-2 text-sm text-muted-foreground">{signals.notes}</div>
      )}
    </div>
  );
}

function EngagementBarriersPanel({ barriers }: { barriers?: EngagementBarriers }) {
  if (!barriers) return null;
  const items = [
    {
      label: "Language Barrier",
      value: barriers.language_barrier,
      map: { none: "green" as const, some: "yellow" as const, significant: "red" as const },
    },
    {
      label: "Digital Access",
      value: barriers.digital_access,
      map: { good: "green" as const, limited: "yellow" as const, none: "red" as const },
    },
    {
      label: "Disability Accommodation",
      value: barriers.disability_accommodation_needed,
      map: { no: "green" as const, unknown: "yellow" as const, yes: "red" as const },
    },
  ];
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Engagement Barriers</div>
      <div className="mt-2 space-y-1">
        {items.map(({ label, value, map }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className={cx("text-base", trafficLight(value, map))}>●</span>
            <span className="w-40 text-xs text-muted-foreground">{label}</span>
            <span className="capitalize">{value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FraudSignalsPanel({ fraud }: { fraud?: FraudSignals }) {
  if (!fraud) return null;
  const items = [
    { label: "Identity Duplicate Match", value: fraud.identity_duplicate_match },
    { label: "Device / Address Reuse", value: fraud.device_or_address_reuse },
    { label: "Document Tampering", value: fraud.document_tampering },
  ];
  const colorMap = { none: "green" as const, possible: "yellow" as const, confirmed: "red" as const };
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Fraud Signals</div>
      <div className="mt-2 space-y-1">
        {items.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className={cx("text-base", trafficLight(value, colorMap))}>●</span>
            <span className="w-48 text-xs text-muted-foreground">{label}</span>
            <span className="capitalize">{value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificationStatusPanel({ inputs }: { inputs?: StructuredInputs }) {
  if (!inputs) return null;
  const fields: [string, string | undefined][] = [
    ["IDV Status", inputs.idv_status],
    ["Residency Status", inputs.residency_status],
    ["Employment Status", inputs.employment_status_declared],
    ["Separation Reason", inputs.separation_reason_declared],
    ["Employer Report", inputs.employer_report_status],
    ["Contributions Record", inputs.contributions_record_status],
    ["Income Verification", inputs.income_verification],
    ["Benefits Overlap Check", inputs.other_benefits_overlap_check],
    ["Earnings Record (30d)", inputs.earnings_record_last_30d],
    ["Bank Data Access", inputs.bank_data_access],
  ];
  const docs = inputs.docs_status;
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Verification Status</div>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {fields.map(([label, value]) =>
          value ? (
            <div key={label} className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 text-sm">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="capitalize">{value.replace(/_/g, " ")}</div>
            </div>
          ) : null
        )}
        {docs && (
          <>
            {docs.docs_requested && docs.docs_requested.length > 0 && (
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 text-sm">
                <div className="text-[11px] text-muted-foreground">Docs Requested</div>
                <div>{docs.docs_requested.join(", ")}</div>
              </div>
            )}
            {docs.docs_received && docs.docs_received.length > 0 && (
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 text-sm">
                <div className="text-[11px] text-muted-foreground">Docs Received</div>
                <div>{docs.docs_received.join(", ")}</div>
              </div>
            )}
            {docs.docs_quality && (
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 text-sm">
                <div className="text-[11px] text-muted-foreground">Docs Quality</div>
                <div className="capitalize">{docs.docs_quality.replace(/_/g, " ")}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FreeTextPanel({ freeText, userMessage }: { freeText?: FreeText; userMessage?: string }) {
  const claimant = freeText?.claimant_message || userMessage;
  const transcript = freeText?.agent_chat_transcript_excerpt;
  const note = freeText?.caseworker_note;
  return (
    <div className="rounded-lg border border-muted/60 bg-background/30 p-3 space-y-3">
      {claimant && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Claimant Message</div>
          <pre className="mt-1 whitespace-pre-wrap text-sm">{claimant}</pre>
        </div>
      )}
      {transcript && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Agent Chat Transcript</div>
          <pre className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{transcript}</pre>
        </div>
      )}
      {note && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Caseworker Note</div>
          <pre className="mt-1 whitespace-pre-wrap text-sm">{note}</pre>
        </div>
      )}
      {!claimant && !transcript && !note && (
        <div className="text-sm text-muted-foreground">No free text available.</div>
      )}
    </div>
  );
}

/** Render a string that may contain a JSON object as nicely formatted fields. */
function JsonOrTextDisplay({ value, className }: { value: string; className?: string }) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return (
        <dl className={`mt-2 space-y-1 text-sm ${className ?? ""}`}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-muted-foreground capitalize shrink-0">
                {k.replace(/_/g, " ")}:
              </dt>
              <dd className="break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
      );
    }
  } catch {
    // Not pure JSON — fall through
  }
  return <pre className={`mt-2 whitespace-pre-wrap text-sm ${className ?? ""}`}>{value}</pre>;
}

// ──────────────────────────────────────────────
// Conversation summary sub-panel
// ──────────────────────────────────────────────

function ConversationSummaryPanel({
  loading,
  summary,
  messages,
}: {
  loading: boolean;
  summary: string | null;
  messages: Array<{ role: string; content: string; created_at: string }>;
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (loading) {
    return (
      <div className="rounded-lg border border-muted/60 bg-background/30 p-3 animate-pulse">
        <div className="text-xs font-semibold text-muted-foreground">Conversation summary</div>
        <div className="mt-2 h-4 w-3/4 rounded bg-muted/40" />
        <div className="mt-1 h-4 w-1/2 rounded bg-muted/40" />
      </div>
    );
  }

  if (!summary) return null;

  // Lightweight markdown: **bold** and bullet lines
  function renderSummary(text: string) {
    return text.split("\n").map((line, i) => {
      const isBullet = /^[-•*]\s/.test(line.trim());
      const parts = line.replace(/\*\*(.+?)\*\*/g, "|||$1|||").split("|||");
      const rendered = parts.map((p, j) =>
        j % 2 === 1 ? <strong key={j}>{p}</strong> : p
      );
      if (isBullet) {
        return (
          <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
            {rendered}
          </li>
        );
      }
      if (!line.trim()) return <div key={i} className="h-2" />;
      return (
        <p key={i} className="text-sm leading-relaxed">
          {rendered}
        </p>
      );
    });
  }

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch { return ""; }
  }

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-blue-400">✦ Conversation summary</div>
      </div>

      <div className="space-y-1">{renderSummary(summary)}</div>

      {messages.length > 0 && (
        <div>
          <button
            onClick={() => setTranscriptOpen((o) => !o)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {transcriptOpen ? "▾" : "▸"} {transcriptOpen ? "Hide" : "Show"} full transcript ({messages.length} messages)
          </button>

          {transcriptOpen && (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-2 pr-1">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cx(
                    "rounded-md px-3 py-2 text-xs max-w-[90%]",
                    m.role === "user"
                      ? "ml-0 bg-muted/40 border border-muted/60"
                      : "ml-auto bg-blue-500/10 border border-blue-500/20"
                  )}
                >
                  <div className="text-[10px] text-muted-foreground mb-1">
                    {m.role === "user" ? "Claimant" : "Atlas"} {m.created_at ? `· ${fmtTime(m.created_at)}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

export default function CasesPage() {
  const [all, setAll] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | "connecting"
  >("connecting");
  const realtimeStatusRef = useRef(realtimeStatus);
  const soundEnabledRef = useRef(loadSettings().notificationSound);

  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<"ALL" | RiskLabel>("ALL");
  const [signalFilter, setSignalFilter] = useState<"ALL" | SignalLevel>("ALL");
  const [actionFilter, setActionFilter] = useState<"ALL" | RecommendedAction>("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [approverSlug, setApproverSlug] = useState("");
  const [approverName, setApproverName] = useState("");
  const [busy, setBusy] = useState(false);
  const [convSummary, setConvSummary] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<Array<{ role: string; content: string; created_at: string }>>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const now = Date.now();
  const hoursSince = (iso: string) =>
    Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60));

  function getCaseSignalLevel(c: CaseRecord): SignalLevel {
    return normalizeSignalLevel(
      (c.tool_args_redacted?.harm_rights_signals as HarmRightsSignals | undefined)?.signal_level
    );
  }

  function getCaseRecommendedAction(c: CaseRecord): RecommendedAction | undefined {
    return (c.tool_args_redacted?.labels as CaseLabels | undefined)?.recommended_action;
  }

  function isArticle14Risk(c: CaseRecord): boolean {
    const args = c.tool_args_redacted;
    const label = (args?.labels as CaseLabels | undefined)?.label;
    const signalLevel = normalizeSignalLevel(
      (args?.harm_rights_signals as HarmRightsSignals | undefined)?.signal_level
    );
    return label === "ARTICLE14_RISK" || (signalLevel !== "none");
  }

  // Auto-detect the logged-in approver from Supabase Auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) return;

      const email = user.email?.toLowerCase() ?? "";
      const displayName = user.user_metadata?.displayName ?? "";

      const match = APPROVERS.find((a) => a.email.toLowerCase() === email);
      if (match) {
        setApproverSlug(match.slug);
        setApproverName(match.fullName);
      } else if (displayName) {
        setApproverSlug(displayName);
        setApproverName(displayName);
      }
    });
  }, []);

  // Fetch conversation summary whenever the selected case changes
  useEffect(() => {
    if (!selectedId) { setConvSummary(null); setConvMessages([]); return; }
    setSummaryLoading(true);
    setConvSummary(null);
    setConvMessages([]);
    fetch(`/api/cases/${encodeURIComponent(selectedId)}/summary`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setConvSummary(data.summary ?? null);
          setConvMessages(data.messages ?? []);
        }
      })
      .catch(() => { })
      .finally(() => setSummaryLoading(false));
  }, [selectedId]);

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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the sound-enabled ref in sync when the user changes settings.
  useEffect(() => {
    return onSettingsChange(() => {
      soundEnabledRef.current = loadSettings().notificationSound;
    });
  }, []);

  // NOTE: Realtime requires the `approval_queue` table to have Realtime enabled
  // in the Supabase dashboard (Database → Replication → Realtime).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cases-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "approval_queue" },
        (payload) => {
          const newCase = payload.new as CaseRecord;
          setAll((prev) => {
            if (prev.some((c) => c.id === newCase.id)) return prev;
            return [newCase, ...prev];
          });
          if (newCase.risk_label === "BLOCK") {
            toast.error("🚨 New high-risk case requires review", {
              description: `Case ${newCase.id} has been flagged as BLOCK`,
            });
            if (soundEnabledRef.current) playNotificationChime(true);
          } else if (newCase.risk_label === "ESCALATE") {
            toast.warning("⚠️ New escalated case requires review", {
              description: `Case ${newCase.id} has been escalated`,
            });
            if (soundEnabledRef.current) playNotificationChime(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "approval_queue" },
        (payload) => {
          const updated = payload.new as CaseRecord;
          setAll((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "approval_queue" },
        (payload) => {
          const deleted = payload.old as { id: string };
          setAll((prev) => prev.filter((c) => c.id !== deleted.id));
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(
          status as "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED"
        );
        realtimeStatusRef.current = status as
          | "SUBSCRIBED"
          | "CHANNEL_ERROR"
          | "TIMED_OUT"
          | "CLOSED";
      });

    // Polling fallback: always poll every 10 s as a safety net even when Realtime appears connected.
    const pollInterval = setInterval(() => {
      fetchCases()
        .then((data) => {
          setAll((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newCases = data.filter((c) => !existingIds.has(c.id));
            // Update status of existing cases detected via polling
            const updated = prev.map((existing) => {
              const fresh = data.find((d) => d.id === existing.id);
              return fresh && fresh.status !== existing.status ? fresh : existing;
            });
            if (newCases.length === 0) return updated;
            for (const nc of newCases) {
              if (nc.risk_label === "BLOCK") {
                toast.error("🚨 New high-risk case requires review", {
                  description: `Case ${nc.id} has been flagged as BLOCK`,
                });
                if (soundEnabledRef.current) playNotificationChime(true);
                break;
              } else if (nc.risk_label === "ESCALATE") {
                toast.warning("⚠️ New escalated case requires review", {
                  description: `Case ${nc.id} has been escalated`,
                });
                if (soundEnabledRef.current) playNotificationChime(false);
                break;
              }
            }
            return [...newCases, ...updated];
          });
        })
        .catch(() => {
          // Silently ignore poll errors
        });
    }, 10_000);

    return () => {
      clearInterval(pollInterval);
      void supabase.removeChannel(channel);
    };
  }, []);

  const counts = useMemo(() => {
    const pending = all.filter((c) => c.status === "PENDING_REVIEW").length;
    const approved = all.filter((c) => c.status === "APPROVED").length;
    const rejected = all.filter((c) => c.status === "REJECTED").length;
    return { pending, approved, rejected, all: all.length };
  }, [all]);

  const metrics = useMemo(() => {
    const article14 = all.filter(isArticle14Risk).length;
    const escalateToHuman = all.filter(
      (c) => getCaseRecommendedAction(c) === "escalate_to_human"
    ).length;
    const waiting24h = all.filter(
      (c) => c.status === "PENDING_REVIEW" && hoursSince(c.created_at) >= 24
    ).length;
    const oldestPending = all
      .filter((c) => c.status === "PENDING_REVIEW")
      .reduce((max, c) => Math.max(max, hoursSince(c.created_at)), 0);

    return { article14, escalateToHuman, waiting24h, oldestPending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, now]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return all
      .filter((c) => {
        if (tab === "PENDING" && c.status !== "PENDING_REVIEW") return false;
        if (tab === "APPROVED" && c.status !== "APPROVED") return false;
        if (tab === "REJECTED" && c.status !== "REJECTED") return false;
        if (risk !== "ALL" && c.risk_label !== risk) return false;

        if (signalFilter !== "ALL") {
          const sl = getCaseSignalLevel(c);
          const norm = normalizeSignalLevel(signalFilter);
          if (sl !== norm) return false;
        }

        if (actionFilter !== "ALL") {
          if (getCaseRecommendedAction(c) !== actionFilter) return false;
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, risk, q, signalFilter, actionFilter, now]);

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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to submit decision");
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
              className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm backdrop-blur hover:bg-background/60 flex items-center gap-2"
              title={`Realtime: ${realtimeStatus}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${realtimeStatus === "SUBSCRIBED"
                  ? "bg-green-500"
                  : realtimeStatus === "connecting"
                    ? "bg-yellow-400"
                    : "bg-red-500"
                  }`}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>



        {err ? (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {/* Toolbar */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {/* Status tabs */}
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

          {/* Search */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search id, user, tool, text, policy refs..."
            className="h-9 w-full max-w-xs rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-foreground/30"
          />

          {/* Risk filter */}
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as "ALL" | RiskLabel)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All risk</option>
            <option value="ROUTINE">Routine</option>
            <option value="ESCALATE">Escalate</option>
            <option value="BLOCK">Block</option>
          </select>

          {/* Signal level filter */}
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

          {/* Recommended action filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "ALL" | RecommendedAction)}
            className="h-9 rounded-md border border-muted/60 bg-background/40 px-3 text-sm shadow-sm outline-none"
          >
            <option value="ALL">All actions</option>
            <option value="auto_approve">Auto-Approve</option>
            <option value="auto_deny">Auto-Deny</option>
            <option value="auto_review">Auto-Review</option>
            <option value="escalate_to_human">Escalate to Human</option>
          </select>
        </div>

        {/* Main grid: table + detail */}
        <div className="mt-6 grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] items-start">
          {/* Cases table */}
          <div className="rounded-xl border border-muted/60 bg-background/40 backdrop-blur flex min-h-0 flex-col min-w-0 h-[calc(100vh-320px)]">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium w-[110px]">Status</th>
                    <th className="px-3 py-3 text-left font-medium w-[110px]">Risk</th>
                    <th className="px-3 py-3 text-left font-medium w-[130px]">Action</th>
                    <th className="px-3 py-3 text-left font-medium w-[90px]">Signal</th>
                    <th className="px-3 py-3 text-left font-medium hidden md:table-cell w-[160px]">Created</th>
                    <th className="px-3 py-3 text-left font-medium hidden lg:table-cell w-[120px]">User</th>
                    <th className="px-3 py-3 text-left font-medium">Message</th>
                    <th className="px-3 py-3 text-right font-medium w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={8}>
                        Loading...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={8}>
                        No cases match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const active = c.id === selectedId;
                      const actionInfo = recommendedActionBadge(getCaseRecommendedAction(c));
                      const signalInfo = signalLevelBadge(getCaseSignalLevel(c));
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
                                "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                                badgeClass(c.status)
                              )}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={cx(
                                "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                                badgeClass(c.risk_label)
                              )}
                            >
                              {c.risk_label}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={cx(
                                "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                                actionInfo.cls
                              )}
                            >
                              {actionInfo.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={cx(
                                "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                                signalInfo.cls
                              )}
                            >
                              {signalInfo.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground align-top hidden md:table-cell">
                            {fmtTs(c.created_at)}
                          </td>
                          <td className="px-3 py-3 align-top hidden lg:table-cell">{c.user_name}</td>
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

          {/* Detail panel */}
          <div className="rounded-xl border border-muted/60 bg-background/40 p-4 backdrop-blur h-[calc(100vh-320px)] min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Case details</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      ID: <span className="font-mono">{selected.id}</span>
                    </div>
                    {typeof selected.tool_args_redacted?.gateway_event_id === "string" && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Inngest Event ID:</span>
                        <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-400">
                          {selected.tool_args_redacted.gateway_event_id as string}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                        badgeClass(selected.status)
                      )}
                    >
                      {selected.status}
                    </span>
                    <span
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
                        badgeClass(selected.risk_label)
                      )}
                    >
                      {selected.risk_label}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                  {/* 1. MCP Brain Recommendation Banner */}
                  <RecommendationBanner
                    labels={selected.tool_args_redacted?.labels as CaseLabels | undefined}
                    rationale={selected.risk_rationale}
                  />

                  {/* 2. Decision Context */}
                  <DecisionContextPanel
                    ctx={selected.tool_args_redacted?.decision_context as DecisionContext | undefined}
                  />

                  {/* 3. Harm / Rights Signals */}
                  <HarmSignalsPanel
                    signals={selected.tool_args_redacted?.harm_rights_signals as HarmRightsSignals | undefined}
                  />

                  {/* 4. Engagement Barriers */}
                  <EngagementBarriersPanel
                    barriers={
                      (selected.tool_args_redacted?.structured_inputs as StructuredInputs | undefined)
                        ?.engagement_barriers
                    }
                  />

                  {/* 5. Fraud Signals */}
                  <FraudSignalsPanel
                    fraud={
                      (selected.tool_args_redacted?.structured_inputs as StructuredInputs | undefined)
                        ?.fraud_signals
                    }
                  />

                  {/* 6. Verification Status */}
                  <VerificationStatusPanel
                    inputs={selected.tool_args_redacted?.structured_inputs as StructuredInputs | undefined}
                  />

                  {/* 7. Free text split into 3 sections */}
                  <FreeTextPanel
                    freeText={selected.tool_args_redacted?.free_text as FreeText | undefined}
                    userMessage={selected.user_message}
                  />

                  {/* 8. Conversation summary */}
                  <ConversationSummaryPanel
                    loading={summaryLoading}
                    summary={convSummary}
                    messages={convMessages}
                  />

                  {/* Risk rationale */}
                  <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Risk rationale</div>
                    {selected.risk_rationale ? (
                      <JsonOrTextDisplay value={selected.risk_rationale} />
                    ) : null}
                  </div>

                </div>

                {/* Decision panel */}
                <div className="rounded-lg border border-muted/60 bg-background/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Decision</div>

                  {approverName ? (
                    <div className="mt-3 rounded-md border border-muted/40 bg-background/40 px-3 py-2 text-xs">
                      Deciding as: <strong className="text-foreground">{approverName}</strong>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      Unable to identify your approver account. Log out and back in.
                    </div>
                  )}

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
    </div >
  );
}
