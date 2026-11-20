/* "Renovation Wizard": which of Poseidon's buildings to renovate first.

   The same method as the main planner (frontend/src/utils/retrofitPriority.ts,
   copied to src/planner/): every building gets a 0–100 priority
     P = wE·E + wF·F + wC·C
   E  energy        — EPSM RC space heating per m² (40 → 0, 140 → 100), so a
                      recorded renovation or an edited U-value changes it
   F  façade        — ML + AI defect load from the façade inspection; left out
                      (weights re-normalised) until a building is inspected
   C  characteristics — age + heated size
   Weights: presets, sliders, or AHP pairwise judgements (with consistency ratio).
   Plus the planner's per-component verdict (renovationRecommendations.ts):
   service life (IVL), façade defects, U-value vs BBR.

   Everything recomputes live: new history, photos, edits or weights. */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useWM } from "../desktop/wm";
import { useLang, buildingUse, locale } from "../i18n";
import { PixelIcon } from "../icons/PixelIcon";
import { EpcChip } from "../ui";
import { openApp, openFacade, openHistory } from "./launch";
import { useStock, entrances, type Row } from "../useStock";
import { getSetting, putSetting } from "../stockStore";
import { inspectStreetView } from "../facadeRun";
import { download, xlsxBlob } from "../xlsx";
import { CRITERION_COLORS, WEIGHT_PRESETS, type CriterionKey, type PriorityResult } from "../planner/retrofitPriority";
import { ASSESSED_COMPONENTS, recommendComponents, type RecBuilding, type RecLevel } from "../planner/renovationRecommendations";
import {
  DEFAULT_WEIGHT_SETTINGS, E_HI, E_LO, hasDefaultU, rankRows, weightsFrom, type WeightMode, type WeightSettings,
} from "../ranking";
import { rcRun, rowResult, type RcBody, type RcRes, type USource } from "../rc";
import { CATALOGUE, MEASURE_BY_CODE, MEASURE_COMPONENTS, U_FIELD, recommendedMeasure, type MeasureComponent } from "../catalogue";
import { useCatalogueVersion } from "../catalogueStore";
import { printReport, reportHtml, saveReport, type ReportContent } from "../report";
import { openReport, reportsChanged } from "./ReportsApps";

type ReportRows = "flagged" | "top20" | "all";

const STEPS = [
  { title: "Buildings & data", blurb: "Which of Poseidon's buildings to rank, and what we know about each. Filter by area, address, year or class; untick a building to leave it out. Adding past renovations or façade photos updates the ranking." },
  { title: "Façades & weights", blurb: "How much energy, façade condition and building characteristics each count, and AI defect detection on façade photos (the façade criterion)." },
  { title: "Ranking", blurb: "Which buildings to renovate first, why, and which parts of each. Flag the buildings to plan measures for." },
  { title: "Measures", blurb: "Recommended measures for the flagged buildings from the renovation catalogue, with their effect on heating (EPSM RC), cost and payback." },
  { title: "Report", blurb: "Save the ranking and measures as a report in the Reports folder, or print it." },
];

const C_LABEL: Record<CriterionKey, string> = { E: "Energy (EPSM RC heating)", F: "Façade condition", C: "Building characteristics" };
const LEVEL_COLOR: Record<RecLevel, string> = { needed: "#c00000", consider: "#b45309", ok: "#2e7d32", unknown: "#808080" };
const COMP_SHORT: Record<string, string> = { Walls: "W", Windows: "Wi", Roof: "R", Floor: "F", "Heating system": "H" };

interface ScopeSettings {
  q: string; area: string; yearFrom: string; yearTo: string; classes: string[];
  excluded: string[];   // row ids ticked off by hand
}
const DEFAULT_SCOPE: ScopeSettings = { q: "", area: "", yearFrom: "", yearTo: "", classes: [], excluded: [] };

/** Saaty slider: −8…8 ↦ 1/9…9 (0 = equally important). */
const toSaaty = (s: number) => (s >= 0 ? s + 1 : 1 / (1 - s));
const fromSaaty = (v: number) => (v >= 1 ? Math.round(v - 1) : -Math.round(1 / v - 1));

export default function Wizard() {
  const wm = useWM();
  const [, t] = useLang();
  const { data, rows, allBodies, st } = useStock();
  const [step, setStep] = useState(0);

  /* ── scope: filters + buildings ticked off by hand (saved, shared) ── */
  const [sc, setSc] = useState<ScopeSettings>(DEFAULT_SCOPE);
  useEffect(() => { getSetting<ScopeSettings>("wizard-scope").then((v) => v && setSc({ ...DEFAULT_SCOPE, ...v })); }, []);
  const updateSc = (patch: Partial<ScopeSettings>) => setSc((s) => {
    const next = { ...s, ...patch };
    void putSetting("wizard-scope", next).catch(() => {});
    return next;
  });
  const classes = useMemo(() => new Set(sc.classes), [sc.classes]);
  const excluded = useMemo(() => new Set(sc.excluded), [sc.excluded]);
  /** Buildings matching the filters (before the hand-ticked exclusions). */
  const filtered = useMemo(() => rows.filter((r) => {
    const ql = sc.q.trim().toLowerCase();
    if (ql && !(`${r.b.addrs ?? r.b.addr ?? ""} ${r.epc.property ?? ""} ${r.b.area ?? ""}`.toLowerCase().includes(ql))) return false;
    if (sc.area && (r.b.area ?? "") !== sc.area) return false;
    if (sc.yearFrom && (r.b.year ?? 0) < Number(sc.yearFrom)) return false;
    if (sc.yearTo && (r.b.year ?? 9999) > Number(sc.yearTo)) return false;
    if (classes.size && !classes.has(r.b.eclass ?? "–")) return false;
    return true;
  }), [rows, sc.q, sc.area, sc.yearFrom, sc.yearTo, classes]);
  const scoped = useMemo(() => filtered.filter((r) => !excluded.has(r.id)), [filtered, excluded]);
  /** Areas and streets in the stock, for the drop-downs. */
  const areas = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => { if (r.b.area) c.set(r.b.area, (c.get(r.b.area) ?? 0) + 1); });
    return [...c].sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [rows]);
  const streets = useMemo(() => [...new Set(rows.flatMap((r) => entrances(r.b).map((a) => a.replace(/\s+\d.*$/, ""))))]
    .sort((a, b) => a.localeCompare(b, "sv")), [rows]);
  const toggleExcluded = (ids: string[], include: boolean) => {
    const n = new Set(excluded);
    ids.forEach((id) => (include ? n.delete(id) : n.add(id)));
    updateSc({ excluded: [...n] });
  };

  /* ── weights (shared, saved on the backend) ── */
  const [ws, setWs] = useState<WeightSettings>(DEFAULT_WEIGHT_SETTINGS);
  useEffect(() => { getSetting<WeightSettings>("priority-weights").then((v) => v && setWs({ ...DEFAULT_WEIGHT_SETTINGS, ...v })); }, []);
  const updateWs = (next: WeightSettings) => { setWs(next); void putSetting("priority-weights", next).catch(() => {}); };
  const { weights, ahp } = useMemo(() => weightsFrom(ws), [ws]);

  /* ── flagged for renovation (shared) ── */
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  useEffect(() => { getSetting<string[]>("flagged").then((v) => v && setFlagged(new Set(v))); }, []);
  const saveFlags = (next: Set<string>) => { setFlagged(next); void putSetting("flagged", [...next]).catch(() => {}); };

  /* ── ranking (the planner's computePriorities, via src/ranking.ts) ── */
  const { ranked, recs } = useMemo(() => {
    const facade = Object.fromEntries(scoped.filter((r) => r.facade).map((r) => [r.id, r.facade!]));
    const ranked = rankRows(scoped, weights, ` ${t("space heating (EPSM RC)")}`);

    // Per-component verdicts. U-values only where they are real data (not a national default).
    const recB: RecBuilding[] = scoped.map((r) => {
      const real = (part: "wall" | "roof" | "win" | "floor") => {
        const s = r.rc?.u_source?.[part] as USource | undefined;
        return s && s !== "default" ? r.rc?.u_used?.[part] ?? null : null;
      };
      return { key: r.id, label: r.b.addr ?? r.id, yearBuilt: r.b.year ?? null, floors: Number(r.v.floors) || null,
        heightM: Number(r.v.height_m) || null, u: { Walls: real("wall"), Windows: real("win"), Roof: real("roof"), Floor: real("floor") } };
    });
    const history = Object.fromEntries(scoped.filter((r) => r.history).map((r) => [r.id, r.history!]));
    const comps = recommendComponents(recB, facade, history, { useBbrTargets: true });
    const recs = new Map<string, Record<string, { level: RecLevel; reasons: string[] }>>();
    for (const c of comps) for (const b of c.buildings) {
      const m = recs.get(b.key) ?? {};
      m[c.component] = { level: b.level, reasons: b.reasons.map((x) => t(x.msg, x.params)) };
      recs.set(b.key, m);
    }
    return { ranked, recs };
  }, [scoped, weights, t]);

  /* ── batch façade inspection ── */
  const [topN, setTopN] = useState(10);
  const [batch, setBatch] = useState<{ done: number; total: number; current: string } | null>(null);
  async function inspectTop() {
    const todo = ranked.filter(({ r }) => !r.facade).slice(0, topN);
    const ok = await wm.msg({ title: "Façade inspection", icon: "warning", buttons: ["Yes", "No"],
      text: t("Capture all four façades of the top {n} uninspected buildings from Street View and run defect detection? Street View is billed per image (roughly 4–12 images per building).", { n: todo.length }) });
    if (ok !== "Yes") return;
    setBatch({ done: 0, total: todo.length, current: "" });
    for (let i = 0; i < todo.length; i++) {
      const { r } = todo[i];
      setBatch({ done: i, total: todo.length, current: r.b.addr ?? r.id });
      const [lat, lon] = r.id.split(",").map(Number);
      await inspectStreetView(r.id, r.b.addr ?? r.id, lat, lon);
    }
    setBatch(null);
  }

  function exportRanking() {
    const head = [t("Rank"), t("Address"), t("Priority (0–100)"), "E", "F", "C", t("Confidence"), t("Why"),
      ...ASSESSED_COMPONENTS.map((c) => t(c)), t("RC heating (kWh/m²·yr)"), t("Year"), t("Energy class"),
      t("Past renovations"), t("Façade inspection"), t("Flagged for renovation")];
    const body = ranked.map(({ p, r }, i) => [
      i + 1, r.b.addr, Math.round(p.P), Math.round(p.scores.E.value),
      p.scores.F.available ? Math.round(p.scores.F.value) : null, Math.round(p.scores.C.value),
      Math.round(p.confidence * 100) / 100, p.drivers.join(" · "),
      ...ASSESSED_COMPONENTS.map((c) => { const v = recs.get(r.id)?.[c]; return v ? `${t(v.level)}: ${v.reasons.join(" ")}` : null; }),
      r.rc?.heating_kwh_m2_yr ?? null, r.b.year ?? null, r.b.eclass ?? null,
      (r.history?.renovations ?? []).map((x) => `${x.component} ${x.year}${x.uValue != null ? ` U${x.uValue}` : ""}`).join("; ") || null,
      r.facade ? `${r.facade.defectCount} / ${r.facade.imageCount}` : null, flagged.has(r.id) ? "✓" : null,
    ]);
    download(xlsxBlob(t("Renovation priority"), head, body, [6, 26, 12, 6, 6, 6, 10, 60, 30, 30, 30, 30, 30, 14, 8, 10, 30, 14, 12]),
      `poseidon_renovation_priority_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ── stats for the Data step ── */
  const stats = useMemo(() => ({
    rc: scoped.filter((r) => r.rc && !r.rc.error).length,
    defU: scoped.filter(hasDefaultU).length,
    hist: scoped.filter((r) => r.history?.renovations.length).length,
    fac: scoped.filter((r) => r.facade).length,
  }), [scoped]);

  /* ── measures for the flagged buildings ─────────────────────────────────── */
  const [heatPrice, setHeatPrice] = useState(0.8);
  const [choices, setChoices] = useState<Record<string, Partial<Record<MeasureComponent, string>>>>({});
  useEffect(() => {
    getSetting<number>("heat-price").then((v) => v != null && setHeatPrice(v));
    getSetting<typeof choices>("measures").then((v) => v && setChoices(v));
  }, []);
  const measureRows = useMemo(() => ranked.filter(({ r }) => flagged.has(r.id)).map(({ r }) => r), [ranked, flagged]);
  const catVer = useCatalogueVersion();
  /** The user's choice, else the suggestion for parts the ranking says need work. */
  const chosen = (rowId: string, c: MeasureComponent): string => {
    const own = choices[rowId]?.[c];
    if (own !== undefined) return own;
    const level = recs.get(rowId)?.[c]?.level;
    return level === "needed" || level === "consider" ? recommendedMeasure(c)?.code ?? "" : "";
  };
  const setChoice = (rowId: string, c: MeasureComponent, code: string) => setChoices((s) => {
    const next = { ...s, [rowId]: { ...(s[rowId] ?? {}), [c]: code } };
    void putSetting("measures", next).catch(() => {});
    return next;
  });

  // EPSM RC with the measures' U-values, recalculated automatically (debounced).
  const [after, setAfter] = useState<Record<string, RcRes>>({});
  const [measureBusy, setMeasureBusy] = useState(false);
  // catVer: an edited price/U in the catalogue re-costs and re-simulates the measures.
  const runKey = JSON.stringify([catVer, measureRows.map((r) => [r.id, MEASURE_COMPONENTS.map((c) => chosen(r.id, c))])]);
  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    const bodies: RcBody[] = [];
    for (const r of measureRows) {
      const u: Partial<Record<string, number>> = {};
      for (const c of MEASURE_COMPONENTS) { const m = MEASURE_BY_CODE.get(chosen(r.id, c)); if (m) u[U_FIELD[c]] = m.u; }
      if (!Object.keys(u).length) continue;
      for (const b of allBodies.filter((x) => r.ids.includes(x.id))) bodies.push({ ...b, edits: { ...b.edits, ...u } });
    }
    if (!bodies.length) { setAfter({}); return; }
    let live = true;
    const h = setTimeout(async () => {
      setMeasureBusy(true);
      const res: Record<string, RcRes> = {};
      for (let i = 0; i < bodies.length; i += 25) {
        try { Object.assign(res, await rcRun(bodies.slice(i, i + 25))); } catch { /* shown as "…" */ }
      }
      if (live) { setAfter(res); setMeasureBusy(false); }
    }, 500);
    return () => { live = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, step, allBodies]);

  const measureTable = useMemo(() => measureRows.map((r) => {
    const area: Record<MeasureComponent, number> = {
      Walls: r.rc?.wall_area_m2 ?? 0, Windows: r.rc?.window_area_m2 ?? 0, Roof: r.rc?.roof_area_m2 ?? 0, Floor: r.rc?.roof_area_m2 ?? 0,
    };
    const partKey: Record<MeasureComponent, "wall" | "win" | "roof" | "floor"> = { Walls: "wall", Windows: "win", Roof: "roof", Floor: "floor" };
    const parts = MEASURE_COMPONENTS.flatMap((c) => {
      const m = MEASURE_BY_CODE.get(chosen(r.id, c));
      return m ? [{ component: c, measure: `${m.code} ${m.label}`, uBefore: r.rc?.u_used?.[partKey[c]] ?? null, uAfter: m.u,
        areaM2: Math.round(area[c]), cost: area[c] * m.costPerM2 }] : [];
    });
    const cost = parts.reduce((s, p) => s + p.cost, 0);
    const before = r.rc?.heating_kwh ?? 0;
    const res = parts.length ? rowResult(r.ids, after) : null;
    const afterKwh = parts.length ? (res && !res.error ? res.heating_kwh ?? null : null) : before;
    const saving = afterKwh == null ? null : before - afterKwh;
    const annual = saving == null ? 0 : saving * heatPrice;
    return { r, parts, cost, before, after: afterKwh, payback: annual > 0 && cost > 0 ? cost / annual : null, annual };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [measureRows, after, heatPrice, runKey]);
  const measureTotals = useMemo(() => ({
    cost: measureTable.reduce((s, m) => s + m.cost, 0),
    savingMWh: measureTable.reduce((s, m) => s + (m.after == null ? 0 : (m.before - m.after) / 1000), 0),
    heatBeforeMWh: measureTable.reduce((s, m) => s + m.before / 1000, 0),
    annualSavingSEK: measureTable.reduce((s, m) => s + m.annual, 0),
  }), [measureTable]);

  const fmtN = (v: number, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const sekShort = (v: number) => (v >= 1e6 ? `${fmtN(v / 1e6, 1)} MSEK` : v >= 1e4 ? `${fmtN(v / 1e3)} kSEK` : `${fmtN(v)} SEK`);

  /* ── report ─────────────────────────────────────────────────────────────── */
  const [reportTitle, setReportTitle] = useState(() => `${t("Renovation priorities")} ${new Date().toISOString().slice(0, 10)}`);
  const [reportRows, setReportRows] = useState<ReportRows>("top20");
  const [savingReport, setSavingReport] = useState(false);
  const reportContent: ReportContent = useMemo(() => {
    const rankRows = ranked.map(({ p, r }, i) => ({ p, r, i }))
      .filter(({ r, i }) => reportRows === "all" || flagged.has(r.id) || (reportRows === "top20" && i < 20));
    const geoFixed = scoped.filter((r) => r.rc?.geometry && r.rc.geometry !== "ok" && r.rc.geometry !== "outline_mismatch").length;
    const geoBad = scoped.filter((r) => r.rc?.geometry === "outline_mismatch").length;
    const scopeBits = [sc.area || t("All areas"), sc.q && `"${sc.q}"`, (sc.yearFrom || sc.yearTo) && `${t("built")} ${sc.yearFrom || "…"}–${sc.yearTo || "…"}`,
      sc.classes.length && `${t("class")} ${sc.classes.join(", ")}`].filter(Boolean).join(" · ");
    return {
      createdAt: new Date().toISOString(),
      scope: { description: scopeBits, buildings: scoped.length, atempM2: Math.round(scoped.reduce((s, r) => s + (r.b.atemp ?? 0), 0)) },
      weights: { ...weights, how: ws.mode === "ahp" ? `AHP, CR ${ahp.CR.toFixed(2)}` : ws.mode === "manual" ? t("Set weights") : t(ws.preset) },
      method: [
        `${t(C_LABEL.E)}: ${t("How much heat the building needs per m² a year, from EPSM RC. {lo} kWh or less gives 0 points, {hi} or more gives 100.", { lo: E_LO, hi: E_HI })}`,
        `${t(C_LABEL.F)}: ${t("Damage found on façade photos. Cracks and bulging count most; damage only the AI model saw counts half. Buildings without photos are ranked without this criterion.")}`,
        `${t(C_LABEL.C)}: ${t("Older and bigger buildings get more points (age 60 %, size 40 %).")}`,
        t("Parts (walls, windows, roof, floor, heating) are judged on age against IVL service lives, façade defects and U-value against the BBR renovation target."),
      ],
      ranking: rankRows.map(({ p, r, i }) => ({
        rank: i + 1, address: r.b.addr ?? r.id, area: r.b.area ?? null, year: r.b.year ?? null, eclass: r.b.eclass ?? null,
        P: p.P, E: p.scores.E.value, F: p.scores.F.available ? p.scores.F.value : null, C: p.scores.C.value,
        confidence: p.confidence, why: p.drivers.join(" · "), heating: r.rc?.heating_kwh_m2_yr ?? null, flagged: flagged.has(r.id),
        parts: Object.fromEntries(ASSESSED_COMPONENTS.map((c) => [c, recs.get(r.id)?.[c]?.level ?? "unknown"])),
      })),
      measures: measureTable.filter((m) => m.parts.length && m.after != null).map((m) => ({
        address: m.r.b.addr ?? m.r.id, parts: m.parts,
        heatBeforeMWh: m.before / 1000, heatAfterMWh: (m.after ?? m.before) / 1000, savingMWh: (m.before - (m.after ?? m.before)) / 1000,
        savingPct: m.before ? ((m.before - (m.after ?? m.before)) / m.before) * 100 : 0,
        cost: m.cost, annualSavingSEK: m.annual, paybackYr: m.payback,
      })),
      totals: measureTable.some((m) => m.parts.length) ? measureTotals : null,
      heatPriceSEK: heatPrice,
      notes: [
        t("Energy figures are space heating from the EPSM RC model with a typical weather year — not metered use, and without hot water."),
        t("{n} buildings use national default U-values for walls, roof or windows because no data exists for them.", { n: stats.defU }),
        t("{a} buildings had floors or height corrected from the energy certificate's heated area (Atemp); {b} have an outline that does not match their certificate and get no energy score.", { a: geoFixed, b: geoBad }),
        t("{n} buildings have façade photos analysed. Street imagery cannot show hairline cracks.", { n: stats.fac }),
        t("Measure prices are Wikells new-build prices for the complete part (replacement); adding insulation to an existing part usually costs less."),
        t("Heat price {p} SEK/kWh is an assumption — replace it with Poseidon's district-heating tariff.", { p: heatPrice }),
        t("Embodied and operational carbon are not included in this report yet."),
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, reportRows, flagged, scoped, sc, weights, ws, ahp, recs, measureTable, measureTotals, heatPrice, stats, t]);
  const reportPreview = useMemo(() => (step === 4 ? reportHtml(reportTitle, reportContent) : ""), [step, reportTitle, reportContent]);

  async function doSaveReport() {
    setSavingReport(true);
    try {
      const saved = await saveReport(reportTitle.trim() || t("Renovation priorities"), reportContent);
      reportsChanged();
      const r = await wm.msg({ title: "Report saved", icon: "info", buttons: ["Open", "OK"],
        text: t("\"{name}\" is saved in the Reports folder.", { name: saved.title }) });
      if (r === "Open") openReport(wm, saved.id, saved.title);
    } catch (e) {
      await wm.msg({ title: "Error", icon: "error", text: <>{t("Could not save the report.")}<br /><span className="small muted">{String((e as Error).message)}</span></> });
    } finally { setSavingReport(false); }
  }

  const bar = (v: number, color: string, w = 60) => (
    <span className="mini-bar" style={{ width: w }}><span style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} /></span>
  );
  const pct = (n: number) => `${Math.round((n / Math.max(1, scoped.length)) * 100)} %`;
  const loading = !data || !st.rowEdits || !st.history;

  return (
    <div className="window-body flush" style={{ margin: 3 }}>
      <div className="wizard">
        <div className="wizard-side">
          <div style={{ fontFamily: "var(--pixel)", fontSize: 17, marginBottom: 8, lineHeight: 1.1, whiteSpace: "pre-line" }}>{t("Renovation\nWizard")}</div>
          {STEPS.map((s, i) => (
            <button key={s.title} className={`step step-btn${i === step ? " on" : ""}${i < step ? " done" : ""}`} onClick={() => setStep(i)}>
              <span style={{ width: 12 }}>{i === step ? "►" : `${i + 1}`}</span><span>{t(s.title)}</span>
            </button>
          ))}
          <div className="small" style={{ marginTop: 12, opacity: 0.9 }}>
            {scoped.length} {t("buildings in scope")}<br />{stats.fac} {t("façades inspected")}<br />{flagged.size} {t("flagged")}
          </div>
          <div style={{ marginTop: "auto", alignSelf: "center" }}><PixelIcon name="wizard" size={64} /></div>
        </div>

        <div className="wizard-main col" style={{ gap: 8 }}>
          <div>
            <h2 className="pixel-heading">{t("Step")} {step + 1}: {t(STEPS[step].title)}</h2>
            <p style={{ margin: 0 }}>{t(STEPS[step].blurb)}</p>
          </div>
          {loading && <div className="muted">{t("Loading…")}</div>}

          {!loading && step === 0 && (
            <>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Filter")}</legend>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <label>{t("Area:")}</label>
                  <select className="field" value={sc.area} onChange={(e) => updateSc({ area: e.target.value })}>
                    <option value="">{t("All areas")} ({rows.length})</option>
                    {areas.map(([a, n]) => <option key={a} value={a}>{a} ({n})</option>)}
                  </select>
                  <label>{t("Address:")}</label>
                  <input className="field" list="wiz-streets" style={{ width: 220 }} value={sc.q}
                    onChange={(e) => updateSc({ q: e.target.value })} placeholder={t("street, address or property")} />
                  <datalist id="wiz-streets">{streets.map((s) => <option key={s} value={s} />)}</datalist>
                  <label>{t("Built from")}</label>
                  <input className="field" style={{ width: 64 }} type="number" value={sc.yearFrom} onChange={(e) => updateSc({ yearFrom: e.target.value })} />
                  <label>{t("to")}</label>
                  <input className="field" style={{ width: 64 }} type="number" value={sc.yearTo} onChange={(e) => updateSc({ yearTo: e.target.value })} />
                </div>
                <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                  <label>{t("Energy class:")}</label>
                  {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                    <label key={c} className="row" style={{ gap: 2 }}>
                      <input type="checkbox" checked={classes.has(c)}
                        onChange={() => updateSc({ classes: classes.has(c) ? sc.classes.filter((x) => x !== c) : [...sc.classes, c] })} />
                      <EpcChip cls={c} />
                    </label>
                  ))}
                  <span className="muted small">{t("(none ticked = all)")}</span>
                  <span className="grow" />
                  <button className="btn" onClick={() => updateSc({ ...DEFAULT_SCOPE })}>{t("Reset")}</button>
                </div>
              </fieldset>
              <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                <span><b>{scoped.length}</b> {t("of")} {rows.length} {t("buildings in scope")} · {new Intl.NumberFormat(locale()).format(Math.round(scoped.reduce((s, r) => s + (r.b.atemp ?? 0), 0)))} m² Atemp</span>
                {filtered.length > scoped.length && <span className="muted">({filtered.length - scoped.length} {t("unticked")})</span>}
                <span>{t("EPSM RC result:")} <b>{stats.rc}</b></span>
                <span className="u-default">{t("National default U-values:")} <b>{stats.defU}</b></span>
                <span>{t("Renovations recorded:")} <b>{stats.hist}</b></span>
                <span>{t("Façades inspected:")} <b>{stats.fac}</b></span>
              </div>
              <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                <table className="list sheet">
                  <thead><tr>
                    <th title={t("Include in the ranking")}>
                      <input type="checkbox" checked={filtered.length > 0 && filtered.every((r) => !excluded.has(r.id))}
                        onChange={(e) => toggleExcluded(filtered.map((r) => r.id), e.target.checked)} />
                    </th>
                    <th>{t("Address")}</th><th>{t("Area")}</th><th className="num">{t("Year")}</th><th>{t("Energy class")}</th>
                    <th className="num">{t("Atemp (m²)")}</th><th className="num">{t("RC heating (kWh/m²·yr)")}</th><th>{t("U-values from")}</th>
                    <th>{t("Past renovations")}</th><th>{t("Façade inspection")}</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map((r) => {
                      const on = !excluded.has(r.id);
                      return (
                        <tr key={r.id} style={on ? undefined : { color: "#808080" }}>
                          <td><input type="checkbox" checked={on} onChange={(e) => toggleExcluded([r.id], e.target.checked)} /></td>
                          <td title={entrances(r.b).join(", ")}>{r.b.addr}</td>
                          <td>{r.b.area ?? "–"}</td>
                          <td className="num">{r.b.year ?? "–"}</td><td><EpcChip cls={r.b.eclass} /></td>
                          <td className="num">{r.b.atemp != null ? new Intl.NumberFormat(locale()).format(Math.round(r.b.atemp)) : "–"}</td>
                          <td className="num">{r.rc ? (r.rc.geometry === "outline_mismatch" ? <span className="u-default">{r.rc.heating_kwh_m2_yr}?</span> : r.rc.heating_kwh_m2_yr) : "…"}</td>
                          <td className={hasDefaultU(r) ? "u-default" : undefined}>{hasDefaultU(r) ? t("National default") : r.rc ? t("Data (TABULA / certificate)") : "…"}</td>
                          <td className="link-cell" onClick={() => openHistory(wm, r.id, r.b.addr ?? r.id)}>
                            {r.history?.renovations.length ? r.history.renovations.map((x) => `${t(x.component)} ${x.year}`).join(", ") : t("+ add")}</td>
                          <td className="link-cell" onClick={() => openFacade(wm, r.id, r.b.addr ?? r.id)}>
                            {r.facade ? (r.facade.defectCount ? `${r.facade.defectCount} ${t("defects")}` : t("no defects")) : t("+ inspect")}</td>
                        </tr>
                      );
                    })}
                    {!filtered.length && <tr><td colSpan={10} className="muted" style={{ padding: 10 }}>{t("No buildings match these filters.")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && step === 1 && (
            <>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Weights: how much each criterion counts")}</legend>
                <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                  {(["preset", "manual", "ahp"] as WeightMode[]).map((m) => (
                    <label key={m} className="row" style={{ gap: 4 }}>
                      <input type="radio" checked={ws.mode === m} onChange={() => updateWs({ ...ws, mode: m })} />
                      {t(m === "preset" ? "Preset" : m === "manual" ? "Set weights" : "Pairwise comparison (AHP)")}
                    </label>
                  ))}
                  {ws.mode === "preset" && (
                    <select className="field" style={{ width: 220 }} value={ws.preset} onChange={(e) => updateWs({ ...ws, preset: e.target.value })}>
                      {Object.keys(WEIGHT_PRESETS).map((k) => <option key={k} value={k}>{t(k)}</option>)}
                    </select>
                  )}
                </div>
                {ws.mode === "ahp" && (
                  <div style={{ marginTop: 6 }}>
                    <div className="small muted">{t("Which criterion matters more, and how much? (Saaty 1–9)")}</div>
                    {([["E", "F"], ["E", "C"], ["F", "C"]] as [CriterionKey, CriterionKey][]).map(([a, b]) => {
                      const k = `${a}>${b}`;
                      const s = fromSaaty(ws.pairs[k] ?? 1);
                      return (
                        <div key={k} className="row" style={{ marginBottom: 2 }}>
                          <span style={{ width: 190, textAlign: "right" }}>{t(C_LABEL[a])}</span>
                          <input type="range" min={-8} max={8} value={-s} style={{ width: 200 }}
                            onChange={(e) => updateWs({ ...ws, pairs: { ...ws.pairs, [k]: toSaaty(-Number(e.target.value)) } })} />
                          <span style={{ width: 190 }}>{t(C_LABEL[b])}</span>
                          <span className="small muted">
                            {s === 0 ? t("equally important") : s > 0 ? `${t(C_LABEL[a])} ${s + 1}× ${t("more important")}` : `${t(C_LABEL[b])} ${-s + 1}× ${t("more important")}`}
                          </span>
                        </div>
                      );
                    })}
                    <div className="small" style={{ color: ahp.consistent ? "var(--good)" : "var(--bad)" }}>
                      {ahp.consistent ? t("Your judgements are consistent") : t("Your judgements contradict each other — adjust them")} (CR = {ahp.CR.toFixed(2)}, {t("should be 0.10 or less")})
                    </div>
                  </div>
                )}
                <table style={{ marginTop: 6, borderSpacing: "0 3px" }}>
                  <tbody>
                    {(["E", "F", "C"] as CriterionKey[]).map((k) => (
                      <tr key={k}>
                        <td style={{ width: 200, verticalAlign: "top" }}><b>{t(C_LABEL[k])}</b></td>
                        <td style={{ width: 230, verticalAlign: "top" }}>
                          {ws.mode === "manual"
                            ? <input type="range" min={0} max={100} value={Math.round(ws.manual[k] * 100)} style={{ width: 200 }}
                                onChange={(e) => updateWs({ ...ws, manual: { ...ws.manual, [k]: Number(e.target.value) / 100 } })} />
                            : bar(weights[k] * 100, CRITERION_COLORS[k], 200)}
                        </td>
                        <td style={{ width: 46, textAlign: "right", verticalAlign: "top" }}><b>{Math.round(weights[k] * 100)} %</b></td>
                        <td className="small" style={{ paddingLeft: 10, verticalAlign: "top" }}>
                          {k === "E" ? t("How much heat the building needs per m² a year, from EPSM RC. {lo} kWh or less gives 0 points, {hi} or more gives 100.", { lo: E_LO, hi: E_HI })
                            : k === "F" ? t("Damage found on façade photos. Cracks and bulging count most; damage only the AI model saw counts half. Buildings without photos are ranked without this criterion.")
                            : t("Older and bigger buildings get more points (age 60 %, size 40 %).")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </fieldset>
              <fieldset className="group col grow" style={{ marginTop: 0, minHeight: 0, gap: 6 }}>
                <legend>{t("Façade inspection")}</legend>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <span>{t("Street View for the top")}</span>
                  <input className="field" style={{ width: 56 }} type="number" min={1} max={50} value={topN}
                    onChange={(e) => setTopN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
                  <span>{t("uninspected buildings of the current ranking")}</span>
                  <button className="btn default" disabled={!!batch} onClick={inspectTop}>{t("Inspect")}</button>
                  <span className="small muted">{t("Street View is billed per image and only the defect counts are kept. For a single building, or to upload your own photos, click its façade cell.")}</span>
                </div>
                {batch && (
                  <div className="col" style={{ gap: 3 }}>
                    <div className="progress"><div style={{ width: `${(batch.done / Math.max(1, batch.total)) * 100}%` }} /></div>
                    <div className="small">{batch.done} / {batch.total} · {batch.current}</div>
                  </div>
                )}
                <div className="sunken-panel grow" style={{ padding: 0, minHeight: 120 }}>
                  <table className="list sheet">
                    <thead><tr><th>{t("Rank")}</th><th>{t("Address")}</th><th>{t("Area")}</th><th>{t("Façade inspection")}</th><th>{t("Defects found")}</th></tr></thead>
                    <tbody>
                      {ranked.map(({ r }, i) => (
                        <tr key={r.id}>
                          <td className="num">{i + 1}</td><td>{r.b.addr}</td><td>{r.b.area ?? "–"}</td>
                          <td className="link-cell" onClick={() => openFacade(wm, r.id, r.b.addr ?? r.id)}>
                            {r.facade ? `${r.facade.imageCount} ${t("photos")}${r.facade.streetviewOnly ? ` (${t("Street View")})` : ""}` : t("+ inspect")}</td>
                          <td style={{ color: r.facade?.defectCount ? "var(--bad)" : undefined }}>
                            {r.facade ? (r.facade.defectCount ? Object.entries(r.facade.byClass).map(([k, n]) => `${n} ${t(k)}`).join(", ") : t("none")) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </fieldset>
            </>
          )}

          {!loading && step === 2 && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn default" onClick={exportRanking}>
                  <span className="row" style={{ gap: 6 }}><PixelIcon name="report" size={16} />{t("Download Excel…")}</span>
                </button>
                <button className="btn" onClick={() => saveFlags(new Set(ranked.slice(0, topN).map(({ r }) => r.id)))}>{t("Flag top")} {topN}</button>
                <button className="btn" disabled={!flagged.size} onClick={() => saveFlags(new Set())}>{t("Clear flags")}</button>
                <button className="btn" onClick={() => openApp(wm, "stocktable")}>{t("Open Building Table")}</button>
                <span className="grow" />
                <span className="small muted">{t("Component verdict")}: <b style={{ color: LEVEL_COLOR.needed }}>■</b> {t("needed")} <b style={{ color: LEVEL_COLOR.consider }}>■</b> {t("consider")} <b style={{ color: LEVEL_COLOR.ok }}>■</b> {t("ok")} <b style={{ color: LEVEL_COLOR.unknown }}>■</b> {t("unknown")}</span>
              </div>
              <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                <table className="list sheet">
                  <thead><tr>
                    <th className="num">#</th><th title={t("Flagged for renovation")}>⚑</th><th>{t("Address")}</th>
                    <th>{t("Priority")}</th><th title={t(C_LABEL.E)}>E</th><th title={t(C_LABEL.F)}>F</th><th title={t(C_LABEL.C)}>C</th>
                    <th>{t("Confidence")}</th><th>{t("Parts")}</th><th>{t("Why")}</th>
                  </tr></thead>
                  <tbody>
                    {ranked.map(({ p, r }, i) => (
                      <RankRow key={r.id} i={i} p={p} r={r} flagged={flagged.has(r.id)} rec={recs.get(r.id)} bar={bar}
                        onFlag={() => { const n = new Set(flagged); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); saveFlags(n); }}
                        onHistory={() => openHistory(wm, r.id, r.b.addr ?? r.id)} onFacade={() => openFacade(wm, r.id, r.b.addr ?? r.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && step === 3 && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span>{measureRows.length} {t("flagged buildings")}</span>
                {!flagged.size && <button className="btn" onClick={() => saveFlags(new Set(ranked.slice(0, topN).map(({ r }) => r.id)))}>{t("Flag top")} {topN}</button>}
                <button className="btn" onClick={() => openApp(wm, "catalogue")}>{t("Open catalogue…")}</button>
                <span className="grow" />
                <label>{t("Heat price (SEK/kWh):")}</label>
                <input className="field" style={{ width: 64 }} type="number" step={0.05} value={heatPrice}
                  onChange={(e) => { const v = Number(e.target.value); setHeatPrice(v); void putSetting("heat-price", v).catch(() => {}); }} />
                <span className="small u-default" title={t("No sourced district-heating price is in the tool yet — enter Poseidon's own tariff.")}>{t("assumption")}</span>
              </div>
              <div className="hint small">
                {t("For each flagged building, the parts the ranking marks as needed or worth considering get the catalogue's suggestion: the cheapest item that meets the BBR renovation target. Change or remove any measure; EPSM RC then recalculates the heating automatically.")}
              </div>
              {measureBusy && <div className="small">{t("EPSM RC: calculating the effect of the measures…")}</div>}
              <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                <table className="list sheet">
                  <thead><tr>
                    <th>{t("Building")}</th>
                    {MEASURE_COMPONENTS.map((c) => <th key={c}>{t(c)}</th>)}
                    <th className="num">{t("Heating before (MWh/yr)")}</th><th className="num">{t("Heating after (MWh/yr)")}</th>
                    <th className="num">{t("Saving")}</th><th className="num">{t("Cost")}</th><th className="num">{t("Payback (years)")}</th>
                  </tr></thead>
                  <tbody>
                    {measureTable.map((m) => (
                      <tr key={m.r.id}>
                        <td title={m.r.b.area ?? ""}>{m.r.b.addr}</td>
                        {MEASURE_COMPONENTS.map((c) => {
                          const level = recs.get(m.r.id)?.[c]?.level ?? "unknown";
                          const code = chosen(m.r.id, c);
                          return (
                            <td key={c} style={{ minWidth: 150 }}>
                              <span className="part-chip" style={{ background: LEVEL_COLOR[level] }} title={`${t(c)}: ${t(level)}`}>{COMP_SHORT[c]}</span>
                              <select className="field" style={{ width: 130, minHeight: 18 }} value={code}
                                onChange={(e) => setChoice(m.r.id, c, e.target.value)}>
                                <option value="">{t("no measure")}</option>
                                {CATALOGUE.filter((x) => x.component === c).sort((a, b) => a.u - b.u).map((x) => (
                                  <option key={x.code} value={x.code}>{`U ${x.u} · ${Math.round(x.costPerM2)} kr/m² · ${x.label}`}</option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                        <td className="num">{fmtN(m.before / 1000, 1)}</td>
                        <td className="num">{m.after == null ? "…" : fmtN(m.after / 1000, 1)}</td>
                        <td className="num"><b>{m.after == null ? "…" : `${fmtN((m.before - m.after) / 1000, 1)} (${fmtN(m.before ? ((m.before - m.after) / m.before) * 100 : 0)} %)`}</b></td>
                        <td className="num">{sekShort(m.cost)}</td>
                        <td className="num">{m.payback == null ? "–" : fmtN(m.payback)}</td>
                      </tr>
                    ))}
                    {!measureTable.length && <tr><td colSpan={10} className="muted" style={{ padding: 10 }}>{t("Flag buildings in the Ranking step to plan measures for them.")}</td></tr>}
                  </tbody>
                </table>
              </div>
              {measureTable.length > 0 && (
                <div className="row" style={{ gap: 16 }}>
                  <b>{t("Total")}:</b>
                  <span>{t("Cost")} {sekShort(measureTotals.cost)}</span>
                  <span>{t("Saving")} {fmtN(measureTotals.savingMWh, 1)} MWh/{t("yr")} ({sekShort(measureTotals.annualSavingSEK)}/{t("yr")})</span>
                  <span>{t("Payback")} {measureTotals.annualSavingSEK > 0 ? fmtN(measureTotals.cost / measureTotals.annualSavingSEK) : "–"} {t("years")}</span>
                  <span className="small muted">{t("Carbon is not included yet.")}</span>
                </div>
              )}
            </>
          )}

          {!loading && step === 4 && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label>{t("Title:")}</label>
                <input className="field" style={{ width: 340 }} value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
                <label>{t("Ranking in the report:")}</label>
                <select className="field" value={reportRows} onChange={(e) => setReportRows(e.target.value as ReportRows)}>
                  <option value="flagged">{t("flagged buildings")}</option>
                  <option value="top20">{t("top 20 + flagged")}</option>
                  <option value="all">{t("all buildings in scope")}</option>
                </select>
                <span className="grow" />
                <button className="btn default" disabled={savingReport} onClick={doSaveReport}>{savingReport ? t("Saving…") : t("Save report")}</button>
                <button className="btn" onClick={() => !printReport(reportTitle, reportContent)
                  && wm.msg({ title: "Print", icon: "warning", text: t("The browser blocked the print window. Allow pop-ups for this site and try again.") })}>{t("Print…")}</button>
                <button className="btn" onClick={() => openApp(wm, "reports")}>{t("Open Reports")}</button>
              </div>
              <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                <iframe title="report preview" srcDoc={reportPreview} style={{ border: 0, width: "100%", height: "100%", background: "#fff" }} />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="hr" style={{ margin: "0 0 2px" }} />
      <div className="wizard-foot">
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("< Back")}</button>
        <button className="btn default" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>{t("Next >")}</button>
      </div>
    </div>
  );
}

function RankRow({ i, p, r, flagged, rec, bar, onFlag, onHistory, onFacade }: {
  i: number; p: PriorityResult; r: Row; flagged: boolean;
  rec: Record<string, { level: RecLevel; reasons: string[] }> | undefined;
  bar: (v: number, color: string, w?: number) => ReactElement;
  onFlag: () => void; onHistory: () => void; onFacade: () => void;
}) {
  const [, t] = useLang();
  const sc = (k: CriterionKey) => p.scores[k].available
    ? <span title={p.scores[k].note}>{bar(p.scores[k].value, CRITERION_COLORS[k], 34)}</span>
    : <span className="muted" title={p.scores[k].note}>—</span>;
  return (
    <tr className={flagged ? "flagged" : undefined}>
      <td className="num">{i + 1}</td>
      <td><input type="checkbox" checked={flagged} onChange={onFlag} /></td>
      <td title={`${buildingUse(r.b.use)} · ${r.b.year ?? "?"}`}>{r.b.addr}</td>
      <td style={{ whiteSpace: "nowrap" }}>{bar(p.P, "var(--brand)", 70)} <b>{Math.round(p.P)}</b></td>
      <td>{sc("E")}</td>
      <td className="link-cell" onClick={onFacade}>{sc("F")}</td>
      <td>{sc("C")}</td>
      <td className="num" title={t("How much of the score rests on real data rather than defaults")}>{Math.round(p.confidence * 100)} %</td>
      <td style={{ whiteSpace: "nowrap" }} className="link-cell" onClick={onHistory} title={t("Click to record past renovations")}>
        {ASSESSED_COMPONENTS.map((c) => {
          const v = rec?.[c];
          return <span key={c} className="part-chip" style={{ background: LEVEL_COLOR[v?.level ?? "unknown"] }}
            title={`${t(c)}: ${t(v?.level ?? "unknown")}\n${(v?.reasons ?? []).join("\n")}`}>{COMP_SHORT[c]}</span>;
        })}
      </td>
      <td className="small" style={{ whiteSpace: "normal", minWidth: 280 }}>{p.drivers.join(" · ")}</td>
    </tr>
  );
}
