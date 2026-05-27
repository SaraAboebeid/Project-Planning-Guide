/* ── Shared TypeScript types for the wizard ── */

export type ProjectType =
  | "Embodied Carbon Assessment"
  | "Renovation Planning"
  | "Renewable Energy Study";

export type ProjectScale = "Building" | "Neighborhood" | "City";

export interface ProjectConfig {
  projectType: ProjectType | null;
  projectName: string;
  country: string;
  scale: ProjectScale;
  systemsInScope: string[];
  selectedKpis: string[];
  explorationApproach: string | null;
  /* location */
  address: string;
  lat: number | null;
  lon: number | null;
  radiusM: number;
}

export interface EpcPassport {
  FormularId: string;
  IdAdr?: string;
  IdKommun?: string;
  EgiEnergiklass?: string;
  EgiEnergiPrestanda?: number;
  EgenAtemp?: number;
  EgenNybyggAr?: number;
  EgenByggnadsTyp?: string;
  EgenByggnadsKat?: string;
  available_field_count?: number;
  total_field_count?: number;
  [key: string]: unknown;
}

export interface TabulaArchetype {
  code: string;
  type_label: string;
  period: string;
  u_values: Record<string, number>;
}

export interface MatchConfidence {
  level: "High" | "Medium" | "Low" | "None";
  score: number;
  reason: string;
}

export interface EpcSnapshot {
  points: EpcPoint[];
  summary: EpcSummary;
  classes: { energy_class: string; count: number }[];
  sample: Record<string, unknown>[];
}

/** Aggregate EUBUCCO stats for all buildings inside a bounding box */
export interface BboxStats {
  count: number;
  with_height: number;
  with_floors: number;
  with_year: number;
  with_energy: number;
  with_epc: number;
  with_use: number;
  with_footprint: number;
  avg_height: number | null;
  avg_floors: number | null;
  avg_year: number | null;
  avg_energy: number | null;
  avg_footprint: number | null;
  common_use: string | null;
}

/** Individual building record returned by /api/buildings/bbox/list */
export interface BuildingRecord {
  address: string;
  cadastral_id: string | null;
  lat: number;
  lon: number;
  building_use: string | null;
  year_built: number | null;
  height_m: number | null;
  floors: number | null;
  footprint_m2: number | null;
  energy_kwh_m2: number | null;
  epc_class: string | null;
  has_epc: boolean | null;
  tabula_period: string | null;
  u_wall: number | null;
  u_roof: number | null;
  u_window: number | null;
  boplats_listings: number | null;
  boplats_avg_rent_sek: number | null;
  boplats_avg_rent_per_m2_sek: number | null;
}

/** Saved AI WWR record from the local database */
export interface WWRRecord {
  lat: number;
  lon: number;
  address: string | null;
  average_wwr: number;
  per_facade: number[];
  directions: string[];
  source: string;
  building_info: Record<string, unknown>;
  saved_at: string;
}

/** Nearest EUBUCCO building returned by /api/building */
export interface BuildingLookup {
  address: string | null;
  height: number | null;
  floors: number | null;
  area_atemp: number | null;    // total Atemp (GFA) from EPC
  footprint_m2: number | null; // EUBUCCO polygon area (single building footprint)
  use_cat: string | null;
  year: number | null;
  energy: number | null;        // kWh/m²/yr
  eclass: string | null;
  tabula_period: string | null;
  tabula_u_wall: number | null;
  tabula_u_win: number | null;
  has_epc: boolean;
  lat: number;
  lon: number;
  dist_m: number;
}

export interface EpcPoint {
  FormularId: string;
  lat: number;
  lon: number;
  address?: string;
  municipality?: string;
  energy_class?: string;
  energy_performance?: number;
  build_year?: number;
  atemp?: number;
}

export interface EpcSummary {
  footprint_buildings: number;
  epc_linked_buildings: number;
  epc_records: number;
}

export interface DataInput {
  key: string;
  label: string;
  available: boolean;
  confidenceLevel: number;
  source: string;
}

/** Pipeline step definition */
export interface StepDef {
  number: number;
  label: string;
  path: string;
}
