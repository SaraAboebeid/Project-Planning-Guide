import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
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
function buildDefs(projectType: string | null, systems: string[]): DataCategoryDef[] {
  if (!projectType) return [];
  const sys = new Set(systems);

  /* ══ RENOVATION PLANNING ══ */
  if (projectType === "Renovation Planning") {
    const cats: DataCategoryDef[] = [
      {
        category: "Building Geometry",
        items: [
          {
            key: "r_fp",   label: "Building footprint",
            primarySource: "Architectural drawing", primaryConfidence: "High",
            fallbackSource: "Boverket building register (GIS footprint)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_hgt",  label: "Building height",
            primarySource: "Architectural drawing", primaryConfidence: "High",
            fallbackSource: "Lantmäteriet 3D building model", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_ori",  label: "Building orientation",
            primarySource: "Site plan / architectural drawing", primaryConfidence: "High",
            fallbackSource: "Derived from GIS coordinates (OpenStreetMap)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_flrs", label: "Number of floors",
            primarySource: "Architectural drawing / EPC", primaryConfidence: "High",
            fallbackSource: "Boverket building register", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_atemp",label: "Heated floor area (Atemp)",
            primarySource: "EPC certificate", primaryConfidence: "High",
            fallbackSource: "Boverket building register (gross area estimate)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: true,
          },
        ],
      },
      {
        category: "Energy Performance",
        items: [
          {
            key: "r_epc",  label: "Energy performance class (A–G)",
            primarySource: "EPC certificate", primaryConfidence: "High",
            fallbackSource: "National EPC distribution (Boverket statistics)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_dem",  label: "Annual energy demand (kWh/m²)",
            primarySource: "EPC certificate / utility bills", primaryConfidence: "High",
            fallbackSource: "TABULA archetype energy demand by construction year", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_hvac", label: "HVAC system type",
            primarySource: "Building permit / energy declaration", primaryConfidence: "High",
            fallbackSource: "Boverket building stock statistics (dominant system by era)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "r_hd",   label: "Heating / cooling demand split",
            primarySource: "EPC certificate", primaryConfidence: "High",
            fallbackSource: "TABULA archetype demand split by building type", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
        ],
      },
    ];

    if (sys.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Envelope",
        items: [
          {
            key: "r_mat",  label: "Construction materials / wall build-up",
            primarySource: "Architectural / structural drawing", primaryConfidence: "High",
            fallbackSource: "TABULA archetype (material by construction year & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_wwr",  label: "Window-to-wall ratio",
            primarySource: "Architectural drawing (facade elevation)", primaryConfidence: "High",
            fallbackSource: "TABULA archetype WWR by building type & era", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_uw",   label: "U-value – Walls",
            primarySource: "Building survey / thermography report", primaryConfidence: "High",
            fallbackSource: "— (no reliable DB fallback; must be measured or input)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "r_ur",   label: "U-value – Roof",
            primarySource: "Building survey / thermography report", primaryConfidence: "High",
            fallbackSource: "— (no reliable DB fallback; must be measured or input)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "r_uwin", label: "U-value – Windows",
            primarySource: "Building survey / product specification", primaryConfidence: "High",
            fallbackSource: "TABULA default window U-value by era (less reliable)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "r_uf",   label: "U-value – Floor / slab",
            primarySource: "Building survey / structural drawing", primaryConfidence: "High",
            fallbackSource: "— (no reliable DB fallback; must be measured or input)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "r_tb",   label: "Thermal bridges (linear ψ-values)",
            primarySource: "Detailed design calculation", primaryConfidence: "High",
            fallbackSource: "TABULA default psi-values (catalogue method EN ISO 14683)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    const sysItems: DataItemDef[] = [];
    if (sys.has("Heating System")) {
      sysItems.push(
        {
          key: "r_ht",   label: "Heating system type",
          primarySource: "Building energy declaration / boiler room inspection", primaryConfidence: "High",
          fallbackSource: "Boverket building stock statistics (dominant system by era & type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: true,
        },
        {
          key: "r_hage", label: "Heating system age & capacity (kW)",
          primarySource: "Boiler plate / service log / installation permit", primaryConfidence: "High",
          fallbackSource: "Boverket building stock statistics (age distribution by system type)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
          defaultHas: false,
        },
      );
    }
    if (sys.has("Cooling System")) {
      sysItems.push(
        {
          key: "r_ct",   label: "Cooling system type",
          primarySource: "Building energy declaration / inspection", primaryConfidence: "High",
          fallbackSource: "— (cooling rarely registered; user must confirm)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
          defaultHas: false,
        },
        {
          key: "r_cc",   label: "Cooling capacity (kW)",
          primarySource: "Equipment nameplate / commissioning report", primaryConfidence: "High",
          fallbackSource: "— (no DB fallback; must be measured or input)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
          defaultHas: false,
        },
      );
    }
    if (sys.has("Domestic Hot Water System (DHW)")) {
      sysItems.push(
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
      );
    }
    if (sysItems.length) cats.push({ category: "Installed Systems", items: sysItems });
    return cats;
  }

  /* ══ ENERGY COMMUNITY PLANNING ══ */
  if (projectType === "Energy Community Planning") {
    const cats: DataCategoryDef[] = [
      {
        category: "Building Stock",
        items: [
          {
            key: "ec_fp",   label: "Building footprints",
            primarySource: "GIS / municipal open data", primaryConfidence: "High",
            fallbackSource: "OpenStreetMap building footprints", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_hgt",  label: "Building heights",
            primarySource: "Lantmäteriet 3D city model / GIS", primaryConfidence: "High",
            fallbackSource: "Estimated from floor count × typical storey height", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_use",  label: "Building use category",
            primarySource: "Municipal planning register / tax records", primaryConfidence: "High",
            fallbackSource: "Boverket building register (use category by property type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_flrs", label: "Number of floors per building",
            primarySource: "Building register / EPC", primaryConfidence: "High",
            fallbackSource: "Boverket building register (floors by building type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_epc",  label: "Energy performance class (A–G) per building",
            primarySource: "National EPC register (Boverket)", primaryConfidence: "High",
            fallbackSource: "Statistical distribution of EPC classes by era & type (Boverket)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: true,
          },
        ],
      },
      {
        category: "Energy Demand",
        items: [
          {
            key: "ec_ed",  label: "Annual electricity consumption per building",
            primarySource: "Smart meter / utility billing data", primaryConfidence: "High",
            fallbackSource: "TABULA archetype electricity demand (kWh/m²·year by type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_hd",  label: "Annual heating demand per building",
            primarySource: "EPC / utility heat meter", primaryConfidence: "High",
            fallbackSource: "TABULA archetype heating demand by construction year & type", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "ec_ep",  label: "Hourly electricity load profile",
            primarySource: "Smart meter interval data (15-min or hourly)", primaryConfidence: "High",
            fallbackSource: "TABULA archetype hourly load profiles (synthetic)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_hp",  label: "Hourly heating load profile",
            primarySource: "District heat meter interval data", primaryConfidence: "High",
            fallbackSource: "TABULA archetype heating load profiles (degree-day normalised)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      },
    ];

    if (sys.has("Rooftop PV") || sys.has("Community PV") || sys.has("Facade PV (BIPV)")) {
      cats.push({
        category: "Case: PV Generation",
        items: [
          {
            key: "ec_pvc", label: "PV installed / planned capacity (kWp)",
            primarySource: "System design / installation permit", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined; no default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "ec_pva", label: "PV panel azimuth & tilt",
            primarySource: "Site plan / installation drawing", primaryConfidence: "High",
            fallbackSource: "PVGIS typical south-facing roof assumption (180° / 35°)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "ec_ghi", label: "Solar irradiance (GHI) time series",
            primarySource: "On-site pyranometer data", primaryConfidence: "High",
            fallbackSource: "PVGIS ERA5 reanalysis + satellite data (hourly, 2005–2020)", fallbackStatus: "Estimated", fallbackConfidence: "High", fallbackAction: "None",
            defaultHas: false,
          },
          {
            key: "ec_pvl", label: "System losses (soiling, wiring, inverter)",
            primarySource: "Commissioning report / measured performance ratio", primaryConfidence: "High",
            fallbackSource: "PVGIS default loss model (14% total losses)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
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
            key: "ec_bc",  label: "Battery capacity (kWh)",
            primarySource: "System specs / purchase contract", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined; no default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "ec_bp",  label: "Max charge / discharge power (kW)",
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
            key: "ec_evc", label: "EV charger rated power (kW)",
            primarySource: "Charger nameplate / installation spec", primaryConfidence: "High",
            fallbackSource: "— (rated power must be specified)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      });
    }

    cats.push({
      category: "Grid & Tariffs",
      items: [
        {
          key: "ec_gt",  label: "Grid import / export tariff structure",
          primarySource: "Utility contract / tariff schedule", primaryConfidence: "High",
          fallbackSource: "Typical Swedish utility tariff structure (Energimarknadsinspektionen)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: true,
        },
        {
          key: "ec_gef", label: "Grid emission factor (gCO₂/kWh)",
          primarySource: "Utility declaration / AIB certificate", primaryConfidence: "High",
          fallbackSource: "Swedish Energy Agency marginal emission factor (2023)", fallbackStatus: "Estimated", fallbackConfidence: "High", fallbackAction: "None",
          defaultHas: false,
        },
        {
          key: "ec_tou", label: "Hourly spot price profile",
          primarySource: "Nordpool day-ahead prices (downloaded)", primaryConfidence: "High",
          fallbackSource: "Nordpool historical SE3 spot prices (annual average profile)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: false,
        },
      ],
    });

    return cats;
  }

  /* ══ RENEWABLE ENERGY PLANNING ══ */
  if (projectType === "Renewable Energy Planning") {
    const cats: DataCategoryDef[] = [
      {
        category: "Site & Climate",
        items: [
          {
            key: "re_ghi",  label: "Solar irradiance (GHI) time series",
            primarySource: "On-site pyranometer data", primaryConfidence: "High",
            fallbackSource: "PVGIS ERA5 reanalysis + satellite (hourly, 2005–2020)", fallbackStatus: "Estimated", fallbackConfidence: "High", fallbackAction: "None",
            defaultHas: false,
          },
          {
            key: "re_temp", label: "Ambient temperature profile",
            primarySource: "On-site weather station data", primaryConfidence: "High",
            fallbackSource: "PVGIS / SMHI climate data for nearest station", fallbackStatus: "Estimated", fallbackConfidence: "High", fallbackAction: "None",
            defaultHas: false,
          },
          {
            key: "re_wind", label: "Wind speed time series",
            primarySource: "On-site anemometer data (hub height)", primaryConfidence: "High",
            fallbackSource: "ERA5 reanalysis wind at 100m (SMHI / Copernicus)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_shad", label: "Shading analysis / horizon profile",
            primarySource: "Site survey / LiDAR scan / 3D model", primaryConfidence: "High",
            fallbackSource: "— (shading cannot be estimated without site data)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
        ],
      },
      {
        category: "Electricity Demand",
        items: [
          {
            key: "re_fp",  label: "Building / site footprint",
            primarySource: "Site plan / GIS data", primaryConfidence: "High",
            fallbackSource: "OpenStreetMap / Lantmäteriet building footprints", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "re_use", label: "Building use / occupancy category",
            primarySource: "Planning permission / energy declaration", primaryConfidence: "High",
            fallbackSource: "Boverket building register (use by property type)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "re_elp", label: "Hourly electricity demand profile",
            primarySource: "Smart meter interval data (hourly or 15-min)", primaryConfidence: "High",
            fallbackSource: "TABULA archetype hourly load profiles by use type", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      },
    ];

    if (sys.has("Rooftop PV") || sys.has("Community PV") || sys.has("Facade PV (BIPV)")) {
      cats.push({
        category: "Case: PV Generation",
        items: [
          {
            key: "re_pvc", label: "Planned PV capacity (kWp)",
            primarySource: "System design / layout drawing", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined; no default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_pvm", label: "Module specs (Pmax, efficiency η)",
            primarySource: "Manufacturer datasheet", primaryConfidence: "High",
            fallbackSource: "IEC 61215 standard module (320 Wp, 19.5% η)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_pvt", label: "Panel tilt & azimuth",
            primarySource: "Site plan / installation drawing", primaryConfidence: "High",
            fallbackSource: "PVGIS optimal tilt for latitude (south-facing default)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_pvl", label: "System losses (soiling, wiring, inverter)",
            primarySource: "Commissioning report / measured PR", primaryConfidence: "High",
            fallbackSource: "PVGIS default loss model (14% total losses)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
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
            key: "re_bc",  label: "Battery capacity (kWh)",
            primarySource: "System specs / purchase contract", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined; no default)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_bp",  label: "Max charge / discharge power (kW)",
            primarySource: "System specs / datasheet", primaryConfidence: "High",
            fallbackSource: "— (must be specified)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_soc", label: "State-of-charge limits (min / max %)",
            primarySource: "Manufacturer commissioning settings", primaryConfidence: "High",
            fallbackSource: "IEC 62619 default (10–90% SOC window)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_eff", label: "Round-trip cycle efficiency (%)",
            primarySource: "Manufacturer datasheet", primaryConfidence: "High",
            fallbackSource: "IEC 62619 / literature default (90% round-trip)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Onshore Wind") || sys.has("Offshore Wind")) {
      cats.push({
        category: "Case: Wind Generation",
        items: [
          {
            key: "re_wc",  label: "Turbine rated capacity (kW)",
            primarySource: "System design / purchase contract", primaryConfidence: "High",
            fallbackSource: "— (capacity must be defined)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_wh",  label: "Hub height (m)",
            primarySource: "System design drawing", primaryConfidence: "High",
            fallbackSource: "— (hub height must be specified)", fallbackStatus: "Missing", fallbackConfidence: "—", fallbackAction: "User input",
            defaultHas: false,
          },
          {
            key: "re_wpc", label: "Turbine power curve",
            primarySource: "Manufacturer datasheet", primaryConfidence: "High",
            fallbackSource: "Generic IEC class II turbine power curve (literature)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    if (sys.has("Heat Pump") || sys.has("District Heating") || sys.has("Solar Thermal")) {
      cats.push({
        category: "Case: Heating System",
        items: [
          {
            key: "re_hpc", label: "Heat pump COP / seasonal SCOP",
            primarySource: "Manufacturer datasheet / measured data", primaryConfidence: "High",
            fallbackSource: "EU Ecodesign regulation default SCOP by climate zone", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: false,
          },
          {
            key: "re_hed", label: "Annual heating demand (kWh/year)",
            primarySource: "EPC certificate / heat meter", primaryConfidence: "High",
            fallbackSource: "TABULA archetype heating demand by construction year & type", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
            defaultHas: true,
          },
          {
            key: "re_hep", label: "Hourly heating load profile",
            primarySource: "District heat meter interval data", primaryConfidence: "High",
            fallbackSource: "TABULA archetype heating load profiles (degree-day normalised)", fallbackStatus: "Estimated", fallbackConfidence: "Low", fallbackAction: "Review",
            defaultHas: false,
          },
        ],
      });
    }

    cats.push({
      category: "Grid & Tariffs",
      items: [
        {
          key: "re_gt",  label: "Grid import / export tariff structure",
          primarySource: "Utility contract / tariff schedule", primaryConfidence: "High",
          fallbackSource: "Typical Swedish tariff structure (Energimarknadsinspektionen)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: true,
        },
        {
          key: "re_ef",  label: "Grid emission factor (gCO₂/kWh)",
          primarySource: "Utility declaration / AIB certificate", primaryConfidence: "High",
          fallbackSource: "Swedish Energy Agency marginal emission factor (2023)", fallbackStatus: "Estimated", fallbackConfidence: "High", fallbackAction: "None",
          defaultHas: false,
        },
        {
          key: "re_tou", label: "Hourly spot price profile",
          primarySource: "Nordpool day-ahead prices (downloaded)", primaryConfidence: "High",
          fallbackSource: "Nordpool historical SE3 spot prices (annual average profile)", fallbackStatus: "Estimated", fallbackConfidence: "Medium", fallbackAction: "Review",
          defaultHas: false,
        },
      ],
    });

    return cats;
  }

  return [];
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export default function DataCoverage() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const defs = useMemo(
    () => buildDefs(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope],
  );

  /* Per-item "user has this data" state — keyed by item.key */
  const [hasData, setHasData] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    defs.forEach(cat => cat.items.forEach(i => { init[i.key] = i.defaultHas; }));
    return init;
  });

  /* Reset when project type / systems change */
  useEffect(() => {
    const init: Record<string, boolean> = {};
    defs.forEach(cat => cat.items.forEach(i => { init[i.key] = i.defaultHas; }));
    setHasData(init);
  }, [defs]);

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
                          {def && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.hasData
                                ? <span>Your data: <span className="text-slate-500 font-medium">{def.primarySource}</span></span>
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
                          {item.hasData ? "Provided by user" : item.source}
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
