"use client";

import { useEffect } from "react";
import { applyTheme, loadSettings, onSettingsChange } from "@/lib/userSettings";

export default function ThemeInit() {
  useEffect(() => {
    const run = () => {
      const s = loadSettings();
      applyTheme(s.theme);
    };

    run();

    const off = onSettingsChange(run);

    // respond to system theme changes when in "system"
    const mql =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const onMql = () => run();

    if (mql && mql.addEventListener) mql.addEventListener("change", onMql);
    else if (mql && (mql as any).addListener) (mql as any).addListener(onMql);

    return () => {
      off();
      if (mql && mql.removeEventListener) mql.removeEventListener("change", onMql);
      else if (mql && (mql as any).removeListener) (mql as any).removeListener(onMql);
    };
  }, []);

  return null;
}
