"use client";

import React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { SettingsProvider, useSettings } from "@/components/settings-provider";

function ThemeSync() {
  const { settings } = useSettings();
  const { setTheme } = useTheme();

  React.useEffect(() => {
    setTheme(settings.theme);
  }, [settings.theme, setTheme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SettingsProvider>
        <ThemeSync />
        {children}
      </SettingsProvider>
    </ThemeProvider>
  );
}
