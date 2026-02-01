export type ThemeMode = "light" | "dark" | "system";
export type InboxTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
export type RiskFilter = "ALL" | "ROUTINE" | "ESCALATE" | "BLOCK";
export type PreviewBehavior = "open_on_click" | "auto_open_on_selection";
export type PreviewPosition = "right_rail" | "modal_drawer";
export type DecisionNotePolicy = "off" | "block_only" | "high_only" | "block_or_high";
export type AutoRefreshInterval = "off" | "30s" | "60s";

export type UserSettings = {
  theme: ThemeMode;
  keyboardShortcuts: boolean;
  defaultInboxTab: InboxTab;
  defaultRiskFilter: RiskFilter;
  previewBehavior: PreviewBehavior;
  previewPosition: PreviewPosition;
  decisionRequiresNote: DecisionNotePolicy;
  highRiskThreshold: number; // used when decisionRequiresNote involves "high"
  autoRefreshInterval: AutoRefreshInterval;
};

export const defaultSettings: UserSettings = {
  theme: "system",
  keyboardShortcuts: true,
  defaultInboxTab: "PENDING",
  defaultRiskFilter: "ALL",
  previewBehavior: "open_on_click",
  previewPosition: "right_rail",
  decisionRequiresNote: "block_or_high",
  highRiskThreshold: 80,
  autoRefreshInterval: "off",
};

const KEY = "atlas_hitl_user_settings_v1";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}
