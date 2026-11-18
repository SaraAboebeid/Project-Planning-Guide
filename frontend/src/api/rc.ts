/** Fast hourly heating model (backend/rc_engine.py — epsm_rc ISO 13790 5R1C).
 *  Same building inputs as the EnergyPlus shoebox, ~0.2 s per building, so it
 *  can screen a whole selection — or a whole city. */

export interface RcBuildingInput {
  address: string | null;
  lat: number;
  lon: number;
}

export interface RcResult {
  address: string | null;
  lat: number;
  lon: number;
  source?: "city screening" | "computed";
  floor_area_m2?: number;
  heating_kwh?: number;
  heating_kwh_m2_yr?: number;
  peak_heating_kw?: number;
  peak_heating_w_m2?: number;
  error?: string;
}

export interface RcGroup {
  group: string;
  buildings: number;
  floor_area_m2: number;
  heat_mwh: number;
  heat_kwh_m2: number | null;
  sum_of_peaks_mw: number;
}

export interface RcCitySummary {
  city: string;
  created: string;
  weather: string;
  buildings: number;
  failed: number;
  runtime_s: number;
  totals: {
    floor_area_m2: number; heat_mwh: number; heat_kwh_m2: number | null;
    peak_mw: number; peak_hour: number; peak_daily_avg_mw: number; sum_of_peaks_mw: number;
  };
  by_use: RcGroup[];
  by_era: RcGroup[];
  by_district: RcGroup[];
  monthly_mwh: number[];
  heat_kwh_m2_percentiles?: number[];
}

export interface RcCityStatus {
  city_id: string;
  status: { state: "running" | "done" | "failed"; done: number; total: number; elapsed_s?: number } | null;
  result: RcCitySummary | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `API ${res.status}`);
  return res.json() as Promise<T>;
}

export async function rcSimulate(cityId: string, buildings: RcBuildingInput[], weatherYear?: number | null) {
  return json<{ engine: string; weather: string; calibration: string; results: RcResult[] }>(
    await fetch("/api/rc/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "se", city_id: cityId, buildings, weather_year: weatherYear ?? null }),
    }),
  );
}

export async function rcCity(cityId: string) {
  return json<RcCityStatus>(await fetch(`/api/rc/city/${encodeURIComponent(cityId)}`));
}

export async function rcCityRun(cityId: string) {
  return json<{ started: boolean; reason?: string }>(
    await fetch(`/api/rc/city/${encodeURIComponent(cityId)}/run`, { method: "POST" }),
  );
}

/** Share (0–100) of the city's buildings that need MORE heat per m² than `v`. */
export function shareHigher(percentiles: number[] | undefined, v: number): number | null {
  if (!percentiles?.length) return null;
  let below = 0;
  for (const p of percentiles) if (p <= v) below++;
  return Math.max(0, Math.min(100, Math.round(100 - (below / percentiles.length) * 100)));
}

export interface WeatherYears {
  city_id: string;
  first_year: number;
  last_year: number;
  /** Years already compiled from SMHI data (instant to use). */
  ready: { year: number; station?: string; station_distance_km?: number; filled_fraction?: number }[];
  suggested: { year: number; note: string }[];
  typical: string | null;
}

export async function rcWeatherYears(cityId: string) {
  return json<WeatherYears>(await fetch(`/api/weather/years/${encodeURIComponent(cityId)}`));
}
