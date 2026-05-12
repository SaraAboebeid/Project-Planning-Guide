import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import type { BuildingLookup, BboxStats } from "../types";
import BuildingMapPanel from "../components/panels/BuildingMap";
import {
  CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, MapPin, Layers, Database, Check, X,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type Status     = "Available" | "Estimated" | "Missing";
type Confidence = "High" | "Medium" | "Low" | "—";
type Action     = "None" | "Review" | "User input";
type FilterId   = "All" | "Available" | "Estimated" | "Missing" | "Needs user input";

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
const STATUS_CFG: Record<Status, {
  icon: React.ReactNode;
  pillBg: string; pillBorder: string; pillText: string; rowAccent: string;
}> = {
  Available: {
    icon:       <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />,
    pillBg:     "bg-emerald-50",  pillBorder: "border-emerald-200", pillText: "text-emerald-700",
    rowAccent:  "hover:bg-emerald-50/40",
  },
  Estimated: {
    icon:       <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
    pillBg:     "bg-amber-50",    pillBorder: "border-amber-200",   pillText: "text-amber-700",
    rowAccent:  "hover:bg-amber-50/40",
  },
  Missing: {
    icon:       <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />,
    pillBg:     "bg-red-50",      pillBorder: "border-red-200",     pillText: "text-red-700",
    rowAccent:  "hover:bg-red-50/30",
  },
};

const CONFIDENCE_CFG: Record<Confidence, { bar: string; pct: number; text: string }> = {
  High:   { bar: "bg-emerald-500", pct: 90, text: "text-emerald-700" },
  Medium: { bar: "bg-amber-400",   pct: 55, text: "text-amber-700"   },
  Low:    { bar: "bg-red-400",     pct: 25, text: "text-red-600"     },
  "—":    { bar: "bg-slate-300",   pct: 0,  text: "text-slate-400"   },
};

const ACTION_CFG: Record<Action, { bg: string; border: string; text: string }> = {
  "None":       { bg: "bg-slate-50",  border: "border-slate-200", text: "text-slate-500" },
  "Review":     { bg: "bg-amber-50",  border: "border-amber-200", text: "text-amber-700" },
  "User input": { bg: "bg-red-50",    border: "border-red-200",   text: "text-red-700"   },
};

/* ─────────────────────────────────────────────
   Data definitions (all project types)
───────────────────────────────────────────── */
function buildDefs(projectType: string | null, systems: string[], ecEnergyFocus: string[]): DataCategoryDef[] {
  if (!projectType) return [];
  const sys = new Set(systems);

  /* ══ RENOVATION PLANNING ══ */
  if (projectType === "Renovation Planning") {
    const cats: DataCategoryDef[] = [];

    if (sys.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Information",
        items: [
          {
            key: "r_fp",   label: "Building footprint dimensions",
            primarySource: "EUBUCCO / EPC database", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate / Cadastral Data", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_hgt",  label: "Building height",
            primarySource: "EUBUCCO / urban dataset", primaryConfidence: "High",
            fallbackSource: "Urban datasets", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_flrs", label: "Number of floors",
            primarySource: "EUBUCCO / EPC database", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate / Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_use",  label: "Building use",
            primarySource: "EUBUCCO / EPC database", primaryConfidence: "High",
            fallbackSource: "Energy Performance Certificate", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
      cats.push({
        category: "Building Envelope",
        items: [
          {
            key: "r_mat",  label: "Existing construction materials",
            primarySource: "Design drawings / BIM model", primaryConfidence: "High",
            fallbackSource: "Archetype model", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_matlist", label: "List of materials to test",
            primarySource: "User-provided material list", primaryConfidence: "High",
            fallbackSource: "Curated material library (provided — no action needed)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "None",
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

    return cats;
  }

  /* ══ ENERGY COMMUNITY PLANNING ══ */
  if (projectType === "Energy Community Planning") {
    const cats: DataCategoryDef[] = [];

    if (sys.has("Buildings") && (ecEnergyFocus.includes("Heating") || ecEnergyFocus.includes("Cooling"))) {
      cats.push({
        category: "Buildings – Envelope & Thermal",
        items: [
          {
            key: "ec_b_fp",    label: "Building footprint dimensions (m²)",
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
            key: "ec_b_orient", label: "Building orientation",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery / GIS cadastral data", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
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
          {
            key: "ec_b_hvac",  label: "HVAC system type",
            primarySource: "Building energy declaration / inspection", primaryConfidence: "High",
            fallbackSource: "Boverket building stock statistics (dominant system by era & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_b_hcdem", label: "Heating / cooling demand – hourly profile",
            primarySource: "Smart meter / district heating metering data", primaryConfidence: "High",
            fallbackSource: "EPC national average heat demand by building type (Boverket)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
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
            key: "ec_be_edem", label: "Hourly electricity demand profile",
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
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_rpv_azimuth", label: "Building azimuth",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_rpv_demand", label: "Electricity demand – hourly profile",
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
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_fpv_demand", label: "Electricity demand – hourly profile",
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

 

    return cats;
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
            key: "re_rpv_tilt", label: "Roof tilt (°)",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_rpv_azimuth", label: "Building azimuth (°)",
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_rpv_demand", label: "Electricity demand – hourly profile",
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
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
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
            primarySource: "Design drawings / Digital model", primaryConfidence: "High",
            fallbackSource: "Street-level imagery ", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_fpv_demand", label: "Electricity demand – hourly profile",
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

    return cats;
  }

  return [];
}

/* ─────────────────────────────────────────────
   Building data → DataCoverage key mapping
   Keys here signal "we have EUBUCCO data for this parameter"
───────────────────────────────────────────── */
type BKey = keyof BuildingLookup;

// Which EUBUCCO field (non-null) proves a DataCoverage item is available
const FIELD_MAP: Record<string, BKey> = {
  // Renovation Planning
  r_fp:    "footprint_m2",
  r_hgt:   "height",
  r_flrs:  "floors",
  r_use:   "use_cat",
  r_mat:   "tabula_u_wall",   // if u_wall known → archetype/materials known
  // EC – Buildings
  ec_b_fp:    "footprint_m2",
  ec_b_hgt:   "height",
  ec_b_flrs:  "floors",
  ec_b_use:   "use_cat",
  ec_b_mat:   "tabula_u_wall",
  ec_b_hvac:  "eclass",       // eclass implies EPC → system info likely
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

// Keys that are starred as critical for each project type
const CRITICAL_KEYS: Record<string, Set<string>> = {
  "Renovation Planning":       new Set(["r_fp","r_hgt","r_flrs","r_use","r_mat","r_ht"]),
  "Energy Community Planning": new Set(["ec_b_fp","ec_b_hgt","ec_b_flrs","ec_b_use","ec_b_mat",
                                         "ec_b_hvac","ec_rpv_area","ec_fpv_area","ec_be_edem"]),
  "Renewable Energy Planning": new Set(["re_rpv_area","re_rpv_azimuth","re_rpv_demand",
                                         "re_fpv_area","re_fpv_wwr"]),
};

// Build initial hasData state from EUBUCCO building (auto-fills available fields)
function initFromBuilding(
  defs: DataCategoryDef[],
  building: BuildingLookup | null,
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  defs.forEach(cat => cat.items.forEach(i => {
    const bKey = FIELD_MAP[i.key];
    const fromBuilding = bKey && building && building[bKey] !== null && building[bKey] !== undefined;
    init[i.key] = fromBuilding ? true : i.defaultHas;
  }));
  return init;
}

// Build initial hasData state from BboxStats (auto-fills fields covered by aggregate data)
// Bbox provides: footprint, height, floors, use_cat — mark those as available
const BBOX_COVERED_BKEYS = new Set<BKey>(["footprint_m2", "height", "floors", "use_cat"]);
function initFromBboxStats(
  defs: DataCategoryDef[],
  _stats: BboxStats | null,
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  defs.forEach(cat => cat.items.forEach(i => {
    const bKey = FIELD_MAP[i.key] as BKey | undefined;
    init[i.key] = (bKey && BBOX_COVERED_BKEYS.has(bKey)) ? true : i.defaultHas;
  }));
  return init;
}

// Return a display string when a field is sourced from bbox aggregate data
function bboxSourceText(key: string, bboxStats: BboxStats | null): string | null {
  if (!bboxStats) return null;
  const bKey = FIELD_MAP[key] as BKey | undefined;
  if (!bKey || !BBOX_COVERED_BKEYS.has(bKey)) return null;
  const meta = EUBUCCO_LABELS[bKey];
  if (!meta) return `EUBUCCO aggregate — ${bboxStats.count} buildings`;
  return `EUBUCCO aggregate — ${bboxStats.count} buildings`;
}

// Format actual EUBUCCO value for display in source column
const EUBUCCO_LABELS: Partial<Record<BKey, { label: string; unit?: string }>> = {
  footprint_m2:  { label: "footprint",   unit: "m²" },
  height:        { label: "height",      unit: "m" },
  floors:        { label: "floors" },
  use_cat:       { label: "use" },
  tabula_u_wall: { label: "U-wall",      unit: "W/m²K" },
  tabula_u_win:  { label: "U-win",       unit: "W/m²K" },
  eclass:        { label: "energy class" },
  energy:        { label: "energy use",  unit: "kWh/m²" },
};

function eubuccoSourceText(key: string, building: BuildingLookup | null): string | null {
  if (!building) return null;
  const bKey = FIELD_MAP[key] as BKey | undefined;
  if (!bKey) return null;
  const val = building[bKey];
  if (val === null || val === undefined) return null;
  const meta = EUBUCCO_LABELS[bKey];
  if (!meta) return `EUBUCCO — ${val}`;
  const formatted = typeof val === "number" && !Number.isInteger(val)
    ? val.toFixed(2)
    : String(val);
  return `EUBUCCO — ${meta.label}: ${formatted}${meta.unit ? " " + meta.unit : ""}`;
}

/* ─────────────────────────────────────────────
   Bbox data summary banner (multi-building mode)
───────────────────────────────────────────── */
function BboxDataBanner({ bboxStats }: { bboxStats: BboxStats }) {
  const epcPct = Math.round((bboxStats.with_epc / bboxStats.count) * 100);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <span>🏙️</span>
          <span className="text-xs font-semibold text-blue-900">
            {bboxStats.count.toLocaleString()} buildings in bounding box — EUBUCCO aggregate data loaded
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">
            {epcPct}% have EPC
          </span>
        </div>
        <a
          href="http://127.0.0.1:8765/gothenburg_3d.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2 whitespace-nowrap"
        >
          📷 3D Inspector →
        </a>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 text-xs text-blue-800">
        {bboxStats.common_use  && <span>🏢 Most common: {bboxStats.common_use}</span>}
        {bboxStats.avg_year    && <span>📅 Avg built: {bboxStats.avg_year}</span>}
        {bboxStats.avg_floors  && <span>⬆ Avg {bboxStats.avg_floors} floors</span>}
        {bboxStats.avg_footprint && <span>📐 Avg footprint: {Math.round(bboxStats.avg_footprint)} m\u00b2</span>}
        {bboxStats.avg_height  && <span>📏 Avg height: {bboxStats.avg_height} m</span>}
        {bboxStats.avg_energy  && <span>🔥 Avg energy: {bboxStats.avg_energy} kWh/m\u00b2</span>}
        <span>📊 Height data: {bboxStats.with_height}/{bboxStats.count} ({Math.round(bboxStats.with_height/bboxStats.count*100)}%)</span>
        <span>📊 Floor data: {bboxStats.with_floors}/{bboxStats.count} ({Math.round(bboxStats.with_floors/bboxStats.count*100)}%)</span>
      </div>
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
    ? critical ? "bg-purple-50 border-purple-200 text-purple-900"
               : "bg-emerald-50 border-emerald-200 text-emerald-800"
    : critical ? "bg-red-50 border-red-200 text-red-700"
               : "bg-slate-50 border-slate-200 text-slate-500";
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
  const viewerUrl = `http://127.0.0.1:8765/gothenburg_3d.html?lat=${building.lat}&lon=${building.lon}&zoom=17`;

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
    <div className="rounded-xl border border-purple-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-xs font-semibold text-purple-900">Data Available</span>
          <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-300">EUBUCCO</span>
          {building.has_epc && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC</span>
          )}
        </div>
        {building.address && <span className="text-[10px] text-purple-700 truncate max-w-[200px]">{building.address}</span>}
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
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
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
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-700 hover:text-purple-900 underline underline-offset-2">
          📷 Open 3D Facade Inspector →
        </a>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export default function DataCoverage() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();
  const building   = project.lookedUpBuilding ?? null;
  const bboxStats  = project.bboxStats ?? null;

  const defs = useMemo(
    () => buildDefs(project.projectType, project.systemsInScope, project.ecEnergyFocus ?? []),
    [project.projectType, project.systemsInScope, project.ecEnergyFocus],
  );

  /* Per-item "user has this data" state — keyed by item.key */
  const [hasData, setHasData] = useState<Record<string, boolean>>(() =>
    bboxStats ? initFromBboxStats(defs, bboxStats) : initFromBuilding(defs, building),
  );

  /* Reset when project type / systems change OR when building/bbox lookup updates */
  useEffect(() => {
    setHasData(bboxStats ? initFromBboxStats(defs, bboxStats) : initFromBuilding(defs, building));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, building, bboxStats]);

  const toggleHas = (key: string) =>
    setHasData(prev => ({ ...prev, [key]: !prev[key] }));

  const [activeFilter, setActiveFilter] = useState<FilterId>("All");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(defs.map(c => c.category)),
  );
  useEffect(() => {
    setExpandedCats(new Set(defs.map(c => c.category)));
  }, [defs]);

  const toggleCat = (cat: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  /* Resolved items (respecting user toggles) */
  const resolved = useMemo(
    () => defs.map(cat => ({
      category: cat.category,
      items: cat.items.map(def => resolve(def, hasData[def.key] ?? def.defaultHas)),
    })),
    [defs, hasData],
  );

  const allItems       = resolved.flatMap(c => c.items);
  const availableCount = allItems.filter(i => i.status === "Available").length;
  const estimatedCount = allItems.filter(i => i.status === "Estimated").length;
  const missingCount   = allItems.filter(i => i.status === "Missing").length;
  const userInputCount = allItems.filter(i => i.action === "User input").length;
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

  const filteredItems = (items: DataItemResolved[]) => {
    if (activeFilter === "All") return items;
    if (activeFilter === "Needs user input") return items.filter(i => i.action === "User input");
    return items.filter(i => i.status === activeFilter);
  };

  const FILTERS: { id: FilterId; dot?: string; count: number }[] = [
    { id: "All",              count: totalCount      },
    { id: "Available",        dot: "bg-emerald-500", count: availableCount },
    { id: "Estimated",        dot: "bg-amber-400",   count: estimatedCount },
    { id: "Missing",          dot: "bg-red-500",     count: missingCount   },
    { id: "Needs user input", dot: "bg-red-300",     count: userInputCount },
  ];

  const criticalKeys = project.projectType ? (CRITICAL_KEYS[project.projectType] ?? new Set<string>()) : new Set<string>();

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Step 2 – Data Coverage</h2>
        <p className="text-sm text-slate-500 mt-1">
          For each parameter, indicate whether you have the data. If not, the system will
          use the best available reference database (TABULA, Boverket, EPC, PVGIS…) as a fallback.
        </p>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            <Layers className="w-3 h-3" /> {project.projectType}
          </span>
        )}
        {project.scale && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            <Database className="w-3 h-3" /> {project.scale} scale
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* 3D Building Map */}
      <BuildingMapPanel />

      {/* EUBUCCO building data banner (single building) */}
      {building && !bboxStats && (
        <BuildingDataBanner
          building={building}
          projectType={project.projectType}
        />
      )}

      {/* EUBUCCO bbox aggregate banner (multi-building) */}
      {bboxStats && <BboxDataBanner bboxStats={bboxStats} />}

      {/* Instruction callout */}
      {totalCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <span className="text-lg leading-none mt-0.5">💡</span>
          <span>
            Toggle <span className="font-semibold">I have this</span> on/off for each row.
            When toggled <span className="font-semibold">off</span>, the system automatically
            selects the best available fallback database and updates the status to
            <span className="font-semibold text-amber-700"> Estimated</span> or
            <span className="font-semibold text-red-700"> Missing</span>.
          </span>
        </div>
      )}

      {/* Coverage summary bar */}
      {totalCount > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Overall Data Coverage</span>
            <span className="text-xl font-bold text-navy">{confPct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(availableCount / totalCount) * 100}%` }} />
            <div className="h-full bg-amber-400  transition-all" style={{ width: `${(estimatedCount / totalCount) * 100}%` }} />
            <div className="h-full bg-red-400    transition-all" style={{ width: `${(missingCount   / totalCount) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { dot: "bg-emerald-500", label: "Available",   count: availableCount },
              { dot: "bg-amber-400",   label: "Estimated",   count: estimatedCount },
              { dot: "bg-red-400",     label: "Missing",     count: missingCount   },
              { dot: "bg-red-300",     label: "Needs input", count: userInputCount },
            ].map(({ dot, label, count }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {FILTERS.map(({ id, dot, count }) => (
          <button
            key={id}
            onClick={() => setActiveFilter(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === id
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
            {id}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
              activeFilter === id ? "bg-slate-100 text-slate-600" : "text-slate-400"
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Category cards */}
      <div className="space-y-4">
        {resolved.map(cat => {
          const visibleItems = filteredItems(cat.items);
          if (activeFilter !== "All" && visibleItems.length === 0) return null;
          const isExpanded = expandedCats.has(cat.category);

          const counts = {
            available: cat.items.filter(i => i.status === "Available").length,
            estimated: cat.items.filter(i => i.status === "Estimated").length,
            missing:   cat.items.filter(i => i.status === "Missing").length,
          };

          return (
            <div key={cat.category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

              {/* Category header */}
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-slate-800">{cat.category}</span>
                  <div className="flex items-center gap-1.5">
                    {counts.available > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{counts.available}
                      </span>
                    )}
                    {counts.estimated > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{counts.estimated}
                      </span>
                    )}
                    {counts.missing > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{counts.missing}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded
                  ? <ChevronUp   className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {/* Table */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Column headers */}
                  <div className="grid grid-cols-[36px_1fr_140px_180px_110px_130px] gap-x-3 px-5 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Have?</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Parameter</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Source</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Confidence</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Action Required</span>
                  </div>

                  {/* Rows */}
                  {visibleItems.map((item, idx) => {
                    const sc   = STATUS_CFG[item.status];
                    const conf = CONFIDENCE_CFG[item.confidence];
                    const act  = ACTION_CFG[item.action];
                    /* find the def to get the full source tooltip */
                    const def = defs.find(c => c.category === cat.category)
                      ?.items.find(d => d.key === item.key);

                    return (
                      <div
                        key={item.key}
                        className={`grid grid-cols-[36px_1fr_140px_180px_110px_130px] gap-x-3 items-center px-5 py-3 transition-colors ${sc.rowAccent} ${
                          idx < visibleItems.length - 1 ? "border-b border-slate-100" : ""
                        } ${!item.hasData ? "opacity-80" : ""}`}
                      >
                        {/* Toggle */}
                        <button
                          title={item.hasData ? "I have this data — click to mark as unavailable" : "I don't have this data — click to mark as available"}
                          onClick={() => toggleHas(item.key)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                            item.hasData
                              ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                              : "bg-white border-slate-300 text-slate-300 hover:border-slate-400"
                          }`}
                        >
                          {item.hasData
                            ? <Check className="w-3.5 h-3.5" />
                            : <X     className="w-3 h-3"   />}
                        </button>

                        {/* Parameter */}
                        <div>
                          <span className="text-sm text-slate-800 font-medium leading-tight">{item.label}</span>
                          {criticalKeys.has(item.key) && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">★ critical</span>
                          )}
                          {def && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.key === "r_matlist" ? (
                                item.hasData
                                  ? <span className="text-emerald-600 font-medium">✓ Your material list will be used</span>
                                  : <span className="text-amber-600 font-medium">No problem — we have a curated material library for you</span>
                              ) : item.hasData
                                ? (() => {
                                    const bbText = bboxSourceText(item.key, bboxStats);
                                    if (bbText) return <span className="text-blue-600 font-medium">🗃 {bbText}</span>;
                                    const eubuccoText = eubuccoSourceText(item.key, building);
                                    return eubuccoText
                                      ? <span className="text-purple-600 font-medium">🗄 {eubuccoText}</span>
                                      : <span>Your data: <span className="text-slate-500 font-medium">{def.primarySource}</span></span>;
                                  })()
                                : <span>Fallback: <span className="text-slate-500 font-medium">{def.fallbackSource}</span></span>
                              }
                            </div>
                          )}
                        </div>

                        {/* Status pill */}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold w-fit ${sc.pillBg} ${sc.pillBorder} ${sc.pillText}`}>
                          {sc.icon}
                          {item.status}
                        </span>

                        {/* Source (short) */}
                        <span className="text-xs text-slate-500 leading-tight">
                          {item.hasData
                            ? (() => {
                                if (bboxSourceText(item.key, bboxStats))
                                  return <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold border border-blue-200">EUBUCCO</span>;
                                const eubText = eubuccoSourceText(item.key, building);
                                if (eubText) {
                                  const isEpc = building?.has_epc && ["energy","eclass","tabula_u_wall","tabula_u_win","floors","year"].includes(FIELD_MAP[item.key] ?? "");
                                  return isEpc
                                    ? <><span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span><span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC</span></>
                                    : <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span>;
                                }
                                return <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">User</span>;
                              })()
                            : (() => {
                                const src = item.source.toLowerCase();
                                if (src.includes("tabula"))  return <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold border border-amber-200">TABULA</span>;
                                if (src.includes("boverket")) return <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold border border-orange-200">Boverket</span>;
                                if (src.includes("epc") || src.includes("energy performance")) return <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC</span>;
                                if (src.includes("pvgis")) return <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[9px] font-bold border border-yellow-200">PVGIS</span>;
                                if (src.includes("eubucco")) return <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span>;
                                if (src.includes("—") || src.includes("no ") || src.includes("must")) return <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold border border-red-200">Missing</span>;
                                return <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">Estimated</span>;
                              })()
                          }
                        </span>

                        {/* Confidence mini-bar */}
                        <div className="flex items-center gap-1.5">
                          {item.confidence !== "—" ? (
                            <>
                              <div className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                <div className={`h-full rounded-full ${conf.bar}`} style={{ width: `${conf.pct}%` }} />
                              </div>
                              <span className={`text-[11px] font-semibold ${conf.text}`}>{item.confidence}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* Action pill */}
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold w-fit ${act.bg} ${act.border} ${act.text}`}>
                          {item.action}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalCount === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400 text-sm">
          No data inputs configured for the selected project type and systems.
          <br />
          <span className="text-xs mt-1 block">Go back to Step 1 and select a project type.</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button
          onClick={() => navigate("/step/1")}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          &#x2190; Back
        </button>
        <button
          onClick={() => navigate("/step/3")}
          className="ppg-btn-primary px-6 py-2"
        >
          Continue &#x2192;
        </button>
      </div>
    </div>
  );
}
