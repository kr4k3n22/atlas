export type ThemeMode = "system" | "light" | "dark";
export type InboxTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
export type RiskFilter = "ALL" | "ROUTINE" | "ESCALATE" | "BLOCK";
export type PreviewBehavior = "open_on_click" | "auto_on_select";
export type PreviewPosition = "right_rail" | "modal_drawer";
export type NoteRequirement = "off" | "block_only" | "high_only" | "block_or_high";
export type AutoRefresh = "off" | "30s" | "60s";

export type UserSettings = {
  theme: ThemeMode;
  keyboardShortcuts: boolean;

  defaultInboxTab: InboxTab;
  defaultRiskFilter: RiskFilter;

  previewBehavior: PreviewBehavior;
  previewPosition: PreviewPosition;

  decisionRequiresNote: NoteRequirement;
  highRiskThreshold: number; // used when decisionRequiresNote involves high risk

  autoRefresh: AutoRefresh;
};

export const SETTINGS_KEY = "atlas_user_settings_v1";

export const defaultSettings: UserSettings = {
  theme: "system",
  keyboardShortcuts: true,

  defaultInboxTab: "PENDING",
  defaultRiskFilter: "ALL",

  previewBehavior: "open_on_click",
  previewPosition: "right_rail",

  decisionRequiresNote: "off",
  highRiskThreshold: 80,

  autoRefresh: "off",
};

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings;

  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      // safety: keep threshold sane
      highRiskThreshold:
        typeof parsed.highRiskThreshold === "number"
          ? Math.min(100, Math.max(0, parsed.highRiskThreshold))
          : defaultSettings.highRiskThreshold,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("atlas_settings_change"));
}

export function onSettingsChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  const fn = () => handler();
  window.addEventListener("atlas_settings_change", fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener("atlas_settings_change", fn);
    window.removeEventListener("storage", fn);
  };
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  const shouldDark = mode === "dark" || (mode === "system" && prefersDark);

  if (shouldDark) root.classList.add("dark");
  else root.classList.remove("dark");
}
