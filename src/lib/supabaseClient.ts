import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getProjectRef(url: string) {
  return url.replace(/^https?:\/\//, "").split(".")[0];
}

const cookieStorage = {
  getItem(key: string) {
    if (typeof document === "undefined") return null;
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${key}=`));
    if (!match) return null;
    return decodeURIComponent(match.split("=").slice(1).join("="));
  },
  setItem(key: string, value: string) {
    if (typeof document === "undefined") return;
    const isSecure = window.location.protocol === "https:";
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax;${
      isSecure ? " Secure;" : ""
    }`;
  },
  removeItem(key: string) {
    if (typeof document === "undefined") return;
    document.cookie = `${key}=; Max-Age=0; path=/; SameSite=Lax;`;
  },
};

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env vars. Check Vercel settings.");
  }

  const projectRef = getProjectRef(url);
  const storageKey = projectRef ? `sb-${projectRef}-auth-token` : undefined;

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: cookieStorage,
      storageKey,
    },
  });
}
