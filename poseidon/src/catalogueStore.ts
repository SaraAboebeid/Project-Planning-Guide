/* The user's layer on top of the Wikells Sektionsdata catalogue, kept in the
   backend (backend/poseidon_catalogue.py):

     edits.columns  extra columns the user added (shown in every table)
     edits.cells    per item: values that replace Wikells' (or fill an extra column)
     edits.added    rows the user added to a chapter / sub-chapter
     sources        other catalogues: uploaded files and supplier-API connections

   Items are addressed by a uid: a Wikells item by its code ("7.041"), an added
   row by "u-…", a supplier item by "<source id>:<item id>". Every change bumps
   `version`, which the Wizard's measures (catalogue.ts) and the windows follow. */
import { useSyncExternalStore } from "react";

export type CellValue = string | number | null;
export const EDITABLE = ["desc", "unit", "cost", "u", "co2"] as const;
export type EditableField = (typeof EDITABLE)[number];
export const NUMERIC_FIELDS = new Set<string>(["cost", "u", "co2"]);
export type Part = "Walls" | "Windows" | "Roof" | "Floor";

export interface AddedRow {
  uid: string;
  id: string;            // code shown, e.g. "7.900" or the user's own
  chapter: number;       // Sektionsdata chapter it belongs to
  group: string;         // sub-chapter name
  desc: string; unit: string;
  cost: number | null; u: number | null; co2: number | null;
}
export interface CatEdits {
  columns: { key: string; label: string }[];
  cells: Record<string, Record<string, CellValue>>;
  added: AddedRow[];
}
export interface SourceItem {
  id: string; desc: string; unit?: string | null; group?: string | null; part?: Part | null;
  cost?: number | null; u?: number | null; co2?: number | null;
  extra?: Record<string, string>;
}
export interface Connector {
  url: string; auth: "bearer" | "header" | "query" | "none"; auth_name: string | null; key_hint: string | null;
  items_path: string | null; mapping: Record<string, string>; last_sync: string | null; last_error: string | null;
}
export interface Source {
  id: string; name: string; kind: "upload" | "api"; updated_at: string;
  items: SourceItem[]; columns: string[]; connector?: Connector;
}

const EMPTY: CatEdits = { columns: [], cells: {}, added: [] };
let state = { loaded: false, error: null as string | null, edits: EMPTY, sources: [] as Source[], version: 0 };
const listeners = new Set<() => void>();
const emit = () => { state = { ...state, version: state.version + 1 }; listeners.forEach((l) => l()); };
const set = (p: Partial<typeof state>) => { state = { ...state, ...p }; emit(); };

const API = "/api/poseidon/catalogue";
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

let loading: Promise<void> | null = null;
export function loadCatalogueState(): Promise<void> {
  if (!loading) {
    loading = call<{ edits: CatEdits | null; sources: Source[] }>("")
      .then((d) => set({ loaded: true, error: null, edits: { ...EMPTY, ...(d.edits ?? {}) }, sources: d.sources }))
      .catch((e) => { loading = null; set({ loaded: true, error: String(e.message ?? e) }); });
  }
  return loading;
}

export const getCatalogueState = () => state;
/** Module-level subscription (catalogue.ts rebuilds the Wizard's measures before any window re-renders). */
export function subscribeCatalogue(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function useCatalogueState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
/** Re-render when anything in the catalogue changes; also triggers the first load. */
export function useCatalogueVersion(): number {
  const s = useCatalogueState();
  if (!s.loaded) void loadCatalogueState();
  return s.version;
}

/* ── edits ── */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveEdits(next: CatEdits) {
  set({ edits: next });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    call(`/edits`, { method: "PUT", body: JSON.stringify({ value: state.edits }) }).catch((e) => set({ error: `Not saved: ${e.message}` }));
  }, 400);
}

/** Set (or with null/"" clear) one cell of an item. Numbers are parsed with
 *  Swedish or English decimals; an empty value goes back to the catalogue's. */
export function setCell(uid: string, field: string, raw: string) {
  const e = state.edits;
  const cells = { ...e.cells, [uid]: { ...(e.cells[uid] ?? {}) } };
  const v = raw.trim();
  if (v === "") delete cells[uid][field];
  else if (NUMERIC_FIELDS.has(field)) {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return;
    cells[uid][field] = n;
  } else cells[uid][field] = v;
  if (!Object.keys(cells[uid]).length) delete cells[uid];
  saveEdits({ ...e, cells });
}

export function addColumn(label: string) {
  const key = `c${Date.now().toString(36)}`;
  saveEdits({ ...state.edits, columns: [...state.edits.columns, { key, label: label.trim().slice(0, 60) }] });
}
export function removeColumn(key: string) {
  const cells: CatEdits["cells"] = {};
  for (const [uid, c] of Object.entries(state.edits.cells)) {
    const { [key]: _gone, ...rest } = c;
    if (Object.keys(rest).length) cells[uid] = rest;
  }
  saveEdits({ ...state.edits, columns: state.edits.columns.filter((c) => c.key !== key), cells });
}
export function addRow(row: Omit<AddedRow, "uid">) {
  saveEdits({ ...state.edits, added: [...state.edits.added, { ...row, uid: `u-${Date.now().toString(36)}` }] });
}
export function removeRow(uid: string) {
  const { [uid]: _gone, ...cells } = state.edits.cells;
  saveEdits({ ...state.edits, added: state.edits.added.filter((r) => r.uid !== uid), cells });
}

/** The value shown for a field: the user's edit, else the catalogue's. */
export function cellValue<T extends CellValue | undefined>(uid: string, field: string, base: T): T | CellValue {
  const c = state.edits.cells[uid];
  return c && field in c ? c[field] : base;
}
export const isEdited = (uid: string, field: string) => !!state.edits.cells[uid] && field in state.edits.cells[uid];

/* ── other catalogues ── */
export async function uploadCatalogue(name: string, items: Record<string, unknown>[], columns: string[]) {
  const s = await call<Source>("/sources", { method: "POST", body: JSON.stringify({ name, items, columns }) });
  set({ sources: [...state.sources, s] });
  return s;
}
export async function deleteSource(id: string) {
  await call(`/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
  set({ sources: state.sources.filter((s) => s.id !== id) });
}
export interface ConnectorInput {
  name: string; url: string; auth: Connector["auth"]; auth_name?: string | null; api_key?: string | null;
  items_path?: string | null; mapping: Record<string, string>;
}
export async function saveConnector(input: ConnectorInput, id?: string) {
  const s = await call<Source>(id ? `/connectors/${encodeURIComponent(id)}` : "/connectors",
    { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
  set({ sources: id ? state.sources.map((x) => (x.id === id ? s : x)) : [...state.sources, s] });
  return s;
}
export async function syncConnector(id: string) {
  try {
    const s = await call<Source>(`/connectors/${encodeURIComponent(id)}/sync`, { method: "POST" });
    set({ sources: state.sources.map((x) => (x.id === id ? s : x)) });
    return s;
  } catch (e) {
    // the backend recorded the error on the connector: reload to show it
    loading = null; await loadCatalogueState();
    throw e;
  }
}
/** Connections not synced for a day are refreshed when the catalogue opens. */
export function autoSyncStale(maxAgeH = 24) {
  const now = Date.now();
  for (const s of state.sources) {
    const last = s.connector?.last_sync ? Date.parse(s.connector.last_sync) : 0;
    if (s.kind === "api" && !s.connector?.last_error && now - last > maxAgeH * 3600_000) void syncConnector(s.id).catch(() => {});
  }
}
