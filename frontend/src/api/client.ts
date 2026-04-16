/**
 * Thin API client — all calls go through the Vite proxy → FastAPI backend.
 */

const BASE = "/api";

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/* ── Endpoints ── */

import type { EpcSnapshot, EpcPassport, TabulaArchetype, MatchConfidence } from "../types";

export const api = {
  /** Geocode an address → { lat, lon, display_name } */
  geocode: (address: string) =>
    get<{ lat: number; lon: number; display_name: string }>("/geocode", { address }),

  /** Fetch nearby EPC snapshot */
  epcSnapshot: (lat: number, lon: number, radiusM: number) =>
    get<EpcSnapshot>("/epc/snapshot", {
      lat: String(lat),
      lon: String(lon),
      radius_m: String(radiusM),
    }),

  /** Get full EPC building passport */
  epcPassport: (formularId: string) =>
    get<EpcPassport>(`/epc/passport/${formularId}`),

  /** Match TABULA archetype */
  tabulaMatch: (buildingType: string, buildYear: number) =>
    get<{ archetype: TabulaArchetype | null; confidence: MatchConfidence }>("/tabula/match", {
      building_type: buildingType,
      build_year: String(buildYear),
    }),

  /** Boverket Klimatdatabas materials for a renovation component */
  boverketMaterials: (component: string) =>
    get<Record<string, unknown>[]>("/boverket/materials", { component }),

  /** Run sensitivity analysis */
  sensitivity: (params: Record<string, unknown>) =>
    post<Record<string, unknown>>("/sensitivity/run", params),

  /** Health check */
  health: () => get<{ status: string }>("/health"),
};
