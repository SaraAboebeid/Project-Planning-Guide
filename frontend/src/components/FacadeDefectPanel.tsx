import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ScanSearch, Upload, Loader2, X, ChevronDown, ChevronUp, ImageOff, Cpu,
  Building2, Check, Sparkles, Maximize2,
} from "lucide-react";
import { api, type FacadeDetectResponse, type FacadeDetection } from "../api/client";
import { useWizardStore, type FacadeDefectSummary } from "../store/wizard";

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

export interface FacadeBuilding { key: string; label: string; }

interface ImgEntry {
  id: string; name: string; url: string; blob: Blob;
  status: "idle" | "running" | "done" | "error";
  result: FacadeDetectResponse | null; error: string | null; ms: number | null;
}

let _uid = 0;
const nextId = () => `img-${Date.now()}-${_uid++}`;

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
function Lightbox({ entry, buildingLabel, onClose }: { entry: ImgEntry; buildingLabel: string; onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
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
              <div className="text-[10px] text-white/40 truncate">{entry.name}</div>
            </div>
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

const SENSITIVITY = [
  { label: "High (more boxes)", value: 0.3 },
  { label: "Medium", value: 0.45 },
  { label: "Low (surest only)", value: 0.6 },
];

export default function FacadeDefectPanel({ buildings }: { buildings: FacadeBuilding[] }) {
  const { project, setProject } = useWizardStore();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string>(buildings[0]?.key ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imagesByBuilding, setImagesByBuilding] = useState<Record<string, ImgEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [threshold, setThreshold] = useState(0.45);
  const [aiAssist, setAiAssist] = useState(true);
  const [lightbox, setLightbox] = useState<{ entry: ImgEntry; label: string } | null>(null);
  const warmed = useRef(false);

  useEffect(() => {
    if (buildings.length && !buildings.some(b => b.key === activeKey)) setActiveKey(buildings[0]!.key);
  }, [buildings, activeKey]);

  useEffect(() => {
    if (!open || warmed.current) return;
    warmed.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    canvas.getContext("2d")!.fillRect(0, 0, 32, 32);
    canvas.toBlob(b => { if (b) api.facadeDetect(b, 0.9).catch(() => {}); }, "image/jpeg");
  }, [open]);

  const activeLabel = buildings.find(b => b.key === activeKey)?.label ?? "—";
  const setImages = (key: string, updater: (prev: ImgEntry[]) => ImgEntry[]) =>
    setImagesByBuilding(prev => ({ ...prev, [key]: updater(prev[key] ?? []) }));

  const writeSummary = (key: string, entries: ImgEntry[]) => {
    const done = entries.filter(e => e.status === "done");
    const byClass: Record<string, number> = {};
    let defectCount = 0;
    for (const e of done) for (const d of e.result?.detections ?? []) { byClass[d.label] = (byClass[d.label] ?? 0) + 1; defectCount++; }
    const summary: FacadeDefectSummary = { imageCount: done.length, defectCount, byClass, checkedAt: new Date().toISOString() };
    const next = { ...(project.facadeDefects ?? {}) };
    if (done.length === 0) delete next[key]; else next[key] = summary;
    setProject({ facadeDefects: next });
  };

  const runDetection = async (key: string, id: string, blob: Blob) => {
    setImages(key, prev => prev.map(e => e.id === id ? { ...e, status: "running", error: null } : e));
    const t0 = performance.now();
    try {
      const [ml, ai] = await Promise.all([
        api.facadeDetect(blob, threshold),
        aiAssist ? api.facadeVision(blob, 0.3).catch(() => null) : Promise.resolve(null),
      ]);
      const result = mergeDetections(ml, ai);
      const ms = performance.now() - t0;
      setImages(key, prev => {
        const next = prev.map(e => e.id === id ? { ...e, status: "done" as const, result, ms } : e);
        writeSummary(key, next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImages(key, prev => prev.map(e => e.id === id ? { ...e, status: "error", error: msg } : e));
    }
  };

  const addFiles = async (fileList: FileList | File[]) => {
    const key = activeKey;
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    setExpanded(prev => new Set(prev).add(key));  // auto-expand the building we're adding to
    for (const f of files) {
      const blob = await prepImage(f);
      const entry: ImgEntry = { id: nextId(), name: f.name, url: URL.createObjectURL(blob), blob, status: "idle", result: null, error: null, ms: null };
      setImages(key, prev => [...prev, entry]);
      void runDetection(key, entry.id, blob);
    }
  };

  const removeImage = (key: string, id: string) => {
    setImages(key, prev => {
      const gone = prev.find(e => e.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      const next = prev.filter(e => e.id !== id);
      writeSummary(key, next);
      return next;
    });
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
  const withImages = buildings.filter(b => (imagesByBuilding[b.key]?.length ?? 0) > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition">
        <span className="p-1.5 rounded-lg bg-violet-600/20 text-violet-300"><ScanSearch className="w-4 h-4" /></span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-white">Facade condition — AI defect detection</span>
          <span className="block text-[11px] text-white/40">
            Upload facade photos; your MBDD2025 model + AI vision flag cracks, leakage, spalling, corrosion &amp; bulges.
            {totalChecked > 0 && <b className="text-violet-300"> · {totalChecked} building{totalChecked === 1 ? "" : "s"} checked</b>}
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
          {/* Model attribution */}
          <div className="flex items-start gap-2 text-[10px] text-white/40 bg-black/20 border border-white/8 rounded-md px-2.5 py-1.5">
            <Cpu className="w-3.5 h-3.5 text-violet-300 shrink-0 mt-0.5" />
            <span>
              <b className="text-violet-300">Solid boxes</b> = your trained <b className="text-violet-300">MBDD2025 model</b> (local Faster R-CNN).
              {aiAssist && <> <b className="text-sky-300">Dashed boxes</b> = <b className="text-sky-300">AI vision second opinion</b> (GPT-4o) catching what ML misses.</>}
              {" "}Click any photo to enlarge. Photos are downscaled to {MAX_UPLOAD_DIM}px for speed.
            </span>
          </div>

          {/* Upload target + AI + sensitivity */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] text-white/45">Upload to:</label>
            <div className="relative">
              <button onClick={() => setPickerOpen(o => !o)}
                className="flex items-center gap-2 bg-[#0d1117] border border-white/15 rounded-md pl-2.5 pr-2 py-1.5 text-[12px] text-white hover:border-violet-500/60 min-w-[210px] max-w-[320px]">
                <Building2 className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                <span className="truncate flex-1 text-left">{activeLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
              </button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-white/15 bg-[#161b22] shadow-2xl py-1">
                    {buildings.map(b => {
                      const s = summaries[b.key];
                      const nImg = imagesByBuilding[b.key]?.length ?? 0;
                      return (
                        <button key={b.key} onClick={() => { setActiveKey(b.key); setPickerOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-violet-600/20 transition ${b.key === activeKey ? "bg-violet-600/10" : ""}`}>
                          {b.key === activeKey ? <Check className="w-3.5 h-3.5 text-violet-300 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                          <span className="flex-1 truncate text-white">{b.label}</span>
                          {nImg > 0 && <span className="text-[9px] text-white/40 shrink-0">{nImg}📷</span>}
                          {s && <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#7c3aed33", color: "#c4b5fd" }}>{s.defectCount}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <label className="text-[11px] text-white/50 ml-auto flex items-center gap-1.5 cursor-pointer select-none"
              title="Also run a general vision model (GPT-4o) as a second opinion and merge anything the ML detector missed.">
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

          {/* Legend */}
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] text-white/40">
            {Object.keys(DEFECT_LABELS).map(k => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(k) }} /> {DEFECT_LABELS[k]}
              </span>
            ))}
          </div>

          {/* Drop zone (compact) */}
          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) void addFiles(e.dataTransfer.files); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed cursor-pointer transition ${
              dragOver ? "border-violet-500 bg-violet-600/10" : "border-white/12 hover:border-white/25 hover:bg-white/[0.02]"}`}>
            <Upload className="w-4 h-4 text-white/40" />
            <span className="text-[11px] text-white/55">Drop photos for <b className="text-violet-300">{activeLabel}</b> or click — runs automatically (ML ~1–2s{aiAssist ? "; +AI a few s" : ""})</span>
            <input type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={e => { if (e.target.files) void addFiles(e.target.files); e.currentTarget.value = ""; }} />
          </label>

          {/* Buildings — accordion rows (compact) */}
          {withImages.length === 0 ? (
            <div className="flex items-center gap-2 text-[11px] text-white/30 py-1">
              <ImageOff className="w-3.5 h-3.5" /> No photos uploaded yet.
            </div>
          ) : (
            <div style={{ columnWidth: "300px", columnGap: "10px" }}>
              {withImages.map(b => {
                const imgs = imagesByBuilding[b.key] ?? [];
                const s = summaries[b.key];
                const isOpen = expanded.has(b.key);
                const running = imgs.some(e => e.status === "running");
                return (
                  <div key={b.key} className="rounded-lg border border-white/8 overflow-hidden mb-2.5" style={{ breakInside: "avoid" }}>
                    <button onClick={() => toggleExpand(b.key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition ${isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/40 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />}
                      <Building2 className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                      <span className="font-semibold text-white truncate">{b.label}</span>
                      <span className="text-[10px] text-white/35 shrink-0">{imgs.length}📷</span>
                      {running ? <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" /> : <SummaryChips s={s} />}
                      <span className="ml-auto shrink-0">
                        <span onClick={e => { e.stopPropagation(); setActiveKey(b.key); }}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${b.key === activeKey ? "text-violet-300" : "text-white/35 hover:text-white hover:bg-white/8"}`}>
                          {b.key === activeKey ? "▲ upload target" : "upload here"}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-2.5 pt-1.5 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                        {imgs.map(e => (
                          <Thumb key={e.id} entry={e}
                            onOpen={() => setLightbox({ entry: e, label: b.label })}
                            onRemove={() => removeImage(b.key, e.id)}
                            onRerun={() => runDetection(b.key, e.id, e.blob)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-white/30 leading-relaxed">
            Click a photo to enlarge and see each issue listed. Photos stay in your browser session (only sent to the local ML model &amp;
            the vision API); a small per-building defect summary feeds the retrofit prioritization below &amp; the report.
          </p>
        </div>
      )}

      {lightbox && <Lightbox entry={lightbox.entry} buildingLabel={lightbox.label} onClose={() => setLightbox(null)} />}
    </div>
  );
}
