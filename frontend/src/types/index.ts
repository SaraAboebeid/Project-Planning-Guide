/* ── Shared types mirroring your Streamlit session_state ── */

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
