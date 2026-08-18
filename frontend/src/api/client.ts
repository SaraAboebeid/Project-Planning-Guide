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

/* ── Optimizer (POST /api/optimize) ── */
export interface OptimizeOption { code: string; label?: string; u_value: number; cost: number; carbon: number; }
export interface OptimizeComponentInput { key: string; area_m2: number; baseline_u: number; options: OptimizeOption[]; }
export interface OptimizeParams {
  f_dh: number; energy_price: number; carbon_factor_heat: number; discount_rate: number;
  study_period_yr: number; floor_area_m2: number; baseline_total_kwh_m2_yr: number;
}
export interface OptimizeRequestBody {
  components: OptimizeComponentInput[]; params: OptimizeParams; max_results?: number;
}
export interface OptimizePoint {
  energy_kwh_m2_yr: number; total_cost: number; total_carbon: number;
  initial_cost: number; initial_carbon: number; htr_w_per_k: number;
  selections: Record<string, string>; selection_labels: Record<string, string>; tags?: string[];
}
export interface OptimizeCloudPoint { energy_kwh_m2_yr: number; total_cost: number; total_carbon: number; }
export interface OptimizeResponse {
  baseline: { energy_kwh_m2_yr: number; total_cost: number; total_carbon: number; htr_w_per_k: number };
  pareto: OptimizePoint[];
  /** Every evaluated package with its selections (only for small runs); powers the "show all" view. */
  all_points?: OptimizePoint[];
  cloud: OptimizeCloudPoint[];
  evaluated: number; unique_points: number; combinations_total: number; pareto_count: number; truncated: boolean;
  params_used: { annuity_factor: number; q_fixed_kwh_yr: number; study_period_yr: number };
}

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
  lookupBuildingsBbox: (north: number, south: number, east: number, west: number, polygon?: string) =>
    get<BboxStats>("/buildings/bbox/stats", {
      north: String(north), south: String(south),
      east:  String(east),  west:  String(west),
      ...(polygon ? { polygon } : {}),
    }),

  /** Individual building records in a bounding box (optionally refined to a drawn
   *  polygon), with Boplats data merged. `polygon` is "lon,lat;lon,lat;…". */
  buildingsBboxList: (north: number, south: number, east: number, west: number, polygon?: string) =>
    get<BuildingRecord[]>("/buildings/bbox/list", {
      north: String(north), south: String(south),
      east:  String(east),  west:  String(west),
      ...(polygon ? { polygon } : {}),
    }),

  /** Named neighborhoods (Gothenburg primärområden) with building counts */
  listDistricts: (country = "se") =>
    get<{ country: string; districts: { name: string; count: number; lat: number; lon: number }[] }>(
      "/districts", { country },
    ),

  /** All building records inside a named district (neighborhood-scale selection) */
  buildingsByDistrict: (district: string) =>
    get<BuildingRecord[]>("/buildings/bbox/list", { district }),

  /** Bilingual (EN/SV) data-grounded chatbot. Send the full turn history. */
  chat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    post<{ reply: string; configured: boolean }>("/chat", { messages }),

  /** Live day-ahead electricity spot price (SE = Nord Pool via elprisetjustnu). */
  energyPrice: (country = "se") =>
    get<{ country: string; zone?: string; live: boolean; date?: string; unit?: string;
          average_price?: number | null; min_price?: number | null; max_price?: number | null;
          note?: string; source?: string | null }>("/energy-price", { country }),

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
    lat: number; lon: number; address?: string | null; country: string; city_id?: string;
    building: Record<string, unknown>; wwr_override?: number;
    u_wall_override?: number; u_roof_override?: number; u_win_override?: number; u_floor_override?: number;
    package_id?: string; package_label?: string | null;
  }) => post<{ simulation_id: string; task_id: string; status: string }>("/simulation-submit", body),

  simulationStatus: (id: string) =>
    get<{ status: string; progress?: number; error?: string | null; error_message?: string | null }>(`/simulation-status/${id}`),

  simulationResults: (id: string) =>
    get<{
      heating_kwh: number; cooling_kwh: number; lighting_kwh: number; equipment_kwh: number;
      dhw_kwh: number; total_kwh: number;
      heating_kwh_m2_yr: number | null; cooling_kwh_m2_yr: number | null; lighting_kwh_m2_yr: number | null;
      equipment_kwh_m2_yr: number | null; dhw_kwh_m2_yr: number | null; total_kwh_m2_yr: number | null;
      floors: number; footprint_m2: number; total_floor_area_m2: number;
    }>(`/simulation-results/${id}`),

  /** Persist an annotated facade photo so it survives the tab and can be shown
   * in the Step 5 report. Returns the URL to render it from. */
  facadeImageSave: async (imageId: string, blob: Blob) => {
    const res = await fetch(`${BASE}/facade-image?image_id=${encodeURIComponent(imageId)}`, {
      method: "POST", body: blob, headers: { "Content-Type": "application/octet-stream" },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ id: string; url: string; bytes: number }>;
  },

  facadeImageDelete: async (imageId: string) => {
    const res = await fetch(`${BASE}/facade-image/${encodeURIComponent(imageId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<{ deleted: boolean }>;
  },

  /** Resolve the batch id of the most recent baseline run covering a building.
   * Lets the load-profile charts work on baselines simulated before the id was
   * being persisted - the trace was always in the database, only the pointer to
   * it was missing. Returns the id alone, never the payload. */
  baselineBatchLookup: (lat: number, lon: number, radiusM = 25) =>
    get<{ found: boolean; batch_id: string | null; submitted_at?: string; status?: string }>(
      "/baseline-batch-lookup", { lat: String(lat), lon: String(lon), radius_m: String(radiusM) },
    ),

  /** Monthly (12) or hourly (8760) baseline load profile per end use, in kWh.
   * Aggregated backend-side from the trace EPSM already stored with the run, so
   * nothing re-simulates and the wizard store never holds the raw time series.
   * Pass idfIdx for hourly - it is 8760 points per series per building. */
  simulationTimeseries: (batchId: string, resolution: "monthly" | "hourly", idfIdx?: number) =>
    get<{
      batch_id: string; resolution: "monthly" | "hourly"; unit: string;
      labels: (string | number)[];
      buildings: Array<{
        idf_idx: number; address: string | null; total_floor_area_m2: number | null;
        series: Partial<Record<"heating" | "cooling" | "lighting" | "equipment" | "dhw", number[]>>;
        available: string[];
      }>;
    }>(`/simulation-timeseries/${batchId}`, {
      resolution,
      ...(idfIdx != null ? { idf_idx: String(idfIdx) } : {}),
    }),

  /** Every saved/running simulation near a location - one per package_id
   * (baseline + N renovation packages) - for rehydrating the comparison
   * table on mount without re-submitting. */
  simulationLookupAll: (lat: number, lon: number, radiusM = 25) =>
    get<{ records: Array<Record<string, unknown> & { package_id?: string; status: string; epsm_simulation_id: string }> }>(
      "/simulation-lookup-all", { lat: String(lat), lon: String(lon), radius_m: String(radiusM) }
    ),

  /** Submit one shoebox EnergyPlus simulation per building, all in a single
   * EPSM call (EPSM runs them as independent parallel tasks under one shared
   * batch_id) - see backend's /api/simulation-batch-submit. */
  simulationBatchSubmit: (body: {
    country: string; city_id?: string;
    buildings: Array<{ lat: number; lon: number; address?: string | null; building?: Record<string, unknown> }>;
    wwr_override?: number;
    u_wall_override?: number; u_roof_override?: number; u_win_override?: number; u_floor_override?: number;
    package_id?: string; package_label?: string | null;
  }) => post<{ batch_id: string; task_id: string; total: number; status: string }>("/simulation-batch-submit", body),

  /** Multi-objective renovation optimizer — enumerate material combinations,
   * score on the fast degree-day physics, return the Pareto-optimal front over
   * (cost, carbon, energy). The winners are then validated in EPSM. */
  optimize: (body: OptimizeRequestBody) => post<OptimizeResponse>("/optimize", body),

  simulationBatchStatus: (batchId: string) =>
    get<{
      batch_id: string; total: number; counts: Record<string, number>; overall_status: string;
      /** EPSM's own 0-100 progress; our row statuses only move at the end. */
      overall_progress?: number | null;
      buildings: Array<{
        idf_idx: number; lat: number; lon: number; address: string | null;
        package_id: string; package_label: string | null; status: string;
        results: {
          heating_kwh_m2_yr: number | null; cooling_kwh_m2_yr: number | null;
          lighting_kwh_m2_yr: number | null; equipment_kwh_m2_yr: number | null;
          dhw_kwh_m2_yr: number | null; total_kwh_m2_yr: number | null;
          floors: number; footprint_m2: number; total_floor_area_m2: number;
        } | null;
        error: string | null;
      }>;
    }>(`/simulation-batch-status/${batchId}`),

  /* ── Current heating system per building, inferred from the Boverket EPC ── */
  epcHeating: (addresses: string[]) =>
    post<{ results: Record<string, { system: string } | null>; available: boolean }>("/epc/heating", { addresses }),

  /* ── Facade defect detection (ML) — POST raw image bytes to the on-host model ── */
  facadeDetect: async (blob: Blob, threshold = 0.5): Promise<FacadeDetectResponse> => {
    const res = await fetch(`${BASE}/facade-detect?threshold=${threshold}`, { method: "POST", body: blob });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.detail || d.error) {
      throw new Error(d.detail || d.error || `Facade model error (${res.status})`);
    }
    return d as FacadeDetectResponse;
  },

  /* ── Facade defect second opinion — general vision-language model (GPT-4o/Claude) ── */
  facadeVision: async (blob: Blob, threshold = 0.3): Promise<FacadeDetectResponse> => {
    const res = await fetch(`${BASE}/facade-vision?threshold=${threshold}`, { method: "POST", body: blob });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.detail) throw new Error(d.detail || `Vision model error (${res.status})`);
    return d as FacadeDetectResponse;
  },
};

export interface FacadeDetection {
  label: string; score: number; box: [number, number, number, number];
  source?: "ml" | "ai"; note?: string;
}
export interface FacadeDetectResponse {
  detections: FacadeDetection[]; width: number; height: number;
  model?: string | null; normalized?: boolean;
}
