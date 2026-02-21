import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthUser(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { cookie: cookieHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}

// GET /api/chats/[id] — load messages for a conversation
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: conv, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, role, content, metadata, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages });
}

// DELETE /api/chats/[id] — delete a conversation
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership then delete (cascade handles messages)
  const { error } = await supabaseAdmin
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
