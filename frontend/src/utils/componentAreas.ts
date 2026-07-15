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

export interface ResolvedBuildingGeometry {
  lat: number;
  lon: number;
  address: string | null;
  height: number | null;
  footprintM2: number | null;
  wallAreaM2: number | null;       // real perimeter x height when available
  wallPerimeterM: number | null;   // null for bbox-scope buildings (no real polygon exposed there yet)
  useCat: string | null;
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
    case "Walls":
      return geometry.wallAreaM2;
    case "Roof":
    case "Floor":
      return geometry.footprintM2;
    case "Windows": {
      if (!geometry.wallAreaM2 || !wwr) return null;
      const windowAreaM2 = geometry.wallAreaM2 * (wwr.average_wwr / 100);
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
