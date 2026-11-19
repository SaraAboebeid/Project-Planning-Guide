/* Thin client for the shared FastAPI backend (proxied at /api).
   Poseidon is Gothenburg-only, so every call is pinned to Sweden/Gothenburg. */
import { t } from "./i18n";

export interface Building {
  address: string | null;
  all_addresses?: string | null;
  lat: number;
  lon: number;
  year: number | null;
  floors: number | null;
  height: number | null;
  area_atemp: number | null;
  footprint_m2: number | null;
  wall_area_m2: number | null;
  use_cat: string | null;
  energy: number | null;      // kWh/m²/yr from the energy certificate
  eclass: string | null;
  has_epc: boolean;
  tabula_period: string | null;
  tabula_u_wall: number | null;
  tabula_u_roof: number | null;
  tabula_u_win: number | null;
  dist_m: number;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${t("Server responded {code}", { code: res.status })}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export const api = {
  geocode: (address: string) =>
    get<{ lat: number; lon: number; display_name: string }>("/geocode", { address, country: "se" }),
  building: (lat: number, lon: number) =>
    get<Building>("/building", { lat: String(lat), lon: String(lon), city_id: "gothenburg" }),
};

/** Rough Gothenburg municipality box: enough to catch addresses in another town. */
export function inGothenburg(lat: number, lon: number) {
  return lat > 57.55 && lat < 57.88 && lon > 11.6 && lon < 12.25;
}
