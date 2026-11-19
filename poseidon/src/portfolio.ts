/* Poseidon's building list ("Fastigheter"), kept in this browser for now.
   Moves to per-account storage once Poseidon's property register is wired in. */
import { useSyncExternalStore } from "react";
import type { Building } from "./api";

export interface SavedBuilding extends Building {
  id: string;
  label: string;   // what the user typed / the address shown in lists
  addedAt: string;
}

const KEY = "poseidon-portfolio-v1";
const listeners = new Set<() => void>();

function load(): SavedBuilding[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
let items: SavedBuilding[] = load();

function save(next: SavedBuilding[]) {
  items = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: keep in memory */ }
  listeners.forEach((l) => l());
}

export const portfolio = {
  all: () => items,
  add(b: Building, label: string): SavedBuilding {
    const id = `${b.lat.toFixed(6)},${b.lon.toFixed(6)}`;
    const existing = items.find((i) => i.id === id);
    if (existing) return existing;
    const rec: SavedBuilding = { ...b, id, label, addedAt: new Date().toISOString() };
    save([...items, rec]);
    return rec;
  },
  remove(id: string) { save(items.filter((i) => i.id !== id)); },
  get: (id: string) => items.find((i) => i.id === id),
};

export function usePortfolio() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => items,
  );
}

/** Energy-class colours (A green → G red), the usual Swedish certificate scale. */
export const EPC_COLORS: Record<string, string> = {
  A: "#008000", B: "#3a9a00", C: "#8cb400", D: "#c8b400", E: "#e08a00", F: "#d04a00", G: "#c00000",
};
