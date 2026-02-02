"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
      router.push("/approver/login");
      router.refresh();
    }
  }

  // ...rest of component
}
