import { useState, useMemo, useEffect, useRef } from "react";
import { useWizardStore } from "../store/wizard";
import { api } from "../api/client";
import { setWizardCanNext, setWizardNextError } from "../components/wizardNav";
import type { BuildingLookup, BboxStats, BuildingRecord } from "../types";
import FacadeDefectPanel, { type FacadeBuilding } from "../components/FacadeDefectPanel";
import RetrofitPriorityPanel from "../components/RetrofitPriorityPanel";
import { makeBuildingKeys, type PriorityInput } from "../utils/retrofitPriority";
import {
  ChevronUp, ChevronDown,
  Download, Upload, Plus, Pencil, MapPin, Building2, Loader2, Layers, Globe2, Database,
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
];

const FUTURE_META_COLS = [
  { key: "renovated", label: "Renovated", badge: "soon", title: "Renovation status is not yet available from the EPC dataset." },
  { key: "renovation_measure", label: "Renovation measure", badge: "soon", title: "Renovation measure is a future feature and is not currently populated." },
] as const;

/* ─────────────────────────────────────────────
   User data import (CSV / JSON) — merge the user's own data onto the loaded
   buildings, overwriting existing values or filling missing ones. Rows are
   matched by Address (or Cadastral ID). Columns are matched either by the
   export labels above or by the raw BuildingRecord field name.
───────────────────────────────────────────── */
const NUMERIC_FIELDS = new Set<string>([
  "year_built", "height_m", "floors", "footprint_m2", "energy_kwh_m2",
  "u_wall", "u_window", "u_roof", "lat", "lon", "atemp",
  "boplats_listings", "boplats_avg_rent_sek", "boplats_avg_rent_per_m2_sek",
]);
const _normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const IMPORT_FIELD_MAP: Record<string, keyof BuildingRecord> = (() => {
  const m: Record<string, keyof BuildingRecord> = {};
  const add = (label: string, field: keyof BuildingRecord) => { m[_normKey(label)] = field; };
  add("Address", "address"); add("Cadastral ID", "cadastral_id"); add("Use", "building_use");
  add("Year", "year_built"); add("Height (m)", "height_m"); add("Floors", "floors");
  add("Footprint (m²)", "footprint_m2"); add("Energy (kWh/m²)", "energy_kwh_m2"); add("EPC", "epc_class");
  add("TABULA Period", "tabula_period"); add("U-Wall", "u_wall"); add("U-Window", "u_window");
  add("U-Roof", "u_roof"); add("Latitude", "lat"); add("Longitude", "lon"); add("Has EPC", "has_epc");
  add("Boplats #", "boplats_listings"); add("Rent/m² (SEK)", "boplats_avg_rent_per_m2_sek");
  add("Avg Rent (SEK)", "boplats_avg_rent_sek");
  (["address", "cadastral_id", "building_use", "year_built", "height_m", "floors", "footprint_m2",
    "energy_kwh_m2", "epc_class", "tabula_period", "u_wall", "u_window", "u_roof", "lat", "lon",
    "has_epc", "atemp", "boplats_listings", "boplats_avg_rent_sek", "boplats_avg_rent_per_m2_sek",
  ] as (keyof BuildingRecord)[]).forEach(k => { m[_normKey(k)] = k; });
  return m;
})();

/* Same idea for a SINGLE building — the single-building lookup uses different
   field names than the bbox record (energy vs energy_kwh_m2, tabula_u_wall vs
   u_wall, …), so an import file / paste maps its columns to these keys. */
const SINGLE_IMPORT_MAP: Record<string, keyof BuildingLookup> = (() => {
  const m: Record<string, keyof BuildingLookup> = {};
  const add = (label: string, field: keyof BuildingLookup) => { m[_normKey(label)] = field; };
  add("Address", "address");
  add("Use", "use_cat"); add("building_use", "use_cat"); add("use_cat", "use_cat");
  add("Year", "year"); add("Year built", "year"); add("year_built", "year");
  add("Floors", "floors");
  add("Height (m)", "height"); add("height_m", "height"); add("height", "height");
  add("Footprint (m²)", "footprint_m2"); add("footprint_m2", "footprint_m2");
  add("Energy (kWh/m²)", "energy"); add("energy_kwh_m2", "energy"); add("Energy", "energy"); add("energy", "energy");
  add("Energy class", "eclass"); add("EPC", "eclass"); add("epc_class", "eclass"); add("eclass", "eclass");
  add("U-wall (W/m²K)", "tabula_u_wall"); add("U-Wall", "tabula_u_wall"); add("u_wall", "tabula_u_wall"); add("tabula_u_wall", "tabula_u_wall");
  add("U-win (W/m²K)", "tabula_u_win"); add("U-Window", "tabula_u_win"); add("u_window", "tabula_u_win"); add("tabula_u_win", "tabula_u_win");
  add("Latitude", "lat"); add("lat", "lat"); add("Longitude", "lon"); add("lon", "lon");
  return m;
})();
const SINGLE_NUMERIC = new Set<string>(["year", "floors", "height", "footprint_m2", "energy", "tabula_u_wall", "tabula_u_win", "lat", "lon"]);

/* Collapsible "how to format your import" guide — shown next to the CSV/JSON
   import controls so the user knows exactly what headers to use. The importer
   is forgiving (many header aliases, any subset of columns), so this shows the
   common shape rather than a rigid schema. */
function ImportFormatGuide() {
  const [open, setOpen] = useState(false);
  const cell = "font-mono text-[10px] text-emerald-300/90 bg-black/40 rounded p-2 overflow-x-auto whitespace-pre";
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10.5px] font-semibold text-violet-300 hover:text-violet-200 transition"
      >
        {open ? "▾" : "▸"} How should my CSV or JSON look?
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border border-white/10 bg-[#0d1117] p-2.5 text-[10.5px] text-white/60 space-y-2.5 leading-relaxed">
          <div>
            <b className="text-white/75">One row per building.</b> Include only the columns you actually have — any you leave
            out just stay as they are. Rows are matched to a building by its <b className="text-white/75">Address</b>; for a
            single building, the first row is used if no address matches. Values overwrite what&apos;s shown; a blank cell is ignored.
          </div>
          <div>
            <div className="text-white/45 font-semibold mb-1">Column headers it understands (use any subset):</div>
            <div className="font-mono text-[10px] text-white/70">
              Address · Use · Year · Floors · Height (m) · Footprint (m²) · Energy class · Energy (kWh/m²) · U-wall · U-window
            </div>
            <div className="text-white/35 mt-1">Header matching is flexible — <span className="font-mono">energy</span>, <span className="font-mono">energy_kwh_m2</span> and <span className="font-mono">Energy (kWh/m²)</span> all work.</div>
          </div>
          <div>
            <div className="text-white/45 font-semibold mb-1">CSV example</div>
            <div className={cell}>{`Address,Year,Energy (kWh/m²),U-wall,Floors
Storgatan 1,1965,142,0.45,4`}</div>
          </div>
          <div>
            <div className="text-white/45 font-semibold mb-1">JSON example (one object, or an array of them)</div>
            <div className={cell}>{`{ "year": 1965, "energy": 142, "tabula_u_wall": 0.45, "floors": 4 }`}</div>
          </div>
          <div className="text-white/40">
            <b className="text-white/60">Excel?</b> Use <b className="text-white/60">File → Save As → CSV (.csv)</b>, then import that file — spreadsheets (.xlsx) can&apos;t be read directly in the browser.
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas, "" escapes).
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], val = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false; }
      else val += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(val); val = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(val); rows.push(cur); cur = []; val = ""; }
    else val += c;
  }
  if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ""));
  if (nonEmpty.length < 2) return [];
  const header = nonEmpty[0];
  return nonEmpty.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// Turn uploaded records into {matchKey -> {field: value}} + the set of fields seen.
function normalizeImport(records: Record<string, unknown>[]): {
  byKey: Map<string, Record<string, unknown>>; fields: Set<string>;
} {
  const byKey = new Map<string, Record<string, unknown>>();
  const fields = new Set<string>();
  for (const rec of records) {
    const mapped: Record<string, unknown> = {};
    let key: string | null = null;
    for (const [rawCol, rawVal] of Object.entries(rec)) {
      const field = IMPORT_FIELD_MAP[_normKey(rawCol)];
      if (!field) continue;
      let v: unknown = typeof rawVal === "string" ? rawVal.trim() : rawVal;
      if (v === "" || v === null || v === undefined) continue;
      if (NUMERIC_FIELDS.has(field)) { const n = Number(v); if (Number.isNaN(n)) continue; v = n; }
      mapped[field] = v;
      fields.add(field);
      if ((field === "address" || field === "cadastral_id") && !key) key = _normKey(String(v));
    }
    if (key && Object.keys(mapped).length) byKey.set(key, { ...(byKey.get(key) || {}), ...mapped });
  }
  return { byKey, fields };
}

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
  const [importMsg, setImportMsg]     = useState<string | null>(null);
  const [fillMissingOnly, setFillMissingOnly] = useState(false);
  const [addOpen, setAddOpen]         = useState(false);   // guided add-data panel
  const [showPaste, setShowPaste]     = useState(false);
  const [pasteText, setPasteText]     = useState("");
  const [editing, setEditing]         = useState(false);   // inline table cell editing
  const [editDraftRows, setEditDraftRows] = useState<BuildingRecord[] | null>(null);
  // Current heating system per building (from the Boverket EPC), keyed by address.
  const [heating, setHeating]         = useState<Record<string, { system: string } | null>>({});
  const PAGE_SIZE = 50;

  // Look up the current heating system for the loaded buildings (Gothenburg EPC).
  useEffect(() => {
    const addrs = Array.from(new Set(
      (rows ?? []).map(r => r.address).filter((a): a is string => !!a && !isCadastralId(a)),
    ));
    if (!addrs.length) { setHeating({}); return; }
    let alive = true;
    api.epcHeating(addrs).then(res => { if (alive) setHeating(res.results ?? {}); }).catch(() => { if (alive) setHeating({}); });
    return () => { alive = false; };
  }, [rows]);

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

  // Parse CSV/JSON TEXT (from a file OR pasted) and merge it onto the loaded
  // buildings — matched by Address (or Cadastral ID), overwriting existing values
  // or (fill-missing mode) only filling blanks. Flows downstream via onRowsChange.
  function applyImportText(text: string, sourceName: string) {
    try {
      const trimmed = text.trim();
      if (!trimmed) { setImportMsg("Nothing to apply — paste CSV/JSON or choose a file."); return; }
      let records: Record<string, unknown>[];
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const j = JSON.parse(text);
        if (Array.isArray(j)) records = j as Record<string, unknown>[];
        else if (j && typeof j === "object") records = Object.entries(j).map(([k, v]) => ({ address: k, ...(v as object) }));
        else records = [];
      } else {
        records = parseCSV(text);
      }
      if (!records.length) { setImportMsg("No rows found."); return; }
      const { byKey, fields } = normalizeImport(records);
      if (!byKey.size) { setImportMsg("No usable rows — need an Address (or Cadastral ID) column plus data columns (e.g. Energy, Year, U-Wall)."); return; }
      let matched = 0, changed = 0;
      setRows(prev => {
        if (!prev) return prev;
        return prev.map(r => {
          const keys = [_normKey(String(r.address ?? "")), _normKey(String(r.cadastral_id ?? ""))].filter(Boolean);
          const upd = keys.map(k => byKey.get(k)).find(Boolean);
          if (!upd) return r;
          matched++;
          const merged: Record<string, unknown> = { ...r };
          for (const [f, v] of Object.entries(upd)) {
            const ex = merged[f];
            const isMissing = ex === null || ex === undefined || ex === "" || ex === false;
            if (fillMissingOnly && !isMissing) continue;
            if (merged[f] !== v) { merged[f] = v; changed++; }
          }
          return merged as unknown as BuildingRecord;
        });
      });
      const dataFields = [...fields].filter(f => f !== "address" && f !== "cadastral_id");
      setImportMsg(matched === 0
        ? `⚠ ${sourceName}: matched 0 buildings — check that the Address / Cadastral ID values match the table.`
        : `✓ ${sourceName}: matched ${matched} building${matched === 1 ? "" : "s"}, ${changed} value${changed === 1 ? "" : "s"} ${fillMissingOnly ? "filled" : "updated"}${dataFields.length ? " (" + dataFields.join(", ") + ")" : ""}.`);
    } catch (e) {
      setImportMsg("Import failed: " + (e as Error).message);
    }
  }

  async function handleImportFile(file: File) {
    setImportMsg("Reading…");
    try { applyImportText(await file.text(), `"${file.name}"`); }
    catch (e) { setImportMsg("Import failed: " + (e as Error).message); }
  }

  function downloadTemplateCsv() {
    const header = "Address,Year,Energy (kWh/m²),U-Wall,Floors";
    const sample = "Herkulesgatan 38,1968,126,0.42,6";
    const blob = new Blob([`${header}\n${sample}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "building_data_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function startEditMode() {
    if (!rows) return;
    setEditDraftRows(rows.map((r) => ({ ...r })));
    setEditing(true);
    setAddOpen(false);
  }

  function cancelEditMode() {
    setEditing(false);
    setEditDraftRows(null);
  }

  function saveEditMode() {
    if (editDraftRows) setRows(editDraftRows);
    setEditing(false);
    setEditDraftRows(null);
    setImportMsg("✓ Table edits saved for this session.");
  }

  // Inline table editing: write one cell back into its row (numeric fields coerced,
  // empty → null). Same rows state → same downstream propagation as an import.
  function updateCell(globalIdx: number, field: keyof BuildingRecord, raw: string) {
    setEditDraftRows(prev => {
      if (!prev) return prev;
      const next = prev.slice();
      const r: Record<string, unknown> = { ...next[globalIdx] };
      if (raw.trim() === "") r[field] = null;
      else if (NUMERIC_FIELDS.has(field)) { const n = Number(raw); r[field] = Number.isNaN(n) ? raw : n; }
      else r[field] = raw;
      next[globalIdx] = r as unknown as BuildingRecord;
      return next;
    });
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
        const srcRows = editing ? (editDraftRows ?? rows) : rows;
        const withIdx = srcRows.map((r, idx) => ({ r, idx }));
        if (tableSort) withIdx.sort((a, b) => sortByCol(a.r, b.r, tableSort.key, tableSort.asc));
        return withIdx;
      })()
    : [];
  const pagedRows      = orderedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages     = rows ? Math.ceil(rows.length / PAGE_SIZE) : 0;
  const pageIdxs       = pagedRows.map(p => p.idx);
  const pageAllChecked = pageIdxs.length > 0 && pageIdxs.every(i => selected.has(i));
  const pagePartial    = !pageAllChecked && pageIdxs.some(i => selected.has(i));
  const allRowIdxs     = rows?.map((_, idx) => idx) ?? [];
  const allRowsChecked = allRowIdxs.length > 0 && allRowIdxs.every(i => selected.has(i));

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

  function selectAllRows() {
    if (!rows) return;
    setSelected(new Set(allRowIdxs));
  }

  function clearSelection() {
    setSelected(new Set());
    setCompareOpen(false);
  }

  // Build ranked compare list
  const cfg         = (COMPARE_COLS.find(c => c.key === sortCol) ?? COMPARE_COLS[0])!;
  const baseRowsForSelection = editing ? (editDraftRows ?? rows ?? []) : (rows ?? []);
  const selectedRows = baseRowsForSelection.length
    ? [...selected].map(i => ({ i, r: baseRowsForSelection[i] })).filter((x): x is { i: number; r: BuildingRecord } => x.r !== undefined)
    : [];
  const rankedRows   = [...selectedRows].sort((a, b) => sortByCol(a.r, b.r, sortCol, cfg.asc));

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 bg-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <div>
            <span className="text-sm font-bold text-white/85">{bboxStats.count.toLocaleString()} buildings</span>
            <span className="text-xs text-white/35 ml-2">Bounding box</span>
          </div>
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
          <button
            onClick={() => setAddOpen(o => !o)}
            title="Open guided add-data panel: template, upload, paste, and formatting help"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:bg-white/8 whitespace-nowrap transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Data
          </button>
          {!editing ? (
            <button
              onClick={startEditMode}
              disabled={!rows || loading}
              title="Edit the current table values and save them for this session"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white/60 hover:bg-white/8 disabled:opacity-40 whitespace-nowrap transition"
            >
              <Pencil className="w-3 h-3" /> Edit Table
            </button>
          ) : (
            <>
              <button
                onClick={saveEditMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-700/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-700/45 whitespace-nowrap transition"
              >
                Save changes
              </button>
              <button
                onClick={cancelEditMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:bg-white/8 whitespace-nowrap transition"
              >
                Cancel
              </button>
            </>
          )}
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

      {importMsg && (
        <div className="px-4 py-2 border-t border-white/8 text-[11px]">
          <span className={`${importMsg.startsWith("✓") ? "text-emerald-400" : importMsg.startsWith("⚠") ? "text-amber-400" : importMsg.startsWith("Import failed") ? "text-red-400" : "text-white/40"}`}>
            {importMsg}
          </span>
        </div>
      )}

      {/* Guided add-data modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/12 bg-[#0d1117] shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <div className="text-sm font-semibold text-white/90">Add Data</div>
                <div className="text-[11px] text-white/45">Import CSV/JSON with a clear guided flow</div>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                className="px-2 py-1 rounded text-white/45 hover:text-white/80 hover:bg-white/10 transition"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="text-[10px] text-white/40 bg-violet-950/20 border border-violet-800/30 rounded-md px-2.5 py-1.5 leading-relaxed">
                <b className="text-violet-300">Where do my edits go?</b> Changes are kept in <b className="text-white/60">your browser session</b> and
                become the numbers Steps 3–4 (simulation &amp; results) use. They are <b className="text-white/60">not written back</b> to the
                cadastral / EUBUCCO / EPC source data, and don&apos;t affect other users. Closing the tab clears them.
              </div>

              <div className="text-[11px] text-white/65">
                1. Download a template or open the format guide.
                2. Import your CSV/JSON file.
                3. Use Edit Table outside this dialog if you prefer direct cell editing.
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={downloadTemplateCsv}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-white/8 text-white/75 hover:bg-white/12 transition"
                >
                  Download CSV template
                </button>
                <label
                  title="Upload your own CSV or JSON to overwrite or fill missing data — matched by Address or Cadastral ID"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-violet-200 bg-violet-600/20 ring-1 ring-violet-500/60 hover:bg-violet-600/35 hover:text-white whitespace-nowrap transition cursor-pointer"
                >
                  <Upload className="w-3 h-3" /> Drop / choose file
                  <input
                    type="file" accept=".csv,.json,text/csv,application/json"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ""; }}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setShowPaste(v => !v)}
                  className="text-[11px] font-medium text-violet-300 hover:text-violet-200 transition"
                >
                  {showPaste ? "Hide manual paste" : "Paste data manually"}
                </button>
                <ImportFormatGuide />
              </div>

              {showPaste && (
                <>
                  <div className="text-[10px] text-white/35">Paste CSV / JSON (same columns as Export; rows matched by Address / Cadastral ID):</div>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={'Address,Energy (kWh/m²),U-Wall\nHerkulesgatan 38,90,0.30\n\n— or —\n[{"address":"Herkulesgatan 38","energy_kwh_m2":90,"u_wall":0.30}]'}
                    rows={6}
                    className="w-full rounded-md bg-[#0d1117] border border-white/12 px-3 py-2 text-[11px] text-white/80 font-mono resize-y focus:outline-none focus:border-violet-500/60"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => applyImportText(pasteText, "pasted data")}
                      disabled={!pasteText.trim()}
                      className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-40 transition"
                    >Apply pasted data</button>
                    <button onClick={() => setPasteText("")} className="px-3 py-1.5 rounded-md text-[11px] text-white/45 hover:bg-white/8 transition">Clear</button>
                  </div>
                </>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setAddOpen(false)}
                  className="px-3 py-1.5 rounded-md text-[11px] font-medium text-white/60 hover:bg-white/8 transition"
                >
                  Done
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={selectAllRows}
                disabled={!rows || allRowsChecked}
                className="px-3 py-1.5 rounded-md border border-white/10 text-[11px] font-medium text-white/70 hover:bg-white/8 disabled:opacity-35 disabled:hover:bg-transparent transition"
                title="Select every building in the table"
              >
                Select all
              </button>
              <button
                onClick={clearSelection}
                disabled={selected.size === 0}
                className="px-3 py-1.5 rounded-md border border-white/10 text-[11px] font-medium text-white/70 hover:bg-white/8 disabled:opacity-35 disabled:hover:bg-transparent transition"
                title="Clear the current selection"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-2 px-4 pt-2 pb-1 text-[10px] text-white/40">
            <span className="text-white/45">↕ Tip: click a column header to sort — click again to flip high ↔ low.</span>
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
                          title="Sort by this column (click again to flip high ↔ low)"
                          className={`px-2 py-1 text-left font-semibold border-b border-white/10 whitespace-nowrap cursor-pointer select-none transition-colors hover:bg-white/10 hover:text-white ${active ? "text-white" : "text-white/60"}`}>
                        {c.label}
                        <span className="ml-1 text-[9px]" style={{ opacity: active ? 1 : 0.55 }}>
                          {active ? (tableSort!.asc ? "▲" : "▼") : "↕"}
                        </span>
                      </th>
                    );
                  })}
                  {FUTURE_META_COLS.map(col => (
                    <th
                      key={col.key}
                      className="px-2 py-1 text-left font-semibold border-b border-white/10 whitespace-nowrap text-white/60"
                      title={col.title}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-amber-300">
                          {col.badge}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-1 text-left font-semibold border-b border-white/10 whitespace-nowrap text-white/60" title="Current heating system, inferred from the Boverket EPC (energideklaration)">
                    Current heating
                  </th>
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
                          <td key={c.key}
                              className={`px-2 py-1 ${editing ? "" : cell} whitespace-nowrap`}
                              onClick={editing ? (e => e.stopPropagation()) : undefined}>
                            {editing ? (
                              <input
                                value={present ? String(val) : ""}
                                onChange={e => updateCell(globalIdx, c.key, e.target.value)}
                                className="w-full min-w-[64px] bg-[#0d1117] border border-white/12 rounded px-1 py-0.5 text-[10px] text-white/85 focus:outline-none focus:border-violet-500/60"
                              />
                            ) : display}
                          </td>
                        );
                      })}
                      {FUTURE_META_COLS.map(col => (
                        <td
                          key={col.key}
                          className={`px-2 py-1 whitespace-nowrap ${isSelected ? "" : "bg-white/[0.02] text-white/25"}`}
                          title={col.title}
                          onClick={editing ? (e => e.stopPropagation()) : undefined}
                        >
                          —
                        </td>
                      ))}
                      {(() => {
                        const h = r.address ? heating[r.address] : null;
                        const sys = h?.system ?? null;
                        return (
                          <td className={`px-2 py-1 whitespace-nowrap ${isSelected ? "" : sys ? "bg-sky-900/15 text-sky-300" : "bg-white/[0.02] text-white/25"}`}
                              onClick={editing ? (e => e.stopPropagation()) : undefined}>
                            {sys ?? "—"}
                          </td>
                        );
                      })()}
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
          {/* Selection actions — shown after table rows. */}
          {selected.size > 0 && (
            <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-white/10 text-[10px]">
              <span className="text-white/40">{selected.size} selected</span>
              <button
                onClick={clearSelection}
                className="text-gray-400 hover:text-red-500 transition"
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
  const setProject      = useWizardStore(s => s.setProject);
  const storeBuildings  = useWizardStore(s => s.project.lookedUpBuildings);
  const [editing, setEditing] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Current heating system for this building (inferred from the Boverket EPC).
  const [heating, setHeating] = useState<{ system: string } | null>(null);

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
  // Numeric fields get coerced back to numbers on edit; the rest stay strings.
  const NUMERIC = new Set<string>(["year", "floors", "height", "footprint_m2", "energy", "tabula_u_wall", "tabula_u_win"]);

  const missingCritical = fields.filter(
    f => critical.has(f.key) && (building[f.key] === null || building[f.key] === undefined)
  );

  // Look up the current heating system for this address (skip cadastral-only IDs).
  useEffect(() => {
    const addr = building.address;
    if (!addr || isCadastralId(addr)) { setHeating(null); return; }
    let alive = true;
    api.epcHeating([addr])
      .then(res => { if (alive) setHeating(res.results?.[addr] ?? null); })
      .catch(() => { if (alive) setHeating(null); });
    return () => { alive = false; };
  }, [building.address]);

  // Write an edited field back into the store so Steps 3-4 (which read
  // lookedUpBuilding / lookedUpBuildings) pick up the override.
  const updateField = (key: keyof BuildingLookup, raw: string) => {
    let val: string | number | null = raw;
    if (raw.trim() === "") val = null;
    else if (NUMERIC.has(String(key))) { const n = Number(raw); if (Number.isFinite(n)) val = n; }
    const nextSingle = { ...building, [key]: val } as BuildingLookup;
    const list = (storeBuildings ?? []).slice();
    if (list.length) list[0] = { ...list[0], [key]: val };
    setProject({ lookedUpBuilding: nextSingle, lookedUpBuildings: list });
  };

  // Import the user's own data (CSV / JSON, file or pasted) onto THIS building.
  // Excel: save the sheet as .csv first. Columns map by the field labels above.
  const applySingleImport = (text: string, sourceName: string) => {
    try {
      const trimmed = text.trim();
      if (!trimmed) { setImportMsg("Nothing to apply — paste CSV/JSON or choose a file."); return; }
      let records: Record<string, unknown>[];
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const j = JSON.parse(text);
        records = Array.isArray(j) ? (j as Record<string, unknown>[]) : (j && typeof j === "object" ? [j as Record<string, unknown>] : []);
      } else {
        records = parseCSV(text);
      }
      if (!records.length) { setImportMsg("No rows found."); return; }
      // One building: prefer a row whose Address matches, else take the first row.
      const bKey = _normKey(String(building.address ?? ""));
      const pick = records.find(r => {
        const ra = _normKey(String((r as Record<string, unknown>).address ?? (r as Record<string, unknown>).Address ?? ""));
        return ra && ra === bKey;
      }) ?? records[0];
      const patch: Record<string, unknown> = {};
      let changed = 0;
      for (const [col, v] of Object.entries(pick)) {
        const field = SINGLE_IMPORT_MAP[_normKey(col)];
        if (!field || field === "address") continue;
        if (v === null || v === undefined || v === "") continue;
        let val: unknown = v;
        if (SINGLE_NUMERIC.has(field)) { const n = Number(v); if (Number.isFinite(n)) val = n; }
        patch[field] = val; changed++;
      }
      if (!changed) { setImportMsg("No usable columns — headers should match the field labels above (Year, Energy (kWh/m²), U-wall, Floors, …)."); return; }
      const nextSingle = { ...building, ...patch } as BuildingLookup;
      const list = (storeBuildings ?? []).slice();
      if (list.length) list[0] = { ...list[0], ...patch };
      setProject({ lookedUpBuilding: nextSingle, lookedUpBuildings: list });
      setImportMsg(`✓ ${sourceName}: applied ${changed} value${changed === 1 ? "" : "s"} to this building.`);
    } catch (e) {
      setImportMsg("Import failed: " + (e as Error).message);
    }
  };
  const handleSingleFile = async (file: File) => {
    setImportMsg("Reading…");
    try { applySingleImport(await file.text(), `"${file.name}"`); }
    catch (e) { setImportMsg("Import failed: " + (e as Error).message); }
  };

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
        <div className="flex items-center gap-2">
          {building.address && !isCadastralId(building.address) && <span className="text-[10px] text-purple-400/70 truncate max-w-[160px]">{formatAddress(building.address)}</span>}
          <button
            onClick={() => setEditing(e => !e)}
            title="Add or correct this building's data — overrides feed Steps 3-4 (stored for this session only, never written back to the source data)."
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition ring-1 ${editing
              ? "bg-violet-600/30 text-violet-200 ring-violet-500/60"
              : "bg-white/5 text-white/70 ring-white/15 hover:bg-white/10 hover:text-white"}`}>
            <Plus className="w-3.5 h-3.5" /> {editing ? "Done" : "Add / Edit"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mx-3 mt-3 -mb-1 space-y-2.5">
          <div className="rounded-lg bg-violet-900/20 border border-violet-700/30 px-3 py-2 text-[10.5px] text-violet-200/80">
            Editing overrides for <b className="text-violet-100">this session only</b> — they feed the simulation and prioritisation in Steps 3-4 and are never written back to the source datasets. Edit the fields below, or import your own file. Leave a field blank to clear it.
          </div>
          {/* Import the user's own data onto this one building */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <label
                title="Upload a CSV or JSON file to fill in this building's data. Excel: save the sheet as .csv first."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-violet-200 bg-violet-600/20 ring-1 ring-violet-500/60 hover:bg-violet-600/35 hover:text-white whitespace-nowrap transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Import CSV / JSON file
                <input
                  type="file" accept=".csv,.json,text/csv,application/json"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSingleFile(f); e.currentTarget.value = ""; }}
                />
              </label>
              <span className="text-[10px] text-white/35">Excel? Save it as <b className="text-white/55">.csv</b> first.</span>
            </div>
            <div className="text-[10px] text-white/35 mt-2">Or paste CSV / JSON — column headers should match the field labels below (Year, Energy (kWh/m²), U-wall, Floors, …):</div>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={'address,Year,Energy (kWh/m²),U-wall\nStorgatan 1,1965,142,0.45\n\n— or JSON —\n{ "year": 1965, "energy": 142, "tabula_u_wall": 0.45 }'}
              rows={4}
              className="w-full mt-1.5 bg-[#0d1117] border border-white/12 rounded-md px-2.5 py-2 text-[11px] text-white/85 font-mono placeholder:text-white/25 focus:outline-none focus:border-violet-500/60"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => applySingleImport(pasteText, "pasted data")}
                disabled={!pasteText.trim()}
                className="px-3 py-1 rounded-md text-[11px] font-semibold bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/60 hover:bg-violet-600/40 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >Apply pasted data</button>
              {importMsg && <span className="text-[10.5px]" style={{ color: importMsg.startsWith("✓") ? "#2FB477" : importMsg.startsWith("⚠") || importMsg.startsWith("Import failed") ? "#E2483B" : "rgba(255,255,255,0.5)" }}>{importMsg}</span>}
            </div>
            <ImportFormatGuide />
          </div>
        </div>
      )}

      {/* Fields grid — read-only chips, or editable inputs when Add / Edit is on */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-3">
        {fields.map(f => (
          editing ? (
            <EditableChip
              key={String(f.key)}
              label={f.label}
              value={building[f.key] as string | number | null}
              critical={critical.has(f.key)}
              onChange={v => updateField(f.key, v)}
            />
          ) : (
            <FieldChip
              key={String(f.key)}
              label={f.label}
              value={building[f.key] as string | number | null}
              critical={critical.has(f.key)}
            />
          )
        ))}
        {/* Current heating system — inferred from the EPC, read-only */}
        <div className={`flex flex-col px-2.5 py-2 rounded-lg border text-[11px] ${heating ? "bg-sky-900/25 border-sky-700/50 text-sky-300" : "bg-white/5 border-white/10 text-white/30"}`}>
          <span className="font-semibold leading-tight">{heating?.system ?? "—"}</span>
          <span className="text-[10px] opacity-70 mt-0.5">Current heating</span>
        </div>
      </div>

      {/* Missing critical data warning */}
      {missingCritical.length > 0 && !editing && (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-400">
          <span className="text-sm mt-0.5">⚠️</span>
          <span>
            <span className="font-semibold">Missing critical data for {projectType}:</span>{" "}
            {missingCritical.map(f => f.label).join(", ")}.
            {" "}Click <b>Add / Edit</b> above to fill these in, or check the starred (★) rows below for fallback options.
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

/* Editable variant of FieldChip — an inline input that writes back on change. */
function EditableChip({
  label, value, critical, onChange,
}: { label: string; value: string | number | null | undefined; critical: boolean; onChange: (v: string) => void }) {
  const hasVal = value !== null && value !== undefined;
  return (
    <div className={`flex flex-col px-2.5 py-2 rounded-lg border text-[11px] ${
      critical ? "bg-purple-900/20 border-purple-700/50" : "bg-white/5 border-white/12"}`}>
      <input
        value={hasVal ? String(value) : ""}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="w-full bg-[#0d1117] border border-white/12 rounded px-1 py-0.5 text-[11px] text-white/90 focus:outline-none focus:border-violet-500/60"
      />
      <span className="text-[10px] opacity-70 mt-1 text-white/50">{label}{critical && " ★"}</span>
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
  // Current heating system per building, inferred from the Boverket EPC.
  const [heating, setHeating] = useState<Record<string, { system: string } | null>>({});
  useEffect(() => {
    const addrs = Array.from(new Set(buildings.map(b => b.address).filter((a): a is string => !!a && !isCadastralId(a))));
    if (!addrs.length) { setHeating({}); return; }
    let alive = true;
    api.epcHeating(addrs).then(res => { if (alive) setHeating(res.results ?? {}); }).catch(() => { if (alive) setHeating({}); });
    return () => { alive = false; };
  }, [buildings]);

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
                {b.address && heating[b.address]?.system && (
                  <span className="text-sky-300">🔥 {heating[b.address]!.system}</span>
                )}
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

  // Step 2 should never inherit a disabled Continue button from Step 1.
  useEffect(() => {
    setWizardCanNext(true);
    setWizardNextError(null);
  }, []);

  // Façade defect detection is only shown when the walls are part of the
  // renovation scope picked in Step 1 (defects live on the wall surface). With
  // no components chosen yet, the default scope includes walls — mirrors Step 4.
  const scopeComponents = project.renovationEnvelopeComponents.length > 0
    ? project.renovationEnvelopeComponents
    : ["Walls", "Roof", "Windows"];
  const wallsInScope = scopeComponents.includes("Walls");


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

    // Re-run bbox rows/stats when bbox exists but stats are empty.
    // Use the list endpoint so counts match the table and downstream selection.
    if (bbox && !bboxStats && pts.length === 0) {
      (async () => {
        try {
          const rows = await api.buildingsBboxList(
            bbox.north,
            bbox.south,
            bbox.east,
            bbox.west,
            project.selectionPolygon ?? undefined,
          );
          setBboxRows(rows);
          setProject({ bboxRows: rows, bboxStats: deriveStats(rows) });
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
  const [bboxRows, setBboxRows]               = useState<BuildingRecord[]>(project.bboxRows ?? []);
  const [bboxSelectedIdx, setBboxSelectedIdx] = useState<Set<number>>(new Set());

  // Active rows: the buildings the user CHECKED (or all bbox rows if none are
  // checked yet). These are what coverage is computed on AND what flows to
  // Steps 3-4 - so the user simulates only the buildings they selected here.
  const activeCovRows = useMemo<BuildingRecord[]>(() => {
    if (!bboxRows.length) return [];
    if (bboxSelectedIdx.size > 0) return bboxRows.filter((_, i) => bboxSelectedIdx.has(i));
    return bboxRows;
  }, [bboxRows, bboxSelectedIdx]);

  // Persist the SELECTED buildings downstream (Steps 3-4 read project.bboxRows),
  // but don't transiently overwrite Step 1's carried rows with an empty list
  // while Step 2 is still fetching its table data.
  useEffect(() => {
    if (!bboxRows.length) return;
    setProject({ bboxRows: activeCovRows });
  }, [bboxRows, activeCovRows, setProject]);

  // Buildings in scope for the facade-defect panel: the selected coverage rows
  // (canonical carried-forward set), falling back to single/multi address lookups.
  const facadeBuildings = useMemo<FacadeBuilding[]>(() => {
    const rows = activeCovRows.length ? activeCovRows : bboxRows;
    const src: { address: string | null; cadastral_id?: string | null }[] =
      rows.length ? rows : buildings.map(b => ({ address: b.address }));
    const keys = makeBuildingKeys(src);
    return src.map((b, i) => {
      const nice = isCadastralId(b.address, b.cadastral_id) ? null : formatAddress(b.address);
      return { key: keys[i]!, label: nice || `Building ${i + 1}` };
    });
  }, [activeCovRows, bboxRows, buildings]);

  // Retrofit prioritization operates on the real building rows (bbox / neighborhood
  // selection), aligned 1:1 with facadeBuildings so façade summaries map by key.
  const priorityItems = useMemo<PriorityInput[]>(() => {
    const source = activeCovRows.length ? activeCovRows : bboxRows;
    return source.map((row, i) => ({
      row,
      key: facadeBuildings[i]?.key ?? `bldg-${i}`,
      label: facadeBuildings[i]?.label ?? `Building ${i + 1}`,
    }));
  }, [activeCovRows, bboxRows, facadeBuildings]);

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
          Review the available data, fill any gaps with <b className="text-violet-300">＋ Add / Edit</b> or your own CSV/JSON,
          and choose which buildings to include. Your edits stay in this session and do not change the source data.
          {wallsInScope
            ? " Upload façade photos to detect defects and rank buildings by energy performance, façade condition and upgrade potential."
            : " Buildings are ranked by energy performance and upgrade potential."}
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

      {/* Facade defect detection on user-uploaded facade photos.
          Only when the walls are in the renovation scope (Step 1); otherwise
          prioritisation runs on building performance alone. */}

      {/* Step 2 sequential accordion: Facade Detection → Renovation Prioritisation.
          Only one section is open at a time; each section auto-scrolls into view
          when it opens. The Facade section is shown only when Walls are in scope. */}
      {(() => {
        type Sec2 = "facade" | "priority";
        // Use module-level refs via a small wrapper so we keep a single shared
        // state without a separate sub-component.
        return <Step2Sections
          showFacade={wallsInScope && facadeBuildings.length > 0}
          facadeBuildings={facadeBuildings}
          priorityItems={priorityItems}
        />;
      })()}

    </div>
  );
}

/* ── Step2Sections ──────────────────────────────────────────────── */
function Step2Sections({
  showFacade, facadeBuildings, priorityItems,
}: {
  showFacade: boolean;
  facadeBuildings: FacadeBuilding[];
  priorityItems: PriorityInput[];
}) {
  // Strict single-open accordion: facade first (if walls in scope), then
  // prioritisation.
  const firstSection: "facade" | "priority" = showFacade ? "facade" : "priority";
  // Nullable: the sections used to rely on their inner panels for collapsing,
  // and those panels no longer have their own headers - so the section header
  // itself has to be able to close, not just open.
  const [openSec, setOpenSec] = useState<"facade" | "priority" | null>(firstSection);
  const prevOpen = useRef<string | null>(firstSection);
  const facadeRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to whatever section just opened.
  useEffect(() => {
    if (openSec === prevOpen.current) return;
    prevOpen.current = openSec;
    // Nothing to scroll to when a section was just collapsed.
    if (openSec === null) return;
    const el = openSec === "facade" ? facadeRef.current : priorityRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openSec]);

  // Section header used for both sections.
  function SectionHeader({
    id, label, subtitle, done,
  }: { id: "facade" | "priority"; label: string; subtitle: string; done?: boolean }) {
    const isOpen = openSec === id;
    return (
      <button
        type="button"
        onClick={() => setOpenSec(isOpen ? null : id)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", background: "transparent", border: 0, cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Number bubble */}
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isOpen ? "#4ECDC4" : done ? "rgba(47,180,119,0.25)" : "rgba(255,255,255,0.07)",
          border: `1.5px solid ${isOpen ? "#4ECDC4" : done ? "rgba(47,180,119,0.5)" : "rgba(255,255,255,0.12)"}`,
          fontSize: 11, fontWeight: 800, color: isOpen ? "#0b1220" : done ? "#2FB477" : "rgba(255,255,255,0.4)",
        }}>
          {done && !isOpen ? "✓" : id === "facade" ? "1" : showFacade ? "2" : "1"}
        </div>
        {/* Labels */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? "#fff" : "rgba(255,255,255,0.55)" }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{subtitle}</div>
        </div>
        {/* Chevron */}
        {isOpen
          ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" />
          : <ChevronDown size={14} color="rgba(255,255,255,0.2)" />}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ─ Facade Detection ─ */}
      {showFacade && (
        <div
          ref={facadeRef}
          style={{
            borderRadius: 14,
            border: `1px solid ${openSec === "facade" ? "rgba(78,205,196,0.35)" : "rgba(255,255,255,0.08)"}`,
            background: "rgba(255,255,255,0.02)",
            overflow: "hidden",
            transition: "border-color 0.18s",
          }}
        >
          <SectionHeader
            id="facade"
            label="Facade Defect Detection"
            subtitle="Upload photos per facade to detect surface defects"
          />
          {openSec === "facade" && (
            <div style={{ padding: "0 18px 18px" }}>
              <FacadeDefectPanel buildings={facadeBuildings} />
            </div>
          )}
        </div>
      )}

      {/* ─ Renovation Prioritisation ─ */}
      {priorityItems.length > 0 && (
        <div
          ref={priorityRef}
          style={{
            borderRadius: 14,
            border: `1px solid ${openSec === "priority" ? "rgba(78,205,196,0.35)" : "rgba(255,255,255,0.08)"}`,
            background: "rgba(255,255,255,0.02)",
            overflow: "hidden",
            transition: "border-color 0.18s",
          }}
        >
          <SectionHeader
            id="priority"
            label="Renovation Prioritisation"
            subtitle="Buildings ranked by energy performance and upgrade potential"
          />
          {openSec === "priority" && (
            <div style={{ padding: "0 18px 18px" }}>
              <RetrofitPriorityPanel items={priorityItems} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
