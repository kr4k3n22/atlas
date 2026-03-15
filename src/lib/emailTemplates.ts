import type { Case } from "@/lib/schema";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escalationEmail(c: Case, approverName: string, dashboardUrl: string) {
  return {
    subject: `⚠️ ATLAS: Case ${c.id} requires review (Risk: ${c.risk_score})`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⚠️ Action Requires Human Review</h2>
        <p>Hi ${escapeHtml(approverName)},</p>
        <p>A new case has been escalated to you for review:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Case ID</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.id)}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Tool</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.tool_name)}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Risk Label</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: ${c.risk_label === "BLOCK" ? "#dc2626" : "#f59e0b"};">${escapeHtml(c.risk_label)}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Risk Score</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${c.risk_score}/100</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Claimant</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.user_display)}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Rationale</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.risk_rationale.slice(0, 300))}</td></tr>
        </table>
        <a href="${escapeHtml(dashboardUrl)}/approver/inbox"
           style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Review in Dashboard →
        </a>
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
          This is an automated notification from ATLAS Governance Gateway.
        </p>
      </div>
    `,
  };
}

export function decisionConfirmationEmail(
  caseId: string,
  decision: "APPROVE" | "REJECT" | "REQUEST_INFO",
  approverName: string,
) {
  const decisionColor =
    decision === "APPROVE" ? "#16a34a" : decision === "REJECT" ? "#dc2626" : "#f59e0b";
  return {
    subject: `ATLAS: Case ${caseId} — ${decision}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Decision Recorded</h2>
        <p>Case <strong>${escapeHtml(caseId)}</strong> has been marked as
          <span style="color: ${decisionColor}; font-weight: 600;">${escapeHtml(decision)}</span>
          by ${escapeHtml(approverName)}.</p>
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
          This is an automated notification from ATLAS Governance Gateway.
        </p>
      </div>
    `,
  };
}
