/* "Import building list": upload a CSV of addresses → match each to a building
   outline → add the matches to the Poseidon list (then Save, as on the map). */
import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import { useWM } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { openApp } from "./launch";
import { guessColumns, matchAddresses, parseCsv, type ImportRow, type ParsedCsv } from "../csvImport";
import { addMany, loadMapData, saveEdits, statusOf, useEdits, useSync, type MapData } from "../stock";
import { download } from "../xlsx";

export default function CsvImport() {
  const wm = useWM();
  const [, t] = useLang();
  const edits = useEdits();
  const { sync } = useSync();
  const fileRef = useRef<HTMLInputElement>(null);
  const cancel = useRef({ cancelled: false });
  const [data, setData] = useState<MapData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [addrCol, setAddrCol] = useState(0);
  const [numCol, setNumCol] = useState<number | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ImportRow[] | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  useEffect(() => { loadMapData().then(setData); return () => { cancel.current.cancelled = true; }; }, []);

  async function pick(f: File) {
    const text = await f.text();
    const p = parseCsv(text);
    const g = guessColumns(p.header);
    setFileName(f.name); setCsv(p); setHasHeader(g.hasHeader); setAddrCol(g.addr); setNumCol(g.num);
    setResult(null); setAdded(null); setProgress(null);
  }

  const dataRows = csv ? (hasHeader ? csv.rows : [csv.header, ...csv.rows]) : [];
  const ncols = csv ? Math.max(csv.header.length, ...csv.rows.slice(0, 50).map((r) => r.length)) : 0;
  const colLabel = (i: number) => (hasHeader && csv?.header[i]) || `${t("Column")} ${i + 1}`;
  const addresses = dataRows
    .map((r) => [r[addrCol] ?? "", numCol != null ? r[numCol] ?? "" : ""].join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  async function run() {
    if (!data) return;
    cancel.current = { cancelled: false };
    setProgress([0, addresses.length]); setResult(null); setAdded(null);
    const res = await matchAddresses(addresses, data.buildings, (d, n) => setProgress([d, n]), cancel.current);
    setResult(res); setProgress(null);
  }

  const matched = result?.filter((r) => r.building) ?? [];
  const uniq = [...new Map(matched.map((r) => [r.building!.id, r.building!])).values()];
  const already = uniq.filter((b) => { const s = statusOf(b, edits); return s === "boplats" || s === "added"; });
  const toAdd = uniq.filter((b) => !already.includes(b));
  const notFound = result?.filter((r) => !r.building) ?? [];
  const geocodedLeft = progress ? progress[1] - progress[0] : 0;

  function addAll() {
    setAdded(addMany(toAdd));
  }

  function downloadNotFound() {
    const body = ["address", ...notFound.map((r) => `"${r.input.replace(/"/g, '""')}"`)].join("\r\n");
    download(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }), "poseidon_import_not_found.csv");
  }

  return (
    <div className="window-body" style={{ margin: 8, gap: 8 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <PixelIcon name="report" size={32} />
        <div className="col" style={{ gap: 4 }}>
          <b>{t("Add buildings from a CSV file")}</b>
          <div className="small">{t("One row per address, e.g. exported from Excel. Each address is matched to a building on the Poseidon Map and added to the Poseidon list.")}</div>
        </div>
      </div>

      <div className="row">
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        <button className="btn" onClick={() => fileRef.current?.click()}>{t("Choose file…")}</button>
        <span className="small">{fileName ?? t("No file chosen")}</span>
      </div>

      {csv && (
        <fieldset className="group" style={{ marginTop: 0 }}>
          <legend>{t("Columns")}</legend>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              {t("First row is a header")}
            </label>
            <label>{t("Address column:")}</label>
            <select className="field" value={addrCol} onChange={(e) => setAddrCol(Number(e.target.value))}>
              {Array.from({ length: ncols }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
            <label>{t("House number (if separate):")}</label>
            <select className="field" value={numCol ?? ""} onChange={(e) => setNumCol(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">{t("(in the address)")}</option>
              {Array.from({ length: ncols }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {addresses.length} {t("addresses, e.g.")} {addresses.slice(0, 3).join(" · ")}
          </div>
        </fieldset>
      )}

      {csv && !result && !progress && (
        <div className="row">
          <button className="btn default" disabled={!data || !addresses.length} onClick={run}>{t("Match addresses")}</button>
          <span className="small muted">{t("Addresses not found directly are looked up on the map, about one per second.")}</span>
        </div>
      )}

      {progress && (
        <div className="col" style={{ gap: 4 }}>
          <div className="progress"><div style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div>
          <div className="row small">
            {progress[0]} / {progress[1]}{geocodedLeft > 0 && ` · ${t("about")} ${Math.ceil(geocodedLeft * 1.2)} s ${t("left")}`}
            <span className="grow" />
            <button className="btn" onClick={() => { cancel.current.cancelled = true; }}>{t("Stop")}</button>
          </div>
        </div>
      )}

      {result && (
        <>
          <fieldset className="group" style={{ marginTop: 0 }}>
            <legend>{t("Result")}</legend>
            <div className="col small" style={{ gap: 3 }}>
              <div><b>{toAdd.length}</b> {t("buildings to add")}</div>
              <div>{already.length} {t("already on the Poseidon list")}</div>
              <div style={{ color: notFound.length ? "var(--bad)" : undefined }}>{notFound.length} {t("addresses not found")}</div>
            </div>
          </fieldset>
          <div className="sunken-panel grow" style={{ minHeight: 100, padding: 0 }}>
            <table className="list">
              <thead><tr><th>{t("Your address")}</th><th>{t("Building")}</th><th>{t("Matched by")}</th></tr></thead>
              <tbody>
                {result.map((r, i) => (
                  <tr key={i}>
                    <td>{r.input}</td>
                    <td>{r.building?.addr ?? "–"}</td>
                    <td style={{ color: r.how === "not found" ? "var(--bad)" : undefined }}>
                      {r.how === "address" ? t("address") : r.how === "geocoded" ? t("map location") : t("not found")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {added == null ? (
              <button className="btn default" disabled={!toAdd.length} onClick={addAll}>
                {t("Add")} {toAdd.length} {t("buildings to Poseidon")}
              </button>
            ) : (
              <>
                <span className="small"><b>{added}</b> {t("added.")}</span>
                <button className="btn default" disabled={!data || sync !== "unsaved"}
                  onClick={() => data && saveEdits(data)}>{sync === "saved" ? t("Saved") : t("Save")}</button>
                <button className="btn" onClick={() => openApp(wm, "stocktable")}>{t("Open table")}</button>
              </>
            )}
            {notFound.length > 0 && <button className="btn" onClick={downloadNotFound}>{t("Download not found…")}</button>}
          </div>
        </>
      )}
    </div>
  );
}
