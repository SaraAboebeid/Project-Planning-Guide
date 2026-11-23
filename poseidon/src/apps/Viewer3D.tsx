/* "3D Map": the main planner's 3D viewer, made Poseidon-aware.
   The viewer is served from this app's own origin (vite.config.ts), so after
   it loads we inject public/viewer-poseidon/poseidon-theme.css (retro look) and
   poseidon-bridge.js (Poseidon section, colouring, building card) into it.
   The viewer's files are not changed, so the main planner's viewer is untouched.
   We send the Poseidon buildings (status + wizard priority) and act on the
   buttons in its building card. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWM } from "../desktop/wm";
import { useLang } from "../i18n";
import { APPS, openFacade, openHistory } from "./launch";
import { useStock } from "../useStock";
import { getSetting } from "../stockStore";
import { DEFAULT_WEIGHT_SETTINGS, migrateWeights, rankRows, weightsFrom, type WeightSettings } from "../ranking";
import { loadMapData, saveEdits, statusOf, toggle, type MapData } from "../stock";

const BRIDGE_LABELS = [
  "Poseidon stock", "Renovation priority", "Off", "Zoom to Poseidon", "Colour by",
  "Poseidon (found in Boplats plans)", "Poseidon (added by you)", "Other buildings", "low", "high",
  "Renovation priority from the Renovation Wizard (same weights), across the whole Poseidon stock.",
  "The viewer's own colours are shown.", "{n} buildings · {b} from Boplats · {a} added by you",
  "Not on the Poseidon list", "Poseidon: added by you", "Poseidon: found in Boplats floor plans",
  "rank {r} of {n}", "Building Table", "Renovation history", "Façade inspection", "Not Poseidon", "Mark as Poseidon",
  "Ranked buildings (worst first)", "Poseidon buildings, worst first", "Energy class (G worst → A best), then energy use per m². Click a building to fly to it.",
  "Energy use", "no certificate", "certificate", "model", "Close", "Address", "Class",
];

interface BridgeMsg { source: "poseidon-bridge"; type: string; action?: string; rowId?: string | null; lat?: number; lon?: number; address?: string | null; matched?: number; of?: number }

export default function Viewer3D() {
  const wm = useWM();
  const [lang, t] = useLang();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [matched, setMatched] = useState<string | null>(null);
  const { rows } = useStock();
  const [ws, setWs] = useState<WeightSettings>(DEFAULT_WEIGHT_SETTINGS);
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => {
    getSetting<WeightSettings>("priority-weights").then((v) => v && setWs(migrateWeights({ ...DEFAULT_WEIGHT_SETTINGS, ...v })));
    loadMapData().then(setData, () => {});
  }, []);

  /** Every Poseidon outline with its row's status and priority (whole stock, wizard weights). */
  const items = useMemo(() => {
    const { weights } = weightsFrom(ws);
    const ranked = rankRows(rows, weights, "");
    const rankOf = new Map(ranked.map(({ p, r }, i) => [r.id, { P: p.P, rank: i + 1 }]));
    return rows.flatMap((r) => r.ids.map((id) => {
      const [lat, lon] = id.split(",").map(Number);
      const rk = rankOf.get(r.id);
      return { rowId: r.id, lat, lon, status: r.source, label: r.b.addr ?? r.id, P: rk?.P ?? null, rank: rk?.rank ?? null, of: ranked.length,
        // for the "ranked buildings" list: certificate class and energy, and the RC model's heating
        eclass: r.b.eclass ?? null, epcKwh: r.b.energy ?? null, rcKwh: r.rc?.heating_kwh_m2_yr ?? null };
    }));
  }, [rows, ws]);

  const send = (msg: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage({ source: "poseidon-app", ...msg }, window.location.origin);

  // Inject the theme + bridge once the viewer page has loaded.
  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc || doc.getElementById("pz-theme")) return;
    const link = doc.createElement("link");
    link.id = "pz-theme"; link.rel = "stylesheet"; link.href = "/viewer-poseidon/poseidon-theme.css";
    doc.head.appendChild(link);
    const s = doc.createElement("script");
    s.src = "/viewer-poseidon/poseidon-bridge.js";
    doc.body.appendChild(s);
  }

  // Messages from the bridge.
  useEffect(() => {
    async function onMsg(e: MessageEvent<BridgeMsg>) {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || e.data?.source !== "poseidon-bridge") return;
      const m = e.data;
      if (m.type === "ready") setReady(true);
      if (m.type === "matched") setMatched(`${m.matched} / ${m.of}`);
      if (m.type !== "action") return;
      const label = m.address ?? m.rowId ?? "";
      if (m.action === "table") {
        const a = APPS.stocktable;
        wm.open("stocktable", { title: a.title, icon: a.icon, w: a.w, h: a.h, props: { filter: m.address?.split("|")[0].trim() ?? "" } });
      } else if (m.action === "history" && m.rowId) openHistory(wm, m.rowId, label);
      else if (m.action === "facade" && m.rowId) openFacade(wm, m.rowId, label);
      else if (m.action === "toggle") await toggleBuilding(m);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  /** Add the clicked building to the Poseidon list, or take it off — and save. */
  async function toggleBuilding(m: BridgeMsg) {
    if (!data) return;
    const row = m.rowId ? rows.find((r) => r.id === m.rowId) : null;
    let targets = row ? data.buildings.filter((b) => row.ids.includes(b.id)) : [];
    if (!targets.length && m.lat != null && m.lon != null) {
      // Not on the list yet: the map's outline at this spot (apartment blocks only).
      let best = null as (typeof data.buildings)[number] | null, bestD = 6e-5;
      for (const b of data.buildings) {
        const [la, lo] = b.id.split(",").map(Number);
        const d = Math.hypot(la - m.lat, (lo - m.lon) * 0.53);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) targets = [best];
    }
    if (!targets.length) {
      await wm.msg({ title: "Poseidon Map", icon: "info",
        text: t("Only apartment blocks can be added to the Poseidon list, and this building isn't one in the open data. Add it on the Poseidon Map if it should be there.") });
      return;
    }
    const removing = targets.some((b) => { const s = statusOf(b); return s === "boplats" || s === "added"; });
    const r = await wm.msg({ title: "Poseidon Map", icon: "warning", buttons: ["Yes", "No"],
      text: removing ? t("Take {name} off the Poseidon list?", { name: m.address ?? "" }) : t("Add {name} to the Poseidon list?", { name: m.address ?? "" }) });
    if (r !== "Yes") return;
    for (const b of targets) {
      const s = statusOf(b);
      if (removing ? (s === "boplats" || s === "added") : (s === "other" || s === "removed")) toggle(b);
    }
    const ok = await saveEdits(data);
    if (!ok) await wm.msg({ title: "Error", icon: "error", text: t("Could not save to the server. Your changes are kept in this browser; try again.") });
  }

  // Keep the viewer up to date: labels on language change, buildings on data change.
  useEffect(() => {
    if (!ready) return;
    send({ type: "labels", title: t("Poseidon 3D Map"), labels: Object.fromEntries(BRIDGE_LABELS.map((k) => [k, t(k)])) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lang]);
  useEffect(() => {
    if (!ready || !items.length) return;
    const h = setTimeout(() => send({ type: "items", items }), 400);   // edits arrive in bursts
    return () => clearTimeout(h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);

  return (
    <>
      <div className="window-body flush sunken-panel" style={{ padding: 0 }}>
        <iframe ref={frame} title={t("Gothenburg 3D map")} src="/gothenburg_3d.html" onLoad={onLoad}
          style={{ border: 0, width: "100%", height: "100%", background: "#000" }} />
      </div>
      <div className="status-bar">
        <div>{ready ? t("Poseidon layer active") : t("Loading the 3D map…")}</div>
        <div className="fixed" style={{ minWidth: 200 }}>{matched ? `${t("Poseidon outlines shown:")} ${matched}` : ""}</div>
      </div>
    </>
  );
}
