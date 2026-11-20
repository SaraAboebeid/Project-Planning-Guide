/* Façade defect inspection, as in the planner's Step 2 panel
   (frontend/src/components/FacadeDefectPanel.tsx): every photo goes through
   the specialist ML detector (crack / leakage / abscission / corrosion / bulge,
   backend /api/facade-detect) and, in parallel, a general vision model
   (/api/facade-vision) whose boxes only ADD what the ML missed; the vision
   model then looks a second time, told what is already found. The per-building
   summary — the F criterion of the prioritisation — is saved on the backend.

   Photos stay in this session only: Street View imagery may not be kept
   (Google's terms), so only the defect counts are stored. Lives at module level
   so a batch inspection from the wizard needs no open window. */
import { useSyncExternalStore } from "react";
import { getState, saveFacade } from "./stockStore";
import type { FacadeDefectSummary } from "./planner/types";

export type Orientation = "north" | "east" | "south" | "west";
export const ORIENTATIONS: Orientation[] = ["north", "east", "south", "west"];

export interface Det { label: string; score: number; box: [number, number, number, number]; source?: "ml" | "ai"; note?: string }
interface DetectResponse { detections: Det[]; width: number; height: number; normalized?: boolean; model?: string }

export interface Shot {
  id: string; orientation: Orientation; source: "streetview" | "upload"; name: string;
  url: string; width: number; height: number; dets: Det[];
  status: "running" | "done" | "error"; error?: string; mmPerPx?: number; pass2?: boolean;
}

export interface Session {
  shots: Shot[];
  sv: Partial<Record<Orientation, { busy: boolean; error: string | null }>>;
  prior: FacadeDefectSummary | null;   // what was saved before this session's photos
  mlOk: boolean | null;
}

const ML_THRESHOLD = 0.5;      // planner default
const AI_THRESHOLD = 0.3;      // planner default
const MAX_DIM = 1280;          // planner downscales photos to this before sending
const LOW_DETAIL_MM_PER_PX = 35;   // planner FacadeDefectPanel: coarser = a clean result means little

/* ── session store ── */
const sessions = new Map<string, Session>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
function session(rowId: string): Session {
  let s = sessions.get(rowId);
  if (!s) {
    s = { shots: [], sv: {}, prior: getState().facade?.[rowId] ?? null, mlOk: null };
    sessions.set(rowId, s);
  }
  return s;
}
function patch(rowId: string, f: (s: Session) => Session) { sessions.set(rowId, f(session(rowId))); emit(); }
export function useFacadeSession(rowId: string): Session {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
  return session(rowId);
}

/* ── geometry (planner FacadeDefectPanel) ── */
function iou(a: number[], b: number[]) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return u > 0 ? inter / u : 0;
}
function scaleAi(ai: DetectResponse, W: number, H: number): Det[] {
  return ai.detections.map((d) => ({ ...d, source: "ai" as const,
    box: (ai.normalized ? [d.box[0] * W, d.box[1] * H, d.box[2] * W, d.box[3] * H] : d.box) as Det["box"] }));
}
/** Only genuinely new boxes: an overlap with something already found is the same defect. */
function addNew(existing: Det[], incoming: Det[]): Det[] {
  const out = [...existing];
  for (const n of incoming) if (!out.some((e) => iou(e.box, n.box) > (e.label === n.label ? 0.3 : 0.45))) out.push(n);
  return out;
}

async function postBlob<T>(url: string, blob: Blob): Promise<T> {
  const r = await fetch(url, { method: "POST", body: blob });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.detail || d.error) throw new Error(d.detail || d.error || `${url.split("?")[0]} ${r.status}`);
  return d as T;
}

function imageSize(blob: Blob): Promise<{ width: number; height: number; img: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, img });
    img.onerror = () => reject(new Error("could not read the image"));
    img.src = URL.createObjectURL(blob);
  });
}
async function shrink(blob: Blob): Promise<Blob> {
  const { width, height, img } = await imageSize(blob);
  const longest = Math.max(width, height);
  if (longest <= MAX_DIM) return blob;
  const k = MAX_DIM / longest;
  const c = document.createElement("canvas");
  c.width = Math.round(width * k); c.height = Math.round(height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? blob), "image/jpeg", 0.9));
}

/* ── detection (ML + AI round 1, then AI round 2) ── */
async function runDetection(rowId: string, label: string, shotId: string, blob: Blob) {
  const set = (f: (s: Shot) => Shot) => patch(rowId, (s) => ({ ...s, shots: s.shots.map((x) => (x.id === shotId ? f(x) : x)) }));
  const [ml, ai] = await Promise.allSettled([
    postBlob<DetectResponse>(`/api/facade-detect?threshold=${ML_THRESHOLD}`, blob),
    postBlob<DetectResponse>(`/api/facade-vision?threshold=${AI_THRESHOLD}`, blob),
  ]);
  patch(rowId, (s) => ({ ...s, mlOk: ml.status === "fulfilled" }));
  let W: number, H: number, dets: Det[];
  if (ml.status === "fulfilled") {
    W = ml.value.width; H = ml.value.height;
    dets = ml.value.detections.map((d) => ({ ...d, source: "ml" as const }));
    if (ai.status === "fulfilled") dets = addNew(dets, scaleAi(ai.value, W, H));
  } else if (ai.status === "fulfilled") {
    ({ width: W, height: H } = await imageSize(blob));
    dets = scaleAi(ai.value, W, H);
  } else {
    set((x) => ({ ...x, status: "error", error: `${(ml.reason as Error)?.message ?? "ML unavailable"} · ${(ai.reason as Error)?.message ?? "AI unavailable"}` }));
    return;
  }
  set((x) => ({ ...x, status: "done", width: W, height: H, dets, pass2: true }));
  writeSummary(rowId, label);
  try {   // round 2: the AI looks again, told what is found, and reports only misses
    const prior = dets.map((d) => ({ label: d.label, box: d.box.map((v, i) => Math.round((v / (i % 2 === 0 ? W : H)) * 1000) / 1000) }));
    const q = new URLSearchParams({ threshold: String(AI_THRESHOLD), round: "2", prior: JSON.stringify(prior) });
    const ai2 = await postBlob<DetectResponse>(`/api/facade-vision?${q}`, blob);
    set((x) => ({ ...x, dets: addNew(x.dets, scaleAi(ai2, W, H)), pass2: false }));
  } catch {
    set((x) => ({ ...x, pass2: false }));   // a bonus; round 1 stands
  }
  writeSummary(rowId, label);
}

/** The per-building summary the F criterion reads: this session's photos plus
 *  what was saved before (photos from earlier sessions are not kept). */
function writeSummary(rowId: string, label: string) {
  const s = session(rowId);
  const done = s.shots.filter((x) => x.status === "done");
  const p = s.prior;
  const byClass: Record<string, number> = { ...(p?.byClass ?? {}) };
  const aiByClass: Record<string, number> = { ...(p?.aiByClass ?? {}) };
  let defectCount = p?.defectCount ?? 0;
  for (const shot of done) for (const d of shot.dets) {
    byClass[d.label] = (byClass[d.label] ?? 0) + 1;
    if (d.source === "ai") aiByClass[d.label] = (aiByClass[d.label] ?? 0) + 1;
    defectCount++;
  }
  const imageCount = (p?.imageCount ?? 0) + done.length;
  if (!imageCount) { void saveFacade(rowId, null).catch(() => {}); return; }
  const svOnlyNow = done.every((x) => x.source === "streetview");
  const lowNow = done.every((x) => x.source === "streetview" && (x.mmPerPx ?? 0) > LOW_DETAIL_MM_PER_PX);
  const summary: FacadeDefectSummary = {
    label, imageCount, defectCount, byClass, aiByClass,
    // Weaker evidence flags hold only if they hold for every photo, earlier ones included.
    streetviewOnly: (p ? p.streetviewOnly !== false : true) && svOnlyNow,
    lowDetail: (p ? p.lowDetail === true : true) && lowNow,
    checkedAt: new Date().toISOString(),
  };
  void saveFacade(rowId, summary).catch(() => {});
}

export function clearFacade(rowId: string) {
  sessions.set(rowId, { shots: [], sv: {}, prior: null, mlOk: null });
  emit();
  void saveFacade(rowId, null).catch(() => {});
}

let uid = 0;
const nextId = () => `s${Date.now().toString(36)}${uid++}`;

export async function addUpload(rowId: string, label: string, orientation: Orientation, file: File) {
  const blob = await shrink(file);
  const { width, height } = await imageSize(blob);
  const shot: Shot = { id: nextId(), orientation, source: "upload", name: file.name, url: URL.createObjectURL(blob),
    width, height, dets: [], status: "running" };
  patch(rowId, (s) => ({ ...s, shots: [...s.shots, shot] }));
  await runDetection(rowId, label, shot.id, blob);
}

/* Street View: the whole wall, stitched from the panoramas facing it and
   flattened onto the wall plane (backend /api/streetview/facade, framing=facade). */
interface SvResponse {
  images: { b64: string }[]; mm_per_px: number;
  pano: { date: string | null };
  facade: { aimed_at: string; lat?: number; lon?: number; rectified?: boolean; wall_shown?: number };
}
const wallClaims = new Map<string, Orientation>();   // one physical wall is photographed once

export async function captureStreetView(rowId: string, label: string, lat: number, lon: number, o: Orientation) {
  const setSv = (v: { busy: boolean; error: string | null }) => patch(rowId, (s) => ({ ...s, sv: { ...s.sv, [o]: v } }));
  setSv({ busy: true, error: null });
  try {
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon), orientation: o, country: "se", framing: "facade" });
    const r = await fetch(`/api/streetview/facade?${q}`);
    const res = await r.json().catch(() => ({})) as SvResponse & { detail?: string };
    if (!r.ok) throw new Error(typeof res.detail === "string" ? res.detail : `Street View ${r.status}`);
    if (res.facade.aimed_at === "footprint_wall" && res.facade.lat != null && res.facade.lon != null) {
      const wall = `${rowId}|${res.facade.lat.toFixed(5)},${res.facade.lon.toFixed(5)}`;
      const owner = wallClaims.get(wall);
      if (owner && owner !== o) { setSv({ busy: false, error: `same wall as ${owner}` }); return; }
      wallClaims.set(wall, o);
    }
    const bytes = Uint8Array.from(atob(res.images[0].b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const { width, height } = await imageSize(blob);
    const shot: Shot = {
      id: nextId(), orientation: o, source: "streetview", url: URL.createObjectURL(blob), width, height, dets: [],
      status: "running", mmPerPx: res.mm_per_px,
      name: `Street View ${res.pano.date ?? ""} · ${Math.round(res.mm_per_px)} mm/px`
        + (res.facade.rectified && res.facade.wall_shown && res.facade.wall_shown < 0.95 ? ` · ${Math.round(res.facade.wall_shown * 100)}%` : ""),
    };
    patch(rowId, (s) => ({ ...s, shots: [...s.shots, shot] }));
    setSv({ busy: false, error: null });
    await runDetection(rowId, label, shot.id, blob);
  } catch (e) {
    setSv({ busy: false, error: String((e as Error).message || e) });
  }
}

/** All four sides of one building from Street View (the wizard's batch uses this). */
export async function inspectStreetView(rowId: string, label: string, lat: number, lon: number) {
  for (const o of ORIENTATIONS) await captureStreetView(rowId, label, lat, lon, o);
}
