/* ── Shared TypeScript types for the wizard ── */

export type ProjectType =
  | "Energy Community Planning"
  | "Renovation Planning"
  | "Renewable Energy Planning";

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
  all_addresses?: string | null;   // every entrance on this EPC, "16A | 16B | 16C"
  cadastral_id: string | null;
  lat: number;
  lon: number;
  building_use: string | null;
  /** Named neighbourhood (Gothenburg primärområde) this building falls in. */
  primary_area?: string | null;
  year_built: number | null;
  height_m: number | null;
  floors: number | null;
  atemp: number | null;
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
  // UK only (country=gb): see backend _uk_bbox_row.
  energy_source?: "epc" | "tabula_estimate" | null;
  epc_source?: string | null;
  sap?: number | null;
  u_floor?: number | null;
  u_door?: number | null;
  heating_system?: string | null;
  main_fuel?: string | null;
  property_type?: string | null;
  postcode?: string | null;
  nd_epc_band?: string | null;
  dec_band?: string | null;
  dec_metered_kwh?: Record<string, number> | null;
  desnz_gas_median_kwh?: number | null;
  desnz_electricity_median_kwh?: number | null;
  heated_area_m2?: number | null;
  heated_area_source?: string | null;
  dwellings_est?: number | null;
  epc_stale?: boolean | null;
  u_wall_epc?: number | null;
  u_roof_epc?: number | null;
  u_win_epc?: number | null;
  u_floor_epc?: number | null;
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
  balcony_count_total?: number;
  balcony_area_m2_total?: number | null;
}

/** One material resource from the Boverket Klimatdatabas, flattened by
 * utils/boverket_api.py's resource_summary(). GWP figures are kg CO2e per
 * the resource's own Unit (see the Unit field, usually per-kg or per-m2). */
export interface BoverketResource {
  Name: string;
  Unit: string;
  Category: string;
  "GWP A1-A3 (Conservative)": number | "—";
  "GWP A1-A3 (Typical)": number | "—";
  "GWP A4 (Transport)": number | "—";
  "GWP A5.1 (Installation)": number | "—";
  "GWP Max (Cons+A4+A5)": number | "—";
  "GWP Min (Typ+A4+A5)": number | "—";
  "Density / Conversion": string;
  "Waste Factor": string | number;
}

/**
 * Why the shoebox is not a fair model of this building (backend _model_scope).
 * null/absent means it is. "out_of_scope" = the number answers a different
 * question from the meter (pools, hospitals, industry); "caution" = part of the
 * picture is missing (workshops, unheated stores).
 */
export interface ModelScope {
  level: "out_of_scope" | "caution";
  reason: string;
  matched?: string | null;
}

/** Nearest EUBUCCO building returned by /api/building */
export interface BuildingLookup {
  address: string | null;
  all_addresses?: string | null;   // every entrance on this EPC, "16A | 16B | 16C"
  height: number | null;
  floors: number | null;
  area_atemp: number | null;    // total Atemp (GFA) from EPC
  footprint_m2: number | null; // EUBUCCO polygon area (single building footprint)
  wall_perimeter_m: number | null; // true polygon perimeter, not a square approximation
  wall_area_m2: number | null;     // wall_perimeter_m x height
  roof_area_m2: number | null;     // alias of footprint_m2
  floor_area_m2: number | null;    // alias of footprint_m2
  use_cat: string | null;
  model_scope?: ModelScope | null;
  year: number | null;
  energy: number | null;        // kWh/m²/yr
  eclass: string | null;
  tabula_period: string | null;
  // UK only: always populated when a TABULA match exists (a real known year
  // OR an EHS-sampled era), unlike tabula_period which stays null for a
  // sampled era - use this to re-match the SAME archetype tabula_u_wall/
  // roof/win came from (e.g. a refurbishment-tier picker), not tabula_period.
  tabula_period_used?: string | null;
  // "known_year" | "ehs_sampled_period" | null - UK only.
  tabula_u_source?: string | null;
  tabula_u_wall: number | null;
  tabula_u_roof: number | null;
  tabula_u_win: number | null;
  has_epc: boolean;
  lat: number;
  lon: number;
  dist_m: number;
  // ── UK only (/api/uk/building) ──
  country?: "gb";
  postcode?: string | null;
  floors_source?: "epc_property_type" | "height_estimate" | "eubucco" | null;
  area_source?: "epc_sum" | "epc_mean_x_dwellings" | null;
  year_source?: "epc_age_band" | "eubucco_osm" | null;
  energy_source?: "epc" | "tabula_estimate" | null;
  sap?: number | null;
  /** "EPC register (OS UPRN)" / "epc" = real certificate; "ehs_prior_*" = estimated band */
  epc_source?: string | null;
  epc_dwellings?: number | null;
  epc_latest_date?: string | null;
  property_type?: string | null;
  built_form?: string | null;
  main_fuel?: string | null;
  heating_system?: string | null;
  hotwater_description?: string | null;
  has_heat_pump?: boolean | null;
  has_solar_pv?: boolean | null;
  tabula_u_floor?: number | null;
  tabula_u_door?: number | null;
  /** Non-domestic EPC (SBEM asset rating) placed on this building. */
  nd_epc_band?: string | null;
  nd_property_type?: string | null;
  nd_floor_area_m2?: number | null;
  nd_energy_kwh_m2_yr?: number | null;
  /** Display Energy Certificate: public buildings' metered operational rating. */
  dec_band?: string | null;
  dec_name?: string | null;
  dec_property_type?: string | null;
  dec_floor_area_m2?: number | null;
  dec_metered_kwh?: Record<string, number> | null;
  dec_period?: [string | null, string | null] | null;
  /** DESNZ metered domestic consumption for the postcode — median kWh per meter. */
  desnz_postcode?: string | null;
  desnz_year?: number | null;
  desnz_gas_median_kwh?: number | null;
  desnz_gas_meters?: number | null;
  desnz_electricity_median_kwh?: number | null;
  desnz_electricity_meters?: number | null;
  epc_dwellings_count?: number | null;
  /** Floor area measured to the outside of the walls: OSM footprint x floors. */
  gross_floor_area_m2?: number | null;
  /** Floor area the energy model simulates (UK: EPC total floor areas). */
  heated_area_m2?: number | null;
  heated_area_source?: "epc_sum" | "epc_plus_estimate" | "ratio_estimate" | "nondomestic_epc" | "gross" | null;
  dwellings_est?: number | null;
  boiler_efficiency_epc?: number | null;
  epc_median_year?: number | null;
  epc_stale?: boolean | null;
  u_wall_epc?: number | null;
  u_roof_epc?: number | null;
  u_win_epc?: number | null;
  u_floor_epc?: number | null;
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
