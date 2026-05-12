import { create } from "zustand";
import type { ProjectType } from "../config/projectConfig";
import type { BuildingLookup } from "../types";

/* ── Pipeline definitions ── */

export interface StepDef {
  number: number;
  label: string;
  path: string;
}

const STEPS: StepDef[] = [
  { number: 1, label: "Define Project", path: "/step/1" },
  { number: 2, label: "Data Requirements", path: "/step/2" },
  { number: 3, label: "Review & Confidence", path: "/step/3" },
  { number: 4, label: "Expected Results", path: "/step/4" },
  { number: 5, label: "Cost Estimate", path: "/step/5" },
];

/* ── State shape ── */

interface ProjectState {
  projectType: ProjectType | null;
  projectName: string;
  country: string | null;
  scale: string | null;
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
  /* looked-up building from EUBUCCO */
  lookedUpBuilding: BuildingLookup | null;
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
  projectType: null,
  projectName: "",
  country: null,
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
};

export const useWizardStore = create<WizardState>((set) => ({
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
}));
