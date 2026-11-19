/* "Building Table": every building currently on the Poseidon list (Boplats
   matches + the user's additions, minus removals) with the open data we hold
   for it — the same columns as Step 2's building table in the main planner —
   downloadable as an Excel file. */
import { useEffect, useMemo, useState } from "react";
import { useLang, buildingUse, locale } from "../i18n";
import { useWM } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { EpcChip } from "./Portfolio";
import { openApp } from "./launch";
import { loadMapData, loadServerEdits, poseidonBuildings, useEdits, useSync, type MapBuilding, type MapData } from "../stock";
import { download, xlsxBlob, type Cell } from "../xlsx";

interface EpcInfo { system?: string | null; issued?: string | null; expires?: string | null; property?: string | null }

interface Row {
  b: MapBuilding;          // representative outline (footprint summed, height = tallest)
  ids: string[];           // every outline merged into this row
  source: "boplats" | "added";
  epc: EpcInfo;
}

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
    // A merged row is from Boplats if any of its bodies was matched there.
    const s = g.some((x) => x.s === "boplats") ? "boplats" : "added";
    return { b, ids: g.map((x) => x.b.id), s };
  });
}

const entrances = (b: MapBuilding) =>
  [...new Set([b.addr, ...String(b.addrs ?? "").split("|")].map((s) => (s ?? "").trim()).filter(Boolean))];

/** Column definitions: English label (via t), value for the sheet, and how to show it. */
type Col = {
  key: string; label: string; num?: boolean; w: number;
  get: (r: Row) => Cell;
  show?: (r: Row) => React.ReactNode;
  title?: string;
};

function useColumns(): Col[] {
  const [, t] = useLang();
  const n = (v: number | null | undefined, d = 0) => (v == null ? null : Number(v.toFixed(d)));
  const f = (v: Cell, d = 0) => v == null || v === "" ? "–"
    : typeof v === "number" ? new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : v;
  return [
    { key: "addr", label: t("Address"), w: 26, get: (r) => r.b.addr },
    { key: "entr", label: t("All entrances"), w: 40, get: (r) => entrances(r.b).join(", "),
      show: (r) => { const e = entrances(r.b); return e.length > 1 ? `${e.length} ${t("entrances")}` : "–"; } },
    { key: "prop", label: t("Property designation"), w: 22, get: (r) => r.epc.property ?? null,
      title: t("Fastighetsbeteckning, from the energy certificate register") },
    { key: "use", label: t("Use"), w: 18, get: (r) => buildingUse(r.b.use) },
    { key: "year", label: t("Year"), num: true, w: 8, get: (r) => r.b.year ?? null },
    { key: "height", label: t("Height (m)"), num: true, w: 10, get: (r) => n(r.b.height, 1), show: (r) => f(n(r.b.height, 1), 1) },
    { key: "floors", label: t("Floors"), num: true, w: 8, get: (r) => r.b.floors ?? null },
    { key: "atemp", label: t("Atemp (m²)"), num: true, w: 11, get: (r) => n(r.b.atemp), show: (r) => f(n(r.b.atemp)) },
    { key: "bodies", label: t("Building bodies"), num: true, w: 10, get: (r) => r.ids.length,
      title: t("Separate building bodies covered by the same energy certificate") },
    { key: "fp", label: t("Footprint (m²)"), num: true, w: 12, get: (r) => n(r.b.footprint), show: (r) => f(n(r.b.footprint)) },
    { key: "energy", label: t("Energy (kWh/m²·yr)"), num: true, w: 14, get: (r) => n(r.b.energy), show: (r) => f(n(r.b.energy)) },
    { key: "eclass", label: t("Energy class"), w: 10, get: (r) => r.b.eclass ?? null, show: (r) => <EpcChip cls={r.b.eclass} /> },
    { key: "issued", label: t("EPC issued"), w: 12, get: (r) => r.epc.issued ?? null },
    { key: "expires", label: t("EPC expires"), w: 12, get: (r) => r.epc.expires ?? null,
      show: (r) => {
        const e = r.epc.expires; if (!e) return "–";
        const today = new Date().toISOString().slice(0, 10);
        const soon = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
        return <span style={{ color: e < today ? "var(--bad)" : e < soon ? "var(--warn)" : undefined, fontWeight: e < soon ? "bold" : undefined }}>{e}</span>;
      } },
    { key: "heat", label: t("Heating system"), w: 18, get: (r) => r.epc.system ?? null },
    { key: "period", label: t("Construction period"), w: 14, get: (r) => r.b.period ?? null },
    { key: "uwall", label: t("U-wall (W/m²K)"), num: true, w: 12, get: (r) => n(r.b.u_wall, 2), show: (r) => f(n(r.b.u_wall, 2), 2) },
    { key: "uroof", label: t("U-roof (W/m²K)"), num: true, w: 12, get: (r) => n(r.b.u_roof, 2), show: (r) => f(n(r.b.u_roof, 2), 2) },
    { key: "uwin", label: t("U-window (W/m²K)"), num: true, w: 13, get: (r) => n(r.b.u_win, 2), show: (r) => f(n(r.b.u_win, 2), 2) },
    { key: "bpn", label: t("Boplats listings"), num: true, w: 10, get: (r) => r.b.bp_listings ?? null },
    { key: "rent", label: t("Avg rent (SEK/month)"), num: true, w: 13, get: (r) => r.b.bp_rent ?? null, show: (r) => f(r.b.bp_rent ?? null) },
    { key: "rentm2", label: t("Avg rent (SEK/m²·month)"), num: true, w: 14, get: (r) => r.b.bp_rent_m2 ?? null, show: (r) => f(r.b.bp_rent_m2 ?? null, 1) },
    { key: "src", label: t("Why on the list"), w: 22,
      get: (r) => r.source === "boplats" ? t("Boplats floor plan") : t("Added by you") },
    { key: "lat", label: t("Latitude"), num: true, w: 10, get: (r) => Number(r.b.id.split(",")[0]), show: () => null },
    { key: "lon", label: t("Longitude"), num: true, w: 10, get: (r) => Number(r.b.id.split(",")[1]), show: () => null },
  ];
}

export default function StockTable() {
  const wm = useWM();
  const [, t] = useLang();
  const edits = useEdits();
  const { sync } = useSync();
  const cols = useColumns();
  const [data, setData] = useState<MapData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [epc, setEpc] = useState<Record<string, EpcInfo>>({});
  const [epcState, setEpcState] = useState<"loading" | "ok" | "unavailable" | "error">("loading");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: "addr", asc: true });
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    loadMapData().then(setData, (e) => setErr(String(e.message || e)));
    loadServerEdits();
  }, []);

  const list = useMemo(() => (data ? poseidonBuildings(data, edits) : []), [data, edits]);

  // Certificate details for every entrance of every listed building, in one request.
  const addrKey = useMemo(() => [...new Set(list.flatMap(({ b }) => entrances(b)))].sort(), [list]);
  useEffect(() => {
    if (!addrKey.length) return;
    let live = true;
    setEpcState("loading");
    fetch("/api/poseidon/epc-details", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresses: addrKey }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { results: Record<string, EpcInfo>; available: boolean }) => {
        if (!live) return;
        setEpc(j.results || {});
        setEpcState(j.available ? "ok" : "unavailable");
      })
      .catch(() => live && setEpcState("error"));
    return () => { live = false; };
  }, [addrKey]);

  const rows: Row[] = useMemo(() => mergeBodies(list).map(({ b, ids, s }) => {
    // Building-level certificate info: the newest certificate among its entrances.
    const infos = entrances(b).map((a) => epc[a]).filter(Boolean) as EpcInfo[];
    const newest = [...infos].sort((x, y) => String(y.issued ?? "").localeCompare(String(x.issued ?? "")))[0] ?? {};
    const props = [...new Set(infos.map((i) => i.property).filter(Boolean))];
    return {
      b, ids, source: s as "boplats" | "added",
      epc: { ...newest, system: newest.system ?? infos.find((i) => i.system)?.system ?? null, property: props.join(", ") || null },
    };
  }), [list, epc]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const col = cols.find((c) => c.key === sort.key) ?? cols[0];
    const out = q ? rows.filter((r) => cols.some((c) => String(c.get(r) ?? "").toLowerCase().includes(q))) : rows.slice();
    out.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), locale(), { numeric: true });
      return sort.asc ? c : -c;
    });
    return out;
  }, [rows, filter, sort, cols]);

  function exportXlsx() {
    const date = new Date().toISOString().slice(0, 10);
    download(
      xlsxBlob(t("Poseidon buildings"), cols.map((c) => c.label), shown.map((r) => cols.map((c) => c.get(r))), cols.map((c) => c.w)),
      `poseidon_buildings_${date}.xlsx`,
    );
  }

  const totalAtemp = shown.reduce((s, r) => s + (r.b.atemp ?? 0), 0);
  const visibleCols = cols.filter((c) => c.key !== "lat" && c.key !== "lon");

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 2px", flexWrap: "wrap" }}>
        <button className="btn default" disabled={!shown.length} onClick={exportXlsx}>
          <span className="row" style={{ gap: 6 }}><PixelIcon name="report" size={16} />{t("Download Excel…")}</span>
        </button>
        <button className="btn" onClick={() => openApp(wm, "csvimport")}>{t("Import CSV…")}</button>
        <button className="btn" onClick={() => openApp(wm, "stockmap")}>{t("Open map")}</button>
        <span className="grow" />
        <label htmlFor="flt">{t("Filter:")}</label>
        <input id="flt" className="field" style={{ width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder={t("address, year, class…")} />
      </div>
      {sync === "unsaved" && (
        <div className="hint small" style={{ margin: "0 4px 4px" }}>
          {t("The list includes changes you have not saved yet on the Poseidon Map.")}
        </div>
      )}
      <div className="sunken-panel grow" style={{ margin: "0 2px", padding: 0 }}>
        {!data ? (
          <div className="col" style={{ padding: 24, alignItems: "center" }}>{err ?? t("Loading…")}</div>
        ) : (
          <table className="list sheet">
            <thead>
              <tr>
                <th className="rownum" />
                {visibleCols.map((c) => (
                  <th key={c.key} className={c.num ? "num" : undefined} title={c.title}
                    onClick={() => setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))}>
                    {c.label}{sort.key === c.key ? (sort.asc ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.b.id} className={r.b.id === sel ? "sel" : ""} onClick={() => setSel(r.b.id)}>
                  <td className="rownum">{i + 1}</td>
                  {visibleCols.map((c) => (
                    <td key={c.key} className={c.num ? "num" : undefined}
                      title={c.key === "entr" ? entrances(r.b).join(", ") : undefined}>
                      {c.show ? c.show(r) : (c.get(r) ?? "–")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="status-bar">
        <div className="fixed">{shown.length} {t("buildings")}</div>
        <div>{t("Total Atemp:")} {new Intl.NumberFormat(locale()).format(Math.round(totalAtemp))} m²</div>
        <div className="fixed" style={{ minWidth: 220 }}>
          {epcState === "loading" ? t("Looking up energy certificates…")
            : epcState === "ok" ? t("Energy certificates: Boverket register")
            : epcState === "unavailable" ? t("Certificate register not installed here")
            : t("Certificate lookup failed")}
        </div>
      </div>
    </>
  );
}
