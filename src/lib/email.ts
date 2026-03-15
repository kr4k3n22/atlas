import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@cyber295atlas.app";
const FROM_NAME = "ATLAS Governance";

export type EmailParams = {
  to: string;
  subject: string;
  text?: string;
  html: string;
};

/**
 * Strip HTML tags from a string to produce a plain-text fallback.
 * Runs the replacement iteratively until stable, then removes any
 * residual angle-bracket characters, to avoid incomplete sanitisation.
 */
function htmlToPlainText(html: string): string {
  let text = html;
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== prev);
  // Remove any remaining stray < or > that could not be fully stripped
  return text.replace(/[<>]/g, "");
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!apiKey) {
    console.error("[email] SENDGRID_API_KEY is not set — skipping email send.");
    return false;
  }

  try {
    await sgMail.send({
      to: params.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: params.subject,
      text: params.text || htmlToPlainText(params.html),
      html: params.html,
    });
    console.log(`[email] Sent "${params.subject}" to ${params.to}`);
    return true;
  } catch (error: any) {
    console.error("[email] SendGrid error:", error?.response?.body || error.message);
    return false;
  }
}
