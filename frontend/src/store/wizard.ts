import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProjectType, BuildingDevelopmentType } from "../config/projectConfig";
import type { BuildingLookup, BboxStats, WWRRecord, BuildingRecord } from "../types";

/* ── Pipeline definitions ── */

export interface StepDef {
  number: number;
  label: string;
  path: string;
}

// The five Renovation Planning steps. The rail shows "Step N"; `label` is the
// full renovation name used in the top bar and the rail's hover tooltip.
const STEPS: StepDef[] = [
  { number: 1, label: "Define Project",       path: "/step/1" },
  { number: 2, label: "Building & Site Data", path: "/step/2" },
  { number: 3, label: "Baseline Simulation",  path: "/step/3" },
  { number: 4, label: "Calculator",           path: "/step/4" },
  { number: 5, label: "Report",               path: "/step/5" },
];

/* ── Renovation simulation result types ── */
export interface RenovationBaselineResult {
  address: string;
  energyUse: number;
  heating: number;
  cooling: number;
  dhw: number;
  airLeakage: number;
  eClass: string | null;
  eClassFromEpc: boolean;
}

export interface RenovationPackageResult {
  packageIndex: number;
  components: Record<string, {
    code: string;
    description: string;
    costSEK: number;
    uValue?: number;
    /** Full layer build-up (outside → inside) for a layer-composed assembly, so
     *  the Step-5 report can list every layer and its material. */
    layers?: { name: string; thicknessMm: number; category?: string }[];
  }>;
  energyUse: number;
  saving: number;
  carbonSaving: number;
  cost: number;
}

/* ── Renovation package types ── */
export interface PackageComponent {
  wikellsCode: string;
  areaM2: number;
}

export interface RenovationPackage {
  id: string;
  name: string;
  color: string;
  selections: Record<string, PackageComponent>; // key = renovation component label
}

/* ── Renovation calculator (wizard Step 4 / RenovationSimulator.tsx) ──
   Deliberately a separate type/field from RenovationPackage/renovationPackages
   above - those are still live, used by the standalone /pathways vertical-
   extension tool (RenovationPackages.tsx) and must keep their existing shape. */
export interface RenovationCalcSelection {
  wikellsCode: string;
  quantity: number; // m² for area line items, a unit count for count line items - see AreaLineItem.quantityKind
  /** U-value of a layer-composed assembly (EN ISO 6946), when the user built the
   *  build-up themselves instead of picking a catalogue row. It REPLACES the
   *  catalogue item's U-value in the IDF override. */
  customUValue?: number;
  /** Human label for the composed assembly, e.g. "145 stud + 300 mineral wool". */
  customLabel?: string;
  /** The full layer build-up of a layer-composed assembly (outside → inside),
   *  stored so the package breakdown and the Step-5 report can list every layer
   *  and its material, not just the summary label. Structurally an AssemblyLayer. */
  layers?: { materialId: string; thicknessMm: number }[];
  /** The id of the ComponentConfig this selection came from, when built in the
   *  Step-4 calculator. Lets the optimizer round-trip an assembly pick (whose
   *  identity isn't a single Wikells code) back to its exact build-up. */
  configId?: string;
}

/** One selected building's own simulation outcome within a package - a
 * package is one set of material/tier choices applied uniformly across
 * every building selected in Step 2, submitted together as one EPSM batch
 * (see backend's /api/simulation-batch-submit), so each building gets its
 * own status/results/cost/carbon (footprint and wall area differ per
 * building, so cost/carbon aren't a single shared number). */
export interface RenovationCalcBuildingResult {
  address: string;
  lat: number;
  lon: number;
  status: "idle" | "queued" | "running" | "completed" | "failed";
  heatingKwhM2Yr: number | null;
  coolingKwhM2Yr: number | null;
  totalKwhM2Yr: number | null;
  costSEK: number | null;
  carbonKgCO2e: number | null;
  error: string | null;
}

export interface RenovationCalcPackage {
  id: string;               // "baseline" | `pkg-${uuid}` (suffixed `__<scenario>` per climate)
  name: string;
  color: string;
  isBaseline: boolean;
  selections: Record<string, RenovationCalcSelection>; // key = AreaLineItem.key
  batchId: string | null;   // the shared EPSM batch_id polled for every building below
  buildings: RenovationCalcBuildingResult[];
  auto?: boolean;           // auto-created from the optimizer's best pick; replaced (not stacked) on re-run
}

/* ── State shape ── */

interface ProjectState {
  projectType: ProjectType | null;
  buildingDevelopmentType: BuildingDevelopmentType | null;
  projectName: string;
  country: string | null;
  city: string | null;
  scale: string | null;
  neighborhoodName: string;   // free-text area name when scale = "Neighborhood"
  district: string | null;    // resolved primärområde name → auto-selects its buildings in Step 2
  propertyOwner: string | null; // selected owner when scale = "Portfolio" (see PORTFOLIO_OWNERS)
  systemsInScope: string[];
  selectedKpis: string[];
  explorationApproaches: string[];
  /* follow-ups */
  followUpAnswers: Record<string, boolean>;
  renovationEnvelopeComponents: string[];
  renovationExistingHeating: boolean;
  renovationExistingCooling: boolean;
  renovationExistingDhw: boolean;
  ecExistingPv: boolean;
  ecExistingBattery: boolean;
  ecEnergyFocus: string[];
  reElectricityThreshold: string;
  /* scale extras */
  buildingUses: string[];
  /* location */
  address: string;
  lat: number | null;
  lon: number | null;
  locationLabel: string;
  radiusM: number;
  buildingPoints: { lat: number; lon: number; label: string }[];
  /* data coverage */
  dataInputs: Record<string, { available: boolean; proxy: string | null; confidence: number }>;
  /* looked-up building from EUBUCCO (single-address mode) */
  lookedUpBuilding: BuildingLookup | null;
  /* all looked-up buildings when multiple addresses are selected */
  lookedUpBuildings: BuildingLookup[];
  /* aggregate stats from EUBUCCO for a bbox (multi-building mode) */
  bboxStats: BboxStats | null;
  /* saved AI-detected WWR records for looked-up buildings */
  savedWWR: WWRRecord | null;
  /* raw bbox coords from the map draw (north/south/east/west) */
  currentBbox: { north: number; south: number; east: number; west: number } | null;
  /* optional drawn polygon "lon,lat;lon,lat;…" refining the bbox to any shape */
  selectionPolygon: string | null;
  /* all bbox building rows loaded in step 2 */
  bboxRows: BuildingRecord[];
  /* simulation material selections (Step 4, Renovation) */
  simulationMaterials: Record<string, string[]>; // component label → selected wikells codes
  /* renovation packages built in step 4 */
  renovationPackages: RenovationPackage[];
  selectedPackageId: string | null;
  /* Step 4 Renovation calculator (RenovationSimulator.tsx) - real geometry-
     driven packages with an EPSM comparison, separate from the legacy
     renovationPackages field above */
  renovationCalcPackages: RenovationCalcPackage[];
  /* Step 3 Renovation — supplier discount (%) the owner gets off catalogue material
     prices; deducted from every material cost (catalogue, configs, packages, optimizer). */
  supplierDiscountPct: number;
  /* Step 3 Renovation — supplementary data uploaded by user to fill data gaps */
  supplementaryData: Record<string, Record<string, unknown>>; // building address → field overrides
  /* Step 3 Renovation — baseline EPSM simulation status */
  baselineStatus: "idle" | "done";
  /* Step 3 Renovation — saved baseline results per building */
  renovationBaselineResults: RenovationBaselineResult[];
  /* Step 4 Renovation — saved package simulation results */
  renovationSimResults: RenovationPackageResult[];
  /* Step 2 — ML facade defect detection summary per building (address / cadastral id).
     Only a lightweight summary is persisted (images stay in-component memory to keep
     sessionStorage small). */
  facadeDefects: Record<string, FacadeDefectSummary>;
}

export interface FacadeDefectSummary {
  imageCount: number;
  defectCount: number;
  byClass: Record<string, number>;   // e.g. { crack: 3, corrosion: 1 }
  checkedAt: string;                  // ISO timestamp
}

interface WizardState {
  project: ProjectState;
  setProject: (partial: Partial<ProjectState>) => void;
  currentStep: number;
  steps: StepDef[];
  setStep: (n: number) => void;
  reset: () => void;
}

const DEFAULT_PROJECT: ProjectState = {
  // Start unselected so Step 1 reveals its questions one at a time — the user
  // picks the project type first, then each following question appears. Downstream
  // pages treat a null type as Renovation (the only enabled track; see App.tsx's
  // isEcOrRe router), so nothing breaks before the type is chosen.
  projectType: null,
  buildingDevelopmentType: null,
  projectName: "",
  neighborhoodName: "",
  district: null,
  propertyOwner: null,
  country: null,
  city: null,
  scale: null,
  systemsInScope: [],
  selectedKpis: [],
  explorationApproaches: [],
  followUpAnswers: {},
  renovationEnvelopeComponents: [],
  renovationExistingHeating: true,
  renovationExistingCooling: true,
  renovationExistingDhw: true,
  ecExistingPv: false,
  ecExistingBattery: false,
  ecEnergyFocus: [],
  reElectricityThreshold: "Partial coverage",
  buildingUses: [],
  address: "",
  lat: null,
  lon: null,
  locationLabel: "",
  radiusM: 800,
  buildingPoints: [],
  dataInputs: {},
  lookedUpBuilding: null,
  lookedUpBuildings: [],
  bboxStats: null,
  currentBbox: null,
  selectionPolygon: null,
  bboxRows: [],
  savedWWR: null,
  simulationMaterials: {},
  renovationPackages: [],
  selectedPackageId: null,
  renovationCalcPackages: [],
  supplierDiscountPct: 0,
  supplementaryData: {},
  baselineStatus: "idle",
  renovationBaselineResults: [],
  renovationSimResults: [],
  facadeDefects: {},
};

/* sessionStorage wrapper that never throws — if storage is disabled or over
   quota (a large neighborhood selection), we simply skip persisting rather than
   crash the wizard. */
const safeSessionStorage = {
  getItem: (name: string): string | null => {
    try { return sessionStorage.getItem(name); } catch { return null; }
  },
  setItem: (name: string, value: string): void => {
    try { sessionStorage.setItem(name, value); } catch { /* quota/disabled — ignore */ }
  },
  removeItem: (name: string): void => {
    try { sessionStorage.removeItem(name); } catch { /* ignore */ }
  },
};

/* Persisted so an idle-tab reload (Vite dev reconnect, HMR, or an accidental
   refresh) doesn't wipe the project — losing projectType would otherwise make
   every step router fall through to its non-renovation branch, so a Renovation
   Planning flow would silently render as the generic/Energy-Community pages.
   sessionStorage: state survives reloads within the tab, and a fresh tab starts
   clean rather than resuming a stale old project. */
export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      project: { ...DEFAULT_PROJECT },
      setProject: (partial) =>
        set((s) => ({ project: { ...s.project, ...partial } })),

      currentStep: 1,
      steps: STEPS,
      setStep: (n) => set({ currentStep: n }),

      reset: () =>
        set({
          project: { ...DEFAULT_PROJECT },
          currentStep: 1,
          steps: STEPS,
        }),
    }),
    {
      name: "ppg-wizard-v1",
      storage: createJSONStorage(() => safeSessionStorage),
      // Persist only the wizard data — never the action functions or the static
      // STEPS list (those come from the initializer on every load).
      partialize: (s) => ({ project: s.project, currentStep: s.currentStep }),
    }
  )
);
