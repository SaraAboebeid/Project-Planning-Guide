/* Heating-system and energy assumptions the user can adjust (Catalogue window →
   Heating systems), on top of the main planner's sourced defaults
   (planner/hvacSystems.ts). Saved in the backend settings ("hvac-assumptions"),
   shared by every window; analysis.ts reads the effective values live.

   systems  per system: seasonal efficiency, installation cost (fixed + per kW,
            ground loop per kW), upkeep (share of installation cost a year),
            service life
   prices   SEK per delivered kWh: district heating, electricity, wood pellets
   carbon   kg CO2e per delivered kWh */
import { useSyncExternalStore } from "react";
import { CARRIERS, HVAC_SYSTEMS, type HvacSystem } from "./planner/hvacSystems";
import { getSetting, putSetting } from "./stockStore";

export type CarrierKey = "district_heating" | "electricity" | "biomass";
export const CARRIER_KEYS: CarrierKey[] = ["district_heating", "electricity", "biomass"];
export const SYSTEM_FIELDS = ["spf", "capexFixedSek", "capexPerKwSek", "groundLoopPerKwSek", "omFractionYr", "lifetimeYr"] as const;
export type SystemField = (typeof SYSTEM_FIELDS)[number];

interface Overrides {
  systems: Record<string, Partial<Record<SystemField, number>>>;
  prices: Partial<Record<CarrierKey, number>>;
  carbon: Partial<Record<CarrierKey, number>>;
}
const EMPTY: Overrides = { systems: {}, prices: {}, carbon: {} };
let state = { loaded: false, o: EMPTY, version: 0 };
const listeners = new Set<() => void>();
const emit = () => { state = { ...state, version: state.version + 1 }; listeners.forEach((l) => l()); };

export const defaultPrice = (k: CarrierKey) => CARRIERS[k].tariffSek;
export const defaultCarbon = (k: CarrierKey) => CARRIERS[k].carbonKgPerKwh;
const defaultSystem = (id: string) => HVAC_SYSTEMS.find((s) => s.id === id)!;
export function defaultField(id: string, f: SystemField): number {
  const s = defaultSystem(id);
  return f === "spf" ? s.spf.base : (s[f] ?? 0);
}

/** Effective values (user's where set). */
export const price = (k: CarrierKey) => state.o.prices[k] ?? defaultPrice(k);
export const carbon = (k: CarrierKey) => state.o.carbon[k] ?? defaultCarbon(k);
export function systems(): HvacSystem[] {
  return HVAC_SYSTEMS.map((s) => {
    const o = state.o.systems[s.id];
    if (!o) return s;
    return {
      ...s,
      spf: o.spf != null ? { ...s.spf, base: o.spf } : s.spf,
      capexFixedSek: o.capexFixedSek ?? s.capexFixedSek, capexPerKwSek: o.capexPerKwSek ?? s.capexPerKwSek,
      groundLoopPerKwSek: o.groundLoopPerKwSek ?? s.groundLoopPerKwSek,
      omFractionYr: o.omFractionYr ?? s.omFractionYr, lifetimeYr: o.lifetimeYr ?? s.lifetimeYr,
    };
  });
}
export const isEditedSystem = (id: string, f: SystemField) => state.o.systems[id]?.[f] != null;
export const isEditedCarrier = (kind: "prices" | "carbon", k: CarrierKey) => state.o[kind][k] != null;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function commit(o: Overrides) {
  state = { ...state, o };
  emit();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void putSetting("hvac-assumptions", state.o).catch(() => {}); }, 400);
}
/** null = back to the default. */
export function setSystemField(id: string, f: SystemField, v: number | null) {
  const cur = { ...(state.o.systems[id] ?? {}) };
  if (v == null || !Number.isFinite(v)) delete cur[f]; else cur[f] = v;
  const sys = { ...state.o.systems, [id]: cur };
  if (!Object.keys(cur).length) delete sys[id];
  commit({ ...state.o, systems: sys });
}
export function setCarrier(kind: "prices" | "carbon", k: CarrierKey, v: number | null) {
  const cur = { ...state.o[kind] };
  if (v == null || !Number.isFinite(v)) delete cur[k]; else cur[k] = v;
  commit({ ...state.o, [kind]: cur });
}
export function resetSystem(id: string) { const sys = { ...state.o.systems }; delete sys[id]; commit({ ...state.o, systems: sys }); }

let loading: Promise<void> | null = null;
export function loadHvac(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const saved = await getSetting<Overrides>("hvac-assumptions").catch(() => null);
      let o: Overrides = { ...EMPTY, ...(saved ?? {}) };
      if (!saved) {
        // Older builds kept the two prices as separate Wizard settings: carry them over once.
        const [dh, el] = await Promise.all([getSetting<number>("heat-price").catch(() => null), getSetting<number>("el-price").catch(() => null)]);
        o = { ...o, prices: { ...(dh != null ? { district_heating: dh } : {}), ...(el != null ? { electricity: el } : {}) } };
      }
      state = { ...state, loaded: true, o };
      emit();
    })();
  }
  return loading;
}
export function subscribeHvac(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
/** Re-render when an assumption changes; also triggers the first load. */
export function useHvacVersion(): number {
  const s = useSyncExternalStore(subscribeHvac, () => state);
  if (!s.loaded) void loadHvac();
  return s.version;
}
