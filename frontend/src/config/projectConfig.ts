/**
 * All configuration data ported from config/project_types.py
 */

// ── Project Types ──────────────────────────────────────────────────────────

export const PROJECT_TYPES = [
  "Energy Community Planning",
  "Renovation Planning",
  "Renewable Energy Planning",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_DESCRIPTIONS: Record<ProjectType, string> = {
  "Energy Community Planning":
    "Plan shared energy systems across multiple entities.",
  "Renovation Planning":
    "Assess and prioritize retrofit strategies for existing buildings across envelope, systems, comfort, and energy performance.",
  "Renewable Energy Planning":
    "Evaluate renewable energy potential.",
};

// ── Systems in Scope ───────────────────────────────────────────────────────

export const SYSTEMS_BY_PROJECT_TYPE: Record<ProjectType, string[]> = {
  "Energy Community Planning": [
    "Buildings",
    "Rooftop PV",
    "Community PV",
    "Facade PV",
    "Battery System",
    "EV Charging",
    "Vehicle to Grid",
    "Grid",
  ],
  "Renovation Planning": [
    "Building Envelope (Windows, Roof, Walls, Floors)",
  ],
  "Renewable Energy Planning": [
    "Rooftop PV",
    "Community PV",
    "Facade PV",
    "Offshore Wind",
    "Onshore Wind",
    "Solar Thermal",
    "Geothermal",
    "Biomass",
    "Hydropower",
  ],
};

export const DISABLED_SYSTEMS: Partial<Record<ProjectType, string[]>> = {
  "Renewable Energy Planning": [
    "Offshore Wind",
    "Onshore Wind",
    "Solar Thermal",
    "Geothermal",
    "Biomass",
    "Hydropower",
  ],
};

// ── Follow-up systems ──────────────────────────────────────────────────────

export interface FollowUpConfig {
  triggers: string[];
  question: string;
  help: string;
}

export const FOLLOW_UP_SYSTEMS: Partial<
  Record<ProjectType, Record<string, FollowUpConfig>>
> = {
  "Renewable Energy Planning": {
    "Battery System": {
      triggers: ["Rooftop PV", "Community PV", "Facade PV"],
      question: "Are you planning to include a battery storage system?",
      help: "Battery storage can improve self-sufficiency, enable energy export, and smooth peak loads.",
    },
  },
};

export const EC_FOLLOW_UP_QUESTIONS: Record<string, FollowUpConfig> = {
  existing_pv: {
    triggers: ["Rooftop PV", "Community PV", "Facade PV (BIPV)"],
    question: "Is there PV already installed on site?",
    help: "If PV is already installed, we will ask for measured production data. Otherwise we will ask for planned system specifications.",
  },
  existing_battery: {
    triggers: ["Battery System"],
    question: "Is there a battery system already installed on site?",
    help: "If a battery is already installed, we will ask for measured performance data. Otherwise we will ask for planned specifications.",
  },
};

export const EC_FOCUS_OPTIONS = ["Electricity", "Heating", "Cooling"];

// ── Renovation envelope components ─────────────────────────────────────────

export const ENVELOPE_COMPONENTS = [
  "Walls",
  "Windows",
  "Doors",
  "Floor",
  "Roof",
  "Balcony",
  "Vertical Extension (New Floor)",
];

// ── KPIs ───────────────────────────────────────────────────────────────────

export const UNIVERSAL_KPIS = [
  "Environmental",
  "Economic",
  "Social",
  "Performance / Technical",
];

export const KPIS_BY_PROJECT_TYPE: Record<ProjectType, string[]> = {
  "Energy Community Planning": [
    "Self-sufficiency",
    "Peak Load",
    "Global Warming Potential",
    "Cost",
    "Return on Investment",
  ],
  "Renovation Planning": [
    "Cost",
    "Thermal Comfort",
    "Global Warming Potential",
    "Energy Demand",
    "Return on Investment",
  ],
  "Renewable Energy Planning": [
    "Self-Sufficiency",
    "Global Warming Potential",
    "Energy Import",
    "Peak Load",
    "Thermal Comfort",
    "Cost",
    "Return on Investment",
  ],
};

export const CONDITIONAL_KPIS: Partial<
  Record<ProjectType, Record<string, string[]>>
> = {
  "Energy Community Planning": {
    Grid: ["Energy Import"],
    "Battery System": ["Energy Export", "State of Charge"],
  },
  "Renewable Energy Planning": {
    "Battery System": ["Energy Export"],
  },
};

// ── Exploration Approaches ─────────────────────────────────────────────────

export interface ExplorationConstraint {
  min_kpis: number;
  max_kpis: number | null;
  icon: string;
  description: string;
  hint: string;
  weighting?: boolean;
  primary?: boolean;
}

export const EXPLORATION_OPTIONS: string[] = [
  "Baseline Assessment",
  "Scenario Comparison",
  "Multi-objective Optimization",
];

export const EXPLORATION_CONSTRAINTS: Record<string, ExplorationConstraint> = {
  "Baseline Assessment": {
    min_kpis: 1,
    max_kpis: null,
    icon: "📏",
    description:
      "Evaluate current performance against selected KPIs to establish a reference point.",
    hint: "Select one or more KPIs",
  },
  "Scenario Comparison": {
    min_kpis: 1,
    max_kpis: null,
    icon: "🔀",
    description:
      "Compare multiple design or operational scenarios side-by-side across KPIs.",
    hint: "Select one or more KPIs",
  },
  "What-if Simulation": {
    min_kpis: 1,
    max_kpis: 1,
    icon: "🧪",
    description: "Test the impact of changing a single variable on one KPI.",
    hint: "Select exactly 1 KPI",
  },
  "Multi-objective Optimization": {
    min_kpis: 2,
    max_kpis: 5,
    icon: "⚖️",
    description:
      "Find optimal trade-offs between 2–5 competing objectives.",
    hint: "Select 2–5 KPIs",
    weighting: true,
  },
  "Resource Allocation Planning": {
    min_kpis: 1,
    max_kpis: 1,
    icon: "📦",
    description:
      "Determine how to allocate limited resources to maximise one KPI.",
    hint: "Select exactly 1 KPI",
  },
  "Roadmap Planning": {
    min_kpis: 1,
    max_kpis: null,
    icon: "🗺️",
    description:
      "Define a phased plan with a primary target KPI and optional supporting secondary KPIs.",
    hint: "Select a primary KPI + optional secondary KPIs",
    primary: true,
  },
  "Risk & Uncertainty Analysis": {
    min_kpis: 1,
    max_kpis: 1,
    icon: "🎲",
    description: "Assess how uncertainty in inputs affects one KPI.",
    hint: "Select exactly 1 KPI",
  },
};

// ── Scale ──────────────────────────────────────────────────────────────────

export const SCALE_OPTIONS_BY_TYPE: Record<ProjectType, string[]> = {
  "Energy Community Planning": ["Neighborhood", "Portfolio", "City"],
  "Renovation Planning": ["Building", "Neighborhood", "Portfolio", "City"],
  "Renewable Energy Planning": ["Building", "Neighborhood", "Portfolio", "City"],
};

// ── Building Uses (Neighborhood scale) ─────────────────────────────────────

export const BUILDING_USES = [
  "Residential",
  "Commercial",
  "Industrial",
  "School",
  "Hospital",
  "Sports Facilities",
  "Office",
  "Mixed-Use",
];

// ── RE electricity threshold ───────────────────────────────────────────────

export const RE_ELECTRICITY_THRESHOLDS = [
  "Energy balance",
  "Surplus",
  "Partial coverage",
];

// ── Building Development Type ──────────────────────────────────────────────

export const BUILDING_DEVELOPMENT_OPTIONS = [
  {
    value: "existing",
    label: "Existing buildings",
    description: "Buildings already in use — renovation or system integration.",
  },
  {
    value: "new",
    label: "New development",
    description: "Buildings under design or construction.",
  },
  {
    value: "mix",
    label: "Mix of both",
    description: "Project includes both existing and newly developed buildings.",
  },
] as const;

export type BuildingDevelopmentType = (typeof BUILDING_DEVELOPMENT_OPTIONS)[number]["value"];
