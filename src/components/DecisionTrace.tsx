"use client";

import React from "react";

export interface DecisionTraceData {
  proposed_decision_type: string;
  effective_decision_type: string;
  gateway_action: string;
  risk_score?: number;
  risk_label?: string;
  harm_signal_override: boolean;
  mismatch_detected: boolean;
  schema_aligned: boolean;
  structured_inputs_summary: Record<string, string>;
  free_text_excerpt: string;
  escalation_reasons: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gatewayActionBadge(action: string) {
  if (action === "BLOCK")
    return "bg-red-600/90 text-white border-red-500/40";
  if (action === "NEEDS_HUMAN" || action === "BLOCKED_PENDING_REVIEW" || action === "ESCALATE")
    return "bg-orange-500/90 text-white border-orange-400/40";
  if (action === "ALLOW" || action === "APPROVED")
    return "bg-blue-600/90 text-white border-blue-500/40";
  return "bg-slate-600/60 text-slate-100 border-slate-500/40";
}

function riskLabelBadge(label: string) {
  if (label === "BLOCK") return "bg-red-600/90 text-white border-red-500/40";
  if (label === "ESCALATE") return "bg-orange-500/90 text-white border-orange-400/40";
  if (label === "ROUTINE") return "bg-blue-600/90 text-white border-blue-500/40";
  return "bg-slate-600/60 text-slate-100 border-slate-500/40";
}

function schemaChip(aligned: boolean) {
  if (aligned) return { icon: "✅", label: "Schema aligned", cls: "text-green-400" };
  return { icon: "⚠️", label: "Missing required fields", cls: "text-amber-400" };
}

function humanReadableToolName(toolName: string): string {
  const map: Record<string, string> = {
    check_payment_status: "Check Payment Status",
    request_payment_extension: "Request Payment Extension",
    modify_welfare_record: "Modify Welfare Record",
  };
  return map[toolName] ?? toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanReadableAction(action: string): string {
  const map: Record<string, string> = {
    ALLOW: "Automated (Pass-through)",
    APPROVED: "Automated (Pass-through)",
    BLOCK: "Blocked (Override)",
    NEEDS_HUMAN: "Needs Human Review",
    BLOCKED_PENDING_REVIEW: "Blocked — Pending Review",
    ESCALATE: "Escalate",
  };
  return map[action] ?? action;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DecisionTraceProps {
  trace: DecisionTraceData;
}

export default function DecisionTrace({ trace }: DecisionTraceProps) {
  const [open, setOpen] = React.useState(false);
  const schema = schemaChip(trace.schema_aligned);

  const escalationSummary = buildEscalationSummary(trace);

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-background/50 text-xs overflow-hidden">
      {/* Toggle */}
      <button
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 font-medium">
          🔍 {open ? "Hide Decision Trace" : "View Decision Trace"}
        </span>
        <span className="text-[10px] opacity-70">{open ? "▲" : "▼"}</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40">

          {/* Schema alignment chip */}
          <div className="pt-2">
            <span className={`text-[11px] font-medium ${schema.cls}`}>
              {schema.icon} {schema.label}
            </span>
          </div>

          {/* Pipeline summary row */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <TraceRow label="Proposed tool action" value={humanReadableToolName(trace.proposed_decision_type)} />
            <TraceRow label="Final tool action" value={humanReadableAction(trace.effective_decision_type)} />
            <TraceRow
              label="System routing"
              value={
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${gatewayActionBadge(trace.gateway_action)}`}>
                  {humanReadableAction(trace.gateway_action)}
                </span>
              }
            />
            {trace.risk_label && (
              <TraceRow
                label="Risk label"
                value={
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskLabelBadge(trace.risk_label)}`}>
                    {trace.risk_label}
                  </span>
                }
              />
            )}
            {trace.risk_score !== undefined && (
              <TraceRow label="Risk score" value={`${trace.risk_score} / 100`} />
            )}
            <TraceRow
              label="Harm signal override"
              value={
                <span className={trace.harm_signal_override ? "text-red-400 font-semibold" : "text-green-400"}>
                  {trace.harm_signal_override ? "Yes" : "No"}
                </span>
              }
            />
            <TraceRow
              label="Decision mismatch"
              value={
                <span className={trace.mismatch_detected ? "text-amber-400 font-semibold" : "text-green-400"}>
                  {trace.mismatch_detected ? "Yes — gateway overrode chatbot" : "No"}
                </span>
              }
            />
            <TraceRow
              label="HITL triggered"
              value={
                <span className={
                  trace.gateway_action !== "ALLOW" && trace.gateway_action !== "APPROVED"
                    ? "text-amber-400 font-semibold"
                    : "text-muted-foreground"
                }>
                  {trace.gateway_action !== "ALLOW" && trace.gateway_action !== "APPROVED" ? "Yes" : "No"}
                </span>
              }
            />
          </div>

          {/* Structured payload preview */}
          {Object.keys(trace.structured_inputs_summary).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Structured payload sent
              </p>
              <div className="rounded border border-border/50 bg-muted/30 p-2 space-y-0.5 font-mono">
                {Object.entries(trace.structured_inputs_summary).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{k}:</span>
                    <span className="text-foreground/80 truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Free text excerpt */}
          {trace.free_text_excerpt && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Free text sent (last user message excerpt, max 200 chars)
              </p>
              <p className="rounded border border-border/50 bg-muted/30 p-2 text-foreground/70 italic leading-relaxed">
                &ldquo;{trace.free_text_excerpt}&rdquo;
              </p>
            </div>
          )}

          {/* Escalation summary */}
          {escalationSummary && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Routing rationale
              </p>
              <p className="text-foreground/80 leading-relaxed">{escalationSummary}</p>
            </div>
          )}

          {/* Escalation reasons */}
          {trace.escalation_reasons.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Escalation reason(s)
              </p>
              <ul className="space-y-0.5">
                {trace.escalation_reasons.map((r, i) => (
                  <li key={i} className="text-foreground/70">• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TraceRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

// ── Escalation summary builder ────────────────────────────────────────────────

function buildEscalationSummary(trace: DecisionTraceData): string | null {
  const { gateway_action, harm_signal_override, mismatch_detected, risk_score, risk_label, escalation_reasons } = trace;

  if (gateway_action === "ALLOW" || gateway_action === "APPROVED") {
    if (!harm_signal_override && !mismatch_detected) {
      return `Auto-processed: no harm signals detected, decision type matched, ${risk_score !== undefined ? `risk score ${risk_score}/100 (${risk_label ?? "low"})` : "low risk"}.`;
    }
  }

  const parts: string[] = [];

  if (harm_signal_override) {
    parts.push("harm signal detected in the request");
  }
  if (mismatch_detected) {
    parts.push("decision mismatch between chatbot classification and gateway evaluation");
  }
  if (risk_score !== undefined && risk_score >= 85) {
    parts.push(`elevated risk score (${risk_score}/100)`);
  } else if (risk_score !== undefined && risk_score >= 70) {
    parts.push(`moderate risk score (${risk_score}/100)`);
  }
  if (escalation_reasons.length > 0 && parts.length === 0) {
    // Use the escalation reason text directly if no other signal
    return escalation_reasons[0];
  }

  if (parts.length === 0) return null;

  const action =
    gateway_action === "BLOCK" || gateway_action === "BLOCKED_PENDING_REVIEW"
      ? "Intervention: Blocked pending review"
      : "Escalated for human review";

  return `${action} because: ${parts.join("; ")}.`;
}
