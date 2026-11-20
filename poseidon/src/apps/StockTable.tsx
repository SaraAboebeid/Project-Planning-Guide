/* "Building Table": every building currently on the Poseidon list (Boplats
   matches + the user's additions, minus removals) with the open data we hold
   for it — the same columns as Step 2's building table in the main planner —
   plus EPSM RC space-heating results. Cells that feed the RC model can be
   edited; an edit is saved and that building is re-simulated straight away.
   Downloadable as an Excel file. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang, buildingUse, locale } from "../i18n";
import { useWM, type Win } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { EpcChip } from "../ui";
import { openApp, openFacade, openHistory } from "./launch";
import { useSync } from "../stock";
import { download, xlsxBlob, type Cell } from "../xlsx";
import { type ModelField, type RowEdits, type UPart, type USource } from "../rc";
import { useStock, entrances, type Row } from "../useStock";
import { rerunAll, saveRowEdits } from "../stockStore";

/** Building-use codes the model knows (assets/buildings.json use_cat). */
const USE_CODES = ["bostad_flerfamilj", "bostad_enfamilj", "verksamhet", "samhalle", "industri", "ovrigt"];

type Col = {
  key: string; label: string; num?: boolean; w: number;
  get: (r: Row) => Cell;
  show?: (r: Row) => ReactNode;
  title?: string;
  edit?: { field: ModelField; kind: "num" | "use"; step?: number };
  cellTitle?: (r: Row) => string | undefined;   // hover text for a cell
  open?: (r: Row) => void;                       // click opens a window for this building
  hidden?: boolean;   // in the Excel file only
};

function useColumns(): Col[] {
  const [, t] = useLang();
  const wm = useWM();
  const n = (v: unknown, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(d)));
  const f = (v: Cell, d = 0) => v == null || v === "" ? "–"
    : typeof v === "number" ? new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : v;
  /* U-values: show what the model USED (open data, your value, or the fallback
     it chose), coloured by source, so no cell hides an assumption. */
  const SRC: Record<USource, string> = {
    you: t("your value"), recorded: t("recorded renovation"), epc: t("energy certificate"),
    epsm: t("EPSM archetype (building from 2006 or later)"), tabula: t("TABULA, typical for the construction period"),
    default: t("national default: no data for this building"),
  };
  const SRC_SHORT: Record<USource, string> = {
    you: t("You"), recorded: t("Recorded"), epc: t("Certificate"), epsm: t("EPSM archetype"), tabula: "TABULA", default: t("Default"),
  };
  const PART: Record<UPart, string> = { wall: t("wall"), roof: t("roof"), win: t("window"), floor: t("floor") };
  const uVal = (r: Row, field: ModelField, part: UPart): number | null =>
    r.edits[field] != null ? Number(r.edits[field]) : r.rc?.u_used?.[part] ?? (r.base[field] as number | null);
  const uSrc = (r: Row, field: ModelField, part: UPart): USource | null =>
    r.edits[field] != null ? "you" : r.rc?.u_source?.[part] ?? (r.base[field] != null ? "tabula" : null);
  const FIELD_OF: Record<UPart, ModelField> = { wall: "u_wall", roof: "u_roof", win: "u_window", floor: "u_floor" };
  const uSummary = (r: Row): string | null => {
    const by = new Map<USource, UPart[]>();
    for (const p of ["wall", "roof", "win", "floor"] as UPart[]) {
      const s = uSrc(r, FIELD_OF[p], p);
      if (s) { const l = by.get(s); if (l) l.push(p); else by.set(s, [p]); }
    }
    if (!by.size) return null;
    if (by.size === 1) return SRC_SHORT[[...by.keys()][0]];
    return [...by].map(([s, ps]) => `${SRC_SHORT[s]} (${ps.map((p) => PART[p]).join(", ")})`).join("; ");
  };
  function uCol(key: string, label: string, field: ModelField, part: UPart): Col {
    return {
      key, label, num: true, w: 12, edit: { field, kind: "num", step: 0.01 },
      get: (r) => n(uVal(r, field, part), 2),
      show: (r) => {
        const v = uVal(r, field, part), s = uSrc(r, field, part);
        if (v == null) return "–";
        return <span className={s ? `u-${s}` : undefined}>{f(n(v, 2), 2)}{s === "default" ? <sup>d</sup> : s === "epsm" ? <sup>a</sup> : null}</span>;
      },
      cellTitle: (r) => {
        const s = uSrc(r, field, part), v = uVal(r, field, part);
        return v == null ? undefined : `${label}: ${n(v, 2)} — ${s ? SRC[s] : ""}${r.rc ? "" : ` (${t("until EPSM RC has run")})`}`;
      },
    };
  }
  /* Floors/height: the model corrects one when the two disagree in the data. */
  const usedNote = (r: Row, field: "floors" | "height_m"): string | undefined => {
    const used = field === "floors" ? r.rc?.floors_used : r.rc?.height_used;
    const shown = r.v[field];
    if (used == null || shown == null || r.edits[field] != null) return undefined;
    if (Math.abs(Number(used) - Number(shown)) < 0.05) return undefined;
    const fromAtemp = (r.rc?.geometry ?? "").startsWith("floors_from_atemp") || r.rc?.geometry === "height_from_floors";
    return `${t("EPSM RC used")} ${Number(used.toFixed(1))} — ${fromAtemp
      ? t("the open data's floors and height don't fit the certificate's heated area (Atemp), so the model took the floor count from Atemp ÷ footprint and about 3 m per storey. Type a value to override.")
      : t("floors and height disagreed in the open data, so the model corrected one. Type a value to override.")}`;
  };

  const rcCell = (r: Row, val: number | null | undefined, d = 0) =>
    r.rc == null ? <span className="muted">…</span>
      : r.rc.error ? <span style={{ color: "var(--bad)", fontWeight: "bold" }} title={r.rc.error}>!</span>
      : r.rc.geometry === "outline_mismatch"
        ? <b className="u-default" title={t("Unreliable: this outline is far too small or large for the certificate's heated area (Atemp), so the outline is probably not this building. Check it on the Poseidon Map or type the footprint.")}>{f(val ?? null, d)}?</b>
        : <b>{f(val ?? null, d)}</b>;
  const renovText = (r: Row) => (r.history?.renovations ?? [])
    .slice().sort((a, b) => b.year - a.year)
    .map((x) => `${t(x.component)} ${x.year}${x.uValue != null ? ` (U ${x.uValue})` : ""}`).join("; ");
  const facadeText = (r: Row) => {
    const s = r.facade;
    if (!s || !s.imageCount) return null;
    if (!s.defectCount) return `${t("no defects")} (${s.imageCount} ${t("photos")})`;
    return Object.entries(s.byClass).map(([k, c]) => `${c} ${t(k)}`).join(", ") + ` (${s.imageCount} ${t("photos")})`;
  };
  return [
    { key: "addr", label: t("Address"), w: 26, get: (r) => r.b.addr },
    { key: "renov", label: t("Past renovations"), w: 30, get: (r) => renovText(r) || null,
      show: (r) => <span className="link-cell">{renovText(r) || t("+ add")}</span>,
      title: t("Renovations done since construction — click to record one. A U-value recorded here is used by EPSM RC."),
      open: (r) => openHistory(wm, r.id, r.b.addr ?? r.id) },
    { key: "facade", label: t("Façade inspection"), w: 30, get: (r) => facadeText(r),
      show: (r) => <span className="link-cell" style={{ color: r.facade?.defectCount ? "var(--bad)" : undefined }}>{facadeText(r) ?? t("+ inspect")}</span>,
      title: t("AI defect detection on façade photos (Street View or your own) — click to inspect"),
      open: (r) => openFacade(wm, r.id, r.b.addr ?? r.id) },
    { key: "entr", label: t("All entrances"), w: 40, get: (r) => entrances(r.b).join(", "),
      show: (r) => { const e = entrances(r.b); return e.length > 1 ? `${e.length} ${t("entrances")}` : "–"; } },
    { key: "prop", label: t("Property designation"), w: 22, get: (r) => r.epc.property ?? null,
      title: t("Fastighetsbeteckning, from the energy certificate register") },
    { key: "use", label: t("Use"), w: 18, get: (r) => buildingUse(String(r.v.building_use ?? "")),
      edit: { field: "building_use", kind: "use" } },
    { key: "year", label: t("Year"), num: true, w: 8, get: (r) => r.b.year ?? null },
    { key: "height", label: t("Height (m)"), num: true, w: 10, get: (r) => n(r.v.height_m, 1),
      show: (r) => <>{f(n(r.v.height_m, 1), 1)}{usedNote(r, "height_m") && <sup className="u-default">*</sup>}</>,
      cellTitle: (r) => usedNote(r, "height_m"), edit: { field: "height_m", kind: "num", step: 0.1 } },
    { key: "floors", label: t("Floors"), num: true, w: 8, get: (r) => n(r.v.floors),
      show: (r) => <>{f(n(r.v.floors))}{usedNote(r, "floors") && <sup className="u-default">*</sup>}</>,
      cellTitle: (r) => usedNote(r, "floors"), edit: { field: "floors", kind: "num", step: 1 } },
    { key: "floors_used", label: t("Floors used by RC"), num: true, w: 10, get: (r) => n(r.rc?.floors_used), hidden: true },
    { key: "height_used", label: t("Height used by RC (m)"), num: true, w: 12, get: (r) => n(r.rc?.height_used, 1), hidden: true },
    { key: "atemp", label: t("Atemp (m²)"), num: true, w: 11, get: (r) => n(r.b.atemp), show: (r) => f(n(r.b.atemp)) },
    { key: "bodies", label: t("Building bodies"), num: true, w: 10, get: (r) => r.ids.length,
      title: t("Separate building bodies covered by the same energy certificate") },
    { key: "fp", label: t("Footprint (m²)"), num: true, w: 12, get: (r) => n(r.v.footprint_m2),
      show: (r) => f(n(r.v.footprint_m2)), edit: { field: "footprint_m2", kind: "num", step: 1 } },
    { key: "energy", label: t("Certificate energy (kWh/m²·yr)"), num: true, w: 16, get: (r) => n(r.b.energy), show: (r) => f(n(r.b.energy)),
      title: t("Energy performance from the energy certificate: heating, hot water and the building's own electricity") },
    { key: "eclass", label: t("Energy class"), w: 10, get: (r) => r.b.eclass ?? null, show: (r) => <EpcChip cls={r.b.eclass} /> },
    { key: "rc_m2", label: t("RC heating (kWh/m²·yr)"), num: true, w: 15,
      get: (r) => n(r.rc?.heating_kwh_m2_yr, 1), show: (r) => rcCell(r, n(r.rc?.heating_kwh_m2_yr, 1), 1),
      title: t("Space heating from the EPSM RC model (hourly, typical weather year). Excludes hot water, unlike the certificate figure.") },
    { key: "rc_mwh", label: t("RC heating (MWh/yr)"), num: true, w: 13,
      get: (r) => n(r.rc?.heating_kwh != null ? r.rc.heating_kwh / 1000 : null, 1),
      show: (r) => rcCell(r, n(r.rc?.heating_kwh != null ? r.rc.heating_kwh / 1000 : null, 1), 1) },
    { key: "rc_peak", label: t("RC peak heat (kW)"), num: true, w: 12,
      get: (r) => n(r.rc?.peak_heating_kw, 1), show: (r) => rcCell(r, n(r.rc?.peak_heating_kw, 1), 1) },
    { key: "rc_dhw", label: t("RC hot water (MWh/yr)"), num: true, w: 13,
      get: (r) => n(r.rc?.dhw_kwh != null ? r.rc.dhw_kwh / 1000 : null, 1),
      show: (r) => rcCell(r, n(r.rc?.dhw_kwh != null ? r.rc.dhw_kwh / 1000 : null, 1), 1) },
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
    uCol("uwall", t("U-wall (W/m²K)"), "u_wall", "wall"),
    uCol("uroof", t("U-roof (W/m²K)"), "u_roof", "roof"),
    uCol("uwin", t("U-window (W/m²K)"), "u_window", "win"),
    uCol("ufloor", t("U-floor (W/m²K)"), "u_floor", "floor"),
    { key: "usrc", label: t("U-values from"), w: 30, get: (r) => uSummary(r),
      title: t("Where each U-value used by the EPSM RC model came from") },
    { key: "bpn", label: t("Boplats listings"), num: true, w: 10, get: (r) => r.b.bp_listings ?? null },
    { key: "rent", label: t("Avg rent (SEK/month)"), num: true, w: 13, get: (r) => r.b.bp_rent ?? null, show: (r) => f(r.b.bp_rent ?? null) },
    { key: "rentm2", label: t("Avg rent (SEK/m²·month)"), num: true, w: 14, get: (r) => r.b.bp_rent_m2 ?? null, show: (r) => f(r.b.bp_rent_m2 ?? null, 1) },
    { key: "src", label: t("Why on the list"), w: 22,
      get: (r) => r.source === "boplats" ? t("Boplats floor plan") : t("Added by you") },
    { key: "edited", label: t("Your changes"), w: 24,
      get: (r) => Object.keys(r.edits).length ? Object.entries(r.edits).map(([k, v]) => `${k}=${v}`).join("; ") : null,
      show: (r) => Object.keys(r.edits).length ? <span className="edited-mark">{Object.keys(r.edits).length} {t("changed")}</span> : "" },
    { key: "lat", label: t("Latitude"), num: true, w: 10, get: (r) => Number(r.id.split(",")[0]), hidden: true },
    { key: "lon", label: t("Longitude"), num: true, w: 10, get: (r) => Number(r.id.split(",")[1]), hidden: true },
  ];
}

/** Inline editor for one model-input cell. Empty = back to the open-data value. */
function EditCell({ col, row, onCommit, onCancel }: {
  col: Col; row: Row; onCommit: (v: string) => void; onCancel: () => void;
}) {
  const [, t] = useLang();
  const cur = row.v[col.edit!.field];
  const [val, setVal] = useState(cur == null ? "" : String(cur));
  const done = useRef(false);
  const commit = () => { if (!done.current) { done.current = true; onCommit(val); } };
  if (col.edit!.kind === "use") {
    return (
      <select className="field cell-input" autoFocus value={val}
        onChange={(e) => { done.current = true; onCommit(e.target.value); }}
        onBlur={() => !done.current && onCancel()}
        onKeyDown={(e) => e.key === "Escape" && (done.current = true, onCancel())}>
        {USE_CODES.map((c) => <option key={c} value={c}>{buildingUse(c)}</option>)}
        <option value="">{t("(open data value)")}</option>
      </select>
    );
  }
  return (
    <input className="field cell-input" type="number" step={col.edit!.step} autoFocus value={val}
      onChange={(e) => setVal(e.target.value)} onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { done.current = true; onCancel(); }
      }} />
  );
}

export default function StockTable({ win }: { win?: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  const { sync } = useSync();
  const cols = useColumns();
  const { data, err, rows, allBodies, st } = useStock();
  const { prog, loadingSaved, epcState } = st;
  const [filter, setFilter] = useState(String(win?.props?.filter ?? ""));
  // Opened again from elsewhere (e.g. the 3D map's building card) with a new filter.
  const asked = win?.props?.filter;
  useEffect(() => { if (typeof asked === "string") setFilter(asked); }, [asked]);
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: "addr", asc: true });
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: string; col: string } | null>(null);
  const [lockedHint, setLockedHint] = useState<string | null>(null);   // last non-editable column clicked

  async function commitEdit(row: Row, col: Col, raw: string) {
    setEditing(null);
    const field = col.edit!.field;
    const next: RowEdits = { ...row.edits };
    const baseV = row.base[field];
    if (raw === "" || raw == null) delete next[field];
    else if (col.edit!.kind === "use") {
      if (raw === baseV) delete next[field]; else next[field] = raw;
    } else {
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) {
        await wm.msg({ title: "Error", icon: "error", text: t("Enter a number greater than zero, or leave the cell empty to use the open-data value.") });
        return;
      }
      const v = field === "floors" ? Math.round(num) : num;
      if (baseV != null && Math.abs(Number(baseV) - v) < 1e-9) delete next[field]; else next[field] = v;
    }
    if (JSON.stringify(next) === JSON.stringify(row.edits)) return;
    try {
      await saveRowEdits(row.id, next);   // the store re-runs RC for this row
    } catch (e) {
      await wm.msg({ title: "Error", icon: "error",
        text: <>{t("Could not save the change.")}<br /><span className="small muted">{String((e as Error).message)}</span></> });
    }
  }

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
  const totalHeat = shown.reduce((s, r) => s + (r.rc?.heating_kwh ?? 0), 0);
  const visibleCols = cols.filter((c) => !c.hidden);
  const fmtN = (v: number) => new Intl.NumberFormat(locale()).format(Math.round(v));

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 2px", flexWrap: "wrap" }}>
        <button className="btn default" disabled={!shown.length} onClick={exportXlsx}>
          <span className="row" style={{ gap: 6 }}><PixelIcon name="report" size={16} />{t("Download Excel…")}</span>
        </button>
        <button className="btn" onClick={() => openApp(wm, "csvimport")}>{t("Import CSV…")}</button>
        <button className="btn" onClick={() => openApp(wm, "stockmap")}>{t("Open map")}</button>
        <button className="btn" disabled={prog.running || !allBodies.length} onClick={() => rerunAll(allBodies)}>{t("Re-run RC")}</button>
        <span className="grow" />
        <label htmlFor="flt">{t("Filter:")}</label>
        <input id="flt" className="field" style={{ width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder={t("address, year, class…")} />
      </div>
      <div className="hint small" style={{ margin: "0 4px 4px" }}>
        {lockedHint
          ? <><b>{lockedHint}</b>: {t("this column is open data and is not an input to the EPSM RC model, so it can't be edited here. Editable columns have a dotted underline: Use, Height, Floors, Footprint and the U-values.")}</>
          : t("Click a cell with a dotted underline to change it (Use, Height, Floors, Footprint, U-values): those feed the EPSM RC model, and that building is simulated again. Leave a cell empty to go back to the open data.")}
        {sync === "unsaved" && <> <b>{t("The list includes changes you have not saved yet on the Poseidon Map.")}</b></>}
        <div style={{ marginTop: 3 }}>
          {t("U-values show what EPSM RC used:")}{" "}
          <span>{t("black = open data (TABULA / certificate)")}</span>{" · "}
          <span className="u-default">{t("orange")}<sup>d</sup> = {t("national default, no data for this building")}</span>{" · "}
          <span className="u-epsm">{t("purple")}<sup>a</sup> = {t("EPSM archetype (2006+)")}</span>{" · "}
          <span className="edited" style={{ padding: "0 2px" }}>{t("yellow = your value")}</span>
        </div>
      </div>
      {prog.running && (
        <div className="row small" style={{ margin: "0 4px 4px", gap: 6 }}>
          <span>{t("EPSM RC:")} {prog.done} / {prog.total} {t("building bodies")}</span>
          <div className="progress grow" style={{ height: 14, padding: 2 }}>
            <div style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} />
          </div>
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
                  <th key={c.key} className={`${c.num ? "num" : ""}${c.key.startsWith("rc_") ? " rc-col" : ""}${c.edit ? " input-col" : ""}`}
                    title={c.title ?? (c.edit ? t("EPSM RC input — click a cell to change it") : undefined)}
                    onClick={() => setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))}>
                    {c.label}{sort.key === c.key ? (sort.asc ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} className={r.id === sel ? "sel" : ""} onClick={() => setSel(r.id)}>
                  <td className="rownum">{i + 1}</td>
                  {visibleCols.map((c) => {
                    const isEditing = editing?.row === r.id && editing.col === c.key;
                    const changed = c.edit && r.edits[c.edit.field] != null;
                    const baseV = c.edit ? r.base[c.edit.field] : null;
                    return (
                      <td key={c.key}
                        className={[c.num ? "num" : "", c.edit ? "input" : "", changed ? "edited" : "", c.key.startsWith("rc_") ? "rc-col" : ""].join(" ")}
                        title={changed ? `${t("Your value. Open data:")} ${baseV == null ? "–" : c.key === "use" ? buildingUse(String(baseV)) : baseV}`
                          : c.cellTitle?.(r) ? c.cellTitle(r)
                          : c.key === "entr" ? entrances(r.b).join(", ")
                          : c.key.startsWith("rc_") && r.rc?.model_address ? `${t("Modelled outline:")} ${r.rc.model_address}` : undefined}
                        onClick={() => {
                          if (c.open) { setLockedHint(null); c.open(r); }
                          else if (c.edit) { setLockedHint(null); if (!isEditing) setEditing({ row: r.id, col: c.key }); }
                          else setLockedHint(c.label);
                        }}>
                        {isEditing
                          ? <EditCell col={c} row={r} onCommit={(v) => commitEdit(r, c, v)} onCancel={() => setEditing(null)} />
                          : c.show ? c.show(r) : (c.get(r) ?? "–")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="status-bar">
        <div className="fixed">{shown.length} {t("buildings")}</div>
        <div>{t("Total Atemp:")} {fmtN(totalAtemp)} m² · {t("RC heating:")} {fmtN(totalHeat / 1000)} MWh/{t("yr")}</div>
        <div className="fixed" style={{ minWidth: 200, color: prog.failed ? "var(--bad)" : undefined }}>
          {loadingSaved ? t("Loading saved RC results…")
            : prog.running ? t("Simulating…")
            : prog.failed ? t("Some RC runs failed (marked !)")
            : !rows.length || rows.some((r) => r.rc == null) ? t("Waiting for EPSM RC…")
            : t("EPSM RC up to date")}
        </div>
        <div className="fixed" style={{ minWidth: 200 }}>
          {epcState === "loading" || epcState === "idle" ? t("Looking up energy certificates…")
            : epcState === "ok" ? t("Energy certificates: Boverket register")
            : epcState === "unavailable" ? t("Certificate register not installed here")
            : t("Certificate lookup failed")}
        </div>
      </div>
    </>
  );
}
