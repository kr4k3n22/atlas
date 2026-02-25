"use client";

import React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { SettingsProvider, useSettings } from "@/components/settings-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SettingsProvider>
        {children}
        <Toaster richColors closeButton />
      </SettingsProvider>
    </ThemeProvider>
  );
}
