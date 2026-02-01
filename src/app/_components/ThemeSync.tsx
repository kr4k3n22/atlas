"use client";

import { useEffect } from "react";
import { applyThemeClass, getStoredTheme, resolveTheme, ThemePref } from "@/lib/theme";

function readCookieTheme(): ThemePref | null {
  const m = document.cookie.match(/(?:^|;\s*)theme=(light|dark|system)(?:;|$)/);
  return (m?.[1] as ThemePref) ?? null;
}

export default function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      const pref = getStoredTheme() ?? readCookieTheme() ?? "system";
      applyThemeClass(resolveTheme(pref));
    };

    apply();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme") apply();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("theme:changed", apply);

    // If system theme changes and user is on "system"
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => {
      const pref = getStoredTheme() ?? readCookieTheme() ?? "system";
      if (pref === "system") apply();
    };
    mq?.addEventListener?.("change", onMq);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("theme:changed", apply);
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);

  return null;
}