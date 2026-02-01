"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultSettings, loadSettings, saveSettings, type UserSettings } from "@/lib/settings";

type Ctx = {
  settings: UserSettings;
  setSettings: (next: UserSettings) => void;
  patchSettings: (patch: Partial<UserSettings>) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const setSettings = (next: UserSettings) => {
    setSettingsState(next);
    saveSettings(next);
  };

  const patchSettings = (patch: Partial<UserSettings>) => {
    setSettings({ ...settings, ...patch });
  };

  const value = useMemo(() => ({ settings, setSettings, patchSettings }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
