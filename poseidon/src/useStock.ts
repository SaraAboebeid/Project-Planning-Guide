/* The Poseidon stock as table rows: map list (Boplats matches + the user's
   additions − removals), outlines merged per energy certificate, with the
   user's edits, renovation history, façade inspection, EPSM RC result and
   certificate details for each. Shared by the Building Table and the wizard. */
import { useEffect, useMemo, useState } from "react";
import { loadMapData, loadServerEdits, poseidonBuildings, useEdits, type MapBuilding, type MapData } from "./stock";
import { ensureEpc, ensureRc, initStore, useStore, type EpcInfo } from "./stockStore";
import { rowResult, type ModelField, type RcBody, type RcRes, type RowEdits } from "./rc";
import { recordedUForSimulation } from "./planner/renovationRecommendations";
import type { BuildingHistory, FacadeDefectSummary } from "./planner/types";

/** The model inputs as the table shows them: open data, or the user's value. */
export type Inputs = Record<ModelField, number | string | null>;

export interface Row {
  id: string;              // row key = first outline id (also the key for saved edits/history/façade)
  b: MapBuilding;          // representative outline (footprint summed, height = tallest)
  ids: string[];           // every outline merged into this row
  source: "boplats" | "added";
  epc: EpcInfo;
  base: Inputs;            // open-data values
  edits: RowEdits;         // the user's values (only the changed fields)
  v: Inputs;               // what the model gets: edits over base
  rc: RcRes | null;        // RC result summed over the row's bodies (null = not computed yet)
  history: BuildingHistory | undefined;
  facade: FacadeDefectSummary | undefined;
}

export const entrances = (b: MapBuilding) =>
  [...new Set([b.addr, ...String(b.addrs ?? "").split("|")].map((s) => (s ?? "").trim()).filter(Boolean))];

/* One energy certificate can cover several separate building bodies; each body
   has its own outline but carries the certificate's whole Atemp and energy
   figure. Listing them separately double-counts Atemp, so outlines with the
   same entrance list + certificate figures become one row. */
function mergeBodies(list: { b: MapBuilding; s: string }[]) {
  const groups = new Map<string, { b: MapBuilding; s: string }[]>();
  for (const x of list) {
    const k = x.b.addrs || x.b.addr
      ? `${x.b.addrs ?? x.b.addr}|${x.b.atemp ?? ""}|${x.b.year ?? ""}|${x.b.energy ?? ""}`
      : x.b.id;   // no address: never merge
    const g = groups.get(k);
    if (g) g.push(x); else groups.set(k, [x]);
  }
  return [...groups.values()].map((g) => {
    const first = g[0].b;
    const b: MapBuilding = g.length === 1 ? first : {
      ...first,
      footprint: g.reduce((s, x) => s + (x.b.footprint ?? 0), 0) || null,
      height: Math.max(...g.map((x) => x.b.height ?? 0)) || null,
      floors: Math.max(...g.map((x) => x.b.floors ?? 0)) || null,
    };
    const s = g.some((x) => x.s === "boplats") ? "boplats" : "added";
    return { b, bodies: g.map((x) => x.b), s };
  });
}

export function useStock() {
  const st = useStore();
  const stockEdits = useEdits();
  const [data, setData] = useState<MapData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadMapData().then(setData, (e) => setErr(String(e.message || e)));
    loadServerEdits();
    initStore();
  }, []);

  const byId = useMemo(() => new Map((data?.buildings ?? []).map((b) => [b.id, b])), [data]);
  const groups = useMemo(() => (data ? mergeBodies(poseidonBuildings(data, stockEdits)) : []), [data, stockEdits]);

  /** RC bodies of a row: each outline with its share of the row's edits. */
  const bodiesOf = useMemo(() => (ids: string[], e: RowEdits, rec?: Record<string, number>, atemp?: number | null): RcBody[] => {
    const bs = ids.map((id) => byId.get(id)!).filter(Boolean);
    const fpTotal = bs.reduce((s, b) => s + (b.footprint ?? 0), 0);
    // A body's share of the certificate: by its footprint, like a typed footprint below.
    const share = (b: MapBuilding) => (bs.length > 1 && fpTotal > 0 ? (b.footprint ?? 0) / fpTotal : 1);
    return bs.map((b) => {
      const be: RowEdits = { ...e };
      // A footprint typed for a merged row is the total: share it by each body's own footprint.
      if (e.footprint_m2 != null && bs.length > 1 && fpTotal > 0) {
        be.footprint_m2 = Math.round((Number(e.footprint_m2) * share(b)) * 10) / 10;
      }
      const [lat, lon] = b.id.split(",").map(Number);
      return {
        id: b.id, lat, lon, address: b.addr, edits: be, ...(rec ? { recorded_u: rec } : {}),
        atemp: atemp ? Math.round(atemp * share(b)) : null,
      };
    });
  }, [byId]);

  const ready = !!(data && st.rowEdits && st.history);
  const allBodies = useMemo(() => !ready ? [] : groups.flatMap((g) => {
    const id = g.bodies[0].id;
    return bodiesOf(g.bodies.map((b) => b.id), st.rowEdits![id] ?? {}, recordedUForSimulation(st.history![id]), g.b.atemp);
  }), [ready, groups, st.rowEdits, st.history, bodiesOf]);

  useEffect(() => { if (ready) ensureRc(allBodies); }, [ready, allBodies]);

  // Certificate details only after the saved RC results are in: the first
  // uncached lookup takes a while and holds the backend up meanwhile.
  const addrs = useMemo(() => [...new Set(groups.flatMap(({ b }) => entrances(b)))].sort(), [groups]);
  useEffect(() => { if (st.savedReady && addrs.length) ensureEpc(addrs); }, [st.savedReady, addrs]);

  const rows: Row[] = useMemo(() => groups.map(({ b, bodies, s }) => {
    const id = bodies[0].id;
    const ids = bodies.map((x) => x.id);
    // Building-level certificate info: the newest certificate among its entrances.
    const infos = entrances(b).map((a) => st.epc[a]).filter(Boolean) as EpcInfo[];
    const newest = [...infos].sort((x, y) => String(y.issued ?? "").localeCompare(String(x.issued ?? "")))[0] ?? {};
    const props = [...new Set(infos.map((i) => i.property).filter(Boolean))];
    const base: Inputs = {
      floors: b.floors ?? null, height_m: b.height ?? null, building_use: b.use ?? null,
      footprint_m2: b.footprint ?? null, u_wall: b.u_wall ?? null, u_window: b.u_win ?? null, u_roof: b.u_roof ?? null,
      u_floor: null,   // not in the open data; the column shows what the model used
    };
    const e = st.rowEdits?.[id] ?? {};
    return {
      id, b, ids, source: s as "boplats" | "added",
      epc: { ...newest, system: newest.system ?? infos.find((i) => i.system)?.system ?? null, property: props.join(", ") || null },
      base, edits: e, v: { ...base, ...e } as Inputs,
      rc: rowResult(ids, st.rc),
      history: st.history?.[id], facade: st.facade?.[id],
    };
  }), [groups, st.epc, st.rowEdits, st.rc, st.history, st.facade]);

  return { data, err, rows, allBodies, st };
}
