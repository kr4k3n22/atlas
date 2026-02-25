import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUser } from "@/lib/getAuthUser";

const VALID_BENEFICIARY_IDS = new Set([
  "BEN-ATLAS-001",
  "BEN-ATLAS-002",
  "BEN-ATLAS-003",
  "BEN-ATLAS-004",
  "BEN-ATLAS-005",
]);

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req.headers.get("cookie") ?? "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { beneficiary_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { beneficiary_id } = body;
  if (!beneficiary_id || !VALID_BENEFICIARY_IDS.has(beneficiary_id)) {
    return NextResponse.json(
      { error: "Invalid or missing beneficiary_id. Must be one of: " + [...VALID_BENEFICIARY_IDS].join(", ") },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, beneficiary_id },
  });

  if (error) {
    console.error("[update-profile] Failed to update user metadata:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, beneficiary_id });
}
