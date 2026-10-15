/* ─────────────────────────────────────────────────────────────────────────────
   Cost and carbon for a layer-composed assembly.

   Two different problems, two different (honest) answers:

   COST   — Wikells prices complete SECTIONS (SEK/m², material + labour), never
            individual layers. Deriving a per-layer rate is unreliable: fitting
            the 24 exterior-wall assemblies against insulation thickness gives
            R²=0.71, and a matched-pair check disagrees with that slope by ~2x
            because cladding dominates the cost (TRP sheet 843 vs brick 3,907
            SEK/m²). So we do NOT synthesise a layer price — we quote the nearest
            real Wikells assembly and say which one it is.

   CARBON — Boverket's Klimatdatabas IS per material, with GWP in kg CO2e/kg and
            a density, so a layer's embodied carbon is a real calculation:
                kg CO2e/m² = thickness(m) x density(kg/m³) x GWP(kg CO2e/kg)
            Layers with no Boverket match are reported as unmatched — never
            filled in with a guess.
   ───────────────────────────────────────────────────────────────────────────── */

import type { BoverketResource, WikellsItemLike } from "../types/assembly";
import { MATERIAL_BY_ID, type AssemblyLayer, type ComponentKind } from "../config/assemblyLayers";
import { a4a5PerKg } from "./materialRecommendation";

/* Keywords used to find each layer material in the Boverket database. Matching
   is substring-based and scored; the best-scoring row wins. */
/* Keys are matched against the real Boverket row names (verified against the
   live database). They are deliberately specific: a generic word like "panel"
   matched timber cladding to a 2400 kg/m³ CONCRETE wall panel — a wrong number
   that looks perfectly plausible. Prefer no match over a wrong one. */
export const BOVERKET_KEYWORDS: Record<string, string[]> = {
  mw_batt:     ["glasswool, batts and rolls", "stone wool, batts and rolls"],
  mw_blown_gl: ["glasswool, blowing wool, wall", "glasswool, blowing wool"],
  mw_blown_st: ["stone wool, blowing wool, wall", "stone wool, blowing wool"],
  mw_loft:     ["glasswool, blowing wool, attic floor", "stone wool, blowing wool, attic floor"],
  cellulose:   ["cellulose fibre"],
  wood_fibre:  ["wood fibre insulation"],
  eps:         ["eps, expanded polystyrene"],
  xps:         ["xps, extruded polystyrene"],
  pir:         ["polyisocyanurate"],
  mw_plus:     ["glasswool, batts and rolls"],
  timber_stud: ["sawn timber"],
  timber_joist:["sawn timber"],
  clt:         ["cross-laminated timber"],
  concrete:    ["external wall panels"],
  lwc:         ["expanded clay concrete"],
  brick:       ["bricks"],
  brick_clad:  ["bricks"],
  gypsum:      ["gypsum, sheathing plasterboard"],
  plywood:     ["plywood"],
  osb:         ["osb"],
  wind_board:  ["gypsum, sheathing plasterboard"],
  timber_clad: ["planed timber"],
  fibre_cem:   ["fiber cement boards"],
  render:      ["masonry mortar and plastering"],
  trp_steel:   ["steel sheets for cladding"],
  // air_gap has no material and therefore no embodied carbon.
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(",", ".").match(/-?\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return null;
}

/** Best Boverket row for a layer material, or null when nothing matches. */
export function matchBoverket(materialId: string, rows: BoverketResource[]): BoverketResource | null {
  const keys = BOVERKET_KEYWORDS[materialId];
  if (!keys || !rows.length) return null;
  let best: BoverketResource | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const name = (r.Name || "").toLowerCase();
    for (let i = 0; i < keys.length; i++) {
      if (name.includes(keys[i]!)) {
        // Earlier keywords are more specific → score higher.
        const score = keys.length - i;
        if (score > bestScore) { bestScore = score; best = r; }
        break;
      }
    }
  }
  return best;
}

export interface LayerCarbon {
  materialId: string;
  label: string;
  thicknessMm: number;
  boverketName: string | null;
  densityKgM3: number | null;
  gwpPerKg: number | null;
  /** kg CO2e per m² of assembly, A1–A5, or null when unmatched. */
  kgCo2ePerM2: number | null;
  /** The same split into production (A1–A3), transport (A4) and installation incl. waste (A5). */
  a1a3?: number | null; a4?: number | null; a5?: number | null;
}

export interface AssemblyCarbon {
  total: number | null;          // A1–A5; null when nothing could be matched at all
  a1a3: number | null; a4: number | null; a5: number | null;
  layers: LayerCarbon[];
  unmatched: string[];           // layer labels with no Boverket entry
}

/** Embodied carbon per m² of assembly, A1–A5, from Boverket per-material data:
 *  production (A1–A3), transport to site (A4) and installation including the
 *  material wasted on site (A5) - see a4a5PerKg. The existing construction
 *  (in "add" mode) has no Boverket row and adds nothing. */
export function computeAssemblyCarbon(
  layers: AssemblyLayer[],
  rows: BoverketResource[],
): AssemblyCarbon {
  const out: LayerCarbon[] = [];
  const unmatched: string[] = [];
  let s13 = 0, s4 = 0, s5 = 0;
  let any = false;

  for (const l of layers) {
    const m = MATERIAL_BY_ID[l.materialId];
    if (!m) continue;
    if (m.category === "cavity") continue;           // an air gap has no material

    const row = matchBoverket(l.materialId, rows);
    const density = row ? num(row["Density / Conversion"]) : null;
    const f = row ? a4a5PerKg(row) : null;
    const massKgM2 = density != null ? (l.thicknessMm / 1000) * density : null;
    const a13 = massKgM2 != null && f ? massKgM2 * f.a13 : null;
    const a4 = massKgM2 != null && f ? massKgM2 * f.a4 : null;
    const a5 = massKgM2 != null && f ? massKgM2 * f.a5 : null;
    const kg = a13 != null ? a13 + (a4 ?? 0) + (a5 ?? 0) : null;

    if (kg == null) unmatched.push(m.label);
    else { s13 += a13!; s4 += a4 ?? 0; s5 += a5 ?? 0; any = true; }

    out.push({
      materialId: m.id, label: m.label, thicknessMm: l.thicknessMm,
      boverketName: row?.Name ?? null, densityKgM3: density, gwpPerKg: f?.a13 ?? null,
      kgCo2ePerM2: kg, a1a3: a13, a4, a5,
    });
  }
  return {
    total: any ? s13 + s4 + s5 : null,
    a1a3: any ? s13 : null, a4: any ? s4 : null, a5: any ? s5 : null,
    layers: out, unmatched,
  };
}

/* ── Cost: nearest real Wikells assembly ─────────────────────────────────── */

const CHAPTER_FOR: Record<ComponentKind, string> = { wall: "7", roof: "11", floor: "9" };

export interface CostMatch {
  code: string;
  description: string;
  costSEK: number;
  uValue: number;
  /** How far the quoted assembly's U is from the composed one. */
  deltaU: number;
}

/**
 * The closest real priced assembly to a composed U-value. We quote its actual
 * published price rather than inventing a per-layer rate — and return the code
 * and U-delta so the substitution is visible in the UI.
 */
export function nearestWikellsAssembly(
  uValue: number | null,
  kind: ComponentKind,
  items: WikellsItemLike[],
): CostMatch | null {
  if (uValue == null) return null;
  const prefix = CHAPTER_FOR[kind] + ".";
  let best: CostMatch | null = null;
  for (const it of items) {
    if (!it.code.startsWith(prefix)) continue;
    if (it.uValue == null || !it.costSEK) continue;
    const d = Math.abs(it.uValue - uValue);
    if (!best || d < best.deltaU) {
      best = { code: it.code, description: it.description, costSEK: it.costSEK, uValue: it.uValue, deltaU: d };
    }
  }
  return best;
}
