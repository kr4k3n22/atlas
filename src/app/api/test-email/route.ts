import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  const result = await sendEmail({
    to: "AtlasCaseActions@protonmail.com",
    subject: "ATLAS Test Email ✅",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>✅ SendGrid Integration Test</h1>
        <p>This confirms that the ATLAS email pipeline is working correctly.</p>
        <p>Emails for approved cases will be delivered to this address.</p>
        <p style="color: #6b7280; font-size: 12px;">Sent from ATLAS Governance Gateway via SendGrid / cyber295atlas.app</p>
      </div>
    `,
  });

  return NextResponse.json({
    sent: result,
    to: "AtlasCaseActions@protonmail.com",
    timestamp: new Date().toISOString(),
  });
}
