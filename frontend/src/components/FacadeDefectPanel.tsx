import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Upload, Loader2, X, ChevronDown, ChevronUp,
  Building2, Sparkles, Maximize2, Download, Camera,
} from "lucide-react";
import { api, type FacadeDetectResponse, type FacadeDetection } from "../api/client";
import {
  useWizardStore, FACADE_ORIENTATIONS,
  type FacadeDefectSummary, type FacadeOrientation, type FacadePhotoRecord,
} from "../store/wizard";

/** Compass labels for the four facade slots. Order matches FACADE_ORIENTATIONS. */
const ORIENTATION_LABELS: Record<FacadeOrientation, string> = {
  north: "North", east: "East", south: "South", west: "West",
};
const ORIENTATION_SHORT: Record<FacadeOrientation, string> = {
  north: "N", east: "E", south: "S", west: "W",
};

/* Facade defect classes + colours — matched to the on-host MBDD2025 model and the
   3D viewer's Facade Inspector legend so results look consistent across the app. */
const DEFECT_COLORS: Record<string, string> = {
  crack: "#e6194B", leakage: "#4363d8", abscission: "#f58231",
  corrosion: "#3cb44b", bulge: "#911eb4", other: "#9ca3af",
};
const DEFECT_LABELS: Record<string, string> = {
  crack: "Crack", leakage: "Leakage / staining", abscission: "Spalling / abscission",
  corrosion: "Corrosion", bulge: "Bulge / deformation", other: "Other defect",
};
const colorFor = (label: string) => DEFECT_COLORS[label] ?? "#ffe119";

const MAX_UPLOAD_DIM = 1280;

export interface FacadeBuilding {
  key: string; label: string;
  /** Address point - enables Street View capture (the backend finds the footprint). */
  lat?: number | null; lon?: number | null; country?: "se" | "gb";
}

interface ImgEntry {
  id: string; name: string; url: string; blob: Blob;
  orientation: FacadeOrientation;
  /** Street View imagery is analysed but never persisted (Google Maps Platform terms). */
  source: "upload" | "streetview";
  status: "idle" | "running" | "done" | "error";
  result: FacadeDetectResponse | null; error: string | null; ms: number | null;
  /** Set once the annotated render has been persisted for the Step 5 report. */
  savedUrl: string | null;
  /** How much wall one pixel covers, for Street View captures. Decides whether
   *  "nothing found" is worth anything - see LOW_DETAIL_MM_PER_PX. */
  mmPerPx?: number | null;
}

/**
 * Coarser than this and a clean result means little: the wall is there, but a
 * crack narrower than a few pixels cannot appear in the image at all. Measured
 * on Rotherham captures - the vision model found a crack and a damp patch on a
 * wall imaged at 21 mm/px, and nothing on walls at 49 and 65 mm/px, which are
 * long facades only one distant, sharply angled panorama could see. Hairline
 * cracking needs roughly 2 mm/px, which street imagery never reaches, so this
 * threshold marks "worth looking at", not "good enough for a survey".
 */
const LOW_DETAIL_MM_PER_PX = 35;

let _uid = 0;
/** Also the persisted filename, so keep it inside the backend's [A-Za-z0-9_-] rule. */
const nextId = () => `img-${Date.now()}-${_uid++}-${Math.random().toString(36).slice(2, 8)}`;

/* ── geometry helpers ──────────────────────────────────────────────────────── */
function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0]!, b[0]!), y1 = Math.max(a[1]!, b[1]!);
  const x2 = Math.min(a[2]!, b[2]!), y2 = Math.min(a[3]!, b[3]!);
  const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const areaA = (a[2]! - a[0]!) * (a[3]! - a[1]!), areaB = (b[2]! - b[0]!) * (b[3]! - b[1]!);
  const u = areaA + areaB - inter;
  return u > 0 ? inter / u : 0;
}

function mergeDetections(ml: FacadeDetectResponse, ai: FacadeDetectResponse | null): FacadeDetectResponse {
  const mlDets: FacadeDetection[] = ml.detections.map(d => ({ ...d, source: "ml" }));
  if (!ai || !ai.detections.length) return { ...ml, detections: mlDets };
  const W = ml.width, H = ml.height;
  const aiDets: FacadeDetection[] = ai.detections.map(d => ({
    ...d, source: "ai",
    box: (ai.normalized
      ? [d.box[0] * W, d.box[1] * H, d.box[2] * W, d.box[3] * H]
      : d.box) as [number, number, number, number],
  }));
  const aiKept = aiDets.filter(a => !mlDets.some(m => iou(m.box, a.box) > 0.45));
  return { width: W, height: H, detections: [...mlDets, ...aiKept], model: ai.model };
}

function prepImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= MAX_UPLOAD_DIM) { URL.revokeObjectURL(url); resolve(file); return; }
      const scale = MAX_UPLOAD_DIM / longest;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => resolve(b ?? file), "image/jpeg", 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read uploaded image dimensions"));
    };
    img.src = url;
  });
}

/** Draw an image + defect boxes onto a canvas, scaled to fit maxW × maxH. */
function drawAnnotated(canvas: HTMLCanvasElement, img: HTMLImageElement, result: FacadeDetectResponse | null, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (!result) return;
  const sx = canvas.width / (result.width || img.naturalWidth);
  const sy = canvas.height / (result.height || img.naturalHeight);
  const lw = Math.max(2, canvas.width * 0.005);
  ctx.font = `${Math.max(11, Math.round(canvas.width * 0.022))}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  result.detections.forEach((d, i) => {
    const [x1, y1, x2, y2] = d.box;
    const c = colorFor(d.label);
    const isAi = d.source === "ai";
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.setLineDash(isAi ? [lw * 3, lw * 2] : []);
    ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
    ctx.setLineDash([]);
    const cap = `${i + 1}. ${isAi ? "AI " : ""}${d.label} ${Math.round(d.score * 100)}%`;
    const w = ctx.measureText(cap).width + 8;
    const ty = Math.max(0, y1 * sy - 17);
    ctx.fillStyle = c; ctx.fillRect(x1 * sx, ty, w, 17);
    ctx.fillStyle = "#fff"; ctx.fillText(cap, x1 * sx + 3, ty + 1);
  });
}

/** Render the annotated image (photo + boxes) to a JPEG blob at full detection
 *  resolution - used both for the Step 5 copy on the backend and for the
 *  lightbox's Download, so what is downloaded is exactly what is reported. */
function renderAnnotatedBlob(entry: ImgEntry): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      drawAnnotated(canvas, img, entry.result, img.naturalWidth, img.naturalHeight);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    };
    img.onerror = () => resolve(null);
    img.src = entry.url;
  });
}

/** A canvas that (re)paints the annotated image; `mode` sets the target size. */
function AnnotatedCanvas({ entry, mode, className, onClick }: {
  entry: ImgEntry; mode: "thumb" | "full"; className?: string; onClick?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (mode !== "full") return;
    const on = () => setTick(t => t + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [mode]);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const maxW = mode === "full" ? Math.min(window.innerWidth * 0.82, 1400) : 460;
    const maxH = mode === "full" ? window.innerHeight * 0.8 : 9999;
    const img = new Image();
    img.onload = () => drawAnnotated(canvas, img, entry.result, maxW, maxH);
    img.src = entry.url;
  }, [entry.url, entry.result, mode, tick]);
  return <canvas ref={ref} onClick={onClick} className={className} />;
}

/* ── Lightbox: full-size image + a list of every issue found ────────────────── */
function Lightbox({ entry, buildingLabel, onClose, onDownload }: {
  entry: ImgEntry; buildingLabel: string; onClose: () => void; onDownload: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  const dets = entry.result?.detections ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of dets) c[d.label] = (c[d.label] ?? 0) + 1;
    return c;
  }, [dets]);

  return createPortal(
    // `outside-root-portal`: this renders into document.body, OUTSIDE #root, so the
    // bright-mode inversion never reaches it - but the global `canvas` rule that
    // normally CANCELS that inversion still applied, showing every photo with its
    // colours inverted (red brick came out pale green). See index.css.
    <div className="outside-root-portal fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-[#0d1117] border border-white/15 rounded-xl max-w-[96vw] max-h-[94vh] overflow-hidden flex flex-col md:flex-row shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center bg-black/50 p-2 overflow-auto">
          <AnnotatedCanvas entry={entry} mode="full" className="max-w-full block" />
        </div>
        <div className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-white/10 flex flex-col">
          <div className="flex items-start gap-2 px-3.5 py-3 border-b border-white/10">
            <Building2 className="w-4 h-4 text-violet-300 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{buildingLabel}</div>
              <div className="text-[10px] text-white/40 truncate">
                {ORIENTATION_LABELS[entry.orientation]} facade · {entry.name}
              </div>
            </div>
            <button onClick={onDownload} title="Download this photo with the detected issues drawn on it"
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"><Download className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center gap-1.5 flex-wrap text-[11px]">
            {dets.length === 0
              ? <span className="text-emerald-400 font-medium">No defects detected</span>
              : <>
                  <span className="text-white/50 font-semibold">{dets.length} issue{dets.length === 1 ? "" : "s"}:</span>
                  {Object.entries(counts).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${colorFor(k)}22`, color: colorFor(k) }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: colorFor(k) }} /> {v}× {DEFECT_LABELS[k] ?? k}
                    </span>
                  ))}
                </>}
          </div>
          <div className="flex-1 overflow-auto px-2 py-2 space-y-1.5">
            {dets.map((d, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/[0.03]">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: colorFor(d.label) }}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-medium text-white/85">{DEFECT_LABELS[d.label] ?? d.label}</span>
                    <span className="text-[10px] text-white/40">{Math.round(d.score * 100)}%</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded ${d.source === "ai" ? "bg-sky-600/25 text-sky-300" : "bg-violet-600/25 text-violet-300"}`}>
                      {d.source === "ai" ? "AI vision" : "ML model"}
                    </span>
                  </div>
                  {d.note && <div className="text-[10px] text-white/40 mt-0.5">{d.note}</div>}
                </div>
              </div>
            ))}
            {dets.length === 0 && <div className="text-[11px] text-white/30 px-2 py-3 text-center">Nothing flagged on this photo. Try Sensitivity → High.</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Compact thumbnail ─────────────────────────────────────────────────────── */
function Thumb({ entry, onOpen, onRemove, onRerun }: {
  entry: ImgEntry; onOpen: () => void; onRemove: () => void; onRerun: () => void;
}) {
  const total = entry.result?.detections.length ?? 0;
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
      <div className="relative group bg-black/40 flex items-center justify-center cursor-zoom-in" onClick={onOpen}>
        <AnnotatedCanvas entry={entry} mode="thumb" className="max-w-full block" />
        {entry.status === "running" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white/80 text-[10px] gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting…
          </div>
        )}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/25 flex items-center justify-center pointer-events-none">
          <Maximize2 className="w-5 h-5 text-white/90" />
        </div>
        <button onClick={e => { e.stopPropagation(); onRemove(); }} title="Remove"
          className="absolute top-1 right-1 p-0.5 rounded bg-black/60 hover:bg-red-900/70 text-white/70 hover:text-white transition">
          <X className="w-3 h-3" />
        </button>
        {entry.status === "done" && (
          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={total > 0 ? { background: "#000a", color: "#fca5a5" } : { background: "#000a", color: "#6ee7b7" }}>
            {total > 0 ? `${total} defect${total === 1 ? "" : "s"}` : "clean"}
          </span>
        )}
      </div>
      <div className="px-2 py-1 flex items-center gap-1.5 text-[10px]">
        <span className="text-white/40 truncate flex-1" title={entry.name}>{entry.name}</span>
        {entry.status === "error" && <span className="text-red-400 shrink-0" title={entry.error ?? ""}>failed</span>}
        <button onClick={onRerun} disabled={entry.status === "running"}
          className="text-white/35 hover:text-white shrink-0 disabled:opacity-40">↻</button>
      </div>
    </div>
  );
}

/* ── defect chips for a collapsed building header ───────────────────────────── */
function SummaryChips({ s }: { s: FacadeDefectSummary | undefined }) {
  if (!s) return null;
  if (s.defectCount === 0) return <span className="text-[10px] text-emerald-400 font-medium">no defects</span>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {Object.entries(s.byClass).map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-0.5" title={DEFECT_LABELS[k] ?? k}>
          <span className="w-2 h-2 rounded-full" style={{ background: colorFor(k) }} />
          <span className="text-[10px]" style={{ color: colorFor(k) }}>{v}</span>
        </span>
      ))}
    </span>
  );
}

/** Buildings auto-captured without asking; beyond this the per-slot button applies. */
const AUTO_CAPTURE_MAX_BUILDINGS = 12;

const SENSITIVITY = [
  { label: "High (more boxes)", value: 0.3 },
  { label: "Medium", value: 0.45 },
  { label: "Low (surest only)", value: 0.6 },
];

export default function FacadeDefectPanel({ buildings }: { buildings: FacadeBuilding[] }) {
  const { project, setProject } = useWizardStore();
  const [imagesByBuilding, setImagesByBuilding] = useState<Record<string, ImgEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Which facade slot is under an active drag, keyed "<building>|<orientation>". */
  const [dragSlot, setDragSlot] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.45);
  const [aiAssist, setAiAssist] = useState(true);
  const [lightbox, setLightbox] = useState<{ entry: ImgEntry; label: string } | null>(null);
  /** Street View capture state per facade slot, keyed "<building>|<orientation>". */
  const [svSlots, setSvSlots] = useState<Record<string, { busy: boolean; error: string | null }>>({});
  const warmed = useRef(false);

  /* Auto-capture: every facade of every building in scope is pulled from Street
     View as soon as the panel opens, so the inspection starts from whatever the
     street already shows and photos are only needed where that falls short.
     Each capture costs a handful of Google requests, hence the off switch. */
  const [autoCapture, setAutoCapture] = useState(true);
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null);
  /** Slots auto-capture has already claimed, so re-renders never re-request one. */
  const autoClaimed = useRef<Set<string>>(new Set());
  const autoStopped = useRef(false);
  const autoQueue = useRef<{ b: FacadeBuilding; o: FacadeOrientation }[]>([]);
  const autoRunning = useRef(false);
  const unmounted = useRef(false);
  // Reset on mount, not just set on unmount: StrictMode mounts, unmounts and
  // remounts in dev, which otherwise latches this true and kills the queue.
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; };
  }, []);
  /** Mirror of the images map, read inside the effect without re-triggering it. */
  const imagesRef = useRef(imagesByBuilding);
  imagesRef.current = imagesByBuilding;

  // Warm on mount: the panel only mounts once its wizard section is opened, so
  // mounting is the same signal the old `open` flag carried.
  useEffect(() => {
    if (warmed.current) return;
    warmed.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    canvas.getContext("2d")!.fillRect(0, 0, 32, 32);
    canvas.toBlob(b => { if (b) api.facadeDetect(b, 0.9).catch(() => {}); }, "image/jpeg");
  }, []);

  const setImages = (key: string, updater: (prev: ImgEntry[]) => ImgEntry[]) =>
    setImagesByBuilding(prev => ({ ...prev, [key]: updater(prev[key] ?? []) }));

  const writeSummary = (key: string, entries: ImgEntry[]) => {
    const done = entries.filter(e => e.status === "done");
    const byClass: Record<string, number> = {};
    const byOrientation: Partial<Record<FacadeOrientation, { imageCount: number; defectCount: number; byClass: Record<string, number> }>> = {};
    let defectCount = 0;
    for (const e of done) {
      const o = (byOrientation[e.orientation] ??= { imageCount: 0, defectCount: 0, byClass: {} });
      o.imageCount++;
      for (const d of e.result?.detections ?? []) {
        byClass[d.label] = (byClass[d.label] ?? 0) + 1;
        o.byClass[d.label] = (o.byClass[d.label] ?? 0) + 1;
        o.defectCount++;
        defectCount++;
      }
    }
    // Only photos already persisted can appear in Step 5 - a record pointing at
    // a URL the backend never received would render as a broken image there.
    const photos: FacadePhotoRecord[] = done
      .filter(e => e.savedUrl)
      .map(e => ({
        id: e.id, url: e.savedUrl!, name: e.name, orientation: e.orientation,
        width: e.result?.width ?? 0, height: e.result?.height ?? 0,
        detections: (e.result?.detections ?? []).map(d => ({
          label: d.label, score: d.score, box: d.box, source: d.source, note: d.note,
        })),
        checkedAt: new Date().toISOString(),
      }));
    const summary: FacadeDefectSummary = {
      label: buildings.find(b => b.key === key)?.label,
      imageCount: done.length, defectCount, byClass,
      // Where the evidence came from. A clean result from street imagery alone
      // is weaker than one from uploaded close-ups, and the prioritisation
      // scores it with lower confidence rather than as a clean bill of health.
      streetviewOnly: done.length > 0 && done.every(e => e.source === "streetview"),
      // Best detail any photo achieved. If even the best is too coarse to show a
      // defect, "nothing found" says nothing about the wall.
      lowDetail: done.length > 0 && done.every(
        e => e.source === "streetview" && (e.mmPerPx ?? 0) > LOW_DETAIL_MM_PER_PX),
      checkedAt: new Date().toISOString(), byOrientation, photos,
    };
    const next = { ...(project.facadeDefects ?? {}) };
    if (done.length === 0) delete next[key]; else next[key] = summary;
    setProject({ facadeDefects: next });
  };

  /**
   * Read the glazed share of one facade from its photo and keep it for Step 3.
   *
   * Once per building per direction: a second photo of the same wall would cost
   * another vision call to re-measure something we already have. The ratio goes
   * into the baseline simulation per facade, which matters for solar gain as
   * much as for heat loss - the same glass area costs noticeably more heating on
   * a north wall than on a south one.
   */
  const estimateWwrFor = async (b: FacadeBuilding, orientation: FacadeOrientation, blob: Blob) => {
    if (project.facadeWwr?.[b.key]?.[orientation]) return;
    try {
      const res = await api.estimateWwr(blob, orientation, { address: b.label });
      const pct = Number(res?.wwr);
      if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return;   // reject a nonsense reading
      const store = useWizardStore.getState();
      const all = { ...(store.project.facadeWwr ?? {}) };
      all[b.key] = {
        ...(all[b.key] ?? {}),
        [orientation]: { wwr: pct / 100, confidence: res.confidence ?? "unknown", source: res.source, at: new Date().toISOString() },
      };
      store.setProject({ facadeWwr: all });
    } catch {
      // Glazing is a bonus on top of the defect check; never fail the photo for it.
    }
  };

  const runDetection = async (key: string, id: string, blob: Blob) => {
    setImages(key, prev => prev.map(e => e.id === id ? { ...e, status: "running", error: null } : e));
    const t0 = performance.now();
    try {
      const [mlRes, aiRes] = await Promise.allSettled([
        api.facadeDetect(blob, threshold),
        aiAssist ? api.facadeVision(blob, 0.3) : Promise.resolve(null),
      ]);

      let result: FacadeDetectResponse;
      const mlOk = mlRes.status === "fulfilled";
      const aiOk = aiRes.status === "fulfilled" && !!aiRes.value;

      if (mlOk) {
        const ai = aiOk ? aiRes.value : null;
        result = mergeDetections(mlRes.value, ai);
      } else if (aiOk && aiRes.value) {
        // ML failed but AI still produced detections: keep the workflow alive.
        const ai = aiRes.value;
        const { width, height } = await readImageSize(blob);
        const aiPx: FacadeDetection[] = (ai.detections ?? []).map((d) => ({
          ...d,
          source: "ai",
          box: (ai.normalized
            ? [d.box[0] * width, d.box[1] * height, d.box[2] * width, d.box[3] * height]
            : d.box) as [number, number, number, number],
        }));
        result = {
          detections: aiPx,
          width,
          height,
          model: ai.model ?? "AI vision",
          normalized: false,
        } as FacadeDetectResponse;
      } else {
        const mlErr = mlRes.status === "rejected" ? (mlRes.reason instanceof Error ? mlRes.reason.message : String(mlRes.reason)) : "ML unavailable";
        const aiErr = aiRes.status === "rejected" ? (aiRes.reason instanceof Error ? aiRes.reason.message : String(aiRes.reason)) : "AI unavailable";
        throw new Error(`Detection failed: ${mlErr}. ${aiAssist ? aiErr : "AI assist disabled."}`);
      }

      const ms = performance.now() - t0;
      let doneEntry: ImgEntry | undefined;
      setImages(key, prev => {
        const next = prev.map(e => e.id === id ? { ...e, status: "done" as const, result, ms } : e);
        doneEntry = next.find(e => e.id === id);
        writeSummary(key, next);
        return next;
      });

      // Persist the annotated render so Step 5 can show it after a reload. A
      // failure here must not fail the detection the user is looking at - the
      // photo simply stays session-only and is left out of the report. Street View
      // captures always stay session-only: Google's terms do not allow keeping
      // copies of the imagery, so only the defect counts reach the store.
      if (doneEntry && doneEntry.source !== "streetview") {
        try {
          const annotated = await renderAnnotatedBlob(doneEntry);
          if (annotated) {
            const saved = await api.facadeImageSave(id, annotated);
            setImages(key, prev => {
              const next = prev.map(e => e.id === id ? { ...e, savedUrl: saved.url } : e);
              writeSummary(key, next);
              return next;
            });
          }
        } catch {
          /* report copy unavailable; the panel itself still works */
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImages(key, prev => prev.map(e => e.id === id ? { ...e, status: "error", error: msg } : e));
    }
  };

  const addFiles = async (key: string, orientation: FacadeOrientation, fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    setExpanded(prev => new Set(prev).add(key));  // auto-expand the building we're adding to
    for (const f of files) {
      const blob = await prepImage(f);
      const entry: ImgEntry = {
        id: nextId(), name: f.name, url: URL.createObjectURL(blob), blob, orientation, source: "upload",
        status: "idle", result: null, error: null, ms: null, savedUrl: null,
      };
      setImages(key, prev => [...prev, entry]);
      void runDetection(key, entry.id, blob);
      // An uploaded photo is the best look at this wall we will get, so read its
      // glazing too (the first upload per facade; see estimateWwrFor).
      const b = buildings.find(x => x.key === key);
      if (b) void estimateWwrFor(b, orientation, blob);
    }
  };

  /** Pull this facade from Street View and run it through the same detection.
   *  The backend returns the WHOLE wall: shots from the panoramas that face it,
   *  flattened onto the wall plane, so verticals stay straight. */
  const captureStreetView = async (b: FacadeBuilding, orientation: FacadeOrientation, auto = false) => {
    if (b.lat == null || b.lon == null) return;
    const slotKey = `${b.key}|${orientation}`;
    setSvSlots(prev => ({ ...prev, [slotKey]: { busy: true, error: null } }));
    // Auto-capture must not yank every building open while it runs.
    if (!auto) setExpanded(prev => new Set(prev).add(b.key));
    try {
      const res = await api.streetviewFacade(b.lat, b.lon, orientation, b.country ?? "se");
      const shot = res.images[0]!;
      const bytes = Uint8Array.from(atob(shot.b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/jpeg" });
      const entry: ImgEntry = {
        id: nextId(),
        // The name carries what matters for trusting the result: imagery age, how
        // much wall one pixel covers (hairline cracks need ~2 mm/px), and whether
        // this is the whole wall or only the part a passing camera could see.
        name: `Street View ${res.pano.date ?? ""} · ${Math.round(res.mm_per_px)} mm/px`
          + (res.facade.rectified
            ? (res.facade.wall_shown && res.facade.wall_shown < 0.95
              ? ` · ${Math.round(res.facade.wall_shown * 100)}% of wall` : " · whole wall")
            : " · close-up (no square-on view)"),
        url: URL.createObjectURL(blob), blob, orientation, source: "streetview",
        status: "idle", result: null, error: null, ms: null, savedUrl: null,
        mmPerPx: res.mm_per_px,
      };
      setImages(b.key, prev => [...prev, entry]);
      setSvSlots(prev => ({ ...prev, [slotKey]: { busy: false, error: null } }));
      void runDetection(b.key, entry.id, blob);
      // Only from a capture that can actually show the windows; a coarse photo
      // would have the vision model guessing from the building type instead.
      if ((res.mm_per_px ?? 0) <= LOW_DETAIL_MM_PER_PX) void estimateWwrFor(b, orientation, blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSvSlots(prev => ({ ...prev, [slotKey]: { busy: false, error: msg } }));
    }
  };

  /* Queue every uncaptured facade as soon as the panel opens (or the building set
     changes). Runs a few at a time: each capture is several Google requests plus a
     detection pass, and firing 40 at once would stall both. Failures stay on their
     own slot - one wall with no clear view must not stop the rest. */
  useEffect(() => {
    if (!autoCapture) return;
    const targets: { b: FacadeBuilding; o: FacadeOrientation }[] = [];
    // A neighbourhood selection can hold dozens of buildings, and every facade is
    // billed Google requests. Automatic means automatic for a working set, not a
    // silent spend on a hundred buildings - the rest stay one click away.
    for (const b of buildings.slice(0, AUTO_CAPTURE_MAX_BUILDINGS)) {
      if (b.lat == null || b.lon == null) continue;
      for (const o of FACADE_ORIENTATIONS) {
        const slotKey = `${b.key}|${o}`;
        if (autoClaimed.current.has(slotKey)) continue;
        // Never overwrite a facade the user has already filled themselves.
        if ((imagesRef.current[b.key] ?? []).some(e => e.orientation === o)) continue;
        autoClaimed.current.add(slotKey);
        targets.push({ b, o });
      }
    }
    // The queue lives in a ref and the workers are NOT torn down by this effect:
    // Step 2 re-renders whenever a detection writes its summary, which hands down a
    // fresh `buildings` array. Cancelling on cleanup stopped the run after the
    // first few captures and froze the counter.
    if (targets.length) {
      autoQueue.current.push(...targets);
      setAutoProgress(p => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + targets.length }));
    }
    // Nothing new, but a remount may have left the queue standing: restart it.
    if (!autoQueue.current.length || autoRunning.current) return;

    autoRunning.current = true;
    autoStopped.current = false;
    const worker = async () => {
      while (!autoStopped.current && !unmounted.current) {
        const t = autoQueue.current.shift();
        if (!t) break;
        await captureStreetView(t.b, t.o, true);
        if (!unmounted.current) setAutoProgress(p => (p ? { ...p, done: p.done + 1 } : null));
      }
    };
    void Promise.all([worker(), worker(), worker()]).finally(() => { autoRunning.current = false; });
    // `buildings` is compared by its keys, not identity, and captureStreetView is
    // re-created every render - neither belongs in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, buildings.map(b => b.key).join("|")]);

  const removeImage = (key: string, id: string) => {
    setImages(key, prev => {
      const gone = prev.find(e => e.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      // Drop the stored copy too, so deleting a photo here also removes it from
      // the Step 5 report rather than leaving an orphan on disk.
      if (gone?.savedUrl) void api.facadeImageDelete(id).catch(() => {});
      const next = prev.filter(e => e.id !== id);
      writeSummary(key, next);
      return next;
    });
  };

  /** Download the annotated photo - what you see boxed is what you get. */
  const downloadAnnotated = async (entry: ImgEntry, buildingLabel: string) => {
    const blob = await renderAnnotatedBlob(entry);
    if (!blob) return;
    const safe = `${buildingLabel}_${entry.orientation}`.replace(/[^\w-]+/g, "_");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facade_${safe}_${entry.name.replace(/\.[^.]+$/, "")}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (key: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  useEffect(() => () => {
    Object.values(imagesByBuilding).flat().forEach(e => URL.revokeObjectURL(e.url));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!buildings.length) return null;

  const summaries = project.facadeDefects ?? {};
  const totalChecked = Object.keys(summaries).length;

  return (
    // No wrapper box and no header of its own: this panel is always rendered
    // inside the "Facade Defect Detection" wizard section, which already gives
    // it a title, a number and a collapse control. Repeating them here produced
    // two nested panels saying the same thing.
    <div className="space-y-3">
        {/* AI + sensitivity. The building picker and the single shared drop zone
            are gone: each building now has its own four facade slots, so the
            upload target is the slot you drop onto - there is nothing to pick. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-white/45">
            Every facade is pulled from Street View automatically; upload photos where the street view is blocked or
            too coarse. The MBDD2025 detector flags cracks, leakage, spalling, corrosion &amp; bulges.
            {totalChecked > 0 && <b className="text-violet-300"> · {totalChecked} building{totalChecked === 1 ? "" : "s"} checked</b>}
          </span>
          <label className="text-[11px] text-white/50 ml-auto flex items-center gap-1.5 cursor-pointer select-none"
            title="Also run a general vision model as a second opinion and merge anything the ML detector missed.">
            <input type="checkbox" checked={aiAssist} onChange={e => setAiAssist(e.target.checked)} className="w-3.5 h-3.5 accent-sky-500 cursor-pointer" />
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-sky-300" /> AI vision assist</span>
          </label>
          <label className="text-[11px] text-white/45 flex items-center gap-1.5">
            Sensitivity:
            <select value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              style={{ background: "#0d1117", color: "#e5e7eb" }}
              className="border border-white/15 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-violet-500/60">
              {SENSITIVITY.map(s => <option key={s.value} value={s.value} style={{ background: "#161b22", color: "#e5e7eb" }}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {/* Auto-capture: progress while it runs, and the switch to stop paying for it. */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] text-white/50 flex items-center gap-1.5 cursor-pointer select-none"
            title="Fetch all four facades of every building from Street View as soon as this panel opens. Each facade costs a few Google Street View requests.">
            <input type="checkbox" checked={autoCapture}
              onChange={e => { setAutoCapture(e.target.checked); if (!e.target.checked) autoStopped.current = true; }}
              className="w-3.5 h-3.5 accent-sky-500 cursor-pointer" />
            <span className="flex items-center gap-1"><Camera className="w-3 h-3 text-sky-300" /> Auto-capture from Street View</span>
          </label>
          {autoCapture && buildings.length > AUTO_CAPTURE_MAX_BUILDINGS && (
            <span className="text-[11px] text-white/35">
              first {AUTO_CAPTURE_MAX_BUILDINGS} buildings — capture the rest per facade
            </span>
          )}
          {autoProgress && autoProgress.done < autoProgress.total && !autoStopped.current && (
            <span className="text-[11px] text-sky-300/80 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Capturing facades… {autoProgress.done}/{autoProgress.total}
              <button onClick={() => { autoStopped.current = true; setAutoCapture(false); }}
                className="text-white/40 hover:text-white underline underline-offset-2">stop</button>
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] text-white/40">
          {Object.keys(DEFECT_LABELS).map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(k) }} /> {DEFECT_LABELS[k]}
            </span>
          ))}
        </div>

        {/* Every building, every facade. Buildings are always listed - a facade
            you have not photographed yet is a visible empty slot rather than a
            building missing from the list, which is what makes the four-facade
            coverage legible at a glance. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {buildings.map(b => {
            const imgs = imagesByBuilding[b.key] ?? [];
            const s = summaries[b.key];
            const isOpen = expanded.has(b.key);
            const running = imgs.some(e => e.status === "running");
            const covered = FACADE_ORIENTATIONS.filter(o => imgs.some(e => e.orientation === o)).length;
            return (
              <div key={b.key} className="rounded-lg border border-white/8 overflow-hidden">
                <button onClick={() => toggleExpand(b.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition ${isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/40 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />}
                  <Building2 className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  <span className="font-semibold text-white truncate">{b.label}</span>
                  <span className="text-[10px] text-white/35 shrink-0" title="Facades with at least one photo">
                    {covered}/4 facades
                  </span>
                  {running ? <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" /> : <SummaryChips s={s} />}
                </button>

                {isOpen && (
                  <div className="p-2.5 pt-1.5 grid gap-2"
                       style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    {FACADE_ORIENTATIONS.map(orientation => {
                      const slotImgs = imgs.filter(e => e.orientation === orientation);
                      const slotKey = `${b.key}|${orientation}`;
                      const isDragging = dragSlot === slotKey;
                      const slotDefects = slotImgs.reduce((n, e) => n + (e.result?.detections.length ?? 0), 0);
                      return (
                        <div key={orientation} className="rounded-lg border border-white/10 bg-black/15 overflow-hidden flex flex-col">
                          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/8">
                            <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-violet-600/25 text-violet-200 shrink-0">
                              {ORIENTATION_SHORT[orientation]}
                            </span>
                            <span className="text-[11px] font-semibold text-white/85 flex-1 truncate">
                              {ORIENTATION_LABELS[orientation]} facade
                            </span>
                            {slotImgs.length > 0 && (
                              <span className="text-[9px] shrink-0"
                                    style={{ color: slotDefects > 0 ? "#fca5a5" : "#6ee7b7" }}>
                                {slotDefects > 0 ? `${slotDefects} defect${slotDefects === 1 ? "" : "s"}` : "clean"}
                              </span>
                            )}
                          </div>

                          <div className="p-1.5 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                            {slotImgs.map(e => (
                              <Thumb key={e.id} entry={e}
                                onOpen={() => setLightbox({ entry: e, label: b.label })}
                                onRemove={() => removeImage(b.key, e.id)}
                                onRerun={() => runDetection(b.key, e.id, e.blob)} />
                            ))}
                          </div>

                          <label
                            onDragOver={ev => { ev.preventDefault(); setDragSlot(slotKey); }}
                            onDragLeave={() => setDragSlot(null)}
                            onDrop={ev => {
                              ev.preventDefault(); setDragSlot(null);
                              if (ev.dataTransfer.files) void addFiles(b.key, orientation, ev.dataTransfer.files);
                            }}
                            className={`mt-auto flex items-center justify-center gap-1.5 py-2 m-1.5 rounded-md border-2 border-dashed cursor-pointer transition ${
                              isDragging ? "border-violet-500 bg-violet-600/10" : "border-white/12 hover:border-white/25 hover:bg-white/[0.02]"}`}>
                            <Upload className="w-3.5 h-3.5 text-white/40" />
                            <span className="text-[10px] text-white/50">
                              {slotImgs.length ? "Add another photo" : `Upload ${ORIENTATION_LABELS[orientation].toLowerCase()} photo`}
                            </span>
                            <input type="file" accept="image/*" multiple style={{ display: "none" }}
                              onChange={ev => { if (ev.target.files) void addFiles(b.key, orientation, ev.target.files); ev.currentTarget.value = ""; }} />
                          </label>
                          {b.lat != null && b.lon != null && (
                            <>
                              <button onClick={() => void captureStreetView(b, orientation)}
                                disabled={svSlots[slotKey]?.busy}
                                title="Fetch the whole facade from Google Street View (stitched and straightened) and run defect detection on it. Takes ~5-10 s. Not saved to the report."
                                className="flex items-center justify-center gap-1.5 py-1.5 mx-1.5 mb-1.5 rounded-md border border-white/12 hover:border-sky-500/50 hover:bg-sky-600/10 transition disabled:opacity-50">
                                {svSlots[slotKey]?.busy
                                  ? <Loader2 className="w-3.5 h-3.5 text-sky-300 animate-spin" />
                                  : <Camera className="w-3.5 h-3.5 text-sky-300" />}
                                <span className="text-[10px] text-white/60">Capture from Street View</span>
                              </button>
                              {svSlots[slotKey]?.error && (
                                <div className="text-[10px] text-amber-300/90 px-2 pb-1.5 leading-snug">{svSlots[slotKey]!.error}</div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-white/30 leading-relaxed">
          Click a photo to enlarge, see every issue listed and download it with the boxes drawn on. The annotated copy is
          saved so the Step 5 report can show it; the per-facade defect summary also feeds the retrofit prioritization below.
        </p>

      {lightbox && (
        <Lightbox entry={lightbox.entry} buildingLabel={lightbox.label}
          onClose={() => setLightbox(null)}
          onDownload={() => void downloadAnnotated(lightbox.entry, lightbox.label)} />
      )}
    </div>
  );
}
