import type { Case } from "@/lib/schema";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Email sent to the implementation team when a case officer approves an action.
 * Contains all details the team needs to carry out the approved change.
 */
export function approvalImplementationEmail(
  c: Case,
  approver: string,
  note: string,
  approvedAt: string,
  dashboardUrl: string,
) {
  const approvedAtFormatted = new Date(approvedAt).toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const policyRefs =
    c.policy_refs.length > 0
      ? c.policy_refs.map((r) => escapeHtml(r)).join(", ")
      : "None";

  const toolArgsJson = escapeHtml(JSON.stringify(c.tool_args_redacted, null, 2));

  const noteRow = note
    ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; vertical-align: top;">Approver Notes</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(note)}</td></tr>`
    : "";

  return {
    subject: `✅ ATLAS: Case ${c.id} Approved — Implementation Required`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
        <div style="background: #16a34a; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">✅ Action Approved — Implementation Required</h2>
          <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">
            A case officer has approved the following action. Please implement the change as detailed below.
          </p>
        </div>

        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">

          <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Case Details</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; width: 160px;">Case ID</td><td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${escapeHtml(c.id)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Approved By</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(approver)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Approved At</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(approvedAtFormatted)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Claimant</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.user_display)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Tool / Action</td><td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${escapeHtml(c.tool_name)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Risk</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(c.risk_label)} (${c.risk_score}/100)</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Policy References</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${policyRefs}</td></tr>
            ${noteRow}
          </table>

          <h3 style="margin: 0 0 8px; font-size: 15px; color: #374151;">Original Claimant Request</h3>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
            ${escapeHtml(c.user_message)}
          </div>

          <h3 style="margin: 0 0 8px; font-size: 15px; color: #374151;">Risk Rationale</h3>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
            ${escapeHtml(c.risk_rationale)}
          </div>

          <h3 style="margin: 0 0 8px; font-size: 15px; color: #374151;">Tool Parameters</h3>
          <pre style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0 0 24px;">${toolArgsJson}</pre>

          <a href="${escapeHtml(dashboardUrl)}/cases/${escapeHtml(c.id)}"
             style="display: inline-block; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            View Case in Dashboard →
          </a>

          <p style="margin-top: 24px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
            This is an automated approval notification from ATLAS Governance Gateway.
            Do not reply to this email.
          </p>
        </div>
      </div>
    `,
  };
}
