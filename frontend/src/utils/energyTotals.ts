/* Swedish "building energy use" (byggnadens energianvändning, BBR/BEN and Sveby)
 * leaves out household and business electricity — appliances and lighting in
 * flats, a tenant's equipment. Energy declarations, energy classes and city
 * targets are all stated on that basis, so Swedish results are reported the same
 * way: heating + cooling + hot water + pumps. The electricity is still SIMULATED
 * (its heat lowers the heating demand); it just is not counted or shown.
 *
 * Works on stored results too: they carry lighting/equipment separately, so runs
 * made before this rule get the same total as new ones. */

interface EndUses {
  total_kwh_m2_yr?: number | null;
  lighting_kwh_m2_yr?: number | null;
  equipment_kwh_m2_yr?: number | null;
}

export function excludesHouseholdElectricity(country: string | null | undefined): boolean {
  const c = (country ?? "").toLowerCase();
  return c === "sweden" || c === "se";
}

/** Total kWh/m²·yr as reported for this country (see file comment). */
export function reportedTotalKwhM2(r: EndUses | null | undefined, country: string | null | undefined): number | null {
  if (r?.total_kwh_m2_yr == null) return null;
  if (!excludesHouseholdElectricity(country)) return r.total_kwh_m2_yr;
  const t = r.total_kwh_m2_yr - (r.lighting_kwh_m2_yr ?? 0) - (r.equipment_kwh_m2_yr ?? 0);
  return Math.round(t * 10) / 10;
}
