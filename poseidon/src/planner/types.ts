/* The planner types the copied method files (retrofitPriority.ts,
   renovationRecommendations.ts) need — the same shapes as in
   frontend/src/types and frontend/src/store/wizard.ts, trimmed to the fields
   those files read. Copied rather than imported because the planner's store
   module pulls in its state library, which this app does not use.

   Sync: these files come from the main planner (frontend/src/utils/
   retrofitPriority.ts, utils/renovationRecommendations.ts, config/
   serviceLifeSE.ts) as of 2026-11-19. Only their import lines were changed,
   plus the energy-scale option marked in retrofitPriority.ts. */

/** The subset of the planner's BuildingRecord that the ranking reads. */
export interface BuildingRecord {
  address: string | null;
  cadastral_id?: string | null;
  lat?: number | null;
  lon?: number | null;
  address_source?: string | null;
  year_built: number | null;
  floors: number | null;
  atemp: number | null;
  footprint_m2: number | null;
  energy_kwh_m2: number | null;
  epc_class: string | null;
}

export interface RenovationRecord {
  id: string;
  component: string;   // "Walls", "Windows", "Roof", "Floor", "Heating system"
  year: number;
  /** U-value achieved (W/m²K), when known — envelope parts only. */
  uValue?: number;
  note?: string;
}

export interface BuildingHistory {
  label?: string;
  owner?: string;
  renovations: RenovationRecord[];
}

export interface FacadeDefectSummary {
  label?: string;
  imageCount: number;
  defectCount: number;
  byClass: Record<string, number>;
  aiByClass?: Record<string, number>;
  checkedAt: string;
  streetviewOnly?: boolean;
  lowDetail?: boolean;
}
