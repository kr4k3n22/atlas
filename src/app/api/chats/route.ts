import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthUser(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { createClient: createServerClient } = await import("@supabase/supabase-js");
  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { cookie: cookieHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}

// GET /api/chats — list conversations for authenticated user
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data });
}

// POST /api/chats — create a new conversation
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title = "New conversation";
  try {
    const body = await req.json();
    if (body?.title) title = body.title;
  } catch {
    // no body is fine
  }

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .insert({ user_id: user.id, title })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: data }, { status: 201 });
}
