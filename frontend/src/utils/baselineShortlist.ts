/**
 * baselineShortlist — narrow a building list to the ones Step 3 actually
 * simulated.
 *
 * Step 2 can hand forward a whole neighbourhood (39 buildings in one real
 * project), but Step 3 runs only the shortlist the user picked. Step 4 used to
 * ignore that and run EnergyPlus over every building for EVERY package, which
 * is where "EPSM is taking forever for 3 buildings" came from. Step 4 and the
 * Step 5 report now both narrow to the same set, so the three steps agree on
 * what "the project" is.
 *
 * Matching is on coordinates, which are exact; the address string is a fallback
 * for results saved before coordinates were stored, and a building with no
 * address at all falls back to a positional label ("Building 3") that cannot be
 * matched reliably.
 */
import type { RenovationBaselineResult } from "../store/wizard";

/** Coordinates round-trip through JSON from one source, but compare with a
 *  tolerance rather than `===` so a float re-serialisation can never drop a
 *  building from the project. ~1e-6° is about 0.1 m. */
const COORD_EPS = 1e-6;

export interface ShortlistCandidate {
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * Keep only the candidates Step 3 simulated.
 *
 * Returns the input unchanged when there is no baseline yet — before Step 3 has
 * run there is no shortlist to apply, and showing nothing would be worse than
 * showing everything.
 */
export function filterToBaselineShortlist<T extends ShortlistCandidate>(
  candidates: T[],
  baselineResults: RenovationBaselineResult[] | undefined,
): T[] {
  if (!baselineResults || baselineResults.length === 0) return candidates;

  const coords = baselineResults
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => [r.lat as number, r.lon as number] as const);
  const addresses = new Set(
    baselineResults.map((r) => (r.address ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const matches = (c: T) => {
    if (c.lat != null && c.lon != null) {
      for (const [lat, lon] of coords) {
        if (Math.abs(lat - c.lat) < COORD_EPS && Math.abs(lon - c.lon) < COORD_EPS) return true;
      }
    }
    const addr = (c.address ?? "").trim().toLowerCase();
    return !!addr && addresses.has(addr);
  };

  const kept = candidates.filter(matches);
  // A shortlist that matches nothing means the two lists are describing
  // different things (a project reloaded against changed data, say). Falling
  // back to everything keeps the step usable instead of showing an empty page.
  return kept.length ? kept : candidates;
}
