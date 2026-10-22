/* Interface language (English / Swedish).
 *
 * Strings are keyed by their ENGLISH text: `t("Start Planning")`. With Swedish
 * selected the text is looked up in ./sv.ts and falls back to the English when
 * there is no entry yet, so pages can be translated one at a time and nothing
 * ever shows a raw key. `{name}` placeholders are filled from `vars`:
 *   t("{city} dataset", { city })
 *
 * The choice is per browser (localStorage) and set from Settings or the
 * language switch in the top bar. Data values (addresses, material names,
 * source titles) are not translated. */
import { useSyncExternalStore } from "react";
import { SV } from "./sv";

export type Lang = "en" | "sv";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Svenska" },
];

const STORAGE_KEY = "ppg-lang";

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "sv") return v;
  } catch { /* storage blocked: default below */ }
  return "en";
}

let current: Lang = readStored();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang(): Lang { return current; }

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* not persisted this time */ }
  if (typeof document !== "undefined") document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

function subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** The current language; re-renders the component when it changes. */
export function useLang(): Lang { return useSyncExternalStore(subscribe, getLang, getLang); }

/** Untranslated strings seen while Swedish is on (dev aid: `window.__svMissing`). */
const missing = new Set<string>();

export function translate(text: string, vars?: Record<string, string | number>): string {
  let s = text;
  if (current === "sv") {
    const hit = SV[text];
    if (hit != null) s = hit;
    else if (import.meta.env.DEV && !missing.has(text)) {
      missing.add(text);
      (window as unknown as { __svMissing?: string[] }).__svMissing = [...missing];
    }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** `const t = useT();` - the translate function, re-rendering on language change. */
export function useT() {
  useLang();
  return translate;
}
