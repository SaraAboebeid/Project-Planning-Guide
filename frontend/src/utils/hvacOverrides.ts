import type { HvacCatalogue } from "../config/hvacSystems";
import type { HvacOverrides } from "../store/wizard";

/** The catalogue with the user's own values laid over its defaults (Step 4
 *  heating-system panel). A changed base SPF moves the low/high band with it,
 *  keeping their ratios, so the robustness range stays meaningful. */
export function applyHvacOverrides(cat: HvacCatalogue, o: HvacOverrides | undefined): HvacCatalogue {
  if (!o) return cat;
  const carriers = Object.fromEntries(Object.entries(cat.carriers).map(([k, c]) => {
    const e = o.carriers?.[k];
    return [k, c && e ? { ...c, tariffSek: e.tariffSek ?? c.tariffSek, carbonKgPerKwh: e.carbonKgPerKwh ?? c.carbonKgPerKwh } : c];
  }));
  const systems = cat.systems.map((s) => {
    const e = o.systems?.[s.id];
    if (!e) return s;
    const r = e.spfBase != null && s.spf.base > 0 ? e.spfBase / s.spf.base : 1;
    return {
      ...s,
      spf: { low: s.spf.low * r, base: e.spfBase ?? s.spf.base, high: s.spf.high * r },
      capexFixedSek: e.capexFixedSek ?? s.capexFixedSek,
      capexPerKwSek: e.capexPerKwSek ?? s.capexPerKwSek,
      lifetimeYr: e.lifetimeYr ?? s.lifetimeYr,
    };
  });
  return { ...cat, carriers, systems };
}

export function hasHvacOverrides(o: HvacOverrides | undefined): boolean {
  const any = (r?: Record<string, Record<string, unknown>>) =>
    !!r && Object.values(r).some((v) => Object.values(v).some((x) => x != null));
  return !!o && (any(o.carriers) || any(o.systems));
}
