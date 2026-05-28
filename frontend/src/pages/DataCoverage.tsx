import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { api } from "../api/client";
import type { BuildingLookup, BboxStats, BuildingRecord } from "../types";
import {
  CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, MapPin, Layers, Database, Check, X,
  Building2, Globe2, Download,
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
          key: "r_epc",  label: "Baseline energy class (EPC)",
          primarySource: "Energy Performance Certificate (EPC)", primaryConfidence: "High",
          fallbackSource: "TABULA energy archetype by construction year & type", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: false,
        },
        {
          key: "r_edem", label: "Specific energy demand (kWh/m²·yr)",
          primarySource: "Energy Performance Certificate (EPC)", primaryConfidence: "High",
          fallbackSource: "Boverket average by building type & construction era", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
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
            fallbackSource: "Boverket & Wikells material library (provided — no action needed)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "None",
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
  r_edem:  "energy",         // EPC specific energy demand (kWh/m²·yr)
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

/** Check if a BuildingLookup field is truthy (handles boolean has_epc correctly) */
function bKeyPresent(building: BuildingLookup, bKey: BKey): boolean {
  const val = building[bKey];
  if (typeof val === "boolean") return val === true;
  return val !== null && val !== undefined;
}

// Build initial hasData state from EUBUCCO building (auto-fills available fields)
function initFromBuilding(
  defs: DataCategoryDef[],
  building: BuildingLookup | null,
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  defs.forEach(cat => cat.items.forEach(i => {
    const bKey = FIELD_MAP[i.key];
    const fromBuilding = bKey && building && bKeyPresent(building, bKey);
    init[i.key] = fromBuilding ? true : i.defaultHas;
  }));
  return init;
}

function initFromBuildings(
  defs: DataCategoryDef[],
  buildings: BuildingLookup[],
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  defs.forEach(cat => cat.items.forEach(i => {
    const bKey = FIELD_MAP[i.key];
    const fromAny = bKey && buildings.some(b => bKeyPresent(b, bKey));
    init[i.key] = fromAny ? true : i.defaultHas;
  }));
  return init;
}

/* Returns a formatted value string for a given building + EUBUCCO key, or null if absent */
function buildingFieldDisplay(b: BuildingLookup, bKey: BKey): string | null {
  const v = b[bKey];
  if (v === null || v === undefined) return null;
  if (bKey === "footprint_m2") return `${Math.round(v as number)} m²`;
  if (bKey === "height")       return `${(v as number).toFixed(1)} m`;
  if (bKey === "floors")       return `${v} floors`;
  if (bKey === "use_cat")      return String(v);
  if (bKey === "tabula_u_wall") return `U=${(v as number).toFixed(2)} W/m²K`;
  if (bKey === "tabula_u_win")  return `U-win=${(v as number).toFixed(2)} W/m²K`;
  if (bKey === "tabula_period") return `TABULA ${String(v)}`;
  if (bKey === "eclass")       return `Class ${v}`;
  if (bKey === "has_epc")      return v === true ? "EPC registered" : null as unknown as string;
  if (bKey === "year")         return String(v);
  if (bKey === "energy")       return `${Math.round(v as number)} kWh/m²·yr`;
  return String(v);
}
function buildingShortName(b: BuildingLookup, idx: number): string {
  if (b.address && !isCadastralId(b.address)) return formatAddress(b.address.split(",")[0] ?? b.address);
  return `Building ${idx + 1}`;
}

// Build initial hasData state from BboxStats (auto-fills fields covered by aggregate data)
// Bbox provides: footprint, height, floors, use_cat, energy, epc coverage
const BBOX_COVERED_BKEYS = new Set<BKey>(["footprint_m2", "height", "floors", "use_cat", "energy", "has_epc", "eclass", "tabula_period"]);
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
  footprint_m2:  { label: "footprint",        unit: "m²" },
  height:        { label: "height",           unit: "m" },
  floors:        { label: "floors" },
  use_cat:       { label: "use" },
  tabula_u_wall: { label: "U-wall",           unit: "W/m²K" },
  tabula_u_win:  { label: "U-win",            unit: "W/m²K" },
  tabula_period: { label: "TABULA archetype" },
  eclass:        { label: "energy class" },
  has_epc:       { label: "EPC" },
  energy:        { label: "energy use",       unit: "kWh/m²" },
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

function eubuccoSourceText(key: string, building: BuildingLookup | null): string | null {
  if (!building) return null;
  const bKey = FIELD_MAP[key] as BKey | undefined;
  if (!bKey) return null;
  // Boolean fields: only truthy value is meaningful
  if (typeof building[bKey] === "boolean") {
    if (!bKeyPresent(building, bKey)) return null;
    const meta = EUBUCCO_LABELS[bKey];
    return `EUBUCCO — ${meta?.label ?? String(bKey)}`;
  }
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
  const diff = colKey === "epc_class"
    ? (EPC_ORDER[String(av).toUpperCase()] ?? 99) - (EPC_ORDER[String(bv).toUpperCase()] ?? 99)
    : (Number(av) || 0) - (Number(bv) || 0);
  return asc ? diff : -diff;
}

function rankBgColor(rank: number, total: number): string {
  if (total <= 1) return "";
  const pos = rank / (total - 1);
  if (pos <= 0.15) return "bg-emerald-100";
  if (pos <= 0.40) return "bg-emerald-50";
  if (pos >= 0.85) return "bg-red-100";
  if (pos >= 0.60) return "bg-amber-50";
  return "";
}

function BboxDataBanner({
  bboxStats,
  bbox,
  onRowsChange,
  onSelectionChange,
}: {
  bboxStats: BboxStats;
  bbox: { north: number; south: number; east: number; west: number } | null;
  onRowsChange?: (rows: BuildingRecord[]) => void;
  onSelectionChange?: (selected: Set<number>) => void;
}) {
  const epcPct = Math.round((bboxStats.with_epc / bboxStats.count) * 100);
  const [loading, setLoading]         = useState(false);
  const [rows, setRows]               = useState<BuildingRecord[] | null>(null);
  const [viewOpen, setViewOpen]       = useState(false);
  const [page, setPage]               = useState(0);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [sortCol, setSortCol]         = useState<keyof BuildingRecord>("energy_kwh_m2");
  const PAGE_SIZE = 50;

  // Notify parent whenever rows or selection changes
  useEffect(() => { onRowsChange?.(rows ?? []); }, [rows, onRowsChange]);
  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);

  async function loadRows() {
    if (!bbox) return;
    setLoading(true);
    try {
      const data = await api.buildingsBboxList(bbox.north, bbox.south, bbox.east, bbox.west);
      setRows(data);
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

  const pagedRows      = rows ? rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  const totalPages     = rows ? Math.ceil(rows.length / PAGE_SIZE) : 0;
  const pageIdxs       = pagedRows.map((_, i) => page * PAGE_SIZE + i);
  const pageAllChecked = pageIdxs.length > 0 && pageIdxs.every(i => selected.has(i));
  const pagePartial    = !pageAllChecked && pageIdxs.some(i => selected.has(i));

  function togglePageAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (pageAllChecked) { pageIdxs.forEach(i => next.delete(i)); }
      else                { pageIdxs.forEach(i => next.add(i)); }
      return next;
    });
  }

  // Build ranked compare list
  const cfg         = COMPARE_COLS.find(c => c.key === sortCol) ?? COMPARE_COLS[0];
  const selectedRows = rows ? [...selected].map(i => ({ i, r: rows[i] })).filter(x => x.r) : [];
  const rankedRows   = [...selectedRows].sort((a, b) => sortByCol(a.r, b.r, sortCol, cfg.asc));

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <div>
            <span className="text-sm font-bold text-gray-900">{bboxStats.count.toLocaleString()} buildings</span>
            <span className="text-xs text-gray-400 ml-2">Bounding box · EUBUCCO</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-semibold border border-emerald-200 shrink-0">
            {epcPct}% EPC
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button
            onClick={handleView}
            disabled={loading || !bbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 whitespace-nowrap transition"
          >
            {loading ? "Loading…" : viewOpen ? <><ChevronUp className="w-3 h-3" /> Hide</> : "Buildings"}
          </button>
          <button
            onClick={rows ? handleDownload : handleLoadAndDownload}
            disabled={loading || !bbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 whitespace-nowrap transition"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <a
            href={`http://127.0.0.1:8765/gothenburg_3d.html?bbox=${bbox ? [bbox.north,bbox.south,bbox.east,bbox.west].join(',') : ''}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-violet-600 hover:bg-violet-50 whitespace-nowrap transition"
          >
            <Globe2 className="w-3 h-3" /> 3D view
          </a>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex flex-wrap divide-x divide-slate-100 border-t border-slate-100">
        {bboxStats.common_use && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Primary use</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{bboxStats.common_use}</div>
          </div>
        )}
        {bboxStats.avg_year && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg year built</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{bboxStats.avg_year}</div>
          </div>
        )}
        {bboxStats.avg_floors && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg floors</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{bboxStats.avg_floors}</div>
          </div>
        )}
        {bboxStats.avg_footprint && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg footprint</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{Math.round(bboxStats.avg_footprint)} m²</div>
          </div>
        )}
        {bboxStats.avg_height && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg height</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{bboxStats.avg_height} m</div>
          </div>
        )}
        {bboxStats.avg_energy && (
          <div className="px-4 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg energy use</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{bboxStats.avg_energy} kWh/m²</div>
          </div>
        )}
        <div className="px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Height data</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{Math.round(bboxStats.with_height/bboxStats.count*100)}% <span className="font-normal text-slate-400">({bboxStats.with_height}/{bboxStats.count})</span></div>
        </div>
        <div className="px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Floor data</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{Math.round(bboxStats.with_floors/bboxStats.count*100)}% <span className="font-normal text-slate-400">({bboxStats.with_floors}/{bboxStats.count})</span></div>
        </div>
      </div>

      {/* Inline table */}
      {viewOpen && rows && (
        <div className="border-t border-blue-100">
          {/* Legend + selection controls */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 pb-1 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" /> Data available</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200" /> Missing</span>
            {rows.some(r => r.boplats_listings) && (
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-200" /> Boplats data</span>
            )}
            <span className="ml-auto text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-blue-100/60">
                  {/* Select-all checkbox */}
                  <th className="px-2 py-1 border-b border-blue-200 w-6">
                    <input
                      type="checkbox"
                      checked={pageAllChecked}
                      ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = pagePartial; }}
                      onChange={togglePageAll}
                      className="w-3 h-3 cursor-pointer accent-violet-600"
                      title="Select / deselect all on this page"
                    />
                  </th>
                  {BBOX_CSV_COLS.map(c => (
                    <th key={c.key} className="px-2 py-1 text-left font-semibold text-blue-900 border-b border-blue-200 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, i) => {
                  const globalIdx  = page * PAGE_SIZE + i;
                  const isSelected = selected.has(globalIdx);
                  return (
                    <tr
                      key={i}
                      onClick={() => toggleRow(globalIdx)}
                      className={`cursor-pointer border-b border-blue-100/50 transition-colors ${
                        isSelected ? "bg-violet-50 hover:bg-violet-100/60" : "hover:bg-blue-50/60"
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
                            ? isBoplats ? "bg-amber-50 text-amber-900" : "bg-emerald-50/60 text-gray-800"
                            : "bg-red-50/40 text-gray-400";
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
            <div className="flex items-center justify-center gap-2 py-2 border-t border-blue-100 text-[11px]">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-0.5 rounded border border-blue-200 disabled:opacity-30 hover:bg-blue-100"
              >← Prev</button>
              <span className="text-gray-500">Page {page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2 py-0.5 rounded border border-blue-200 disabled:opacity-30 hover:bg-blue-100"
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
        <div className="border-t-2 border-violet-300 bg-white">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-200">
            <span className="text-xs font-bold text-violet-900">
              Comparing {selectedRows.length} buildings — ranked best to worst
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={saveSelectedCsv}
                className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 hover:text-violet-900"
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
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-violet-100 bg-violet-50/50">
            <span className="text-[10px] text-gray-500 mr-1">Sort by:</span>
            {COMPARE_COLS.map(c => (
              <button
                key={c.key}
                onClick={() => setSortCol(c.key)}
                title={c.betterLabel}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition ${
                  sortCol === c.key
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-white text-gray-600 border-gray-300 hover:border-violet-400 hover:text-violet-700"
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="ml-1 text-[10px] text-gray-400 italic">({cfg.betterLabel})</span>
          </div>

          {/* Ranked table */}
          <div className="overflow-x-auto px-4 py-3">
            <table className="w-full text-[11px] border-collapse rounded-lg overflow-hidden border border-violet-200">
              <thead>
                <tr className="bg-violet-100/70">
                  <th className="px-2 py-1.5 text-left font-semibold text-violet-900 border-b border-violet-200 whitespace-nowrap">Address</th>
                  {COMPARE_COLS.map(c => (
                    <th
                      key={c.key}
                      onClick={() => setSortCol(c.key)}
                      title={c.betterLabel}
                      className={`px-2 py-1.5 text-left font-semibold border-b border-violet-200 whitespace-nowrap cursor-pointer select-none transition ${
                        sortCol === c.key
                          ? "text-violet-700 bg-violet-200/60"
                          : "text-violet-800 hover:text-violet-600 hover:bg-violet-50"
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
                    <tr key={i} className={`border-b border-violet-100/60 ${rowBg}`}>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap max-w-[220px]" title={isCadastralId(r.address, r.cadastral_id) ? (r.cadastral_id ?? "—") : formatAddress(r.address)}>
                        <span className="mr-1.5 text-xs text-slate-400">{rank + 1}</span>
                        <span className="truncate">{isCadastralId(r.address, r.cadastral_id) ? "—" : formatAddress(r.address)}</span>
                      </td>
                      {COMPARE_COLS.map(c => {
                        const val      = r[c.key];
                        const present  = val !== null && val !== undefined;
                        const isActive = c.key === sortCol;
                        return (
                          <td
                            key={c.key}
                            className={`px-2 py-1.5 whitespace-nowrap ${isActive ? "font-semibold" : ""} ${!present ? "text-gray-400" : ""}`}
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
        {building.address && !isCadastralId(building.address) && <span className="text-[10px] text-purple-700 truncate max-w-[200px]">{formatAddress(building.address)}</span>}
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
    <div className="rounded-xl border border-purple-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-xs font-semibold text-purple-900">
            Data Available — {buildings.length} buildings
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-300">EUBUCCO</span>
          {withEpc > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">
              EPC ({withEpc}/{buildings.length})
            </span>
          )}
        </div>
        <span className="text-[10px] text-purple-600">{projectType}</span>
      </div>

      {/* Building list */}
      <div className="divide-y divide-slate-100">
        {shownBuildings.map((b, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2">
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">{isCadastralId(b.address) ? "EUBUCCO building" : (formatAddress(b.address) ?? "EUBUCCO building")}</div>
              <div className="flex flex-wrap gap-x-3 mt-0.5 text-[10px] text-slate-500">
                {b.use_cat    && <span>{b.use_cat}</span>}
                {b.year       && <span>Built {b.year}</span>}
                {b.floors     && <span>{b.floors} floors</span>}
                {b.eclass     && <span>Class {b.eclass}</span>}
                {b.tabula_u_wall && <span>U-wall {b.tabula_u_wall} W/m²K</span>}
              </div>
            </div>
            {b.has_epc && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200 mt-0.5 flex-shrink-0">EPC</span>
            )}
          </div>
        ))}
      </div>

      {buildings.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-[11px] font-medium text-purple-700 hover:text-purple-900 py-2 border-t border-purple-100 hover:bg-purple-50/50 transition-colors"
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
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();
  const building   = project.lookedUpBuilding ?? null;
  const buildings  = project.lookedUpBuildings ?? [];
  const bboxStats  = project.bboxStats ?? null;
  const savedWWR   = project.savedWWR ?? null;
  const isMulti    = buildings.length > 1;

  const WWR_KEYS = ["ec_b_wwr", "ec_fpv_wwr", "re_fpv_wwr"];

  const defs = useMemo(
    () => buildDefs(project.projectType, project.systemsInScope, project.ecEnergyFocus ?? []),
    [project.projectType, project.systemsInScope, project.ecEnergyFocus],
  );

  // Bbox table rows + selection (lifted from BboxDataBanner)
  const [bboxRows, setBboxRows]               = useState<BuildingRecord[]>([]);
  const [bboxSelectedIdx, setBboxSelectedIdx] = useState<Set<number>>(new Set());

  // Persist bbox rows to wizard store so the report can access them
  useEffect(() => { setProject({ bboxRows }); }, [bboxRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active rows for coverage: selected ones if any, otherwise all bbox rows
  const activeCovRows = useMemo<BuildingRecord[]>(() => {
    if (!bboxRows.length) return [];
    if (bboxSelectedIdx.size > 0) return bboxRows.filter((_, i) => bboxSelectedIdx.has(i));
    return bboxRows;
  }, [bboxRows, bboxSelectedIdx]);

  // Per-parameter coverage from activeCovRows
  const coverageMap = useMemo<Record<string, { count: number; total: number } | null>>(() => {
    if (!activeCovRows.length) return {};
    const map: Record<string, { count: number; total: number } | null> = {};
    defs.forEach(cat => cat.items.forEach(item => {
      map[item.key] = coverageFor(item.key, activeCovRows);
    }));
    return map;
  }, [activeCovRows, defs]);

  /* Auto-promote hasData=true whenever the active bbox rows actually provide a value
     (e.g. EPC class/energy showing up once buildings are loaded or selected). */
  useEffect(() => {
    const entries = Object.entries(coverageMap);
    if (!entries.length) return;
    setHasData(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [k, info] of entries) {
        if (info && info.count > 0 && !next[k]) {
          next[k] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [coverageMap]);

  /* Per-item "user has this data" state — keyed by item.key */
  const [hasData, setHasData] = useState<Record<string, boolean>>(() => {
    const base = bboxStats       ? initFromBboxStats(defs, bboxStats)
               : isMulti        ? initFromBuildings(defs, buildings)
               :                  initFromBuilding(defs, building);
    if (savedWWR) WWR_KEYS.forEach(k => { base[k] = true; });
    return base;
  });

  /* Reset when project type / systems change OR when building/bbox lookup updates */
  useEffect(() => {
    const base = bboxStats       ? initFromBboxStats(defs, bboxStats)
               : isMulti        ? initFromBuildings(defs, buildings)
               :                  initFromBuilding(defs, building);
    if (savedWWR) WWR_KEYS.forEach(k => { base[k] = true; });
    setHasData(base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, building, bboxStats, buildings, savedWWR]);

  const toggleHas = (key: string) =>
    setHasData(prev => ({ ...prev, [key]: !prev[key] }));

  const [expandedBreakdownRows, setExpandedBreakdownRows] = useState<Set<string>>(new Set());
  const toggleBreakdown = (key: string) =>
    setExpandedBreakdownRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const [activeFilter, setActiveFilter] = useState<FilterId>("All");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(defs.map(c => c.category)),
  );
  useEffect(() => {
    setExpandedCats(new Set(defs.map(c => c.category)));
  }, [defs]);

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


  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Data Requirements</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review the inputs available for your project scope. Confirm which data you have direct access to — gaps are automatically filled from reference databases (TABULA, EPC, Boverket, PVGIS).
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

      {/* EUBUCCO bbox aggregate banner (bbox draw mode) */}
      {bboxStats && (
        <BboxDataBanner
          bboxStats={bboxStats}
          bbox={project.currentBbox ?? null}
          onRowsChange={setBboxRows}
          onSelectionChange={setBboxSelectedIdx}
        />
      )}

      {/* 🔗 Viewer selection — building highlighted in the 3D viewer */}
      {viewerSelection && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          <Globe2 className="w-4 h-4 text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <span className="font-semibold text-gray-800">{isCadastralId(viewerSelection.address) ? "No street address" : (formatAddress(viewerSelection.address) || "Unknown address")}</span>
            <span className="text-gray-300 mx-2">|</span>
            <span className="text-gray-500 space-x-3">
              {viewerSelection.use_cat && <span>{viewerSelection.use_cat}</span>}
              {viewerSelection.year    && <span>Built {viewerSelection.year}</span>}
              {viewerSelection.height  && <span>{viewerSelection.height} m</span>}
              {viewerSelection.floors  && <span>{viewerSelection.floors} fl</span>}
              {viewerSelection.energy  && <span>{viewerSelection.energy} kWh/m²</span>}
              {viewerSelection.eclass  && <span>EPC {viewerSelection.eclass}</span>}
            </span>
          </div>
          <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded shrink-0">3D Viewer</span>
          <button
            onClick={() => { setViewerSelection(null); try { localStorage.removeItem('ppg_selected_building'); } catch { /**/ } }}
            className="text-gray-300 hover:text-gray-500 shrink-0 text-sm leading-none ml-1"
            title="Dismiss"
          >×</button>
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
                  <div className="grid grid-cols-[36px_1fr_140px_180px_90px_110px_110px] gap-x-3 px-5 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Have?</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Parameter</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Source</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {activeCovRows.length > 0
                        ? bboxSelectedIdx.size > 0
                          ? `Coverage (${bboxSelectedIdx.size} sel.)`
                          : `Coverage (${activeCovRows.length})`
                        : "Coverage"}
                    </span>
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

                    /* Per-building availability (multi-address mode only) */
                    const rowBKey = isMulti ? FIELD_MAP[item.key] as BKey | undefined : undefined;
                    const haveBuildings = rowBKey
                      ? buildings.filter(b => b[rowBKey] !== null && b[rowBKey] !== undefined)
                      : [];
                    const missingBuildings = rowBKey
                      ? buildings.filter(b => b[rowBKey] === null || b[rowBKey] === undefined)
                      : [];
                    const isPartial = isMulti && rowBKey !== undefined
                      && haveBuildings.length > 0
                      && haveBuildings.length < buildings.length;
                    const isBreakdownOpen = expandedBreakdownRows.has(item.key);
                    const epcFields = ["energy","eclass","tabula_u_wall","tabula_u_win","floors","year"];

                    /* Coverage from active bbox rows */
                    const covInfo = coverageMap[item.key] ?? null;
                    const covStatus: Status | null = covInfo
                      ? statusFromCoverage(covInfo.count, covInfo.total)
                      : null;
                    const effectiveSc = covStatus ? STATUS_CFG[covStatus] : sc;

                    return (
                      <div key={item.key}>
                        {/* Main grid row */}
                        <div
                          className={`grid grid-cols-[36px_1fr_140px_180px_90px_110px_110px] gap-x-3 items-center px-5 py-3 transition-colors ${effectiveSc.rowAccent} ${
                            idx < visibleItems.length - 1 && !isBreakdownOpen ? "border-b border-slate-100" : ""
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
                            {def && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.key === "r_matlist" ? (
                                  item.hasData
                                    ? <span className="text-emerald-600 font-medium">✓ Your material list will be used</span>
                                    : <span className="text-amber-600 font-medium">No problem — Boverket &amp; Wikells material library will be used</span>
                                ) : item.hasData
                                  ? (() => {
                                      // WWR database hit
                                      if (savedWWR && WWR_KEYS.includes(item.key)) {
                                        const saved = new Date(savedWWR.saved_at).toLocaleDateString();
                                        return <span className="text-sky-600 font-medium">🏛 WWR database — avg {savedWWR.average_wwr}% · saved {saved}</span>;
                                      }
                                      const bbText = bboxSourceText(item.key, bboxStats);
                                      if (bbText && cat.category !== "Building Information") return <span className="text-blue-600 font-medium">🗃 {bbText}</span>;
                                      if (isMulti && rowBKey) {
                                        if (isPartial) return (
                                          <button
                                            onClick={() => toggleBreakdown(item.key)}
                                            className="text-amber-600 font-medium hover:text-amber-800 flex items-center gap-1"
                                          >
                                            ⚠ {haveBuildings.length}/{buildings.length} buildings have this data
                                            <span className="text-[9px]">{isBreakdownOpen ? "▲" : "▼"}</span>
                                          </button>
                                        );
                                        if (haveBuildings.length === buildings.length) {
                                          const isEpc = buildings.some(b => b.has_epc) && epcFields.includes(FIELD_MAP[item.key] ?? "");
                                          return <span className="text-purple-600 font-medium">🗄 EUBUCCO{isEpc ? " + EPC" : ""} — all {buildings.length} buildings</span>;
                                        }
                                      }
                                      const eubuccoText = eubuccoSourceText(item.key, building);
                                      return eubuccoText
                                        ? <span className="text-purple-600 font-medium">🗄 {eubuccoText}</span>
                                        : <span>Your data: <span className="text-slate-500 font-medium">{def.primarySource}</span></span>;
                                    })()
                                  : (
                                    <span>
                                      Fallback: <span className="text-slate-500 font-medium">{def.fallbackSource}</span>
                                      {(item.key === "ec_b_wwr" || item.key === "ec_fpv_wwr" || item.key === "re_fpv_wwr") && (
                                        <>
                                          {" — "}
                                          <a
                                            href="http://127.0.0.1:8765/gothenburg_3d.html"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-purple-600 font-semibold hover:text-purple-800 underline underline-offset-2"
                                          >
                                            measure in Gothenburg 3D →
                                          </a>
                                        </>
                                      )}
                                    </span>
                                  )
                                }
                              </div>
                            )}
                          </div>

                          {/* Status pill */}
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold w-fit ${effectiveSc.pillBg} ${effectiveSc.pillBorder} ${effectiveSc.pillText}`}>
                            {effectiveSc.icon}
                            {covStatus ?? item.status}
                          </span>

                          {/* Source (short) */}
                          <span className="text-xs text-slate-500 leading-tight">
                            {item.hasData
                              ? (() => {
                                  if (item.key === "r_matlist") return <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">User</span>;
                                  if (savedWWR && WWR_KEYS.includes(item.key))
                                    return <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold border border-sky-200">WWR DB</span>;
                                  if (bboxSourceText(item.key, bboxStats) && cat.category !== "Building Information")
                                    return <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold border border-blue-200">EUBUCCO</span>;
                                  if (isMulti && rowBKey) {
                                    if (isPartial) return (
                                      <button
                                        onClick={() => toggleBreakdown(item.key)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold border border-amber-200 hover:bg-amber-200 transition-colors"
                                      >
                                        {haveBuildings.length}/{buildings.length}
                                        <span>{isBreakdownOpen ? "▲" : "▼"}</span>
                                      </button>
                                    );
                                    if (haveBuildings.length === buildings.length) {
                                      const isEpc = buildings.some(b => b.has_epc) && epcFields.includes(FIELD_MAP[item.key] ?? "");
                                      return isEpc
                                        ? <><span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span><span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC</span></>
                                        : <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span>;
                                    }
                                    if (def?.primarySource?.toLowerCase().includes("cesium"))
                                      return <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold border border-sky-200">Cesium</span>;
                                    return <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">User</span>;
                                  }
                                  if (def?.primarySource?.toLowerCase().includes("cesium"))
                                    return <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold border border-sky-200">Cesium</span>;
                                  const eubText = eubuccoSourceText(item.key, building);
                                  if (eubText) {
                                    const isEpc = building?.has_epc && epcFields.includes(FIELD_MAP[item.key] ?? "");
                                    return isEpc
                                      ? <><span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span><span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC</span></>
                                      : <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">EUBUCCO</span>;
                                  }
                                  return <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">User</span>;
                                })()
                              : (() => {
                                  if (item.key === "r_matlist") return <><span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold border border-orange-200">Boverket</span><span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">Wikells</span></>;
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

                          {/* Coverage cell */}
                          <div className="flex flex-col gap-0.5">
                            {covInfo ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <div className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                    <div
                                      className={`h-full rounded-full ${
                                        covStatus === "Available" ? "bg-emerald-500"
                                        : covStatus === "Estimated" ? "bg-amber-400"
                                        : "bg-red-400"
                                      }`}
                                      style={{ width: `${Math.round((covInfo.count / covInfo.total) * 100)}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-bold ${
                                    covStatus === "Available" ? "text-emerald-700"
                                    : covStatus === "Estimated" ? "text-amber-700"
                                    : "text-red-600"
                                  }`}>
                                    {Math.round((covInfo.count / covInfo.total) * 100)}%
                                  </span>
                                </div>
                                <span className="text-[9px] text-slate-400">
                                  {covInfo.count}/{covInfo.total} bldgs
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>

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

                        {/* Per-building breakdown panel (partial coverage only) */}
                        {isBreakdownOpen && isPartial && rowBKey && (
                          <div className={`mx-5 mb-3 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden ${
                            idx < visibleItems.length - 1 ? "border-b border-slate-100" : ""
                          }`}>
                            <div className="px-4 py-2 bg-amber-100 border-b border-amber-200 flex items-center justify-between">
                              <span className="text-[11px] font-bold text-amber-800">
                                Per-building data availability — {item.label}
                              </span>
                              <span className="text-[10px] text-amber-600">
                                {haveBuildings.length} available · {missingBuildings.length} missing
                              </span>
                            </div>
                            <div className="divide-y divide-amber-100">
                              {buildings.map((b, bi) => {
                                const hasVal = b[rowBKey] !== null && b[rowBKey] !== undefined;
                                const displayVal = hasVal ? buildingFieldDisplay(b, rowBKey) : null;
                                return (
                                  <div key={bi} className="flex items-center gap-3 px-4 py-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                                      hasVal ? "bg-emerald-500 text-white" : "bg-red-100 text-red-500 border border-red-200"
                                    }`}>
                                      {hasVal ? "✓" : "✗"}
                                    </span>
                                    <span className="text-xs text-slate-700 flex-1 truncate">
                                      {buildingShortName(b, bi)}
                                    </span>
                                    {displayVal
                                      ? <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">{displayVal}</span>
                                      : <span className="text-[10px] text-slate-400 italic">not in EUBUCCO — fallback: {def?.fallbackSource ?? "estimated"}</span>
                                    }
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Separator */}
                        {idx < visibleItems.length - 1 && !isBreakdownOpen && (
                          <div className="border-b border-slate-100 mx-0" />
                        )}
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
