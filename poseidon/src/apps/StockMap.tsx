/* "Poseidon Map": Gothenburg with Poseidon's buildings found in the Boplats
   floor plans, every other apartment block as a faint outline, and tools to
   add buildings Poseidon owns that the plans didn't reveal (or reject a wrong
   match). */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLang, buildingUse } from "../i18n";
import { PixelIcon } from "../icons/PixelIcon";
import { useWM } from "../desktop/wm";
import { EpcChip, fmt } from "./Portfolio";
import {
  exportEdits, loadMapData, loadServerEdits, revertEdits, saveEdits, statusOf, toggle, useEdits, useSync,
  type MapBuilding, type MapData, type Status,
} from "../stock";

const STYLE: Record<Status, L.PathOptions> = {
  boplats: { color: "#00303a", weight: 1, fillColor: "#00505a", fillOpacity: 0.8 },
  added:   { color: "#6b4e00", weight: 1.2, fillColor: "#ffc400", fillOpacity: 0.85 },
  removed: { color: "#c00000", weight: 1.2, dashArray: "3 3", fillColor: "#c0c0c0", fillOpacity: 0.5 },
  other:   { color: "#3a3a3a", weight: 1, fillColor: "#808080", fillOpacity: 0.18 },
};
const OTHER_MIN_ZOOM = 14;

function Legend() {
  const [, t] = useLang();
  const sw = (s: Status) => (
    <span style={{ display: "inline-block", width: 14, height: 10, marginRight: 4, verticalAlign: "middle",
      background: STYLE[s].fillColor, border: `1px ${STYLE[s].dashArray ? "dashed" : "solid"} ${STYLE[s].color}`,
      opacity: s === "other" ? 0.7 : 1 }} />
  );
  return (
    <div className="col small" style={{ gap: 3 }}>
      <div>{sw("boplats")}{t("Poseidon (found in Boplats plans)")}</div>
      <div>{sw("added")}{t("Poseidon (added by you)")}</div>
      <div>{sw("removed")}{t("Not Poseidon (removed by you)")}</div>
      <div>{sw("other")}{t("Other apartment blocks")}</div>
    </div>
  );
}

export default function StockMap() {
  const wm = useWM();
  const [, t] = useLang();
  const edits = useEdits();
  const { sync, syncError } = useSync();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapes = useRef(new Map<string, L.Polygon>());
  const others = useRef<L.LayerGroup | null>(null);
  const quickRef = useRef(false);
  const [data, setData] = useState<MapData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<MapBuilding | null>(null);
  const [quick, setQuick] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const [zoom, setZoom] = useState(12);
  quickRef.current = quick;

  useEffect(() => {
    loadMapData().then(setData, (e) => setErr(String(e.message || e)));
    loadServerEdits();
  }, []);

  // Build the map once the data is in.
  useEffect(() => {
    if (!data || !box.current || map.current) return;
    const m = L.map(box.current, { preferCanvas: true, zoomControl: true, attributionControl: true })
      .setView([57.71, 11.97], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(m);
    const renderer = L.canvas({ padding: 0.3 });
    const grpPos = L.layerGroup().addTo(m);
    const grpOther = L.layerGroup();
    others.current = grpOther;
    for (const b of data.buildings) {
      const s = statusOf(b);
      const p = L.polygon(b.poly.map(([lon, lat]) => [lat, lon] as [number, number]), { ...STYLE[s], renderer });
      p.on("click", () => {
        if (quickRef.current) toggle(b);
        setSel(b);
      });
      p.bindTooltip(b.addr ?? "–", { sticky: true, className: "retro-tip" });
      (s === "other" ? grpOther : grpPos).addLayer(p);
      shapes.current.set(b.id, p);
    }
    const pos = data.buildings.filter((b) => b.poseidon);
    if (pos.length) m.fitBounds(L.latLngBounds(pos.flatMap((b) => b.poly.map(([lon, lat]) => [lat, lon] as [number, number]))), { padding: [20, 20] });
    m.on("zoomend", () => setZoom(m.getZoom()));
    setZoom(m.getZoom());
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __stockMap: L.Map }).__stockMap = m;  // for scripted checks
    // Keep tiles filling the window when it is resized or maximised.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; shapes.current.clear(); };
  }, [data]);

  // Restyle when the user's corrections change; move buildings between layers.
  useEffect(() => {
    if (!data || !map.current) return;
    for (const b of data.buildings) {
      const p = shapes.current.get(b.id);
      if (!p) continue;
      const s = statusOf(b, edits);
      p.setStyle(STYLE[s]);
      const inOther = others.current!.hasLayer(p);
      if (s === "other" && !inOther) { p.remove(); others.current!.addLayer(p); }
      if (s !== "other" && inOther) { others.current!.removeLayer(p); p.addTo(map.current); }
    }
  }, [edits, data]);

  // Faint outlines only when zoomed in (and wanted).
  useEffect(() => {
    const m = map.current, g = others.current;
    if (!m || !g) return;
    const want = showOthers && zoom >= OTHER_MIN_ZOOM;
    if (want && !m.hasLayer(g)) g.addTo(m);
    if (!want && m.hasLayer(g)) g.remove();
  }, [showOthers, zoom, data]);

  const counts = useMemo(() => {
    if (!data) return null;
    let boplats = 0, added = 0, removed = 0;
    for (const b of data.buildings) {
      const s = statusOf(b, edits);
      if (s === "boplats") boplats++; else if (s === "added") added++; else if (s === "removed") removed++;
    }
    return { boplats, added, removed };
  }, [data, edits]);

  function zoomToPoseidon() {
    if (!data || !map.current) return;
    const pts = data.buildings.filter((b) => { const s = statusOf(b, edits); return s === "boplats" || s === "added"; })
      .flatMap((b) => b.poly.map(([lon, lat]) => [lat, lon] as [number, number]));
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }

  async function revert() {
    const r = await wm.msg({ title: "Undo changes", icon: "warning", buttons: ["Yes", "No"],
      text: t("Undo the changes you have not saved yet?") });
    if (r === "Yes") revertEdits();
  }

  async function save() {
    if (!data) return;
    const ok = await saveEdits(data);
    if (!ok) {
      await wm.msg({ title: "Error", icon: "error",
        text: <>{t("Could not save to the server. Your changes are kept in this browser; try again.")}<br />
          <span className="small muted">{syncError}</span></> });
    }
  }

  const syncText = {
    loading: t("Loading saved list…"),
    saved: t("All changes saved"),
    unsaved: t("Unsaved changes"),
    saving: t("Saving…"),
    offline: t("Server not reachable – changes kept in this browser"),
  }[sync];

  const selStatus = sel ? statusOf(sel, edits) : null;

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 2px", flexWrap: "wrap" }}>
        <button className="btn" disabled={!data} onClick={zoomToPoseidon}>{t("Zoom to Poseidon")}</button>
        <label className="row" style={{ gap: 4 }}>
          <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
          {t("Show other apartment blocks")}
        </label>
        <label className="row" style={{ gap: 4 }} title={t("Each click marks or unmarks a building as Poseidon")}>
          <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />
          {t("Quick select")}
        </label>
        <span className="grow" />
        <button className="btn default" disabled={!data || (sync !== "unsaved" && sync !== "offline")} onClick={save}>
          {sync === "saving" ? t("Saving…") : t("Save")}
        </button>
        <button className="btn" disabled={sync !== "unsaved"} onClick={revert}>{t("Undo changes")}</button>
        <button className="btn" disabled={!data || !(edits.added.length || edits.removed.length)} onClick={() => data && exportEdits(data)}>{t("Export…")}</button>
      </div>
      <div className="row grow" style={{ alignItems: "stretch", gap: 4, padding: "0 2px", minHeight: 0 }}>
        <div className="sunken-panel grow" style={{ padding: 2, position: "relative" }}>
          <div ref={box} style={{ position: "absolute", inset: 2 }} />
          {!data && (
            <div className="col" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
              {err ? <><PixelIcon name="error" size={32} /><div>{err}</div></> : <div>{t("Loading map…")}</div>}
            </div>
          )}
          {data && showOthers && zoom < OTHER_MIN_ZOOM && (
            <div className="hint small" style={{ position: "absolute", left: 50, top: 8, zIndex: 500 }}>
              {t("Zoom in to see other apartment blocks you can add.")}
            </div>
          )}
        </div>
        <div className="col" style={{ width: 210, flex: "none", overflow: "auto" }}>
          <fieldset className="group" style={{ marginTop: 0 }}>
            <legend>{t("Building")}</legend>
            {!sel ? (
              <div className="small muted">{t("Click a building on the map.")}</div>
            ) : (
              <div className="col" style={{ gap: 4 }}>
                <b style={{ wordBreak: "break-word" }}>{sel.addr ?? "–"}</b>
                {sel.addrs && sel.addrs !== sel.addr && (
                  <div className="small" style={{ maxHeight: 54, overflow: "auto" }}>{sel.addrs.split("|").map((s) => s.trim()).join(", ")}</div>
                )}
                <div className="small">{t("Year built")}: {sel.year ?? "–"} · {t("Floors")}: {sel.floors ?? "–"}</div>
                <div className="small">Atemp: {fmt(sel.atemp)} m² · {buildingUse(sel.use)}</div>
                <div className="small row" style={{ gap: 4 }}>{t("Energy class")}: <EpcChip cls={sel.eclass} /> {sel.energy != null && `${fmt(sel.energy)} ${t("kWh/m²·yr")}`}</div>
                <div className="hr" />
                <div className="small">
                  {selStatus === "boplats" && <>
                    {t("Poseidon: found in")} {sel.listings} {t("Boplats floor plan(s)")}{sel.seen && ` (${t("latest")} ${sel.seen})`}
                    <div className="muted" style={{ marginTop: 3 }}>
                      {sel.match === "geocoded"
                        ? t("Matched by map location (less certain), listing:")
                        : t("Matched by address, listing:")} {sel.listing_addrs?.join(", ")}
                    </div>
                  </>}
                  {selStatus === "added" && t("Poseidon: added by you")}
                  {selStatus === "removed" && t("Removed by you (was matched from Boplats)")}
                  {selStatus === "other" && t("Not marked as Poseidon")}
                </div>
                <button className="btn" onClick={() => toggle(sel)}>
                  {selStatus === "boplats" ? t("Not Poseidon")
                    : selStatus === "removed" ? t("Undo removal")
                    : selStatus === "added" ? t("Remove from Poseidon")
                    : t("Mark as Poseidon")}
                </button>
              </div>
            )}
          </fieldset>
          <fieldset className="group">
            <legend>{t("Legend")}</legend>
            <Legend />
          </fieldset>
          {data && data.unmatched.length > 0 && (
            <fieldset className="group">
              <legend>{t("Not on the map")}</legend>
              <div className="small muted" style={{ marginBottom: 4 }}>{t("Poseidon addresses from Boplats with no building outline:")}</div>
              <div className="small" style={{ maxHeight: 120, overflow: "auto" }}>
                {data.unmatched.map((u) => <div key={u.address}>{u.address}</div>)}
              </div>
            </fieldset>
          )}
        </div>
      </div>
      <div className="status-bar">
        <div className="fixed">{counts ? `${counts.boplats + counts.added} ${t("Poseidon buildings")}` : "…"}</div>
        <div>{counts ? `${counts.boplats} ${t("from Boplats")} · ${counts.added} ${t("added by you")} · ${counts.removed} ${t("removed")}` : ""}</div>
        <div className="fixed" style={{ minWidth: 170, color: sync === "unsaved" || sync === "offline" ? "var(--bad)" : undefined }}>
          {sync === "unsaved" ? "● " : ""}{syncText}
        </div>
      </div>
    </>
  );
}
