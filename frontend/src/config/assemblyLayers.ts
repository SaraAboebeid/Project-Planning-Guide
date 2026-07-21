/* ─────────────────────────────────────────────────────────────────────────────
   Layered assembly composer — build a wall / roof / floor from its actual
   layers and compute the U-value from the stack, per EN ISO 6946:

       U = 1 / R_tot ,   R_tot = R_si + R_se + Σ_j (d_j / λ_j)

   Why this exists: the Wikells catalogue mixes complete insulated assemblies
   (U≈0.11) with bare coverings and uninsulated build-ups (U≈3.37). Treating a
   single catalogue row as "the wall" is wrong — a wall is insulation + cladding
   + boarding + battens — and it let the optimizer propose retrofits that made
   the envelope worse. Composing layers makes the physics explicit and puts the
   bare rows back where they belong: as layers.
   ───────────────────────────────────────────────────────────────────────────── */

export type LayerCategory =
  | "structure"      // studs, CLT, concrete, masonry
  | "insulation"
  | "board"          // gypsum, plywood, OSB, sheathing
  | "cladding"       // external finish
  | "cavity";        // unventilated air gap (fixed R, no λ)

export type ComponentKind = "wall" | "roof" | "floor";

export interface LayerMaterial {
  id: string;
  label: string;
  category: LayerCategory;
  /** Design thermal conductivity W/(m·K). Null for a cavity (uses fixedR). */
  lambda: number | null;
  /** Fixed thermal resistance m²·K/W — cavities only (ISO 6946 capped value). */
  fixedR?: number;
  defaultMm: number;
  minMm: number;
  maxMm: number;
  /** Fraction of area bridged by framing (studs/joists) — raises the effective U. */
  framingFraction?: number;
  note?: string;
}

/* Design λ values: EN ISO 10456 tabulated values, cross-checked against Swedish
   BBR typical figures. These are the same values used to derive the missing
   catalogue U-values, validated against 60 Wikells-supplied ones. */
export const LAYER_MATERIALS: LayerMaterial[] = [
  // ── Insulation ────────────────────────────────────────────────────────────
  { id: "mw_batt",     label: "Mineral wool batt",        category: "insulation", lambda: 0.036, defaultMm: 145, minMm: 20, maxMm: 400 },
  { id: "mw_blown_gl", label: "Blown glass wool",         category: "insulation", lambda: 0.044, defaultMm: 300, minMm: 50, maxMm: 500 },
  { id: "mw_blown_st", label: "Blown stone wool",         category: "insulation", lambda: 0.041, defaultMm: 300, minMm: 50, maxMm: 500 },
  { id: "mw_loft",     label: "Settled loft wool",        category: "insulation", lambda: 0.040, defaultMm: 400, minMm: 100, maxMm: 600 },
  { id: "cellulose",   label: "Cellulose (loose fill)",   category: "insulation", lambda: 0.040, defaultMm: 350, minMm: 100, maxMm: 500 },
  { id: "wood_fibre",  label: "Wood fibre board",         category: "insulation", lambda: 0.038, defaultMm: 200, minMm: 40, maxMm: 400 },
  { id: "eps",         label: "EPS board",                category: "insulation", lambda: 0.036, defaultMm: 100, minMm: 20, maxMm: 300 },
  { id: "xps",         label: "XPS board",                category: "insulation", lambda: 0.034, defaultMm: 100, minMm: 20, maxMm: 300 },
  { id: "pir",         label: "PIR / PUR board",          category: "insulation", lambda: 0.022, defaultMm: 80,  minMm: 20, maxMm: 250,
    note: "Highest performance per mm — useful where build-up depth is limited." },
  { id: "mw_plus",     label: "High-perf. mineral wool (Isover Plus+)", category: "insulation", lambda: 0.032, defaultMm: 145, minMm: 20, maxMm: 400 },

  // ── Structure ─────────────────────────────────────────────────────────────
  { id: "timber_stud", label: "Timber stud layer",        category: "structure", lambda: 0.14, defaultMm: 145, minMm: 45, maxMm: 300, framingFraction: 0.09,
    note: "Studs bridge the insulation — a framing fraction of ~9% (c/c 600) is applied per ISO 6946." },
  { id: "timber_joist",label: "Timber joists (roof/floor)",category: "structure", lambda: 0.14, defaultMm: 220, minMm: 95, maxMm: 400, framingFraction: 0.08 },
  { id: "clt",         label: "CLT panel",                category: "structure", lambda: 0.13, defaultMm: 100, minMm: 60, maxMm: 300 },
  { id: "concrete",    label: "Concrete",                 category: "structure", lambda: 1.70, defaultMm: 200, minMm: 80, maxMm: 400 },
  { id: "lwc",         label: "Lightweight concrete",     category: "structure", lambda: 0.15, defaultMm: 250, minMm: 100, maxMm: 400 },
  { id: "brick",       label: "Brick masonry",            category: "structure", lambda: 0.60, defaultMm: 120, minMm: 60, maxMm: 360 },

  // ── Boards / sheathing ────────────────────────────────────────────────────
  { id: "gypsum",      label: "Gypsum board",             category: "board", lambda: 0.25, defaultMm: 13, minMm: 9,  maxMm: 30 },
  { id: "plywood",     label: "Plywood",                  category: "board", lambda: 0.13, defaultMm: 12, minMm: 6,  maxMm: 25 },
  { id: "osb",         label: "OSB",                      category: "board", lambda: 0.13, defaultMm: 12, minMm: 6,  maxMm: 25 },
  { id: "wind_board",  label: "Windproof board",          category: "board", lambda: 0.045, defaultMm: 9, minMm: 6,  maxMm: 25 },

  // ── Cladding ──────────────────────────────────────────────────────────────
  { id: "timber_clad", label: "Timber panel cladding",    category: "cladding", lambda: 0.14, defaultMm: 22, minMm: 15, maxMm: 45 },
  { id: "fibre_cem",   label: "Fibre-cement board",       category: "cladding", lambda: 0.35, defaultMm: 8,  minMm: 6,  maxMm: 20 },
  { id: "render",      label: "Render / plaster",         category: "cladding", lambda: 0.80, defaultMm: 20, minMm: 8,  maxMm: 40 },
  { id: "trp_steel",   label: "Trapezoidal steel sheet",  category: "cladding", lambda: 50,   defaultMm: 1,  minMm: 1,  maxMm: 2,
    note: "Thermally negligible — included for build-up completeness, not performance." },
  { id: "brick_clad",  label: "Brick facing",             category: "cladding", lambda: 0.60, defaultMm: 120, minMm: 85, maxMm: 150 },

  // ── Cavity ────────────────────────────────────────────────────────────────
  { id: "air_gap",     label: "Unventilated air gap",     category: "cavity", lambda: null, fixedR: 0.18, defaultMm: 25, minMm: 10, maxMm: 100,
    note: "ISO 6946 caps an unventilated cavity at R≈0.18 m²·K/W regardless of depth." },
];

export const MATERIAL_BY_ID: Record<string, LayerMaterial> =
  Object.fromEntries(LAYER_MATERIALS.map((m) => [m.id, m]));

/* Surface resistances m²·K/W (EN ISO 6946, direction of heat flow). */
export const SURFACE_RESISTANCE: Record<ComponentKind, { rsi: number; rse: number; label: string }> = {
  wall:  { rsi: 0.13, rse: 0.04, label: "Wall — horizontal heat flow" },
  roof:  { rsi: 0.10, rse: 0.04, label: "Roof — upward heat flow" },
  floor: { rsi: 0.17, rse: 0.04, label: "Floor — downward heat flow" },
};

export interface AssemblyLayer {
  materialId: string;
  thicknessMm: number;
}

export interface LayerResult {
  materialId: string;
  label: string;
  thicknessMm: number;
  lambda: number | null;
  r: number;
  /** Share of the assembly's total thermal resistance. */
  share: number;
}

export interface AssemblyResult {
  uValue: number | null;
  rTotal: number;
  rsi: number;
  rse: number;
  layers: LayerResult[];
  /** True when a framed layer applied a thermal-bridge correction. */
  framingApplied: boolean;
  warnings: string[];
}

/**
 * U-value of a layered assembly, EN ISO 6946.
 *
 * Framed layers (timber studs/joists) are handled with a parallel-path
 * correction: the framing fraction bypasses the insulation, so the layer's
 * resistance is the area-weighted harmonic mean of the insulated and the
 * timber path. Ignoring it understates U materially.
 */
export function computeAssemblyU(layers: AssemblyLayer[], kind: ComponentKind): AssemblyResult {
  const { rsi, rse } = SURFACE_RESISTANCE[kind];
  const warnings: string[] = [];
  let framingApplied = false;

  // Resolve each layer's resistance first (framing handled below).
  const resolved = layers.map((l) => {
    const m = MATERIAL_BY_ID[l.materialId];
    if (!m) return null;
    const d = Math.max(0, l.thicknessMm) / 1000;
    const r = m.lambda == null ? (m.fixedR ?? 0) : (m.lambda > 0 ? d / m.lambda : 0);
    return { m, thicknessMm: l.thicknessMm, r };
  }).filter((x): x is { m: LayerMaterial; thicknessMm: number; r: number } => x !== null);

  // A framed structural layer bridges whatever insulation sits in the same
  // plane, so combine the two into one parallel-path layer.
  const framed = resolved.find((x) => x.m.framingFraction && x.m.framingFraction > 0);
  const insul = resolved.find((x) => x.m.category === "insulation");
  const out: LayerResult[] = [];
  let rLayers = 0;

  for (const x of resolved) {
    let r = x.r;
    if (framed && insul && x === insul && framed.m.framingFraction) {
      const f = framed.m.framingFraction;
      const rIns = x.r;                                   // insulated path
      const rTim = (x.thicknessMm / 1000) / (framed.m.lambda ?? 0.14); // timber path, same depth
      // Parallel paths → area-weighted conductance.
      const uIns = rIns > 0 ? 1 / rIns : 0;
      const uTim = rTim > 0 ? 1 / rTim : 0;
      const uMix = (1 - f) * uIns + f * uTim;
      r = uMix > 0 ? 1 / uMix : rIns;
      framingApplied = true;
    }
    rLayers += r;
    out.push({ materialId: x.m.id, label: x.m.label, thicknessMm: x.thicknessMm, lambda: x.m.lambda, r, share: 0 });
  }

  const rTotal = rsi + rse + rLayers;
  const uValue = rTotal > 0 ? 1 / rTotal : null;
  for (const l of out) l.share = rTotal > 0 ? l.r / rTotal : 0;

  if (!resolved.some((x) => x.m.category === "insulation")) {
    warnings.push("No insulation layer — this is a bare build-up, not a retrofit assembly.");
  }
  if (uValue != null && uValue > 1.0) {
    warnings.push(`U = ${uValue.toFixed(2)} W/m²K is worse than a typical as-built envelope.`);
  }
  return { uValue, rTotal, rsi, rse, layers: out, framingApplied, warnings };
}

/** Sensible starting stacks so the builder opens with something real. */
export const PRESETS: Record<ComponentKind, { label: string; layers: AssemblyLayer[] }[]> = {
  wall: [
    { label: "Timber stud + mineral wool (typical retrofit)", layers: [
      { materialId: "gypsum", thicknessMm: 13 },
      { materialId: "timber_stud", thicknessMm: 145 },
      { materialId: "mw_batt", thicknessMm: 145 },
      { materialId: "wind_board", thicknessMm: 9 },
      { materialId: "air_gap", thicknessMm: 25 },
      { materialId: "timber_clad", thicknessMm: 22 },
    ]},
    { label: "External insulation on concrete (ETICS)", layers: [
      { materialId: "concrete", thicknessMm: 200 },
      { materialId: "eps", thicknessMm: 150 },
      { materialId: "render", thicknessMm: 20 },
    ]},
  ],
  roof: [
    { label: "Joists + blown wool (attic)", layers: [
      { materialId: "gypsum", thicknessMm: 13 },
      { materialId: "timber_joist", thicknessMm: 220 },
      { materialId: "mw_blown_gl", thicknessMm: 400 },
    ]},
  ],
  floor: [
    { label: "Joists + mineral wool over crawl space", layers: [
      { materialId: "timber_joist", thicknessMm: 220 },
      { materialId: "mw_batt", thicknessMm: 220 },
      { materialId: "plywood", thicknessMm: 22 },
    ]},
  ],
};
