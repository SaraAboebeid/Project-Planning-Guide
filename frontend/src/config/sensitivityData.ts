/**
 * Pre-computed sensitivity analysis results (ported from config/sensitivity_config.py)
 */

export const BASELINE_HEATING_KWH = 226335.41;

export interface OatParam {
  label: string;
  unit: string;
  values: (number | string)[];
  outputs_kwh: number[];
  range_kwh: number;
  baseline_value: number | string;
  facadeDetails?: {
    north: { range: number; impact: string };
    south: { range: number; impact: string };
    east: { range: number; impact: string };
    west: { range: number; impact: string };
  };
}

export const OAT_PARAMETERS: Record<string, OatParam> = {
  infiltration: {
    label: "Infiltration Rate",
    unit: "m³/s·m²",
    values: [0.0001, 0.00015, 0.0002, 0.00025, 0.0003, 0.00035, 0.0004, 0.00045, 0.0005, 0.00055, 0.0006],
    outputs_kwh: [129919.15, 143239.16, 156715.22, 170366.23, 184183.35, 198158.18, 212251.26, 226335.41, 240635.27, 255020.16, 269353.10],
    range_kwh: 139434.0,
    baseline_value: 0.00045,
  },
  construction_package: {
    label: "Construction Quality",
    unit: "category",
    values: ["P0 Poor", "P1 Baseline", "P2 Well-insulated"],
    outputs_kwh: [279892.67, 226335.41, 201608.30],
    range_kwh: 78284.37,
    baseline_value: "P1 Baseline",
  },
  roof_shape_angle: {
    label: "Roof Shape & Angle",
    unit: "configuration",
    values: ["Flat (0°)", "Low (10°)", "Moderate (15-25°)", "Steep (35-45°)", "Gable", "Shed"],
    outputs_kwh: [225100.96, 234629.42, 283095.48, 398728.38, 436418.24, 247602.52],
    range_kwh: 211553.0,
    baseline_value: "Flat (0°)",
  },
  heating_setpoint: {
    label: "Heating Setpoint",
    unit: "°C",
    values: [19, 20, 21, 22, 23],
    outputs_kwh: [171222.30, 197468.59, 226335.41, 257907.95, 291787.77],
    range_kwh: 120565.47,
    baseline_value: 21,
  },
  floors_total: {
    label: "Number of Floors",
    unit: "count",
    values: [3, 4, 5],
    outputs_kwh: [190255.20, 226335.41, 262413.31],
    range_kwh: 72158.11,
    baseline_value: 4,
  },
  footprint_length: {
    label: "Building Length",
    unit: "factor",
    values: [0.9, 1.0, 1.1, 1.2],
    outputs_kwh: [205108.69, 226335.41, 247628.30, 268861.77],
    range_kwh: 63753.08,
    baseline_value: 1.0,
  },
  footprint_width: {
    label: "Building Width",
    unit: "factor",
    values: [0.8, 0.9, 1.0, 1.1, 1.2],
    outputs_kwh: [200067.92, 213174.52, 226335.41, 239692.54, 252891.61],
    range_kwh: 52823.69,
    baseline_value: 1.0,
  },
  window_to_wall_ratio: {
    label: "Window-to-Wall Ratio",
    unit: "by facade",
    values: ["North (Low 4%)", "North (High 49%)", "South (Low 4%)", "South (High 49%)", "East (Low 4%)", "East (High 49%)", "West (Low 4%)", "West (High 49%)"],
    outputs_kwh: [220166.13, 250767.13, 232793.26, 221334.63, 226335.41, 231005.21, 226335.41, 227201.51],
    range_kwh: 30601.0,
    baseline_value: "North (24%)",
    facadeDetails: {
      north: { range: 30601.0, impact: "High - heat loss dominates" },
      south: { range: 11458.63, impact: "Moderate - solar gain vs heat loss" },
      east: { range: 4669.80, impact: "Low - morning sun" },
      west: { range: 866.10, impact: "Very Low - afternoon sun" },
    },
  },
  glazing_package: {
    label: "Glazing Quality",
    unit: "category",
    values: ["P0 Poor", "P1 Baseline", "P2 Good"],
    outputs_kwh: [225390.84, 213962.33, 202041.01],
    range_kwh: 23349.83,
    baseline_value: "P1 Baseline",
  },


};

/** Sorted by impact (descending) */
export const TOTAL_OAT_RANGE = Object.values(OAT_PARAMETERS).reduce((s, p) => s + p.range_kwh, 0);

export function getImportanceRanking() {
  return Object.entries(OAT_PARAMETERS)
    .map(([key, p]) => ({
      key,
      label: p.label,
      range_kwh: p.range_kwh,
      pct: (p.range_kwh / TOTAL_OAT_RANGE) * 100,
    }))
    .sort((a, b) => b.range_kwh - a.range_kwh);
}

/* ── Sample TABULA archetype data (Swedish residential) ── */
export interface TabulaRow {
  component: string;
  original: number;
  typical: number;
  advanced: number;
  unit: string;
}

export const TABULA_SAMPLE: TabulaRow[] = [
  { component: "External Wall", original: 1.20, typical: 0.40, advanced: 0.18, unit: "W/m²K" },
  { component: "Roof", original: 0.90, typical: 0.25, advanced: 0.13, unit: "W/m²K" },
  { component: "Floor", original: 0.80, typical: 0.30, advanced: 0.15, unit: "W/m²K" },
  { component: "Windows", original: 2.80, typical: 1.40, advanced: 0.90, unit: "W/m²K" },
  { component: "Doors", original: 3.00, typical: 1.60, advanced: 1.00, unit: "W/m²K" },
];

export const TABULA_ENERGY: { label: string; original: number; typical: number; advanced: number }[] = [
  { label: "Space Heating", original: 185, typical: 95, advanced: 45 },
  { label: "Hot Water", original: 30, typical: 25, advanced: 20 },
  { label: "Ventilation Losses", original: 45, typical: 20, advanced: 10 },
  { label: "Total Primary", original: 260, typical: 140, advanced: 75 },
];

/* ── Sample EPC distribution data (Swedish context) ── */
export interface EpcClassDist {
  class: string;
  count: number;
  color: string;
}

export const EPC_DISTRIBUTION: EpcClassDist[] = [
  { class: "A", count: 3, color: "#16a34a" },
  { class: "B", count: 8, color: "#65a30d" },
  { class: "C", count: 22, color: "#C4E81D" },
  { class: "D", count: 35, color: "#E8880C" },
  { class: "E", count: 18, color: "#f97316" },
  { class: "F", count: 10, color: "#E2483B" },
  { class: "G", count: 4, color: "#dc2626" },
];

export const EPC_PERFORMANCE_TREND = [
  { year: 2010, avg_kwh: 165 },
  { year: 2012, avg_kwh: 155 },
  { year: 2014, avg_kwh: 142 },
  { year: 2016, avg_kwh: 130 },
  { year: 2018, avg_kwh: 118 },
  { year: 2020, avg_kwh: 108 },
  { year: 2022, avg_kwh: 98 },
  { year: 2024, avg_kwh: 90 },
];

export const EPC_BUILDING_TYPES = [
  { type: "Multi-family", avgPerf: 112, count: 45 },
  { type: "Single-family", avgPerf: 145, count: 28 },
  { type: "Office", avgPerf: 95, count: 12 },
  { type: "School", avgPerf: 130, count: 8 },
  { type: "Retail", avgPerf: 105, count: 7 },
];
