/* EPSM RC runs for the Building Table, through the backend's
   /api/poseidon/rc-run (results cached per building body while its inputs
   are unchanged), plus the table edits that feed the model. */

/** Table fields the RC model reads (backend/poseidon_stock.py MODEL_FIELDS). */
export type ModelField = "floors" | "height_m" | "building_use" | "footprint_m2" | "u_wall" | "u_window" | "u_roof" | "u_floor";
export type RowEdits = Partial<Record<ModelField, number | string>>;

export type UPart = "wall" | "roof" | "win" | "floor";
/** Where a U-value the model used came from (backend/poseidon_stock.py _u_sources). */
export type USource = "you" | "recorded" | "epc" | "epsm" | "tabula" | "default";

export interface RcRes {
  heating_kwh?: number; heating_kwh_m2_yr?: number;
  peak_heating_kw?: number; dhw_kwh?: number; floor_area_m2?: number;
  model_address?: string | null; model_offset_m?: number;
  // what the model actually used
  u_used?: Partial<Record<UPart, number>>;
  u_source?: Partial<Record<UPart, USource>>;
  archetype?: string | null;
  floors_used?: number | null; height_used?: number | null;
  ach?: number; setpoint_c?: number;
  geometry?: Geometry; atemp?: number | null;
  /** Envelope areas the model used (m²) — what measures are costed on. */
  wall_area_m2?: number; window_area_m2?: number; roof_area_m2?: number;
  computed_at?: string; cached?: boolean; error?: string;
}

export interface RcBody {
  id: string; lat: number; lon: number; address: string | null; edits: RowEdits;
  /** U-values from recorded renovations ("wall"/"roof"/"win"/"floor"). */
  recorded_u?: Record<string, number>;
  /** This body's share of the certificate's Atemp (m²): floors/height are checked against it. */
  atemp?: number | null;
}

/** Result of the backend's floors/height check against Atemp (poseidon_stock._atemp_geometry). */
export type Geometry = "ok" | "floors_from_atemp" | "height_from_floors" | "floors_from_atemp+height" | "outline_mismatch";

export async function getBuildingEdits(): Promise<Record<string, RowEdits>> {
  const r = await fetch("/api/poseidon/building-edits");
  if (!r.ok) throw new Error(`building-edits ${r.status}`);
  return r.json();
}

export async function putBuildingEdits(rowId: string, edits: RowEdits): Promise<RowEdits> {
  const r = await fetch(`/api/poseidon/building-edits/${encodeURIComponent(rowId)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `save ${r.status}`);
  return (await r.json()).edits;
}

export async function rcRun(bodies: RcBody[], force = false): Promise<Record<string, RcRes>> {
  const r = await fetch("/api/poseidon/rc-run", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodies, force }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `rc-run ${r.status}`);
  return (await r.json()).results;
}

/** Saved results only — nothing is simulated. `missing` = never run, or inputs changed since. */
export async function rcCached(bodies: RcBody[]): Promise<{ results: Record<string, RcRes>; missing: string[] }> {
  const r = await fetch("/api/poseidon/rc-cached", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodies }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `rc-cached ${r.status}`);
  return r.json();
}

/** Sum a table row's bodies into one result (heat per m² over the summed area). */
export function rowResult(ids: string[], rc: Record<string, RcRes>) {
  const rs = ids.map((id) => rc[id]);
  if (rs.some((x) => !x)) return null;                       // not computed yet
  const err = rs.find((x) => x!.error);
  if (err) return { error: err!.error } as RcRes;
  const sum = (k: keyof RcRes) => rs.reduce((s, x) => s + (Number(x![k]) || 0), 0);
  const area = sum("floor_area_m2");
  const heat = sum("heating_kwh");
  return {
    heating_kwh: heat, floor_area_m2: area, heating_kwh_m2_yr: area ? Math.round((heat / area) * 10) / 10 : undefined,
    peak_heating_kw: sum("peak_heating_kw"), dhw_kwh: sum("dhw_kwh"),
    wall_area_m2: sum("wall_area_m2"), window_area_m2: sum("window_area_m2"), roof_area_m2: sum("roof_area_m2"),
    model_address: rs.map((x) => x!.model_address).filter(Boolean).join(", "),
    model_offset_m: Math.max(...rs.map((x) => x!.model_offset_m ?? 0)),
    // Bodies of one row share a certificate and era, so their inputs match; show the first's.
    u_used: rs[0]!.u_used, u_source: rs[0]!.u_source, archetype: rs[0]!.archetype,
    floors_used: rs[0]!.floors_used, height_used: Math.max(...rs.map((x) => x!.height_used ?? 0)) || null,
    ach: rs[0]!.ach, setpoint_c: rs[0]!.setpoint_c,
    // The row is only as sound as its weakest body.
    geometry: rs.some((x) => x!.geometry === "outline_mismatch") ? "outline_mismatch"
      : rs.find((x) => x!.geometry && x!.geometry !== "ok")?.geometry ?? "ok",
  } as RcRes;
}
