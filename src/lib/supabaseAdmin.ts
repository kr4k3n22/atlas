import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

// Validate that placeholder is not being used at runtime (not during build)
if (
  supabaseServiceRoleKey === "placeholder-for-build" && 
  typeof window !== "undefined" // Only check at runtime in browser
) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is still set to placeholder value. " +
    "Please set the actual service role key in your environment."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
