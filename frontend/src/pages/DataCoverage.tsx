import { useState, useMemo, useEffect } from "react";
import { useWizardStore } from "../store/wizard";
import { api } from "../api/client";
import type { BuildingLookup, BboxStats, BuildingRecord } from "../types";
import {
  ChevronUp,
  Download, MapPin, Building2, Loader2, Layers, Globe2, Database,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type Status     = "Available" | "Estimated" | "Missing";
type Confidence = "High" | "Medium" | "Low" | "—";
type Action     = "None" | "Review" | "User input";

/** Definition of a data parameter — two states depending on whether user has the data */
interface DataItemDef {
  key: string;
  label: string;

  /* When the user DOES have this data */
  primarySource: string;        // e.g. "Architectural drawing"
  primaryConfidence: Confidence;

  /* When the user does NOT have this data */
  fallbackSource: string;       // e.g. "TABULA archetype database"  ("—" if no fallback)
  fallbackStatus: "Estimated" | "Missing";
  fallbackConfidence: Confidence;
  fallbackAction: Action;

  /* Should the toggle default to "I have this"? */
  defaultHas: boolean;

  /* True when there is NO estimation path: the value either comes from its real
     source (cadastral / EUBUCCO / Boverket EPC) or it is simply absent. Such a
     field must never be reported as "Estimated" — nothing estimates it. */
  noFallback?: boolean;
}

interface DataItemResolved {
  key: string;
  label: string;
  source: string;
  status: Status;
  confidence: Confidence;
  action: Action;
  hasData: boolean;
}

interface DataCategoryDef {
  category: string;
  items: DataItemDef[];
}

/* ─────────────────────────────────────────────
   Resolve helper
───────────────────────────────────────────── */
function resolve(def: DataItemDef, hasData: boolean): DataItemResolved {
  if (hasData) {
    return {
      key: def.key, label: def.label,
      source: def.primarySource,
      status: "Available",
      confidence: def.primaryConfidence,
      action: "None",
      hasData: true,
    };
  }
  return {
    key: def.key, label: def.label,
    source: def.fallbackSource || "—",
    status: def.fallbackStatus,
    confidence: def.fallbackConfidence,
    action: def.fallbackAction,
    hasData: false,
  };
}

/* ─────────────────────────────────────────────
   Style configs
───────────────────────────────────────────── */



/* ─────────────────────────────────────────────
   Data definitions (all project types)
───────────────────────────────────────────── */

/** Remove items whose label has already appeared in an earlier category. */
function dedupeByLabel(cats: DataCategoryDef[]): DataCategoryDef[] {
  const seen = new Set<string>();
  return cats
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (seen.has(item.label)) return false;
        seen.add(item.label);
        return true;
      }),
    }))
    .filter(cat => cat.items.length > 0);
}

function buildDefs(projectType: string | null, systems: string[], ecEnergyFocus: string[]): DataCategoryDef[] {
  if (!projectType) return [];
  const sys = new Set(systems);

  /* ══ RENOVATION PLANNING ══ */
  if (projectType === "Renovation Planning") {
    const cats: DataCategoryDef[] = [];

    // Energy Performance (EPC) — always shown for Renovation Planning
    cats.push({
      category: "Energy Performance (EPC)",
      items: [
        {
          key: "r_epc",  label: "Energy class",
          primarySource: "Boverket EPC (energideklaration)", primaryConfidence: "High",
          fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
          defaultHas: false, noFallback: true,
        },
        {
          key: "r_edem", label: "Energy demand (kWh/m²·yr)",
          primarySource: "Boverket EPC (energideklaration)", primaryConfidence: "High",
          fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
          defaultHas: false, noFallback: true,
        },
        {
          key: "r_atemp", label: "Heated floor area (ATEMP)",
          primarySource: "Energy Performance Certificate (ATEMP)", primaryConfidence: "High",
          fallbackSource: "Estimated from footprint × floors", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: false,
        },
      ],
    });

    if (sys.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Information",
        items: [
          {
            key: "r_fp",   label: "Building footprint dimensions",
            primarySource: "Cadastral footprint (Lantmäteriet) / EUBUCCO polygon", primaryConfidence: "High",
            fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
            defaultHas: false, noFallback: true,
          },
          {
            key: "r_hgt",  label: "Building height",
            primarySource: "EUBUCCO", primaryConfidence: "High",
            fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
            defaultHas: false, noFallback: true,
          },
          {
            key: "r_flrs", label: "Number of floors",
            primarySource: "EUBUCCO / Boverket EPC (EgenAntalPlan)", primaryConfidence: "High",
            fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
            defaultHas: false, noFallback: true,
          },
          {
            key: "r_use",  label: "Building use",
            primarySource: "Cadastral ändamål (Lantmäteriet) / EUBUCCO building type", primaryConfidence: "High",
            fallbackSource: "—", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "None",
            defaultHas: false, noFallback: true,
          },
        ],
      });
      cats.push({
        category: "Building Envelope",
        items: [
          {
            key: "r_mat",  label: "Construction U-values",
            primarySource: "TABULA archetype (U-values by construction era & type)", primaryConfidence: "High",
            fallbackSource: "TABULA archetype (U-values by construction era & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Heating System")) {
      cats.push({
        category: "Heating System",
        items: [
          {
            key: "r_ht",   label: "Heating system type",
            primarySource: "Building energy declaration / boiler room inspection", primaryConfidence: "High",
            fallbackSource: "Boverket building stock statistics (dominant system by era & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_hage", label: "Heating system age & capacity",
            primarySource: "Boiler plate / service log / installation permit", primaryConfidence: "High",
            fallbackSource: "Boverket building stock statistics (age distribution by system type)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Cooling System")) {
      cats.push({
        category: "Cooling System",
        items: [
          {
            key: "r_ct",   label: "Cooling system type",
            primarySource: "Building energy declaration / inspection", primaryConfidence: "High",
            fallbackSource: "— (cooling rarely registered; user must confirm)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "r_cc",   label: "Cooling capacity",
            primarySource: "Equipment nameplate / commissioning report", primaryConfidence: "High",
            fallbackSource: "— (no DB fallback; must be measured or input)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Domestic Hot Water System (DHW)")) {
      cats.push({
        category: "Domestic Hot Water",
        items: [
          {
            key: "r_dhw",  label: "DHW system type",
            primarySource: "Building energy declaration / inspection", primaryConfidence: "High",
            fallbackSource: "TABULA archetype / Boverket statistics (dominant DHW by era)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_dh",   label: "DHW annual demand (kWh/year)",
            primarySource: "Utility bill (measured hot water meter)", primaryConfidence: "High",
            fallbackSource: "EPC national average DHW by building type (Boverket)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    return dedupeByLabel(cats);
  }

  /* ══ ENERGY COMMUNITY PLANNING ══ */
  if (projectType === "Energy Community Planning") {
    const cats: DataCategoryDef[] = [];

    if (sys.has("Buildings") && (ecEnergyFocus.includes("Heating") || ecEnergyFocus.includes("Cooling"))) {
      cats.push({
        category: "Buildings – Envelope & Thermal",
        items: [
          {
            key: "ec_b_fp",    label: "Building footprint dimensions",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate / Cadastral data", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_b_hgt",   label: "Building height",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Urban datasets / Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_b_orient", label: "Building orientation (°)",
            primarySource: "Cesium", primaryConfidence: "High",
            fallbackSource: "Street-level imagery / GIS cadastral data", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_b_flrs",  label: "Number of floors",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate / Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_b_wwr",   label: "Window-to-wall ratio (WWR)",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery / TABULA archetype defaults", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_b_mat",   label: "Building construction materials",
            primarySource: "Design drawings / BIM model", primaryConfidence: "High",
            fallbackSource: "TABULA archetype model (by construction year & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          ...(ecEnergyFocus.includes("Heating") || ecEnergyFocus.includes("Cooling") ? [{
            key: "ec_b_hvac",  label: "HVAC system type",
            primarySource: "Building energy declaration / inspection", primaryConfidence: "High" as Confidence,
            fallbackSource: "Boverket building stock statistics (dominant system by era & type)", fallbackStatus: "Estimated" as const, fallbackConfidence: "Medium" as Confidence, fallbackAction: "Review" as Action,
            defaultHas: false,
          }] : []),
          ...(ecEnergyFocus.includes("Heating") ? [{
            key: "ec_b_hdem",  label: "Heating demand",
            primarySource: "Smart meter / district heating metering data", primaryConfidence: "High" as Confidence,
            fallbackSource: "EPC national average heat demand by building type (Boverket)", fallbackStatus: "Estimated" as const, fallbackConfidence: "Medium" as Confidence, fallbackAction: "Review" as Action,
            defaultHas: false,
          }] : []),
          ...(ecEnergyFocus.includes("Cooling") ? [{
            key: "ec_b_cdem",  label: "Cooling demand",
            primarySource: "Smart meter / cooling meter data", primaryConfidence: "High" as Confidence,
            fallbackSource: "— (cooling demand not in EPC; requires measurement or simulation)", fallbackStatus: "Missing" as const, fallbackConfidence: "—" as Confidence, fallbackAction: "User input" as Action,
            defaultHas: false,
          }] : []),
        ],
      });
    }

    if (sys.has("Buildings") && ecEnergyFocus.includes("Electricity")) {
      cats.push({
        category: "Buildings – Electricity",
        items: [
          {
            key: "ec_be_fp",   label: "Building footprint dimensions",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate / Cadastral data", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_be_hgt",  label: "Building height",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Urban datasets / Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_be_use",  label: "Building use / occupancy type",
            primarySource: "Planning permission / EPC", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_be_edem", label: "Electricity demand",
            primarySource: "Smart meter data (AMR/AMI)", primaryConfidence: "High",
            fallbackSource: "Synthetic electricity demand profile by building type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Rooftop PV")) {
      cats.push({
        category: "Case: Rooftop PV",
        items: [
          {
            key: "ec_rpv_area", label: "Roof area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_rpv_tilt", label: "Roof tilt",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Gothenburg 3D (visual estimate from 3D model)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_rpv_azimuth", label: "Building orientation (°)",
            primarySource: "Cesium", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_rpv_demand", label: "Electricity demand",
            primarySource: "Smart meter data", primaryConfidence: "High",
            fallbackSource: "Synthetic electricity demand profile by building type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Facade PV")) {
      cats.push({
        category: "Case: Facade PV",
        items: [
          {
            key: "ec_fpv_area", label: "Facade area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_fpv_wwr", label: "Window-to-wall ratio (WWR)",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_fpv_orient", label: "Building orientation (°)",
            primarySource: "Cesium", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_fpv_demand", label: "Electricity demand",
            primarySource: "Smart meter data", primaryConfidence: "High",
            fallbackSource: "Synthetic electricity demand profile by building type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Community PV")) {
      cats.push({
        category: "Case: Community PV",
        items: [
          {
            key: "ec_cpv_area", label: "Site area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_cpv_slope", label: "Slope & terrain",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_cpv_grid", label: "Grid connection availability",
            primarySource: "DSO grid capacity report / Grid network", primaryConfidence: "High",
            fallbackSource: "— (grid connection status must be confirmed)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "ec_cpv_infra", label: "Existing infrastructure on site",
            primarySource: "Site survey / Utilities map", primaryConfidence: "High",
            fallbackSource: "— (must be confirmed on site)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Battery System")) {
      cats.push({
        category: "Case: Battery Storage",
        items: [
          {
            key: "ec_bc",  label: "Battery capacity",
            primarySource: "System specs / purchase contract", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined; no default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "ec_bp",  label: "Max charge / discharge power",
            primarySource: "System specs / datasheet", primaryConfidence: "High",
            fallbackSource: "— (must be specified; no reliable default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "ec_soc", label: "State-of-charge limits (min / max %)",
            primarySource: "Manufacturer commissioning settings", primaryConfidence: "High",
            fallbackSource: "IEC 62619 standard default (10–90% SOC window)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("EV Charging") || sys.has("Vehicle to Grid (V2G)")) {
      cats.push({
        category: "Case: EV Charging",
        items: [
          {
            key: "ec_evs", label: "EV charging sessions per day",
            primarySource: "Measured charging station logs", primaryConfidence: "High",
            fallbackSource: "National EV mobility statistics (Trafikverket / IEA)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_evc", label: "EV charger rated power",
            primarySource: "Charger spec", primaryConfidence: "High",
            fallbackSource: "— (rated power must be specified)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      });
    }

 

    return dedupeByLabel(cats);
  }

  /* ══ RENEWABLE ENERGY PLANNING ══ */
  if (projectType === "Renewable Energy Planning") {
    const cats: DataCategoryDef[] = [];

    if (sys.has("Rooftop PV")) {
      cats.push({
        category: "Case: Rooftop PV",
        items: [
          {
            key: "re_rpv_area", label: "Roof area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_rpv_tilt", label: "Roof tilt",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Gothenburg 3D (visual estimate from 3D model)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_rpv_azimuth", label: "Building orientation (°)",
            primarySource: "Cesium", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "re_rpv_demand", label: "Electricity demand",
            primarySource: "Smart meter data", primaryConfidence: "High",
            fallbackSource: "Synthetic electricity demand profile by building type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Facade PV")) {
      cats.push({
        category: "Case: Facade PV",
        items: [
          {
            key: "re_fpv_area", label: "Facade area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_fpv_wwr", label: "Window-to-wall ratio (WWR)",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_fpv_orient", label: "Building orientation (°)",
            primarySource: "Cesium", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "re_fpv_demand", label: "Electricity demand",
            primarySource: "Smart meter data", primaryConfidence: "High",
            fallbackSource: "Synthetic electricity demand profile by building type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Community PV")) {
      cats.push({
        category: "Case: Community PV",
        items: [
          {
            key: "re_cpv_area", label: "Site area",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_cpv_slope", label: "Slope & terrain",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_cpv_grid", label: "Grid connection availability",
            primarySource: "DSO grid capacity report / connection offer", primaryConfidence: "High",
            fallbackSource: "— (grid connection status must be confirmed)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_cpv_infra", label: "Existing infrastructure on site",
            primarySource: "Site survey / utilities map", primaryConfidence: "High",
            fallbackSource: "— (must be confirmed on site)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      });
    }

    return dedupeByLabel(cats);
  }

  return [];
}

/* ─────────────────────────────────────────────
   Building data → DataCoverage key mapping
   Keys here signal "we have EUBUCCO data for this parameter"
───────────────────────────────────────────── */
type BKey = keyof BuildingLookup;

// Which EUBUCCO field (non-null / boolean-true) proves a DataCoverage item is available
const FIELD_MAP: Record<string, BKey> = {
  // Renovation Planning
  r_fp:    "footprint_m2",
  r_hgt:   "height",
  r_flrs:  "floors",
  r_use:   "use_cat",
  r_mat:   "tabula_period",  // TABULA matched → construction type/materials known
  r_epc:   "eclass",         // EPC energy class (A–G)
  r_edem:  "energy",         // EPC energy demand (kWh/m²·yr)
  r_atemp: "area_atemp",     // EPC heated floor area (ATEMP)
  // EC – Buildings
  ec_b_fp:    "footprint_m2",
  ec_b_hgt:   "height",
  ec_b_flrs:  "floors",
  ec_b_use:   "use_cat",
  ec_b_mat:   "tabula_period", // TABULA matched → construction materials known
  ec_b_hvac:  "has_epc",      // EPC registered → HVAC type is documented
  ec_b_hcdem: "energy",       // legacy key (kept for safety)
  ec_b_hdem:  "energy",       // heating demand → from EPC energy value
  // ec_b_cdem has no EUBUCCO fallback (cooling not in EPC)
  ec_be_fp:   "footprint_m2",
  ec_be_hgt:  "height",
  ec_be_use:  "use_cat",
  // EC – PV
  ec_rpv_area: "footprint_m2",
  ec_fpv_area: "height",      // facade area derivable from height + perimeter
  // RE – PV
  re_rpv_area: "footprint_m2",
  re_fpv_area: "height",
};









/** Maps BuildingLookup (BKey) field names → BuildingRecord field names for coverage checks */
const BKEY_TO_RECORD_FIELD: Partial<Record<string, keyof BuildingRecord>> = {
  footprint_m2:  "footprint_m2",
  height:        "height_m",
  floors:        "floors",
  use_cat:       "building_use",
  tabula_period: "tabula_period",
  has_epc:       "has_epc",
  energy:        "energy_kwh_m2",
  area_atemp:    "atemp",
  eclass:        "epc_class",
  tabula_u_wall: "u_wall",
  tabula_u_win:  "u_window",
  year:          "year_built",
};

/** Compute coverage for a parameter key over a set of BuildingRecord rows */
function coverageFor(
  itemKey: string,
  rows: BuildingRecord[],
): { count: number; total: number } | null {
  if (!rows.length) return null;
  const bKey = FIELD_MAP[itemKey] as string | undefined;
  if (!bKey) return null;
  const recKey = BKEY_TO_RECORD_FIELD[bKey];
  if (!recKey) return null;
  const count = rows.filter(r => {
    const v = r[recKey];
    return v !== null && v !== undefined && v !== false;
  }).length;
  return { count, total: rows.length };
}

/** Derive Status from coverage percentage */
function statusFromCoverage(count: number, total: number): Status {
  if (total === 0) return "Missing";
  const pct = count / total;
  if (pct >= 0.75) return "Available";
  if (pct > 0)     return "Estimated";
  return "Missing";
}


/* ─────────────────────────────────────────────
   Bbox data summary banner (multi-building mode)
───────────────────────────────────────────── */
const BBOX_CSV_COLS: { key: keyof BuildingRecord; label: string }[] = [
  { key: "address",                     label: "Address" },
  { key: "cadastral_id",                label: "Cadastral ID" },
  { key: "building_use",                label: "Use" },
  { key: "year_built",                  label: "Year" },
  { key: "height_m",                    label: "Height (m)" },
  { key: "floors",                      label: "Floors" },
  { key: "footprint_m2",                label: "Footprint (m²)" },
  { key: "energy_kwh_m2",               label: "Energy (kWh/m²)" },
  { key: "epc_class",                   label: "EPC" },
  { key: "tabula_period",               label: "TABULA Period" },
  { key: "u_wall",                      label: "U-Wall" },
  { key: "u_window",                    label: "U-Window" },
  { key: "boplats_listings",            label: "Boplats #" },
  { key: "boplats_avg_rent_per_m2_sek", label: "Rent/m² (SEK)" },
];

const EPC_ORDER: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };

const COMPARE_COLS: {
  key: keyof BuildingRecord;
  label: string;
  unit?: string;
  asc: boolean;
  betterLabel: string;
}[] = [
  { key: "energy_kwh_m2",               label: "Heat Energy",  unit: "kWh/m²·yr", asc: true,  betterLabel: "lower = better" },
  { key: "epc_class",                   label: "EPC Class",                        asc: true,  betterLabel: "A is best (A→G)" },
  { key: "year_built",                  label: "Year Built",                        asc: false, betterLabel: "newer = better" },
  { key: "u_wall",                      label: "U-Wall",       unit: "W/m²K",      asc: true,  betterLabel: "lower = better" },
  { key: "u_roof",                      label: "U-Roof",       unit: "W/m²K",      asc: true,  betterLabel: "lower = better" },
  { key: "u_window",                    label: "U-Window",     unit: "W/m²K",      asc: true,  betterLabel: "lower = better" },
  { key: "floors",                      label: "Floors",                            asc: false, betterLabel: "more floors"    },
  { key: "footprint_m2",                label: "Footprint",    unit: "m²",          asc: false, betterLabel: "larger = more"  },
  { key: "boplats_avg_rent_per_m2_sek", label: "Rent/m²",     unit: "SEK",         asc: true,  betterLabel: "lower = cheaper"},
];

/** Convert Swedish cadastral IDs like "JÄRNBROTT 134:3" → "Järnbrott 134:3" */
function formatAddress(addr: string | null | undefined): string {
  if (!addr) return "—";
  const m = addr.trim().match(/^(.+)\s+(\d+:\d+)$/);
  if (m) {
    const district = (m[1] ?? "").trim();
    if (district === district.toUpperCase() && /[A-ZÅÄÖ]/.test(district)) {
      const titleCase = district.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
      return `${titleCase} ${m[2]}`;
    }
  }
  return addr;
}

/** Return true when addr is a Swedish cadastral property designation, not a street address. */
function isCadastralId(addr: string | null | undefined, cadastralId?: string | null): boolean {
  if (!addr) return false;
  const s = addr.trim();
  if (cadastralId && s === cadastralId.trim()) return true;
  return /^.+\s+\d+:\d+\s*$/.test(s);
}

function sortByCol(a: BuildingRecord, b: BuildingRecord, colKey: keyof BuildingRecord, asc: boolean): number {
  const av = a[colKey];
  const bv = b[colKey];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  let diff: number;
  if (colKey === "epc_class") {
    diff = (EPC_ORDER[String(av).toUpperCase()] ?? 99) - (EPC_ORDER[String(bv).toUpperCase()] ?? 99);
  } else {
    const an = Number(av), bn = Number(bv);
    // Numeric columns compare numerically; text columns (e.g. address) alphabetically.
    diff = (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "")
      ? an - bn
      : String(av).localeCompare(String(bv));
  }
  return asc ? diff : -diff;
}

function rankBgColor(rank: number, total: number): string {
  if (total <= 1) return "";
  const pos = rank / (total - 1);
  if (pos <= 0.15) return "bg-emerald-900/30";
  if (pos <= 0.40) return "bg-emerald-900/15";
  if (pos >= 0.85) return "bg-red-900/30";
  if (pos >= 0.60) return "bg-amber-900/15";
  return "";
}

function deriveStats(rows: BuildingRecord[]): BboxStats {
  const num = (v: number | null | undefined): v is number => v !== null && v !== undefined && !Number.isNaN(v);
  const avg = (vals: (number | null)[]): number | null => {
    const c = vals.filter(num);
    return c.length ? Math.round((c.reduce((a, b) => a + b, 0) / c.length) * 10) / 10 : null;
  };
  const uses = rows.map(r => r.building_use).filter((u): u is string => !!u);
  const useCounts = uses.reduce<Record<string, number>>((m, u) => { m[u] = (m[u] ?? 0) + 1; return m; }, {});
  const common_use = Object.entries(useCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    count: rows.length,
    with_height:    rows.filter(r => num(r.height_m)).length,
    with_floors:    rows.filter(r => num(r.floors)).length,
    with_year:      rows.filter(r => num(r.year_built)).length,
    with_energy:    rows.filter(r => num(r.energy_kwh_m2)).length,
    with_epc:       rows.filter(r => !!r.epc_class).length,
    with_use:       uses.length,
    with_footprint: rows.filter(r => num(r.footprint_m2)).length,
    avg_height:    avg(rows.map(r => r.height_m)),
    avg_floors:    avg(rows.map(r => r.floors)),
    avg_year:      avg(rows.map(r => r.year_built)),
    avg_energy:    avg(rows.map(r => r.energy_kwh_m2)),
    avg_footprint: avg(rows.map(r => r.footprint_m2)),
    common_use,
  };
}

function BboxDataBanner({
  bboxStats: bboxStatsProp,
  bbox,
  district,
  polygon,
  onRowsChange,
  onSelectionChange,
}: {
  bboxStats: BboxStats | null;
  bbox: { north: number; south: number; east: number; west: number } | null;
  district?: string | null;
  polygon?: string | null;
  onRowsChange?: (rows: BuildingRecord[]) => void;
  onSelectionChange?: (selected: Set<number>) => void;
}) {
  const [loading, setLoading]         = useState(false);
  const [rows, setRows]               = useState<BuildingRecord[] | null>(null);
  const [viewOpen, setViewOpen]       = useState(false);
  const [page, setPage]               = useState(0);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [sortCol, setSortCol]         = useState<keyof BuildingRecord>("energy_kwh_m2");
  // Sort for the main building table (click a header). Null = original order.
  const [tableSort, setTableSort]     = useState<{ key: keyof BuildingRecord; asc: boolean } | null>(null);
  const PAGE_SIZE = 50;

  // In district mode there are no precomputed aggregate stats, so derive them
  // from the fetched rows once they load.
  // Describe EXACTLY the rows in the table below. The server aggregate counts
  // raw EUBUCCO geometries, while the list endpoint collapses duplicates onto
  // one row per address — so the header read "9 buildings · 89% EPC" above a
  // table of 8 rows that all had an EPC. Same denominator, or the numbers lie.
  const bboxStats: BboxStats = rows ? deriveStats(rows) : (bboxStatsProp ?? deriveStats([]));
  const epcPct = bboxStats.count ? Math.round((bboxStats.with_epc / bboxStats.count) * 100) : 0;

  // Notify parent whenever rows or selection changes
  useEffect(() => { onRowsChange?.(rows ?? []); }, [rows, onRowsChange]);
  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);

  // Auto-fetch rows on mount so downstream steps always have building data,
  // and open the table automatically once they're loaded. District mode
  // additionally auto-selects every building (the whole neighborhood is in scope).
  useEffect(() => {
    if ((bbox || district) && !rows) loadRows().then(() => setViewOpen(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRows() {
    if (!bbox && !district) return;
    setLoading(true);
    try {
      const data = district
        ? await api.buildingsByDistrict(district)
        : await api.buildingsBboxList(bbox!.north, bbox!.south, bbox!.east, bbox!.west, polygon ?? undefined);
      setRows(data);
      // Auto-select the whole selection (district or drawn shape) so Steps 3-4
      // simulate all of it (the user can still uncheck buildings to narrow).
      if (district || polygon) setSelected(new Set(data.map((_, i) => i)));
    } finally {
      setLoading(false);
    }
  }

  async function handleView() {
    if (!rows) await loadRows();
    setViewOpen(v => !v);
    setPage(0);
  }

  function handleDownload() {
    if (!rows) return;
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const allCols: { key: keyof BuildingRecord; label: string }[] = [
      ...BBOX_CSV_COLS,
      { key: "lat",                        label: "Latitude" },
      { key: "lon",                        label: "Longitude" },
      { key: "has_epc",                    label: "Has EPC" },
      { key: "u_roof",                     label: "U-Roof" },
      { key: "boplats_avg_rent_sek",       label: "Avg Rent (SEK)" },
    ];
    const header = allCols.map(c => c.label).join(",");
    const body   = rows.map(r => allCols.map(c => escape(r[c.key])).join(",")).join("\n");
    const blob   = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href = url; a.download = `buildings_${bboxStats.count}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleLoadAndDownload() {
    if (!rows) await loadRows();
    handleDownload();
  }

  function saveSelectedCsv() {
    if (!rows || selected.size === 0) return;
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols: { key: keyof BuildingRecord; label: string }[] = [
      ...BBOX_CSV_COLS,
      { key: "lat",                  label: "Latitude" },
      { key: "lon",                  label: "Longitude" },
      { key: "has_epc",              label: "Has EPC" },
      { key: "u_roof",               label: "U-Roof (W/m²K)" },
      { key: "boplats_avg_rent_sek", label: "Avg Rent (SEK)" },
    ];
    const header = cols.map(c => c.label).join(",");
    const body   = rankedRows.map(({ r }) => cols.map(c => escape(r[c.key])).join(",")).join("\n");
    const blob   = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href = url; a.download = `selected_${selected.size}_buildings.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function toggleRow(idx: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  // Rows carry their ORIGINAL index (selection is keyed by that), then optionally
  // sorted by the clicked column — so sorting reorders the view without ever
  // scrambling which buildings are selected.
  const orderedRows: { r: BuildingRecord; idx: number }[] = rows
    ? (() => {
        const withIdx = rows.map((r, idx) => ({ r, idx }));
        if (tableSort) withIdx.sort((a, b) => sortByCol(a.r, b.r, tableSort.key, tableSort.asc));
        return withIdx;
      })()
    : [];
  const pagedRows      = orderedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages     = rows ? Math.ceil(rows.length / PAGE_SIZE) : 0;
  const pageIdxs       = pagedRows.map(p => p.idx);
  const pageAllChecked = pageIdxs.length > 0 && pageIdxs.every(i => selected.has(i));
  const pagePartial    = !pageAllChecked && pageIdxs.some(i => selected.has(i));

  // Click a header to sort by it; click the same header again to flip asc/desc.
  const toggleSort = (key: keyof BuildingRecord) =>
    setTableSort(s => (s && s.key === key ? { key, asc: !s.asc } : { key, asc: true }));

  // Open the 3D viewer focused on the current Step-1 selection — the bounding box
  // of the selected buildings, or of every building in scope when none are ticked,
  // falling back to the drawn area. Works for a single building, many buildings, a
  // neighborhood/district, or a drawn area alike.
  const viewer3dUrl = (() => {
    const src: BuildingRecord[] = selected.size > 0
      ? [...selected].map(i => rows?.[i]).filter((r): r is BuildingRecord => !!r)
      : (rows ?? []);
    const lats = src.map(r => r.lat).filter((n): n is number => typeof n === "number");
    const lons = src.map(r => r.lon).filter((n): n is number => typeof n === "number");
    let box = "";
    if (lats.length && lons.length) {
      box = [Math.max(...lats), Math.min(...lats), Math.max(...lons), Math.min(...lons)].join(",");
    } else if (bbox) {
      box = [bbox.north, bbox.south, bbox.east, bbox.west].join(",");
    }
    return `/gothenburg_3d.html?bbox=${box}`;
  })();

  function togglePageAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (pageAllChecked) { pageIdxs.forEach(i => next.delete(i)); }
      else                { pageIdxs.forEach(i => next.add(i)); }
      return next;
    });
  }

  // Build ranked compare list
  const cfg         = (COMPARE_COLS.find(c => c.key === sortCol) ?? COMPARE_COLS[0])!;
  const selectedRows = rows ? [...selected].map(i => ({ i, r: rows[i] })).filter((x): x is { i: number; r: BuildingRecord } => x.r !== undefined) : [];
  const rankedRows   = [...selectedRows].sort((a, b) => sortByCol(a.r, b.r, sortCol, cfg.asc));

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 bg-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <div>
            <span className="text-sm font-bold text-white/85">{bboxStats.count.toLocaleString()} buildings</span>
            <span className="text-xs text-white/35 ml-2">Bounding box · EUBUCCO</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-emerald-900/40 text-emerald-400 text-[10px] font-semibold border border-emerald-700/50 shrink-0">
            {epcPct}% EPC
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button
            onClick={handleView}
            disabled={loading || !bbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:bg-white/8 disabled:opacity-40 whitespace-nowrap transition"
          >
            {loading ? "Loading…" : viewOpen ? <><ChevronUp className="w-3 h-3" /> Hide</> : "Buildings"}
          </button>
          <button
            onClick={rows ? handleDownload : handleLoadAndDownload}
            disabled={loading || !bbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:bg-white/8 disabled:opacity-40 whitespace-nowrap transition"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <a
            href={viewer3dUrl}
            target="_blank" rel="noopener noreferrer"
            title={selected.size > 0 ? `Open the 3D viewer on the ${selected.size} selected building${selected.size === 1 ? "" : "s"}` : "Open the 3D viewer on this selection"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-purple-400 hover:bg-purple-900/30 whitespace-nowrap transition"
          >
            <Globe2 className="w-3 h-3" /> 3D view
          </a>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex flex-wrap divide-x divide-white/8 border-t border-white/8">
        {bboxStats.common_use && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Primary use</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{bboxStats.common_use}</div>
          </div>
        )}
        {bboxStats.avg_year && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Avg year built</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{bboxStats.avg_year}</div>
          </div>
        )}
        {bboxStats.avg_floors && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Avg floors</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{bboxStats.avg_floors}</div>
          </div>
        )}
        {bboxStats.avg_footprint && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Avg footprint</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{Math.round(bboxStats.avg_footprint)} m²</div>
          </div>
        )}
        {bboxStats.avg_height && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Avg height</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{bboxStats.avg_height} m</div>
          </div>
        )}
        {bboxStats.avg_energy && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Avg energy use</div>
            <div className="text-xs font-bold text-white/75 mt-0.5">{bboxStats.avg_energy} kWh/m²</div>
          </div>
        )}
        <div className="px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Height data</div>
          <div className="text-xs font-bold text-white/75 mt-0.5">{Math.round(bboxStats.with_height/bboxStats.count*100)}% <span className="font-normal text-white/30">({bboxStats.with_height}/{bboxStats.count})</span></div>
        </div>
        <div className="px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Floor data</div>
          <div className="text-xs font-bold text-white/75 mt-0.5">{Math.round(bboxStats.with_floors/bboxStats.count*100)}% <span className="font-normal text-white/30">({bboxStats.with_floors}/{bboxStats.count})</span></div>
        </div>
      </div>

      {/* Prominent loading state while the buildings list is being fetched */}
      {loading && !rows && (
        <div className="border-t border-white/10 flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="w-9 h-9 text-purple-400 animate-spin" />
          <div className="text-sm font-semibold text-white/70">Loading buildings…</div>
          <div className="text-xs text-white/35">Fetching {bboxStats.count.toLocaleString()} buildings in the selected area</div>
        </div>
      )}

      {/* Inline table */}
      {viewOpen && rows && (
        <div className="border-t border-white/10">
          {/* Row count */}
          <div className="flex items-center px-4 pt-2 pb-1 text-[10px] text-white/40">
            <span className="ml-auto text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-white/8">
                  {/* Select-all checkbox */}
                  <th className="px-2 py-1 border-b border-white/10 w-6">
                    <input
                      type="checkbox"
                      checked={pageAllChecked}
                      ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = pagePartial; }}
                      onChange={togglePageAll}
                      className="w-3 h-3 cursor-pointer accent-violet-600"
                      title="Select / deselect all on this page"
                    />
                  </th>
                  {BBOX_CSV_COLS.map(c => {
                    const active = tableSort?.key === c.key;
                    return (
                      <th key={c.key}
                          onClick={() => toggleSort(c.key)}
                          title="Sort by this column (click again to reverse)"
                          className={`px-2 py-1 text-left font-semibold border-b border-white/10 whitespace-nowrap cursor-pointer select-none hover:text-white ${active ? "text-white" : "text-white/60"}`}>
                        {c.label}
                        <span className="ml-1 text-[9px]" style={{ opacity: active ? 1 : 0.3 }}>
                          {active ? (tableSort!.asc ? "▲" : "▼") : "↕"}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ r, idx: globalIdx }) => {
                  const isSelected = selected.has(globalIdx);
                  return (
                    <tr
                      key={globalIdx}
                      onClick={() => toggleRow(globalIdx)}
                      className={`cursor-pointer border-b border-white/8 transition-colors ${
                        isSelected ? "bg-purple-900/30 hover:bg-purple-900/40" : "hover:bg-white/5"
                      }`}
                    >
                      <td className="px-2 py-1 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(globalIdx)}
                          className="w-3 h-3 cursor-pointer accent-violet-600"
                        />
                      </td>
                      {BBOX_CSV_COLS.map(c => {
                        const val     = r[c.key];
                        const present = val !== null && val !== undefined;
                        const isBoplats = (c.key as string).startsWith("boplats_");
                        const cell = isSelected
                          ? ""
                          : present
                            ? isBoplats ? "bg-amber-900/20 text-amber-300" : "bg-emerald-900/15 text-white/70"
                            : "bg-red-900/15 text-white/25";
                        const display = c.key === "address"
                          ? (isCadastralId(val as string, r.cadastral_id) ? "—" : formatAddress(val as string))
                          : present ? String(val) : "—";
                        return (
                          <td key={c.key} className={`px-2 py-1 ${cell} whitespace-nowrap`}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2 border-t border-white/8 text-[11px]">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-0.5 rounded border border-white/15 text-white/50 disabled:opacity-30 hover:bg-white/8"
              >← Prev</button>
              <span className="text-white/35">Page {page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2 py-0.5 rounded border border-white/15 text-white/50 disabled:opacity-30 hover:bg-white/8"
              >Next →</button>
            </div>
          )}
          {/* Compare / Clear — shown after table rows */}
          {selected.size > 0 && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-blue-100">
              <button
                onClick={() => { setCompareOpen(v => !v); }}
                className="px-2.5 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-semibold hover:bg-violet-700 transition"
              >
                Compare {selected.size}
              </button>
              <button
                onClick={() => { setSelected(new Set()); setCompareOpen(false); }}
                className="text-gray-400 hover:text-red-500 transition text-[10px]"
                title="Clear selection"
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Compare panel ── */}
      {compareOpen && selectedRows.length > 0 && (
        <div className="border-t-2 border-violet-700/50 bg-[#0d1117]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-purple-900/20 border-b border-purple-700/30">
            <span className="text-xs font-bold text-purple-300">
              Comparing {selectedRows.length} buildings — ranked best to worst
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={saveSelectedCsv}
                className="flex items-center gap-1.5 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                title="Download selected buildings as CSV"
              >
                <Download className="w-3 h-3" /> Export
              </button>
              <button
                onClick={() => setCompareOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm leading-none"
              >✕</button>
            </div>
          </div>

          {/* Sort-by category pills */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-purple-700/20 bg-purple-900/10">
            <span className="text-[10px] text-white/40 mr-1">Sort by:</span>
            {COMPARE_COLS.map(c => (
              <button
                key={c.key}
                onClick={() => setSortCol(c.key)}
                title={c.betterLabel}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition ${
                  sortCol === c.key
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-white/5 text-white/50 border-white/15 hover:border-purple-500 hover:text-purple-300"
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="ml-1 text-[10px] text-gray-400 italic">({cfg.betterLabel})</span>
          </div>

          {/* Ranked table */}
          <div className="overflow-x-auto px-4 py-3">
            <table className="w-full text-[11px] border-collapse rounded-lg overflow-hidden border border-purple-700/30">
              <thead>
                <tr className="bg-purple-900/30">
                  <th className="px-2 py-1.5 text-left font-semibold text-purple-300 border-b border-purple-700/30 whitespace-nowrap">Address</th>
                  {COMPARE_COLS.map(c => (
                    <th
                      key={c.key}
                      onClick={() => setSortCol(c.key)}
                      title={c.betterLabel}
                      className={`px-2 py-1.5 text-left font-semibold border-b border-purple-700/30 whitespace-nowrap cursor-pointer select-none transition ${
                        sortCol === c.key
                          ? "text-purple-300 bg-purple-900/40"
                          : "text-purple-400/70 hover:text-purple-300 hover:bg-purple-900/20"
                      }`}
                    >
                      <div className="leading-tight">{c.label}{sortCol === c.key ? " ▲" : ""}</div>
                      {c.unit && <div className="text-[8px] font-normal text-gray-400">{c.unit}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedRows.map(({ i, r }, rank) => {
                  const rowBg  = rankBgColor(rank, rankedRows.length);
                  return (
                    <tr key={i} className={`border-b border-white/6 ${rowBg}`}>
                      {(() => {
                        const entrances = (r.all_addresses ?? "").split("|").map(s => s.trim()).filter(Boolean);
                        const extra = entrances.length - 1;
                        const fullTitle = entrances.length > 1
                          ? entrances.join(", ")
                          : (isCadastralId(r.address, r.cadastral_id) ? (r.cadastral_id ?? "—") : formatAddress(r.address));
                        return (
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap max-w-[220px] text-white/75" title={fullTitle}>
                            <span className="mr-1.5 text-xs text-white/30">{rank + 1}</span>
                            <span className="truncate">{isCadastralId(r.address, r.cadastral_id) ? "—" : formatAddress(r.address)}</span>
                            {extra > 0 && <span className="ml-1 text-[10px] text-teal/70" title={entrances.join(", ")}>+{extra}</span>}
                          </td>
                        );
                      })()}
                      {COMPARE_COLS.map(c => {
                        const val      = r[c.key];
                        const present  = val !== null && val !== undefined;
                        const isActive = c.key === sortCol;
                        return (
                          <td
                            key={c.key}
                            className={`px-2 py-1.5 whitespace-nowrap ${isActive ? "font-semibold text-white/90" : "text-white/65"} ${!present ? "text-white/25" : ""}`}
                          >
                            {present ? String(val) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Building data summary banner
───────────────────────────────────────────── */
// Fields critical for each project type (maps to BuildingLookup keys)
const BUILDING_CRITICAL: Record<string, Set<keyof BuildingLookup>> = {
  "Renovation Planning":       new Set(["year","eclass","tabula_u_wall","tabula_u_win","use_cat","floors"]),
  "Energy Community Planning": new Set(["footprint_m2","floors","height","use_cat","eclass","energy"]),
  "Renewable Energy Planning": new Set(["footprint_m2","floors","height","use_cat"]),
};

function FieldChip({
  label, value, critical,
}: { label: string; value: string | number | null | undefined; critical: boolean }) {
  const hasVal = value !== null && value !== undefined;
  const base = "flex flex-col px-2.5 py-2 rounded-lg border text-[11px]";
  const colors = hasVal
    ? critical ? "bg-purple-900/30 border-purple-700/50 text-purple-300"
               : "bg-emerald-900/30 border-emerald-700/50 text-emerald-300"
    : critical ? "bg-red-900/30 border-red-700/50 text-red-400"
               : "bg-white/5 border-white/10 text-white/30";
  return (
    <div className={`${base} ${colors}`}>
      <span className="font-semibold leading-tight">{hasVal ? String(value) : "—"}</span>
      <span className="text-[10px] opacity-70 mt-0.5">{label}{critical && " ★"}</span>
    </div>
  );
}

function BuildingDataBanner({
  building,
  projectType,
}: {
  building: BuildingLookup;
  projectType: string | null;
}) {
  const critical = projectType ? (BUILDING_CRITICAL[projectType] ?? new Set<keyof BuildingLookup>()) : new Set<keyof BuildingLookup>();
  const viewerUrl = `/gothenburg_3d.html?lat=${building.lat}&lon=${building.lon}&zoom=17`;

  const fields: { key: keyof BuildingLookup; label: string }[] = [
    { key: "use_cat",       label: "Use" },
    { key: "year",          label: "Year built" },
    { key: "floors",        label: "Floors" },
    { key: "height",        label: "Height (m)" },
    { key: "footprint_m2",  label: "Footprint (m²)" },
    { key: "eclass",        label: "Energy class" },
    { key: "energy",        label: "Energy (kWh/m²)" },
    { key: "tabula_u_wall", label: "U-wall (W/m²K)" },
    { key: "tabula_u_win",  label: "U-win (W/m²K)" },
  ];

  const missingCritical = fields.filter(
    f => critical.has(f.key) && (building[f.key] === null || building[f.key] === undefined)
  );

  return (
    <div className="rounded-xl border border-purple-700/40 bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-900/25 border-b border-purple-700/30">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-xs font-semibold text-purple-300">Data Available</span>
          <span className="px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 text-[9px] font-bold border border-purple-600/50">EUBUCCO</span>
          {building.has_epc && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-[9px] font-bold border border-emerald-700/50">EPC</span>
          )}
        </div>
        {building.address && !isCadastralId(building.address) && <span className="text-[10px] text-purple-400/70 truncate max-w-[200px]">{formatAddress(building.address)}</span>}
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-3">
        {fields.map(f => (
          <FieldChip
            key={String(f.key)}
            label={f.label}
            value={building[f.key] as string | number | null}
            critical={critical.has(f.key)}
          />
        ))}
      </div>

      {/* Missing critical data warning */}
      {missingCritical.length > 0 && (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-400">
          <span className="text-sm mt-0.5">⚠️</span>
          <span>
            <span className="font-semibold">Missing critical data for {projectType}:</span>{" "}
            {missingCritical.map(f => f.label).join(", ")}.
            {" "}Check the starred (★) rows below and toggle them off for fallback options.
          </span>
        </div>
      )}

      {/* 3D Inspector link */}
      <div className="px-3 pb-3">
        <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-400 hover:text-purple-300 underline underline-offset-2">
          📷 Open Gothenburg 3D →
        </a>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Multi-building data summary banner (multiple addresses selected)
───────────────────────────────────────────── */
function MultiBuildingDataBanner({
  buildings,
  projectType,
}: {
  buildings: BuildingLookup[];
  projectType: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const withEpc = buildings.filter(b => b.has_epc).length;
  const shownBuildings = expanded ? buildings : buildings.slice(0, 3);

  return (
    <div className="rounded-xl border border-purple-700/40 bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-900/25 border-b border-purple-700/30">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-xs font-semibold text-purple-300">
            Data Available — {buildings.length} buildings
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 text-[9px] font-bold border border-purple-600/50">EUBUCCO</span>
          {withEpc > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-[9px] font-bold border border-emerald-700/50">
              EPC ({withEpc}/{buildings.length})
            </span>
          )}
        </div>
        <span className="text-[10px] text-purple-400/70">{projectType}</span>
      </div>

      {/* Building list */}
      <div className="divide-y divide-white/6">
        {shownBuildings.map((b, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2">
            <span className="text-[10px] text-white/25 font-mono mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white/75 truncate">{isCadastralId(b.address) ? "EUBUCCO building" : (formatAddress(b.address) ?? "EUBUCCO building")}</div>
              <div className="flex flex-wrap gap-x-3 mt-0.5 text-[10px] text-white/40">
                {b.use_cat    && <span>{b.use_cat}</span>}
                {b.year       && <span>Built {b.year}</span>}
                {b.floors     && <span>{b.floors} floors</span>}
                {b.eclass     && <span>Class {b.eclass}</span>}
                {b.tabula_u_wall && <span>U-wall {b.tabula_u_wall} W/m²K</span>}
              </div>
            </div>
            {b.has_epc && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-[9px] font-bold border border-emerald-700/50 mt-0.5 flex-shrink-0">EPC</span>
            )}
          </div>
        ))}
      </div>

      {buildings.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-[11px] font-medium text-purple-400 hover:text-purple-300 py-2 border-t border-purple-700/30 hover:bg-purple-900/20 transition-colors"
        >
          {expanded ? `Show less ▲` : `Show all ${buildings.length} buildings ▼`}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export default function DataCoverage() {
  const { project, setProject } = useWizardStore();
  const building   = project.lookedUpBuilding ?? null;
  const buildings  = project.lookedUpBuildings ?? [];
  const bboxStats  = project.bboxStats ?? null;
  const isMulti    = buildings.length > 1;


  /* ── Auto-retry: if building lookups are missing (backend was down when step 1
     ran) re-run them as soon as DataCoverage mounts. ── */
  useEffect(() => {
    const pts = project.buildingPoints ?? [];
    const bbox = project.currentBbox ?? null;

    // Re-run point lookups when points exist but results are empty
    if (pts.length > 0 && buildings.length === 0 && !bboxStats) {
      (async () => {
        try {
          const results = await Promise.all(pts.map(p => api.lookupBuilding(p.lat, p.lon, project.country)));
          let savedWWRNew = null;
          try {
            const first = pts[0];
            if (first) {
              const wwrRes = await api.lookupWWR(first.lat, first.lon);
              if (wwrRes.found) savedWWRNew = wwrRes.record;
            }
          } catch { /* ignore */ }
          setProject({ lookedUpBuilding: results[0] ?? null, lookedUpBuildings: results, savedWWR: savedWWRNew });
        } catch { /* backend still not ready — silent */ }
      })();
      return;
    }

    // Re-run bbox stats when bbox exists but stats are empty
    if (bbox && !bboxStats && pts.length === 0) {
      (async () => {
        try {
          const stats = await api.lookupBuildingsBbox(bbox.north, bbox.south, bbox.east, bbox.west);
          setProject({ bboxStats: stats });
        } catch { /* backend still not ready — silent */ }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defs = useMemo(
    () => buildDefs(project.projectType, project.systemsInScope, project.ecEnergyFocus ?? []),
    [project.projectType, project.systemsInScope, project.ecEnergyFocus],
  );

  // Bbox table rows + selection (lifted from BboxDataBanner)
  const [bboxRows, setBboxRows]               = useState<BuildingRecord[]>([]);
  const [bboxSelectedIdx, setBboxSelectedIdx] = useState<Set<number>>(new Set());

  // Active rows: the buildings the user CHECKED (or all bbox rows if none are
  // checked yet). These are what coverage is computed on AND what flows to
  // Steps 3-4 - so the user simulates only the buildings they selected here.
  const activeCovRows = useMemo<BuildingRecord[]>(() => {
    if (!bboxRows.length) return [];
    if (bboxSelectedIdx.size > 0) return bboxRows.filter((_, i) => bboxSelectedIdx.has(i));
    return bboxRows;
  }, [bboxRows, bboxSelectedIdx]);

  // Persist the SELECTED buildings downstream (Steps 3-4 read project.bboxRows).
  useEffect(() => { setProject({ bboxRows: activeCovRows }); }, [activeCovRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-parameter coverage from activeCovRows
  const coverageMap = useMemo<Record<string, { count: number; total: number } | null>>(() => {
    if (!activeCovRows.length) return {};
    const map: Record<string, { count: number; total: number } | null> = {};
    defs.forEach(cat => cat.items.forEach(item => {
      map[item.key] = coverageFor(item.key, activeCovRows);
    }));
    return map;
  }, [activeCovRows, defs]);

  /* One honest summary of the selection's data quality — what the old coverage
     table was trying to say, in the two facts that actually change a decision:
     how much of the selection has measured EPC data, and what is missing outright. */


  /* ── 2-way bridge: receive building selection from Cesium viewer ── */
  const [viewerSelection, setViewerSelection] = useState<{
    address?: string; lat?: number; lon?: number;
    use_cat?: string; year?: number; height?: number;
    floors?: number; footprint_m2?: number; energy?: number; eclass?: string;
  } | null>(null);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ppg_selected_building' && e.newValue) {
        try { setViewerSelection(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);


  /* Resolved items (respecting user toggles).
     Where we have the actual buildings, the status reflects REAL coverage
     across the selection — Available ≥75%, Estimated >0, Missing 0 — instead of
     a flat "at least one building has this" boolean. A field the user set by
     hand keeps their value. */
  const resolved = useMemo(
    () => defs.map(cat => ({
      category: cat.category,
      items: cat.items.map(def => {
        const cov = coverageMap[def.key];
        // Availability is derived purely from what the selected buildings
        // actually contain — there is no user "do you have this?" toggle any more.
        const covStatus = cov && cov.total > 0 ? statusFromCoverage(cov.count, cov.total) : null;
        const base = resolve(def, covStatus ? covStatus === "Available" : def.defaultHas);
        if (!cov || covStatus === null) return base;

        // Fields with no estimation path (footprint, height, floors, use, energy
        // class, energy demand) are never "Estimated" — nothing estimates them.
        // They come from cadastral / EUBUCCO / Boverket EPC, or they are absent.
        // The source stays the real one and the n/N fraction carries the nuance.
        const covHas = covStatus === "Available";

        if (def.noFallback) {
          const status: Status = covHas ? "Available" : "Missing";
          return {
            ...base,
            status,
            hasData: covHas,
            source: cov.count > 0
              ? `${def.primarySource}${cov.count < cov.total ? ` — ${cov.count}/${cov.total} buildings` : ""}`
              : base.source,
            confidence: cov.count > 0 ? def.primaryConfidence : base.confidence,
            // Nothing for the user to supply — the value is in the registry or it isn't.
            action: "None" as Action,
          };
        }

        // Otherwise partial coverage is a MIX, not a pure fallback: the buildings
        // that have the field get it from the real source (ATEMP from the EPC) and
        // only the remainder is derived.
        const source = covStatus === "Estimated" && cov.count > 0 && def.fallbackSource
          ? `${def.primarySource} — ${cov.count}/${cov.total} buildings; rest: ${def.fallbackSource}`
          : base.source;
        return { ...base, status: covStatus, hasData: covHas, source };
      }),
    })),
    [defs, coverageMap],
  );

  const allItems       = resolved.flatMap(c => c.items);
  const availableCount = allItems.filter(i => i.status === "Available").length;
  const estimatedCount = allItems.filter(i => i.status === "Estimated").length;
  const totalCount     = allItems.length;
  const confPct = totalCount
    ? Math.round(((availableCount + estimatedCount * 0.5) / totalCount) * 100)
    : 0;

  useEffect(() => {
    setProject({ dataCoveragePct: confPct } as never);
  }, [confPct, setProject]);

  /* Sync resolved items to store so Step 3 can read them */
  useEffect(() => {
    const inputs: Record<string, { available: boolean; proxy: string | null; confidence: number }> = {};
    resolved.forEach(cat => cat.items.forEach(item => {
      const conf = item.confidence === "High" ? 0.9
        : item.confidence === "Medium" ? 0.55
        : item.confidence === "Low"    ? 0.25
        : 0;
      inputs[item.key] = {
        available:  item.hasData,
        proxy:      item.hasData ? null : item.source,
        confidence: conf,
      };
    }));
    setProject({ dataInputs: inputs });
  }, [resolved, setProject]);




  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Building &amp; Site Data</h2>
        <p className="text-sm text-white/45 mt-1">
          What data is available for each building, and what is missing — from the cadastral register (Lantmäteriet),
          EUBUCCO and the Boverket EPC. An empty cell means that value simply doesn&apos;t exist for that building.
          Select the buildings you want to carry into the analysis.
        </p>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-900/30 text-purple-300 text-xs font-semibold border border-purple-700/40">
            <Layers className="w-3 h-3" /> {project.projectType}
          </span>
        )}
        {project.scale && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/30 text-emerald-400 text-xs font-semibold border border-emerald-700/40">
            <Database className="w-3 h-3" /> {project.scale} scale
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-white/50 text-xs font-semibold border border-white/10">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* EUBUCCO building data banner (single building) */}
      {!isMulti && building && !bboxStats && (
        <BuildingDataBanner
          building={building}
          projectType={project.projectType}
        />
      )}

      {/* EUBUCCO multi-building banner (multiple addresses selected) */}
      {isMulti && !bboxStats && (
        <MultiBuildingDataBanner
          buildings={buildings}
          projectType={project.projectType}
        />
      )}

      {/* EUBUCCO bbox aggregate banner (bbox draw mode OR neighborhood-by-name) */}
      {(bboxStats || project.district) && (
        <BboxDataBanner
          bboxStats={bboxStats}
          bbox={project.currentBbox ?? null}
          district={project.district ?? null}
          polygon={project.selectionPolygon ?? null}
          onRowsChange={setBboxRows}
          onSelectionChange={setBboxSelectedIdx}
        />
      )}

      {/* 🔗 Viewer selection — building highlighted in the 3D viewer */}
      {viewerSelection && (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0d1117] px-4 py-2.5">
          <Globe2 className="w-4 h-4 text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <span className="font-semibold text-white/80">{isCadastralId(viewerSelection.address) ? "No street address" : (formatAddress(viewerSelection.address) || "Unknown address")}</span>
            <span className="text-white/20 mx-2">|</span>
            <span className="text-white/40 space-x-3">
              {viewerSelection.use_cat && <span>{viewerSelection.use_cat}</span>}
              {viewerSelection.year    && <span>Built {viewerSelection.year}</span>}
              {viewerSelection.height  && <span>{viewerSelection.height} m</span>}
              {viewerSelection.floors  && <span>{viewerSelection.floors} fl</span>}
              {viewerSelection.energy  && <span>{viewerSelection.energy} kWh/m²</span>}
              {viewerSelection.eclass  && <span>EPC {viewerSelection.eclass}</span>}
            </span>
          </div>
          <span className="text-[10px] font-medium text-violet-400 bg-purple-900/30 px-2 py-0.5 rounded shrink-0">3D Viewer</span>
          <button
            onClick={() => { setViewerSelection(null); try { localStorage.removeItem('ppg_selected_building'); } catch { /**/ } }}
            className="text-white/25 hover:text-white/60 shrink-0 text-sm leading-none ml-1"
            title="Dismiss"
          >×</button>
        </div>
      )}


    </div>
  );
}
