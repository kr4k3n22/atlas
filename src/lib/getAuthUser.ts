import { supabaseAdmin } from "@/lib/supabaseAdmin";

function extractAccessToken(cookieHeader: string, supabaseUrl: string): string | null {
  const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const match = cookies.find((c) => c.startsWith(`${storageKey}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    return parsed?.access_token ?? parsed?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getAuthUser(cookieHeader: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const accessToken = extractAccessToken(cookieHeader, supabaseUrl);
  if (!accessToken) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
  return user;
}
