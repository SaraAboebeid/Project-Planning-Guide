import type { BuildingLookup, BuildingRecord, WWRRecord } from "../types";
import type { AreaLineItem } from "../config/componentAreaLineItems";

// Matches tools/idf/defaults.py's FLOOR_HEIGHT_M - used for the Vertical
// Extension's new-storey wall height, since the new floor doesn't exist yet
// to measure a real height from.
const FLOOR_HEIGHT_M = 3.2;

// Wikells prices windows per-unit ("SEK/st"), not per-m² - there is no m²
// window pricing in the catalogue at all. This is a rough typical single
// residential window area (based on common Wikells window sizes, which
// range ~1.0-1.8 m²) used only to convert a computed glazed AREA into an
// estimated window COUNT for costing purposes.
const TYPICAL_WINDOW_AREA_M2 = 1.4;

/* Window-to-wall ratio fallback, mirroring tools/idf/defaults.py's
   DEFAULT_WWR_BY_USE. TABULA does not publish a WWR - it gives U-values and
   construction periods - so the honest fallback is the ratio the EnergyPlus
   shoebox itself assumed for this use category. Using the same number keeps the
   cost quantity and the simulated geometry describing one building rather than
   two. Kept in step with the generator's table by hand; they are both small. */
const DEFAULT_WWR_BY_USE: Record<string, number> = {
  bostad_enfamilj: 0.15,
  bostad_flerfamilj: 0.20,
  verksamhet: 0.30,
  samhalle: 0.25,
  industri: 0.08,
  ovrigt: 0.15,
  komplement: 0.08,
};
const DEFAULT_WWR_FALLBACK = 0.15;

/** Glazed fraction of the façade: the surveyed value when the WWR tool has one
 *  for this building, otherwise the use-category default the simulation used. */
export function effectiveWwr(geometry: ResolvedBuildingGeometry, wwr: WWRRecord | null): number {
  if (wwr && wwr.average_wwr > 0) return wwr.average_wwr / 100;
  return DEFAULT_WWR_BY_USE[geometry.useCat ?? ""] ?? DEFAULT_WWR_FALLBACK;
}

export interface ResolvedBuildingGeometry {
  lat: number;
  lon: number;
  address: string | null;
  height: number | null;
  footprintM2: number | null;
  wallAreaM2: number | null;       // real perimeter x height when available
  wallPerimeterM: number | null;   // null for bbox-scope buildings (no real polygon exposed there yet)
  useCat: string | null;
  tabulaPeriod: string | null;
  // UK only - see BuildingLookup.tabula_period_used/tabula_u_source. Always
  // null for Sweden (bbox rows and /api/building's own on-the-fly period
  // derivation both only ever produce a "known year" period, never sampled).
  tabulaPeriodUsed: string | null;
  tabulaUSource: string | null;
  tabulaUWall: number | null;
  tabulaURoof: number | null;
  tabulaUWin: number | null;
}

function isBuildingLookup(b: BuildingLookup | BuildingRecord): b is BuildingLookup {
  return "height" in b;
}

/** Normalizes the two different building shapes the wizard can have resolved
 * (a single EUBUCCO lookup vs. a bbox-scope row) into one geometry shape.
 * bbox rows never expose a real perimeter (only /api/building does), so
 * wallAreaM2 falls back to the old square approximation for that path only -
 * clearly worse, but bbox-scope renovation isn't this feature's main case. */
export function resolveBuildingGeometry(
  building: BuildingLookup | BuildingRecord | null | undefined
): ResolvedBuildingGeometry | null {
  if (!building) return null;
  if (isBuildingLookup(building)) {
    return {
      lat: building.lat,
      lon: building.lon,
      address: building.address,
      height: building.height,
      footprintM2: building.footprint_m2,
      wallAreaM2: building.wall_area_m2,
      wallPerimeterM: building.wall_perimeter_m,
      useCat: building.use_cat,
      tabulaPeriod: building.tabula_period,
      tabulaPeriodUsed: building.tabula_period_used ?? null,
      tabulaUSource: building.tabula_u_source ?? null,
      tabulaUWall: building.tabula_u_wall,
      tabulaURoof: building.tabula_u_roof,
      tabulaUWin: building.tabula_u_win,
    };
  }
  const approxPerimeter = building.footprint_m2 ? 4 * Math.sqrt(building.footprint_m2) : null;
  return {
    lat: building.lat,
    lon: building.lon,
    address: building.address,
    height: building.height_m,
    footprintM2: building.footprint_m2,
    wallAreaM2: approxPerimeter && building.height_m ? approxPerimeter * building.height_m : null,
    wallPerimeterM: null,
    useCat: building.building_use,
    tabulaPeriod: building.tabula_period,
    tabulaPeriodUsed: null,
    tabulaUSource: null,
    tabulaUWall: building.u_wall,
    tabulaURoof: building.u_roof,
    tabulaUWin: building.u_window,
  };
}

/** Real area/count for one line item, or null if there's no data source and
 * no manual override yet (the UI should then require manual entry). */
export function computeAreaForLineItem(
  item: AreaLineItem,
  geometry: ResolvedBuildingGeometry,
  wwr: WWRRecord | null,
  manualOverrides: Record<string, number>
): number | null {
  const manual = manualOverrides[item.key];
  if (manual != null) return manual;

  switch (item.key) {
    case "Walls": {
      // Gross perimeter x height includes the window openings. Cladding those
      // openings was inflating both cost and embodied carbon by the glazed
      // fraction - about a fifth on a typical flerbostadshus - and, when a
      // package replaced the windows too, charging for the same area twice.
      if (geometry.wallAreaM2 == null) return null;
      return Math.round(geometry.wallAreaM2 * (1 - effectiveWwr(geometry, wwr)));
    }
    case "Roof":
    case "Floor":
      return geometry.footprintM2;
    case "Windows": {
      if (!geometry.wallAreaM2) return null;
      const windowAreaM2 = geometry.wallAreaM2 * effectiveWwr(geometry, wwr);
      return Math.max(1, Math.round(windowAreaM2 / TYPICAL_WINDOW_AREA_M2));
    }
    case "Doors":
      return null; // no real signal (see plan) - always manual
    case "Balcony":
      return wwr?.balcony_count_total ?? null;
    case "VertExt::Roof":
    case "VertExt::Floor":
      return geometry.footprintM2;
    case "VertExt::Walls":
      return geometry.wallPerimeterM != null ? Math.round(geometry.wallPerimeterM * FLOOR_HEIGHT_M * 10) / 10 : null;
    default:
      return null;
  }
}

export function quantityUnitLabel(kind: "area" | "count"): string {
  return kind === "area" ? "m²" : "unit(s)";
}
