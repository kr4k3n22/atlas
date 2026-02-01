// src/lib/theme.ts
export type ThemePref = "light" | "dark" | "system";

const LS_KEY = "theme";

export function getStoredTheme(): ThemePref | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LS_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : null;
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    return mq?.matches ? "dark" : "light";
  }
  return pref;
}

export function applyThemeClass(mode: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(mode);
}

export function setThemePref(pref: ThemePref) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(LS_KEY, pref);

  // Persist for SSR. 1 year.
  document.cookie = `theme=${pref}; Path=/; Max-Age=31536000; SameSite=Lax`;

  const mode = resolveTheme(pref);
  applyThemeClass(mode);

  // Let other tabs/pages know
  window.dispatchEvent(new Event("theme:changed"));
}