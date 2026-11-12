/** Compare buildings with similar ones in their municipality (POST /api/benchmark/epc-peers). */

export interface PeerGroup {
  kommun: string;
  category: string;
  category_label: string;
  era: [number, number];
  era_label: string;
}

export interface PeerResult {
  key: string;
  reason?: "no_energy" | "no_category" | "no_year" | "too_few_peers";
  group?: PeerGroup;
  n?: number;
  p10?: number; p25?: number; median?: number; p75?: number; p90?: number;
  /** Share of the group using MORE energy per m² than this building. */
  share_using_more_pct?: number;
}

export interface PeerInput {
  key: string;
  building_use: string | null;
  year: number | null;
  energy_kwh_m2: number | null;
}

export async function fetchEpcPeers(cityId: string, buildings: PeerInput[]) {
  const res = await fetch("/api/benchmark/epc-peers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city_id: cityId, buildings }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `API ${res.status}`);
  return res.json() as Promise<{ kommun: string; source: string; metric: string; results: PeerResult[] }>;
}
