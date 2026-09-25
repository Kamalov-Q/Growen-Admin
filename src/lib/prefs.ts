import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";
/** "auto" leaves each price in the currency its offer was written in. */
export type CurrencyMode = "auto" | "USD" | "UZS";

interface Prefs {
  theme: ThemeMode;
  currency: CurrencyMode;
  /** Rows per table page. Lives here rather than in the pager so that
   *  changing it in Settings reaches tables that are already open. */
  pageSize: number;
}

const KEY = "growen.admin.prefs";

const DEFAULTS: Prefs = { theme: "system", currency: "auto", pageSize: 20 };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const subs = new Set<() => void>();

/**
 * The theme is applied to <html> rather than to a React wrapper: the page
 * background, the scrollbars and anything rendered in a portal all read their
 * colours from `:root`, and a class on a div inside the tree would miss them.
 */
export function applyTheme(mode: ThemeMode) {
  const el = document.documentElement;
  if (mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not worth failing a settings change over.
  }
  if (patch.theme) applyTheme(patch.theme);
  subs.forEach((fn) => fn());
}

export function getPrefs(): Prefs {
  return current;
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
  );
}

/** Called once at boot, before the first paint. */
export function bootPrefs() {
  applyTheme(current.theme);
}
