/* Poseidon's building stock on the map: the Boplats-derived list
   (public/data/poseidon_map.json, built by tools/poseidon/) plus the user's
   own corrections — buildings they add, and Boplats matches they reject.
   Corrections are saved to the backend (/api/poseidon/stock-edits →
   data/poseidon_stock.sqlite3); until saved they are kept in this browser
   so nothing is lost on a reload. */
import { useSyncExternalStore } from "react";

export interface MapBuilding {
  id: string;
  addr: string | null;
  addrs: string | null;
  year: number | null;
  floors: number | null;
  atemp: number | null;
  energy: number | null;
  eclass: string | null;
  use: string | null;
  poly: [number, number][];  // [lon, lat]
  poseidon?: boolean;        // matched from Boplats floor plans
  listings?: number;
  layouts?: string[];
  seen?: string;
  match?: "address" | "geocoded";  // how the listing address found this outline
  listing_addrs?: string[];
  // table columns (assets/buildings.json + Boplats rents, see tools/poseidon/build_poseidon_map.py)
  height?: number | null;
  footprint?: number | null;
  has_epc?: boolean | null;
  period?: string | null;
  u_wall?: number | null;
  u_roof?: number | null;
  u_win?: number | null;
  bp_listings?: number;
  bp_rent?: number | null;
  bp_rent_m2?: number | null;
}

export interface MapData {
  generated: string;
  poseidon_listings: number;
  poseidon_addresses: number;
  buildings: MapBuilding[];
  unmatched: { address: string; listings: number }[];
}

export interface Edits { added: string[]; removed: string[] }

const KEY = "poseidon-stock-edits-v1";
const SAVED_KEY = "poseidon-stock-saved-v1";   // what the server had when we last synced
const listeners = new Set<() => void>();
const EMPTY: Edits = { added: [], removed: [] };

function readLocal(key: string): Edits | null {
  try {
    const e = JSON.parse(localStorage.getItem(key) || "null");
    if (e && Array.isArray(e.added) && Array.isArray(e.removed)) return e;
  } catch { /* ignore */ }
  return null;
}
let edits: Edits = readLocal(KEY) ?? EMPTY;
let saved: Edits = readLocal(SAVED_KEY) ?? EMPTY;

export type SyncState = "loading" | "saved" | "unsaved" | "saving" | "offline";
let sync: SyncState = "loading";
let syncError: string | null = null;

/* Snapshot for useSyncExternalStore: must be the same object until something changes. */
let snap: { edits: Edits; sync: SyncState; syncError: string | null } = { edits, sync, syncError };
function emit() {
  snap = { edits, sync, syncError };
  listeners.forEach((l) => l());
}

const same = (a: Edits, b: Edits) => {
  const k = (e: Edits) => JSON.stringify([[...e.added].sort(), [...e.removed].sort()]);
  return k(a) === k(b);
};

function save(next: Edits) {
  edits = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  if (sync !== "loading" && sync !== "saving") sync = same(edits, saved) ? "saved" : "unsaved";
  emit();
}

function setSaved(s: Edits) {
  saved = s;
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export type Status = "boplats" | "added" | "removed" | "other";

export function statusOf(b: MapBuilding, e: Edits = edits): Status {
  if (b.poseidon) return e.removed.includes(b.id) ? "removed" : "boplats";
  return e.added.includes(b.id) ? "added" : "other";
}

/** Flip a building between Poseidon / not Poseidon. */
export function toggle(b: MapBuilding) {
  const s = statusOf(b);
  if (s === "boplats") save({ ...edits, removed: [...edits.removed, b.id] });
  else if (s === "removed") save({ ...edits, removed: edits.removed.filter((x) => x !== b.id) });
  else if (s === "added") save({ ...edits, added: edits.added.filter((x) => x !== b.id) });
  else save({ ...edits, added: [...edits.added, b.id] });
}

/** Mark many buildings as Poseidon at once (CSV import). Returns how many changed. */
export function addMany(bs: MapBuilding[]): number {
  const add = new Set(edits.added), rem = new Set(edits.removed);
  let n = 0;
  for (const b of bs) {
    const s = statusOf(b);
    if (s === "other") { add.add(b.id); n++; }
    else if (s === "removed") { rem.delete(b.id); n++; }
  }
  if (n) save({ added: [...add], removed: [...rem] });
  return n;
}

/** Every building currently counted as Poseidon's, with where that came from. */
export function poseidonBuildings(data: MapData, e: Edits = edits) {
  return data.buildings
    .map((b) => ({ b, s: statusOf(b, e) }))
    .filter((x) => x.s === "boplats" || x.s === "added");
}

/** Throw away unsaved changes: go back to what is saved on the server. */
export function revertEdits() { save(saved); }

export function useEdits() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snap.edits);
}
export function useSync() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snap);
}

interface ServerEdit { id: string; address: string | null; all_addresses: string | null; lat: number | null; lon: number | null }

/** Load the saved list from the server. Unsaved local changes are kept on top. */
export async function loadServerEdits() {
  try {
    const r = await fetch("/api/poseidon/stock-edits");
    if (!r.ok) throw new Error(`${r.status}`);
    const s = await r.json() as { added: ServerEdit[]; removed: ServerEdit[] };
    const server: Edits = { added: s.added.map((e) => e.id), removed: s.removed.map((e) => e.id) };
    const hadUnsaved = !same(edits, saved);
    setSaved(server);
    if (!hadUnsaved) edits = server;   // nothing pending here: show what is saved
    try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch { /* storage blocked */ }
    sync = same(edits, saved) ? "saved" : "unsaved";
    syncError = null;
  } catch (e) {
    sync = "offline";
    syncError = String((e as Error).message || e);
  }
  emit();
}

/** Save the whole edit set (addresses included) to the server. */
export async function saveEdits(data: MapData): Promise<boolean> {
  const byId = new Map(data.buildings.map((b) => [b.id, b]));
  const row = (id: string) => {
    const b = byId.get(id);
    const [lat, lon] = id.split(",").map(Number);
    return { id, address: b?.addr ?? null, all_addresses: b?.addrs ?? null, lat, lon };
  };
  const body = { added: edits.added.map(row), removed: edits.removed.map(row) };
  const sent = { added: [...edits.added], removed: [...edits.removed] };
  sync = "saving"; emit();
  try {
    const r = await fetch("/api/poseidon/stock-edits", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
    setSaved(sent);
    sync = same(edits, saved) ? "saved" : "unsaved";   // edits made while saving stay unsaved
    syncError = null;
    emit();
    return true;
  } catch (e) {
    sync = "unsaved";
    syncError = String((e as Error).message || e);
    emit();
    return false;
  }
}

let dataPromise: Promise<MapData> | null = null;
export function loadMapData(): Promise<MapData> {
  dataPromise ??= fetch("/data/poseidon_map.json").then((r) => {
    if (!r.ok) throw new Error(`poseidon_map.json: ${r.status}`);
    return r.json();
  });
  return dataPromise;
}

/** The user's corrections as a file they can hand back for the next data build. */
export function exportEdits(data: MapData) {
  const byId = new Map(data.buildings.map((b) => [b.id, b]));
  const pick = (ids: string[]) => ids.map((id) => {
    const b = byId.get(id);
    return { id, address: b?.addr ?? null, all_addresses: b?.addrs ?? null };
  });
  const blob = new Blob([JSON.stringify({
    exported: new Date().toISOString(),
    data_generated: data.generated,
    added: pick(edits.added),
    removed: pick(edits.removed),
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "poseidon_map_edits.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
