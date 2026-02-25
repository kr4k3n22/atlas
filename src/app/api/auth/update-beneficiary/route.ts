import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { userId, beneficiaryId } = await req.json();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { beneficiary_id: beneficiaryId },
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}
