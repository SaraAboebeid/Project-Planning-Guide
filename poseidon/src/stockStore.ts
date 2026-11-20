/* One shared store for everything the Building Table and the Renovation
   Wizard both read: the user's table edits, renovation history, façade
   inspections, EPSM RC results and certificate details — plus the RC and
   certificate request queues. Module-level (not component state), so two open
   windows see the same numbers, nothing is requested twice, and closing a
   window never stops a run. */
import { useSyncExternalStore } from "react";
import type { BuildingHistory, FacadeDefectSummary } from "./planner/types";
import { getBuildingEdits, putBuildingEdits, rcCached, rcRun, type RcBody, type RcRes, type RowEdits } from "./rc";

export interface EpcInfo { system?: string | null; issued?: string | null; expires?: string | null; property?: string | null }

export interface StoreState {
  rowEdits: Record<string, RowEdits> | null;              // null until loaded
  history: Record<string, BuildingHistory> | null;
  facade: Record<string, FacadeDefectSummary> | null;
  rc: Record<string, RcRes>;
  epc: Record<string, EpcInfo>;
  epcState: "idle" | "loading" | "ok" | "unavailable" | "error";
  prog: { done: number; total: number; running: boolean; failed: boolean };
  loadingSaved: boolean;
  savedReady: boolean;                                     // first saved-results load done
}

let state: StoreState = {
  rowEdits: null, history: null, facade: null, rc: {}, epc: {}, epcState: "idle",
  prog: { done: 0, total: 0, running: false, failed: false }, loadingSaved: false, savedReady: false,
};
const listeners = new Set<() => void>();
function set(patch: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export const getState = () => state;
export function useStore(): StoreState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function putJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `${url}: ${r.status}`);
  return r.json();
}

/* ── loading ── */
let initStarted = false;
export function initStore() {
  if (initStarted) return;
  initStarted = true;
  getBuildingEdits().then((e) => set({ rowEdits: e }), () => set({ rowEdits: {} }));
  getJson<Record<string, BuildingHistory>>("/api/poseidon/history").then((h) => set({ history: h }), () => set({ history: {} }));
  getJson<Record<string, FacadeDefectSummary>>("/api/poseidon/facade").then((f) => set({ facade: f }), () => set({ facade: {} }));
}

/* ── saving (optimistic; reverted and re-thrown on failure) ── */
export async function saveRowEdits(rowId: string, edits: RowEdits) {
  const prev = state.rowEdits;
  set((s) => ({ rowEdits: { ...(s.rowEdits ?? {}), [rowId]: edits } }));
  try {
    const saved = await putBuildingEdits(rowId, edits);
    set((s) => ({ rowEdits: { ...(s.rowEdits ?? {}), [rowId]: saved } }));
  } catch (e) { set({ rowEdits: prev }); throw e; }
}

export async function saveHistory(rowId: string, h: BuildingHistory) {
  const prev = state.history;
  set((s) => ({ history: { ...(s.history ?? {}), [rowId]: h } }));
  try { await putJson(`/api/poseidon/history/${encodeURIComponent(rowId)}`, { value: h }); }
  catch (e) { set({ history: prev }); throw e; }
}

export async function saveFacade(rowId: string, summary: FacadeDefectSummary | null) {
  set((s) => {
    const next = { ...(s.facade ?? {}) };
    if (summary) next[rowId] = summary; else delete next[rowId];
    return { facade: next };
  });
  await putJson(`/api/poseidon/facade/${encodeURIComponent(rowId)}`, { value: summary });
}

export async function getSetting<T>(key: string): Promise<T | null> {
  try { return (await getJson<{ value: T | null }>(`/api/poseidon/settings/${encodeURIComponent(key)}`)).value; }
  catch { return null; }
}
export async function putSetting(key: string, value: unknown) {
  await putJson(`/api/poseidon/settings/${encodeURIComponent(key)}`, { value });
}

/* ── EPSM RC queue ──────────────────────────────────────────────────────────
   Each body is sent when its inputs differ from what was last requested (first
   load, a building newly added, an edit, a recorded renovation), so nothing runs
   twice. A bulk set first asks for SAVED results (one request, no simulation)
   and simulates only what is missing; a small set (an edit) runs at once. */
const RC_CHUNK = 25;
const requested = new Map<string, string>();
let queue: { body: RcBody; force: boolean }[] = [];
let running = false;
const bodyKey = (b: RcBody) => JSON.stringify([b.edits, b.recorded_u ?? {}, b.atemp ?? null]);

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const chunk = queue.splice(0, RC_CHUNK);
    try {
      const res = await rcRun(chunk.map((c) => c.body), chunk.some((c) => c.force));
      set((s) => ({ rc: { ...s.rc, ...res } }));
    } catch (e) {
      const msg = String((e as Error).message || e);
      set((s) => ({ rc: { ...s.rc, ...Object.fromEntries(chunk.map((c) => [c.body.id, { error: msg }])) },
                    prog: { ...s.prog, failed: true } }));
    }
    set((s) => ({ prog: { ...s.prog, done: s.prog.done + chunk.length } }));
  }
  running = false;
  set((s) => ({ prog: { ...s.prog, running: false } }));
}

function enqueue(bodies: RcBody[], opts: { priority?: boolean; force?: boolean } = {}) {
  if (!bodies.length) return;
  const ids = new Set(bodies.map((b) => b.id));
  queue = queue.filter((q) => !ids.has(q.body.id));   // newer inputs replace queued ones
  const items = bodies.map((body) => ({ body, force: !!opts.force }));
  if (opts.priority) queue.unshift(...items); else queue.push(...items);
  set((s) => {
    const rc = { ...s.rc };
    ids.forEach((id) => delete rc[id]);                  // "…" while it runs
    return {
      rc,
      prog: running ? { ...s.prog, total: s.prog.total + bodies.length, running: true }
                    : { done: 0, total: bodies.length, running: true, failed: false },
    };
  });
  void pump();
}

export function ensureRc(bodies: RcBody[]) {
  const todo = bodies.filter((b) => requested.get(b.id) !== bodyKey(b));
  todo.forEach((b) => requested.set(b.id, bodyKey(b)));
  if (!todo.length) { if (!state.savedReady && bodies.length) set({ savedReady: true }); return; }
  if (todo.length <= 4 && state.savedReady) { enqueue(todo, { priority: true }); return; }
  set({ loadingSaved: true });
  rcCached(todo)
    .then(({ results, missing }) => {
      set((s) => ({ rc: { ...s.rc, ...results } }));
      const miss = new Set(missing);
      enqueue(todo.filter((b) => miss.has(b.id)));
    })
    .catch(() => enqueue(todo))   // cache lookup failed: rc-run still reuses saved results
    .finally(() => set({ loadingSaved: false, savedReady: true }));
}

export function rerunAll(bodies: RcBody[]) {
  bodies.forEach((b) => requested.set(b.id, bodyKey(b)));
  enqueue(bodies, { force: true });
}

/* ── certificate details: only addresses not asked for yet ── */
const epcAsked = new Set<string>();
export function ensureEpc(addresses: string[]) {
  const todo = addresses.filter((a) => !epcAsked.has(a));
  if (!todo.length) return;
  todo.forEach((a) => epcAsked.add(a));
  set({ epcState: "loading" });
  fetch("/api/poseidon/epc-details", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresses: todo }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { results: Record<string, EpcInfo>; available: boolean }) =>
      set((s) => ({ epc: { ...s.epc, ...(j.results || {}) }, epcState: j.available ? "ok" : "unavailable" })))
    .catch(() => { todo.forEach((a) => epcAsked.delete(a)); set({ epcState: "error" }); });
}
