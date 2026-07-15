/**
 * Thin API client — all calls go through the Vite proxy → FastAPI backend.
 */

const BASE = "/api";

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/* ── Endpoints ── */

import type { EpcSnapshot, EpcPassport, TabulaArchetype, MatchConfidence, BuildingLookup, BboxStats, BuildingRecord, WWRRecord, BoverketResource } from "../types";

export const api = {
  /** Geocode an address → { lat, lon, display_name } */
  geocode: (address: string) =>
    get<{ lat: number; lon: number; display_name: string }>("/geocode", { address }),

  /** Fetch nearby EPC snapshot */
  epcSnapshot: (lat: number, lon: number, radiusM: number) =>
    get<EpcSnapshot>("/epc/snapshot", {
      lat: String(lat),
      lon: String(lon),
      radius_m: String(radiusM),
    }),

  /** Get full EPC building passport */
  epcPassport: (formularId: string) =>
    get<EpcPassport>(`/epc/passport/${formularId}`),

  /** Match TABULA archetype */
  tabulaMatch: (buildingType: string, buildYear: number) =>
    get<{ archetype: TabulaArchetype | null; confidence: MatchConfidence }>("/tabula/match", {
      building_type: buildingType,
      build_year: String(buildYear),
    }),

  /** Boverket Klimatdatabas materials for a renovation component */
  boverketMaterials: (component: string) =>
    get<BoverketResource[]>("/boverket/materials", { component }),

  /** Run sensitivity analysis */
  sensitivity: (params: Record<string, unknown>) =>
    post<Record<string, unknown>>("/sensitivity/run", params),

  /** Look up nearest real building by lat/lon - Sweden's EUBUCCO dataset is
   * one flat file (/building); the UK dataset is split per built district,
   * resolved server-side from just lat/lon (/uk/building). */
  lookupBuilding: (lat: number, lon: number, country?: string | null) =>
    country === "United Kingdom"
      ? get<BuildingLookup>("/uk/building", { lat: String(lat), lon: String(lon) })
      : get<BuildingLookup>("/building", { lat: String(lat), lon: String(lon) }),

  /** Aggregate EUBUCCO stats for all buildings in a bounding box */
  lookupBuildingsBbox: (north: number, south: number, east: number, west: number) =>
    get<BboxStats>("/buildings/bbox/stats", {
      north: String(north), south: String(south),
      east:  String(east),  west:  String(west),
    }),

  /** Individual building records in a bounding box, with Boplats data merged */
  buildingsBboxList: (north: number, south: number, east: number, west: number) =>
    get<BuildingRecord[]>("/buildings/bbox/list", {
      north: String(north), south: String(south),
      east:  String(east),  west:  String(west),
    }),

  /** Look up saved AI WWR for a building (null if none saved) */
  lookupWWR: (lat: number, lon: number) =>
    get<{ found: boolean; record: WWRRecord | null; dist_m?: number }>("/wwr-lookup", {
      lat: String(lat), lon: String(lon),
    }),

  /** Health check */
  health: () => get<{ status: string }>("/health"),

  /** Submit a shoebox EnergyPlus simulation (baseline or a renovation package
   * with envelope U-value overrides) - see backend's /api/simulation-submit. */
  simulationSubmit: (body: {
    lat: number; lon: number; address?: string | null; country: string; city_id: string;
    building: Record<string, unknown>; wwr_override?: number;
    u_wall_override?: number; u_roof_override?: number; u_win_override?: number; u_floor_override?: number;
    package_id?: string; package_label?: string | null;
  }) => post<{ simulation_id: string; task_id: string; status: string }>("/simulation-submit", body),

  simulationStatus: (id: string) =>
    get<{ status: string; progress?: number; error?: string | null; error_message?: string | null }>(`/simulation-status/${id}`),

  simulationResults: (id: string) =>
    get<{
      heating_kwh: number; cooling_kwh: number; lighting_kwh: number; equipment_kwh: number; total_kwh: number;
      heating_kwh_m2_yr: number | null; cooling_kwh_m2_yr: number | null; lighting_kwh_m2_yr: number | null;
      equipment_kwh_m2_yr: number | null; total_kwh_m2_yr: number | null;
      floors: number; footprint_m2: number; total_floor_area_m2: number;
    }>(`/simulation-results/${id}`),

  /** Every saved/running simulation near a location - one per package_id
   * (baseline + N renovation packages) - for rehydrating the comparison
   * table on mount without re-submitting. */
  simulationLookupAll: (lat: number, lon: number, radiusM = 25) =>
    get<{ records: Array<Record<string, unknown> & { package_id?: string; status: string; epsm_simulation_id: string }> }>(
      "/simulation-lookup-all", { lat: String(lat), lon: String(lon), radius_m: String(radiusM) }
    ),
};
