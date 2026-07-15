/**
 * Loads/matches frontend/public/uk/tabula_gb.json - the EPISCOPE/TABULA
 * England (BRE) archetype set used as the UK's material-picker substitute for
 * Sweden's Wikells catalogue. Unlike Wikells (per-component, per-code cost
 * items), TABULA GB only publishes whole-building U-value sets for three
 * states: "as_built" (the building today) and two refurbishment tiers
 * ("standard_refurbishment" / "ambitious_refurbishment") - so the UK picker
 * is a single tier choice per package, not a per-component material list.
 */

export interface TabulaTier {
  u_roof?: number;
  u_wall?: number;
  u_floor?: number;
  u_window?: number;
  u_door?: number;
  kwh_m2_yr: number;
}

export interface TabulaArchetypeGB {
  type_label: string;
  use_cat: string;
  period_label: string;
  period: string;
  as_built: TabulaTier;
  standard_refurbishment: TabulaTier;
  ambitious_refurbishment: TabulaTier;
}

export type RefurbTierKey = "standard_refurbishment" | "ambitious_refurbishment";

export const REFURB_TIERS: { key: RefurbTierKey; label: string }[] = [
  { key: "standard_refurbishment", label: "Standard Refurbishment" },
  { key: "ambitious_refurbishment", label: "Ambitious Refurbishment" },
];

let cached: Promise<TabulaArchetypeGB[]> | null = null;

/** Fetches once per page load, cached module-level (same pattern as a
 * bundled catalogue import, just fetched at runtime since tabula_gb.json
 * lives under public/, not src/). */
export function loadUkArchetypes(): Promise<TabulaArchetypeGB[]> {
  if (!cached) {
    cached = fetch("/uk/tabula_gb.json")
      .then((r) => r.json())
      .then((d) => (d.archetypes as TabulaArchetypeGB[]) ?? []);
  }
  return cached;
}

/**
 * Matches a building's use_cat + tabula_period against the archetype list.
 * Multiple type_labels (e.g. "Single Family House" vs "Terraced house") can
 * share the same use_cat+period - the first match wins, which is always the
 * more generic/primary type_label since that's how the source JSON orders
 * them (all "Single Family House" rows precede "Terraced house" rows).
 * Falls back to the same use_cat with no period match if the exact period
 * isn't present (rare - a few type/period combos are absent per the source's
 * own "small sample size" notes).
 */
export function findUkArchetype(
  archetypes: TabulaArchetypeGB[],
  useCat: string | null,
  period: string | null
): TabulaArchetypeGB | null {
  if (!useCat) return null;
  const sameCat = archetypes.filter((a) => a.use_cat === useCat);
  if (!sameCat.length) return null;
  if (period) {
    const exact = sameCat.find((a) => a.period === period);
    if (exact) return exact;
  }
  return sameCat[0] ?? null;
}
