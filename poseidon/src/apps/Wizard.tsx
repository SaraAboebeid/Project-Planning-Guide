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
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
  DEFAULT_WEIGHT_SETTINGS, EQUAL_WEIGHTS, E_HI, E_LO, hasDefaultU, migrateWeights, rankRows, weightsFrom, type WeightMode, type WeightSettings,
} from "../ranking";
import { rcRun, rowResult, type RcBody, type RcRes, type USource } from "../rc";
import { MEASURE_BY_CODE, MEASURE_COMPONENTS, U_FIELD, recommendedMeasure, type Measure, type MeasureComponent } from "../catalogue";
import { BBR_RENOVATION_U } from "../planner/serviceLifeSE";
import { useCatalogueVersion } from "../catalogueStore";
import {
  ASSUMPTIONS, BASE_SYSTEM, CARBON, DEFAULT_PRICES, HEATING_SYSTEMS, PRICE_SCENARIOS, annuityFactor, baselineEval, buildingModel, climateCheck,
  evaluate, measureOptions, optimise, pickFromFront, stageItems, stageTimeline, stageValue, type StageBuilding, type StageItem, type StageSettings, regretMatrix, scaled, type BuildingModel, type Envelope, type OptPoint, type OptRule, type Package, type Prices,
} from "../analysis";
import { printReport, reportHtml, saveReport, type ReportContent, type ReportMeasureRow } from "../report";
import { openReport, reportsChanged } from "./ReportsApps";

type ReportRows = "flagged" | "top20" | "all";

const STEPS = [
  { title: "Buildings & data", blurb: "Which of Poseidon's buildings to rank, and what we know about each. Filter by area, address, year or class; untick a building to leave it out. Adding past renovations or façade photos updates the ranking." },
  { title: "Façades & weights", blurb: "How much energy, façade condition and building characteristics each count, and AI defect detection on façade photos (the façade criterion)." },
  { title: "Ranking", blurb: "Which buildings to renovate first, why, and which parts of each. Flag the buildings to plan measures for." },
  { title: "Measures", blurb: "Measures and heating system for each flagged building: pick them yourself or let the optimiser find the lowest life-cycle cost, the lowest carbon, or the cheapest package that meets the climate goal. The energy model (EPSM) recalculates the heating after renovation." },
  { title: "Climate goal & robustness", blurb: "Do the plans meet Gothenburg's climate goal, and which plan holds up best if energy prices change (minimax regret)?" },
  { title: "Staged plan", blurb: "Spread your plan over the years within a budget. Enter the number of years and the budget; the optimiser decides which measure is done in which year and recalculates the timeline." },
  { title: "Report", blurb: "Save the ranking and measures as a report in the Reports folder, or print it." },
];

const C_LABEL: Record<CriterionKey, string> = { E: "Energy (heating need, energy model)", F: "Façade condition", C: "Building characteristics" };
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
  useEffect(() => { getSetting<WeightSettings>("priority-weights").then((v) => v && setWs(migrateWeights({ ...DEFAULT_WEIGHT_SETTINGS, ...v }))); }, []);
  const updateWs = (next: WeightSettings) => { setWs(next); void putSetting("priority-weights", next).catch(() => {}); };
  const { weights, ahp } = useMemo(() => weightsFrom(ws), [ws]);

  /* ── flagged for renovation (shared) ── */
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  useEffect(() => { getSetting<string[]>("flagged").then((v) => v && setFlagged(new Set(v))); }, []);
  const saveFlags = (next: Set<string>) => { setFlagged(next); void putSetting("flagged", [...next]).catch(() => {}); };

  /* ── ranking (the planner's computePriorities, via src/ranking.ts) ── */
  const { ranked, recs } = useMemo(() => {
    const facade = Object.fromEntries(scoped.filter((r) => r.facade).map((r) => [r.id, r.facade!]));
    const ranked = rankRows(scoped, weights, ` ${t("space heating (energy model)")}`);

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
  const stopBatch = useRef(false);
  async function inspectTop(all = false) {
    const uninspected = ranked.filter(({ r }) => !r.facade);
    const todo = all ? uninspected : uninspected.slice(0, topN);
    if (!todo.length) return;
    const ok = await wm.msg({ title: "Façade inspection", icon: "warning", buttons: ["Yes", "No"],
      text: all
        ? t("Capture all four façades of ALL {n} uninspected buildings in the list from Street View and run defect detection? That is roughly {a}–{b} Street View images, billed per image, and takes a while. You can stop at any time; finished buildings are kept.", { n: todo.length, a: todo.length * 4, b: todo.length * 12 })
        : t("Capture all four façades of the top {n} uninspected buildings from Street View and run defect detection? Street View is billed per image (roughly 4–12 images per building).", { n: todo.length }) });
    if (ok !== "Yes") return;
    stopBatch.current = false;
    setBatch({ done: 0, total: todo.length, current: "" });
    for (let i = 0; i < todo.length; i++) {
      if (stopBatch.current) break;
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
  // Energy prices: district heating (the old "heat-price" setting) and electricity.
  const [heatPrice, setHeatPrice] = useState(DEFAULT_PRICES.district_heating);
  const [elPrice, setElPrice] = useState(DEFAULT_PRICES.electricity);
  type ChoiceKey = MeasureComponent | "Heating";
  const [choices, setChoices] = useState<Record<string, Partial<Record<ChoiceKey, string>>>>({});
  useEffect(() => {
    getSetting<number>("heat-price").then((v) => v != null && setHeatPrice(v));
    getSetting<number>("el-price").then((v) => v != null && setElPrice(v));
    getSetting<typeof choices>("measures").then((v) => v && setChoices(v));
  }, []);
  const prices: Prices = useMemo(() => ({ ...DEFAULT_PRICES, district_heating: heatPrice, electricity: elPrice }), [heatPrice, elPrice]);
  const measureRows = useMemo(() => ranked.filter(({ r }) => flagged.has(r.id)).map(({ r }) => r), [ranked, flagged]);
  const catVer = useCatalogueVersion();
  /** The catalogue's suggestion (cheapest meeting BBR) for parts the ranking says need work; heating kept. */
  const suggested = (rowId: string, c: ChoiceKey): string => {
    if (c === "Heating") return BASE_SYSTEM;
    const level = recs.get(rowId)?.[c]?.level;
    return level === "needed" || level === "consider" ? recommendedMeasure(c)?.code ?? "" : "";
  };
  /** The user's choice, else the suggestion. */
  const chosen = (rowId: string, c: ChoiceKey): string => choices[rowId]?.[c] ?? suggested(rowId, c);
  const saveChoices = (next: typeof choices) => { void putSetting("measures", next).catch(() => {}); return next; };
  const setChoice = (rowId: string, c: ChoiceKey, code: string) =>
    setChoices((s) => saveChoices({ ...s, [rowId]: { ...(s[rowId] ?? {}), [c]: code } }));
  /** Set a whole package (all parts + heating) on several buildings at once. */
  const applyPackages = (byRow: Record<string, Package>) => setChoices((s) => {
    const next = { ...s };
    for (const [rowId, p] of Object.entries(byRow))
      next[rowId] = { ...Object.fromEntries(MEASURE_COMPONENTS.map((c) => [c, p.envelope[c] ?? ""])), Heating: p.heating };
    return saveChoices(next);
  });
  const packageOf = (rowId: string): Package => ({
    envelope: Object.fromEntries(MEASURE_COMPONENTS.map((c) => [c, chosen(rowId, c)]).filter(([, v]) => v)) as Envelope,
    heating: chosen(rowId, "Heating") || BASE_SYSTEM,
  });

  /* Building models for the analysis (RC baseline, areas, U today). */
  const models = useMemo(() => {
    const m = new Map<string, BuildingModel>();
    for (const r of scoped) { const bm = buildingModel(r.id, r.b.addr ?? r.id, r.rc); if (bm) m.set(r.id, bm); }
    return m;
  }, [scoped]);

  /* Optimiser: Pareto fronts per flagged building (computed on demand, cached per catalogue/prices). */
  const [fronts, setFronts] = useState<Record<string, OptPoint[]>>({});
  const [optBusy, setOptBusy] = useState<{ done: number; total: number } | null>(null);
  const [optRule, setOptRule] = useState<OptRule>("lcc");
  useEffect(() => { setFronts({}); }, [catVer, prices]);
  async function ensureFronts(rowIds: string[]): Promise<Record<string, OptPoint[]>> {
    const out: Record<string, OptPoint[]> = { ...fronts };
    const todo = rowIds.filter((id) => !out[id] && models.has(id));
    if (!todo.length) return fronts;               // nothing new: no state change (the step-5 effect depends on fronts)
    for (let i = 0; i < todo.length; i++) {
      setOptBusy({ done: i, total: todo.length });
      await new Promise((res) => setTimeout(res, 0));          // keep the window responsive
      out[todo[i]!] = optimise(models.get(todo[i]!)!, prices);
    }
    setOptBusy(null);
    setFronts(out);
    return out;
  }
  /* Compare window for one building: your plan, the suggestion and the optimiser's three picks. */
  const [compare, setCompare] = useState<{ row: Row; initial: Variant[] } | null>(null);
  async function openCompare(r: Row) {
    const fr = await ensureFronts([r.id]);
    const init: Variant[] = [
      { id: "v0", name: t("Your plan"), pkg: packageOf(r.id) },
      { id: "v1", name: t("Catalogue suggestion"), pkg: {
        envelope: Object.fromEntries(MEASURE_COMPONENTS.map((c) => [c, suggested(r.id, c)]).filter(([, v]) => v)) as Envelope, heating: BASE_SYSTEM } },
    ];
    const names: Record<OptRule, string> = { lcc: "Optimiser: lowest life-cycle cost", carbon: "Optimiser: lowest life-cycle carbon", goal: "Optimiser: cheapest that meets the climate goal" };
    (["lcc", "carbon", "goal"] as OptRule[]).forEach((rule, i) => {
      const p = fr[r.id] ? pickFromFront(fr[r.id]!, rule) : null;
      if (p) init.push({ id: `v${2 + i}`, name: t(names[rule]), pkg: p.pkg });
    });
    setCompare({ row: r, initial: init });
  }

  async function runOptimiser(rowIds: string[], rule: OptRule) {
    const fr = await ensureFronts(rowIds);
    const byRow: Record<string, Package> = {};
    const none: string[] = [];
    for (const id of rowIds) {
      const p = fr[id] ? pickFromFront(fr[id]!, rule) : null;
      if (p) byRow[id] = p.pkg; else none.push(measureRows.find((r) => r.id === id)?.b.addr ?? id);
    }
    applyPackages(byRow);
    if (none.length) await wm.msg({ title: "Optimiser", icon: "info", text: <>{rule === "goal"
      ? t("No package in the catalogue brings these buildings to the climate goal ({goal} kWh/m² primary energy); their measures were left unchanged:", { goal: ASSUMPTIONS.petGoal.value })
      : t("These buildings have no energy model result yet; their measures were left unchanged:")}<br /><span className="small">{none.join(", ")}</span></> });
  }

  // EPSM RC with the measures' U-values, recalculated automatically (debounced).
  const [after, setAfter] = useState<Record<string, RcRes>>({});
  const [measureBusy, setMeasureBusy] = useState(false);
  // catVer: an edited price/U in the catalogue re-costs and re-simulates the measures.
  const runKey = JSON.stringify([catVer, measureRows.map((r) => [r.id, MEASURE_COMPONENTS.map((c) => chosen(r.id, c))])]);
  useEffect(() => {
    if (step < 3) return;
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
    const parts: ReportMeasureRow["parts"] = MEASURE_COMPONENTS.flatMap((c) => {
      const m = MEASURE_BY_CODE.get(chosen(r.id, c));
      return m ? [{ component: c, measure: `${m.code} ${m.label}`, uBefore: r.rc?.u_used?.[partKey[c]] ?? null, uAfter: m.u,
        areaM2: Math.round(area[c]), cost: area[c] * m.costPerM2 }] : [];
    });
    const before = r.rc?.heating_kwh ?? 0;
    const res = parts.length ? rowResult(r.ids, after) : null;
    const afterKwh = parts.length ? (res && !res.error ? res.heating_kwh ?? null : null) : before;
    // Life-cycle view of the whole package (envelope + heating system). The heat
    // after renovation is RC's once it has run; until then the anchored estimate.
    const bm = models.get(r.id);
    const pkg = packageOf(r.id);
    const ev = bm ? evaluate(bm, pkg, prices, afterKwh) : null;
    const base = bm ? baselineEval(bm, prices) : null;
    const climate = bm && ev ? climateCheck(bm, ev) : null;
    const sys = HEATING_SYSTEMS.find((s) => s.id === pkg.heating);
    if (ev && sys && sys.id !== BASE_SYSTEM)
      parts.push({ component: "Heating system", measure: sys.name, uBefore: null, uAfter: null, areaM2: 0, cost: ev.investHeating });
    const cost = parts.reduce((s, p) => s + p.cost, 0);
    const annual = ev && base ? base.opCostYr - ev.opCostYr : 0;
    return { r, parts, cost, before, after: afterKwh, payback: annual > 0 && cost > 0 ? cost / annual : null, annual, ev, base, climate, pkg };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [measureRows, after, prices, runKey, choices, models]);
  const measureTotals = useMemo(() => ({
    cost: measureTable.reduce((s, m) => s + m.cost, 0),
    savingMWh: measureTable.reduce((s, m) => s + (m.after == null ? 0 : (m.before - m.after) / 1000), 0),
    heatBeforeMWh: measureTable.reduce((s, m) => s + m.before / 1000, 0),
    annualSavingSEK: measureTable.reduce((s, m) => s + m.annual, 0),
    embodiedT: measureTable.reduce((s, m) => s + (m.ev?.embodiedKg ?? 0) / 1000, 0),
    lccSavingSEK: measureTable.reduce((s, m) => s + (m.base && m.ev ? m.base.lcc - m.ev.lcc : 0), 0),
    opCo2BeforeT: measureTable.reduce((s, m) => s + (m.base?.opCarbonYr ?? 0) / 1000, 0),
    opCo2AfterT: measureTable.reduce((s, m) => s + (m.ev?.opCarbonYr ?? 0) / 1000, 0),
    meetGoal: measureTable.filter((m) => m.climate?.meetsPet).length,
  }), [measureTable]);

  /* ── climate goal & robustness ──────────────────────────────────────────── */
  // Today's stock in scope against the goal (Atemp-weighted PET).
  const stockClimate = useMemo(() => {
    let a = 0, pet = 0, ok = 0, n = 0;
    for (const bm of models.values()) { const b = baselineEval(bm, prices); a += bm.areaM2; pet += b.petKwhM2 * bm.areaM2; n++; if (b.petKwhM2 <= ASSUMPTIONS.petGoal.value) ok++; }
    return { n, ok, pet: a ? pet / a : null };
  }, [models, prices]);

  // Portfolio strategies for the regret analysis, all on the same anchored
  // estimate so they compare like with like (your plan's RC figures are in Measures).
  const [alpha, setAlpha] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);   // Hurwicz optimism: an advanced setting, hidden by default
  type Strategy = { id: string; label: string; byRow: Record<string, Package> | null; isBaseline?: boolean };
  const strategies: Strategy[] = useMemo(() => {
    const ids = measureRows.map((r) => r.id).filter((id) => models.has(id));
    const from = (f: (id: string) => Package | null) => {
      const out: Record<string, Package> = {};
      for (const id of ids) { const p = f(id); if (!p) return null; out[id] = p; }
      return out;
    };
    const front = (rule: OptRule) => from((id) => (fronts[id] ? pickFromFront(fronts[id]!, rule)?.pkg ?? null : null));
    return [
      { id: "none", label: "Do nothing (reference)", byRow: from(() => ({ envelope: {}, heating: BASE_SYSTEM })), isBaseline: true },
      { id: "yours", label: "Your plan (Measures step)", byRow: from(packageOf) },
      { id: "suggested", label: "Catalogue suggestion (meets the building regulations), keep district heating", byRow: from((id) => ({
          envelope: Object.fromEntries(MEASURE_COMPONENTS.map((c) => [c, suggested(id, c)]).filter(([, v]) => v)) as Envelope, heating: BASE_SYSTEM })) },
      { id: "hp", label: "Ground-source heat pump only, no envelope work", byRow: from(() => ({ envelope: {}, heating: "gshp" })) },
      { id: "lcc", label: "Optimiser: lowest life-cycle cost", byRow: front("lcc") },
      { id: "carbon", label: "Optimiser: lowest life-cycle carbon", byRow: front("carbon") },
      { id: "goal", label: "Optimiser: cheapest that meets the climate goal", byRow: front("goal") },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureRows, models, fronts, choices, recs, catVer]);
  useEffect(() => { if (step === 4) void ensureFronts(measureRows.map((r) => r.id)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step, measureRows, fronts]);

  const decision = useMemo(() => {
    const af = annuityFactor();
    const valid = strategies.filter((s) => s.byRow && Object.keys(s.byRow).length);
    if (valid.length < 2) return null;
    const rows = valid.map((s) => {
      let invest = 0, life = 0, carbon = 0, meet = 0;
      const benefits = PRICE_SCENARIOS.map(() => 0);
      for (const [id, pkg] of Object.entries(s.byRow!)) {
        const bm = models.get(id)!;
        const e0 = evaluate(bm, pkg, prices);
        invest += e0.invest; life += e0.invest + e0.replacementsPV + e0.omYr * af; carbon += e0.lifeCarbonKg;
        if (climateCheck(bm, e0).meetsPet) meet++;
        PRICE_SCENARIOS.forEach((sc, k) => {
          const p = scaled(prices, sc.mult);
          benefits[k]! += (baselineEval(bm, p).opCostYr - evaluate(bm, pkg, p).opCostYr) * af;
        });
      }
      return { id: s.id, label: s.label, isBaseline: s.isBaseline, invest, carbonT: carbon / 1000, meet, n: Object.keys(s.byRow!).length,
        benefits: benefits.map((b) => b - life) };
    });
    const rm = regretMatrix(rows, alpha);
    return { rows: rows.map((r) => ({ ...r, ...rm.rows.find((x) => x.id === r.id)! })), picks: rm.picks, bestPer: rm.bestPer };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategies, models, prices, alpha]);

  const fmtN = (v: number, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const sekShort = (v: number) => (v >= 1e6 ? `${fmtN(v / 1e6, 1)} MSEK` : v >= 1e4 ? `${fmtN(v / 1e3)} kSEK` : `${fmtN(v)} SEK`);

  /* ── staged plan: the measures of every flagged building, timed within a budget ──
     Milestones (climate goals by a year) come first, then as much of the plan as
     fits, then the best timing. The plan is solved for each energy-price future;
     minimax regret says which timing holds up best. Steps already carried out are
     kept fixed ("Advance one year" = a rolling-horizon re-plan). */
  type Milestone = { id: string; year: number; kind: "building" | "portfolio"; value: number | null; enabled: boolean };
  const MILESTONE_INFO: Record<string, { label: string; source: string }> = {
    gbg2030: { label: "Gothenburg 2030: every building's primary energy ≤ {v} kWh/m²", source: "Göteborgs Stad miljö- och klimatprogram 2021–2030: homes 84 kWh/m² primary energy (95 kWh/m² final energy) by 2030" },
    epbd2030: { label: "EU 2030: average primary energy of the plan's buildings −{v} % vs today", source: "EU Energy Performance of Buildings Directive (2024/1275), Article 9: residential stock average primary energy −16 % by 2030 vs 2020 (today's level stands in for 2020)" },
    epbd2035: { label: "EU 2035: average primary energy −{v} % vs today", source: "EU Energy Performance of Buildings Directive (2024/1275), Article 9: −20 to 22 % by 2035 vs 2020" },
    zeb2050: { label: "2050: every building's primary energy ≤ {v} kWh/m²", source: "EU Energy Performance of Buildings Directive: a zero-emission building stock by 2050. Sweden has not set its zero-emission threshold yet and no Gothenburg 2050 target was found — enter Poseidon's own level" },
  };
  const DEFAULT_MILESTONES: Milestone[] = [
    { id: "gbg2030", year: 2030, kind: "building", value: ASSUMPTIONS.petGoal.value, enabled: true },
    { id: "epbd2030", year: 2030, kind: "portfolio", value: 16, enabled: false },
    { id: "epbd2035", year: 2035, kind: "portfolio", value: 20, enabled: false },
    { id: "zeb2050", year: 2050, kind: "building", value: null, enabled: false },
  ];
  type StageState = StageSettings & { urgentFirst: boolean; milestones: Milestone[]; done: Record<string, number>; scenario: string };
  const DEFAULT_STAGE: StageState = {
    startYear: new Date().getFullYear() + 1, years: 10, budget: 20_000_000, carbonPriceSekT: 0, costGrowthPct: 0,
    maxBuildingsPerYear: null, urgentFirst: true, milestones: DEFAULT_MILESTONES, done: {}, scenario: "base",
  };
  const [stage, setStage] = useState<StageState>(DEFAULT_STAGE);
  useEffect(() => {
    getSetting<Partial<StageState>>("staged-settings").then((v) => {
      if (!v) return;
      const ms = DEFAULT_MILESTONES.map((d) => ({ ...d, ...(v.milestones ?? []).find((m) => m.id === d.id) }));
      setStage({ ...DEFAULT_STAGE, ...v, milestones: ms, done: v.done ?? {} });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const updateStage = (p: Partial<StageState>) => setStage((s) => { const n = { ...s, ...p }; void putSetting("staged-settings", n).catch(() => {}); return n; });
  const setMilestone = (id: string, p: Partial<Milestone>) => updateStage({ milestones: stage.milestones.map((m) => (m.id === id ? { ...m, ...p } : m)) });

  /** The plan's steps, priced at one set of energy prices. */
  const buildStages = (p: Prices) => measureTable.flatMap((m) => {
    const bm = models.get(m.r.id);
    if (!bm) return [];
    const rec = recs.get(m.r.id) ?? {};
    const urgent = new Set(Object.entries(rec).filter(([, v]) => v.level === "needed").map(([k]) => k));
    const sb = stageItems(bm, m.pkg, p, m.after, urgent);
    return sb.items.length ? [sb] : [];
  });
  const scenarioStages = useMemo(() => Object.fromEntries(PRICE_SCENARIOS.map((sc) => [sc.key, buildStages(scaled(prices, sc.mult))])) as Record<string, StageBuilding[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measureTable, models, prices, recs]);
  const stageBuildings = scenarioStages.base ?? [];
  const isDone = (id: string) => stage.done[id] != null;

  /** Milestone rows for the solver (need already reduced by finished steps), and what each asks. */
  const milestonePlan = useMemo(() => {
    const rows: { id: string; by: number; need: number; coeffs: [string, number][] }[] = [];
    const info: { m: Milestone; by: number; unreachable: string[] }[] = [];
    for (const m of stage.milestones) {
      if (!m.enabled || m.value == null || m.year < stage.startYear) continue;
      const by = Math.min(stage.years, m.year - stage.startYear + 1);
      const unreachable: string[] = [];
      if (m.kind === "building") {
        for (const b of stageBuildings) {
          const total = (b.base.petKwhM2 - m.value) * b.areaM2;
          if (total <= 0) continue;
          const doneSave = b.items.filter((i) => isDone(i.id)).reduce((s, i) => s + i.savePetKwh, 0);
          const open = b.items.filter((i) => !isDone(i.id));
          if (doneSave + open.reduce((s, i) => s + Math.max(0, i.savePetKwh), 0) < total - 1e-6) unreachable.push(b.address);
          rows.push({ id: `${m.id}|${b.id}`, by, need: total - doneSave, coeffs: open.map((i) => [i.id, i.savePetKwh]) });
        }
      } else {
        const base = stageBuildings.reduce((s, b) => s + b.base.petKwhM2 * b.areaM2, 0);
        const total = (m.value / 100) * base;
        const all = stageBuildings.flatMap((b) => b.items);
        const doneSave = all.filter((i) => isDone(i.id)).reduce((s, i) => s + i.savePetKwh, 0);
        if (all.reduce((s, i) => s + Math.max(0, i.savePetKwh), 0) < total - 1e-6) unreachable.push(t("the plan as a whole"));
        rows.push({ id: m.id, by, need: total - doneSave, coeffs: all.filter((i) => !isDone(i.id)).map((i) => [i.id, i.savePetKwh]) });
      }
      info.push({ m, by, unreachable });
    }
    return { rows, info };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.milestones, stage.startYear, stage.years, stage.done, stageBuildings]);

  type PlanResult = { schedule: Record<string, number | null>; status: string; covered: number; total: number; seconds: number; shortfall: Record<string, number> };
  const [plans, setPlans] = useState<Record<string, PlanResult>>({});
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const planKey = JSON.stringify([{ ...stage, scenario: undefined }, Object.entries(scenarioStages).map(([k, bs]) => [k, bs.map((b) => b.items.map((i) => [i.id, Math.round(i.cost), Math.round(i.saveSekYr)]))])]);
  useEffect(() => {
    if (step !== 5 || !stageBuildings.length || !(stage.years >= 1) || !(stage.budget >= 0)) return;
    let live = true;
    const h = setTimeout(async () => {
      setPlanBusy(true); setPlanErr(null);
      const g = 1 + stage.costGrowthPct / 100;
      const after: [string, string][] = [];
      for (const b of stageBuildings) {
        const env = b.items.filter((i) => i.part !== "Heating");
        const heat = b.items.find((i) => i.part === "Heating");
        if (heat) for (const e of env) after.push([e.id, heat.id]);
        const wall = b.items.find((i) => i.part === "Walls"), win = b.items.find((i) => i.part === "Windows");
        if (wall && win) after.push([wall.id, win.id]);
      }
      const solveFor = async (key: string): Promise<[string, PlanResult]> => {
        const items = scenarioStages[key]!.flatMap((b) => b.items.filter((it) => !isDone(it.id)).map((it) => ({
          id: it.id, building: b.id, cost0: it.cost,
          costs: Array.from({ length: stage.years }, (_, y) => it.cost * Math.pow(g, y)),
          // Deferring a part that is past its service life is charged 3 % of its cost a year (risk of failure, emergency repair).
          values: Array.from({ length: stage.years }, (_, y) => stageValue(it, y, stage) - (stage.urgentFirst && it.urgent ? 0.03 * it.cost * y : 0)),
        })));
        // A finished step no longer constrains the order: drop rules that involve it.
        const open = after.filter(([a, b]) => !isDone(a) && !isDone(b));
        const r = await fetch("/api/poseidon/staged-plan", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ years: stage.years, budget: stage.budget, items, after: open, max_buildings_per_year: stage.maxBuildingsPerYear || null,
            milestones: milestonePlan.rows }) });
        const j = await r.json();
        if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : `HTTP ${r.status}`);
        return [key, j];
      };
      try {
        const res = await Promise.all(PRICE_SCENARIOS.map((sc) => solveFor(sc.key)));
        if (live) setPlans(Object.fromEntries(res));
      } catch (e) { if (live) setPlanErr((e as Error).message); }
      finally { if (live) setPlanBusy(false); }
    }, 600);
    return () => { live = false; clearTimeout(h); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, step]);

  const plan: PlanResult | null = plans[stage.scenario] ?? plans.base ?? null;
  /** The schedule with finished steps placed before the start (they count from year one). */
  const fullSchedule = useMemo(() => {
    if (!plan) return null;
    const s: Record<string, number | null> = { ...plan.schedule };
    for (const id of Object.keys(stage.done)) s[id] = -1;
    return s;
  }, [plan, stage.done]);
  const timeline = useMemo(() => (fullSchedule ? stageTimeline(stageBuildings, fullSchedule, stage) : null), [fullSchedule, stageBuildings, stage]);
  const planCost = stageBuildings.reduce((s, b) => s + b.items.filter((i) => !isDone(i.id)).reduce((a, i) => a + i.cost, 0), 0);
  const doneItems = stageBuildings.flatMap((b) => b.items.filter((i) => isDone(i.id)));
  const unscheduled = plan ? stageBuildings.flatMap((b) => b.items.filter((i) => !isDone(i.id) && plan.schedule[i.id] == null)) : [];

  /** Where each milestone stands with the shown plan. */
  const milestoneStatus = useMemo(() => {
    if (!fullSchedule) return [];
    return milestonePlan.info.map(({ m, unreachable }) => {
      const doneBy = (i: StageItem) => { const y = fullSchedule[i.id]; return y != null && stage.startYear + y <= m.year; };
      if (m.kind === "building") {
        let ok = 0;
        for (const b of stageBuildings) {
          const pet = b.base.petKwhM2 * b.areaM2 - b.items.filter(doneBy).reduce((s, i) => s + i.savePetKwh, 0);
          if (pet / b.areaM2 <= (m.value ?? 0) + 1e-9) ok++;
        }
        return { m, unreachable, text: t("{ok} of {n} buildings meet it by {y}", { ok, n: stageBuildings.length, y: m.year }), met: ok === stageBuildings.length };
      }
      const base = stageBuildings.reduce((s, b) => s + b.base.petKwhM2 * b.areaM2, 0);
      const saved = stageBuildings.flatMap((b) => b.items).filter(doneBy).reduce((s, i) => s + i.savePetKwh, 0);
      const pct = base ? (saved / base) * 100 : 0;
      return { m, unreachable, text: t("−{p} % by {y} (goal −{g} %)", { p: Math.round(pct), y: m.year, g: m.value ?? 0 }), met: pct + 1e-9 >= (m.value ?? 0) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSchedule, milestonePlan, stageBuildings, stage.startYear]);

  /** Minimax regret over the price futures: each future's optimal timing, judged in every future. */
  const stageRegret = useMemo(() => {
    if (PRICE_SCENARIOS.some((sc) => !plans[sc.key])) return null;
    const valueIn = (sched: Record<string, number | null>, sk: string) =>
      (scenarioStages[sk] ?? []).flatMap((b) => b.items).reduce((s, it) => {
        const y = sched[it.id];
        return y == null || isDone(it.id) ? s : s + stageValue(it, y, stage);
      }, 0);
    const options = [
      { id: "none", label: "Nothing more done (reference)", isBaseline: true, benefits: PRICE_SCENARIOS.map(() => 0) },
      ...PRICE_SCENARIOS.map((p) => ({ id: p.key, label: p.label, benefits: PRICE_SCENARIOS.map((s) => valueIn(plans[p.key]!.schedule, s.key)) })),
    ];
    return regretMatrix(options, alpha);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, scenarioStages, stage, alpha]);

  /** Rolling horizon: the first plan year's steps are recorded as done, the plan moves on a year. */
  function advanceYear() {
    if (!plan) return;
    const first = stageBuildings.flatMap((b) => b.items).filter((i) => !isDone(i.id) && plan.schedule[i.id] === 0);
    const spent = first.reduce((s, i) => s + i.cost, 0);
    updateStage({
      done: { ...stage.done, ...Object.fromEntries(first.map((i) => [i.id, stage.startYear])) },
      startYear: stage.startYear + 1, years: Math.max(1, stage.years - 1), budget: Math.max(0, stage.budget - spent),
    });
  }

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
        `${t(C_LABEL.E)}: ${t("How much heat the building needs per m² a year, from the energy model (EPSM). {lo} kWh or less gives 0 points, {hi} or more gives 100.", { lo: E_LO, hi: E_HI })}`,
        `${t(C_LABEL.F)}: ${t("Damage found on façade photos. Cracks and bulging count most; damage only the AI model saw counts half. Buildings without photos are ranked without this criterion.")}`,
        `${t(C_LABEL.C)}: ${t("Older and bigger buildings get more points (age 60 %, size 40 %).")}`,
        t("Parts (walls, windows, roof, floor, heating) are judged on age against typical service lives (IVL Swedish Environmental Research Institute), façade defects and U-value against the renovation requirement in the Swedish building regulations."),
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
        heating: m.ev?.system.name, embodiedT: m.ev ? m.ev.embodiedKg / 1000 : undefined,
        opCo2BeforeT: m.base ? m.base.opCarbonYr / 1000 : undefined, opCo2AfterT: m.ev ? m.ev.opCarbonYr / 1000 : undefined,
        lccSavingSEK: m.base && m.ev ? m.base.lcc - m.ev.lcc : undefined,
        petBefore: m.climate?.petBase, petAfter: m.climate?.pet, meetsGoal: m.climate?.meetsPet,
      })),
      totals: measureTable.some((m) => m.parts.length) ? measureTotals : null,
      heatPriceSEK: heatPrice,
      elPriceSEK: elPrice,
      studyPeriodYr: ASSUMPTIONS.studyPeriodYr.value,
      climate: {
        goal: "Gothenburg's climate goal for homes", basis: "Primary energy number of heating and hot water (weighted by energy source) at or below 84 kWh/m² — the city's housing companies' translation of the city's −30 % primary energy goal for 2030.",
        source: ASSUMPTIONS.petGoal.source, petGoal: ASSUMPTIONS.petGoal.value, stockPet: stockClimate.pet, stockOk: stockClimate.ok, stockN: stockClimate.n,
      },
      decision: decision ? {
        scenarios: PRICE_SCENARIOS.map((s) => s.label),
        rows: decision.rows.map((r) => ({ label: r.label, invest: r.invest, carbonT: r.carbonT, meet: r.meet, n: r.n, benefits: r.benefits,
          maxRegret: r.maxRegret, hurwicz: r.hurwicz, range: r.range, isBaseline: r.isBaseline })),
        picks: Object.fromEntries(Object.entries(decision.picks).map(([k, id]) => [k, decision.rows.find((r) => r.id === id)?.label ?? null])) as
          { minimaxRegret: string | null; hurwicz: string | null; mostRobust: string | null },
        alpha,
      } : undefined,
      staged: plan && timeline ? {
        startYear: stage.startYear, years: stage.years, budget: stage.budget, carbonPriceSekT: stage.carbonPriceSekT, costGrowthPct: stage.costGrowthPct,
        maxBuildingsPerYear: stage.maxBuildingsPerYear, planCost, fittedCost: plan.covered,
        measures: stageBuildings.reduce((s, b) => s + b.items.length, 0), fitted: stageBuildings.reduce((s, b) => s + b.items.length, 0) - unscheduled.length,
        unscheduled: unscheduled.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)}`),
        milestones: milestoneStatus.map((s) => `${s.met ? "✓" : "✗"} ${t(MILESTONE_INFO[s.m.id]!.label, { v: s.m.value ?? "?" })}: ${s.text}${s.unreachable.length ? ` — ${t("your plan cannot reach it for: {b}", { b: s.unreachable.join(", ") })}` : ""}`),
        done: doneItems.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)} (${stage.done[i.id]})`),
        robustness: stageRegret?.picks.minimaxRegret
          ? t("Timing shown: optimised for {s}. Most robust to energy prices (minimax regret): optimised for {r}.", {
              s: t(PRICE_SCENARIOS.find((p) => p.key === (plans[stage.scenario] ? stage.scenario : "base"))!.label),
              r: t(PRICE_SCENARIOS.find((p) => p.key === stageRegret.picks.minimaxRegret)?.label ?? "–") })
          : undefined,
        rows: timeline.map((r, y) => ({ year: r.year, spend: r.spend, cum: r.cum, budgetCum: r.budgetCum, bill: r.bill, co2T: r.co2Kg / 1000, meet: r.meet, n: stageBuildings.length,
          final: y === stage.years, done: r.done.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)}`).join(" · ") })),
      } : undefined,
      assumptions: [
        `${t("Study period")} ${ASSUMPTIONS.studyPeriodYr.value} ${t("years")}, ${t("discount rate")} ${ASSUMPTIONS.discountRate.value * 100} % — ${ASSUMPTIONS.discountRate.source}`,
        `${t("District heating")} ${heatPrice} SEK/kWh, ${t("electricity")} ${elPrice} SEK/kWh; CO₂e ${CARBON.district_heating} / ${CARBON.electricity} kg/kWh — planner hvacSystems.ts (Göteborg Energi Miljövärden 2025; Swedish production mix)`,
        `${t("Heating degree-days")} ${ASSUMPTIONS.degreeDays.value} — ${ASSUMPTIONS.degreeDays.source}`,
        `PET ${t("weighting factors")}: ${t("district heating")} 0.7, ${t("electricity")} 1.8, ${t("biomass")} 0.6 — ${ASSUMPTIONS.petWeights.source}`,
        t("Heating systems: seasonal efficiency, installation cost per kW, O&M and service life from the main planner's catalogue (provisional values flagged there); heat pumps sized on the heat demand after the envelope measures ({h} full-load hours).", { h: ASSUMPTIONS.eflh.value }),
        t("Embodied carbon: Wikells Sektionsdata kg CO₂e per item (producing the materials, weight × typical factor), plus replacements within the study period, using typical service lives (IVL Swedish Environmental Research Institute)."),
      ],
      notes: [
        t("Energy figures are from the energy model (EPSM) with a typical weather year — not metered use. Hot water is included in delivered energy and primary energy; property electricity (fans, pumps, lighting) is not, so primary energy is somewhat understated."),
        t("Optimiser and price-scenario figures use the degree-day estimate anchored on each building's own energy-model result (the main planner's method); the Measures table shows the energy model's own result once it has run."),
        t("{n} buildings use national default U-values for walls, roof or windows because no data exists for them.", { n: stats.defU }),
        t("{a} buildings had floors or height corrected from the energy certificate's heated area (Atemp); {b} have an outline that does not match their certificate and get no energy score.", { a: geoFixed, b: geoBad }),
        t("{n} buildings have façade photos analysed. Street imagery cannot show hairline cracks.", { n: stats.fac }),
        t("Measure prices are Wikells new-build prices for the complete part (replacement); adding insulation to an existing part usually costs less."),
        t("Energy prices are today's list prices (Göteborg Energi district heating 2024–25, SE3 retail electricity) — replace them with Poseidon's own tariffs."),
        t("The climate goal is city-wide and per inhabitant; scoring it per building with primary energy is the housing companies' translation, not the city's own rule."),
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, reportRows, flagged, scoped, sc, weights, ws, ahp, recs, measureTable, measureTotals, heatPrice, elPrice, stats, stockClimate, decision, alpha, plan, plans, timeline, stage, stageBuildings, milestoneStatus, stageRegret, doneItems, t]);
  const reportPreview = useMemo(() => (step === 6 ? reportHtml(reportTitle, reportContent) : ""), [step, reportTitle, reportContent]);

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
                <span>{t("Energy model result:")} <b>{stats.rc}</b></span>
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
                      {t(m === "preset" ? "Preset" : m === "manual" ? "Set weights" : "Pairwise comparison (Analytic Hierarchy Process)")}
                    </label>
                  ))}
                  {ws.mode === "preset" && (
                    <select className="field" style={{ width: 220 }} value={ws.preset} onChange={(e) => updateWs({ ...ws, preset: e.target.value })}>
                      {Object.keys(WEIGHT_PRESETS).map((k) => <option key={k} value={k}>{t(k)}</option>)}
                    </select>
                  )}
                  {ws.mode === "manual" && (
                    <button className="btn" onClick={() => updateWs({ ...ws, manual: EQUAL_WEIGHTS })}>{t("Equal weights")}</button>
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
                          {k === "E" ? t("How much heat the building needs per m² a year, from the energy model (EPSM). {lo} kWh or less gives 0 points, {hi} or more gives 100.", { lo: E_LO, hi: E_HI })
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
                  <button className="btn default" disabled={!!batch} onClick={() => inspectTop(false)}>{t("Inspect")}</button>
                  <button className="btn" disabled={!!batch || !ranked.some(({ r }) => !r.facade)} onClick={() => inspectTop(true)}>
                    {t("Inspect all in the list ({n})", { n: ranked.filter(({ r }) => !r.facade).length })}</button>
                  <span className="small muted">{t("Street View is billed per image and only the defect counts are kept. For a single building, or to upload your own photos, click its façade cell.")}</span>
                </div>
                {batch && (
                  <div className="col" style={{ gap: 3 }}>
                    <div className="row">
                      <div className="progress grow"><div style={{ width: `${(batch.done / Math.max(1, batch.total)) * 100}%` }} /></div>
                      <button className="btn" onClick={() => { stopBatch.current = true; setBatch((b) => b && { ...b }); }}>{t("Stop")}</button>
                    </div>
                    <div className="small">{batch.done} / {batch.total} · {batch.current}{stopBatch.current ? ` — ${t("stopping after this building…")}` : ""}</div>
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
              </div>
              <PartsLegend />
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
                <label title={t("District heating price (Göteborg Energi 2024–25 by default) — enter Poseidon's own tariff.")}>{t("District heating (SEK/kWh):")}</label>
                <input className="field" style={{ width: 58 }} type="number" step={0.05} value={heatPrice}
                  onChange={(e) => { const v = Number(e.target.value); setHeatPrice(v); void putSetting("heat-price", v).catch(() => {}); }} />
                <label title={t("Retail electricity price, SE3 (spot + grid + tax + VAT) — used for heat pumps.")}>{t("Electricity:")}</label>
                <input className="field" style={{ width: 58 }} type="number" step={0.05} value={elPrice}
                  onChange={(e) => { const v = Number(e.target.value); setElPrice(v); void putSetting("el-price", v).catch(() => {}); }} />
              </div>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Optimiser")}</legend>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <span>{t("Find for each flagged building the package (envelope measures + heating system) with")}</span>
                  <select className="field" value={optRule} onChange={(e) => setOptRule(e.target.value as OptRule)}>
                    <option value="lcc">{t("the lowest life-cycle cost")}</option>
                    <option value="carbon">{t("the lowest life-cycle carbon")}</option>
                    <option value="goal">{t("the lowest cost that meets the climate goal")}</option>
                  </select>
                  <button className="btn default" disabled={!!optBusy || !measureRows.length} onClick={() => runOptimiser(measureRows.map((r) => r.id), optRule)}>{t("Optimise all")}</button>
                  {optBusy && <span className="small">{t("Optimising {d} / {n}…", { d: optBusy.done + 1, n: optBusy.total })}</span>}
                </div>
                <div className="small muted">{t("Searches every combination of catalogue measures (keep, or one of the non-dominated options per part) and heating systems, over {n} years. Applying a result replaces your choices; the energy model then checks the heating after renovation.", { n: ASSUMPTIONS.studyPeriodYr.value })}</div>
              </fieldset>
              {measureBusy && <div className="small">{t("Energy model: calculating the effect of the measures…")}</div>}
              <PartsLegend />
              <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                <table className="list sheet wrap-head">
                  <thead><tr>
                    <th>{t("Building")}</th>
                    {MEASURE_COMPONENTS.map((c) => <th key={c}>{t(c)}</th>)}
                    <th>{t("Heating system")}</th>
                    <th className="num" title={t("Space heating saved per year (energy model). Hover a cell for before → after.")}>{t("Heat saved per year")}</th>
                    <th className="num" title={t("Price of the measures and heating plant. Hover a cell for quantities, unit prices and payback.")}>{t("Investment")}</th>
                    <th className="num" title={t("Life-cycle cost of doing nothing minus that of this package, over {n} years (present value)", { n: ASSUMPTIONS.studyPeriodYr.value })}>{t("Money saved vs doing nothing ({n} yr)", { n: ASSUMPTIONS.studyPeriodYr.value })}</th>
                    <th className="num" title={t("CO₂e saved over {n} years: operational saving minus the measures' embodied carbon. Hover a cell for the split.", { n: ASSUMPTIONS.studyPeriodYr.value })}>{t("CO₂ saved vs doing nothing (t, {n} yr)", { n: ASSUMPTIONS.studyPeriodYr.value })}</th>
                    <th className="num" title={t("Primary energy number (heating + hot water), goal {g} kWh/m²", { g: ASSUMPTIONS.petGoal.value })}>{t("Climate goal: primary energy ≤ {g}", { g: ASSUMPTIONS.petGoal.value })}</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {measureTable.map((m) => (
                      <tr key={m.r.id}>
                        <td title={m.r.b.area ?? ""}>{m.r.b.addr}</td>
                        {MEASURE_COMPONENTS.map((c) => {
                          const level = recs.get(m.r.id)?.[c]?.level ?? "unknown";
                          const code = chosen(m.r.id, c);
                          return (
                            <td key={c} style={{ whiteSpace: "nowrap" }}>
                              <span className="part-chip" style={{ background: LEVEL_COLOR[level] }} title={`${t(c)}: ${t(level)}`}>{COMP_SHORT[c]}</span>
                              <MeasureSelect c={c} u0={models.get(m.r.id)?.u0[c] ?? null} value={code} onChange={(v) => setChoice(m.r.id, c, v)} />
                            </td>
                          );
                        })}
                        <td>
                          <select className="field" style={{ width: 104, minHeight: 18 }} value={chosen(m.r.id, "Heating")}
                            title={recs.get(m.r.id)?.["Heating system"]?.reasons.join(" ")}
                            onChange={(e) => setChoice(m.r.id, "Heating", e.target.value)}>
                            {HEATING_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{t(s.shortName)}{s.provisional ? " *" : ""}</option>)}
                          </select>
                        </td>
                        {(() => {
                          // Heat saved: RC once it has run, else the anchored estimate (≈).
                          const afterH = m.after ?? m.ev?.heatKwh ?? null;
                          const est = m.after == null && m.ev != null;
                          return (
                            <td className="num" title={afterH == null ? undefined
                              : `${t("Heating")} ${fmtN(m.before / 1000, 1)} → ${fmtN(afterH / 1000, 1)} MWh/${t("yr")}${est ? ` — ${t("Estimate until the energy model has run")}` : ""}`}>
                              {afterH == null ? "…" : `${est ? "≈" : ""}${fmtN((m.before - afterH) / 1000, 1)} MWh`}
                              {afterH != null && m.before > 0 && <span className="small muted"> ({fmtN(((m.before - afterH) / m.before) * 100)} %)</span>}
                            </td>
                          );
                        })()}
                        <td className="num" title={[
                          ...m.parts.map((p) => p.uAfter == null ? `${t(p.component)}: ${sekShort(p.cost)}`
                            : `${t(p.component)}: ${fmtN(p.areaM2)} m² × ${fmtN(p.areaM2 ? p.cost / p.areaM2 : 0)} kr/m² = ${sekShort(p.cost)}`),
                          `${t("Payback (years)")}: ${m.payback == null ? "–" : fmtN(m.payback)}`,
                        ].join("\n")}>{sekShort(m.cost)}</td>
                        <td className="num" style={{ color: m.ev && m.base && m.base.lcc - m.ev.lcc < 0 ? "#a00000" : undefined }}>{m.ev && m.base ? sekShort(m.base.lcc - m.ev.lcc) : "–"}</td>
                        <td className="num" style={{ color: m.ev && m.base && m.base.lifeCarbonKg - m.ev.lifeCarbonKg < 0 ? "#a00000" : undefined }}
                          title={m.ev && m.base ? `${t("Operational")} ${fmtN(m.base.opCarbonYr / 1000, 1)} → ${fmtN(m.ev.opCarbonYr / 1000, 1)} t/${t("yr")} · ${t("Embodied")} ${fmtN(m.ev.embodiedKg / 1000, 1)} t${m.ev.embodiedComplete ? "" : ` (${t("A measure has no carbon figure in the catalogue")})`}` : undefined}>
                          {m.ev && m.base ? `${fmtN((m.base.lifeCarbonKg - m.ev.lifeCarbonKg) / 1000)}${m.ev.embodiedComplete ? "" : "*"}` : "–"}
                        </td>
                        <td className="num" style={{ color: m.climate ? (m.climate.meetsPet ? "var(--good)" : "#a00000") : undefined, fontWeight: "bold" }}
                          title={m.climate ? t("Today {a} → after {b} kWh/m² (−{c} %)", { a: fmtN(m.climate.petBase), b: fmtN(m.climate.pet), c: fmtN(m.climate.cutPct) }) : undefined}>
                          {m.climate ? `${fmtN(m.climate.pet)} ${m.climate.meetsPet ? "≤" : ">"} ${ASSUMPTIONS.petGoal.value} ${m.climate.meetsPet ? "✓" : "✗"}` : "–"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="btn mini" disabled={!!optBusy || !models.has(m.r.id)} title={t("Optimise this building")}
                            onClick={() => runOptimiser([m.r.id], optRule)}>⚙</button>
                          <button className="btn mini" disabled={!!optBusy || !models.has(m.r.id)} title={t("Compare several packages for this building")}
                            onClick={() => openCompare(m.r)}>{t("Compare…")}</button>
                        </td>
                      </tr>
                    ))}
                    {!measureTable.length && <tr><td colSpan={15} className="muted" style={{ padding: 10 }}>{t("Flag buildings in the Ranking step to plan measures for them.")}</td></tr>}
                  </tbody>
                </table>
              </div>
              {measureTable.length > 0 && (
                <div className="row" style={{ gap: 16 }}>
                  <b>{t("Total")}:</b>
                  <span>{t("Investment")} {sekShort(measureTotals.cost)}</span>
                  <span>{t("Heating saved")} {fmtN(measureTotals.savingMWh, 1)} MWh/{t("yr")}</span>
                  <span>{t("Energy bills")} −{sekShort(measureTotals.annualSavingSEK)}/{t("yr")}</span>
                  <span>{t("Life-cycle saving")} {sekShort(measureTotals.lccSavingSEK)}</span>
                  <span>CO₂ {fmtN(measureTotals.opCo2BeforeT, 1)} → {fmtN(measureTotals.opCo2AfterT, 1)} t/{t("yr")} + {fmtN(measureTotals.embodiedT, 1)} t {t("embodied")}</span>
                  <span>{t("Climate goal")} {measureTotals.meetGoal} / {measureTable.length}</span>
                </div>
              )}
              <div className="hint small">
                <b>{t("How to read the table")}:</b>{" "}
                {t("Every saving is compared with doing nothing: the building as it is today, still on district heating, over {n} years. Money saved = what doing nothing would cost (energy bills) minus what this package costs (investment, replacements, upkeep and the remaining bills), in today's money; red and negative means the package costs more than it saves on energy. CO₂ saved = emissions avoided in operation minus the carbon embodied in the new materials.", { n: ASSUMPTIONS.studyPeriodYr.value })}{" "}
                {t("Climate goal: the building's primary energy number (kWh per m² a year for heating and hot water, weighted by energy source) after renovation. ✓ = at or below Gothenburg's {g} kWh/m², so it meets the goal; ✗ = above it. Example: 90 > {g} ✗ misses the goal, 55 ≤ {g} ✓ meets it.", { g: ASSUMPTIONS.petGoal.value })}
              </div>
              <div className="small muted">{t("* provisional values in the heating-system catalogue. Heating after renovation with ≈ is an estimate until the energy model has run.")}</div>
            </>
          )}

          {!loading && step === 4 && (
            <>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Gothenburg's climate goal")}</legend>
                <div>{t("Primary energy number of heating and hot water (weighted by energy source) at or below {g} kWh/m² — the city's housing companies' translation of the city's −{c} % primary energy goal for 2030.", { g: ASSUMPTIONS.petGoal.value, c: ASSUMPTIONS.cityCutPct.value })}</div>
                <div className="small muted">{ASSUMPTIONS.petGoal.source}. {t("Primary energy here excludes property electricity, so it is somewhat understated.")}</div>
                <div className="row" style={{ gap: 18, marginTop: 4, flexWrap: "wrap" }}>
                  <span>{t("Buildings in scope today")}: <b>{stockClimate.pet == null ? "–" : fmtN(stockClimate.pet)}</b> kWh/m² {t("on average")} · {stockClimate.ok} / {stockClimate.n} {t("at or below the goal")}</span>
                  {measureTable.length > 0 && <span>{t("Flagged buildings with your plan")}: <b>{measureTotals.meetGoal} / {measureTable.length}</b> {t("meet the goal")}</span>}
                </div>
              </fieldset>
              <fieldset className="group grow" style={{ marginTop: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <legend>{t("Which plan holds up if energy prices change? (minimax regret)")}</legend>
                <div className="small">{t("Each plan is applied to all flagged buildings. Net benefit = energy bills saved over {n} years minus investment, replacements and upkeep (present value), in each price future. Regret = how much worse a plan is than the best plan for that future; minimax regret picks the plan whose worst regret is smallest. Doing nothing is shown for reference only.", { n: ASSUMPTIONS.studyPeriodYr.value })}</div>
                <div className="row" style={{ margin: "4px 0", flexWrap: "wrap" }}>
                  <button className="btn mini" style={{ padding: "0 6px" }} aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? "▾" : "▸"} {t("Advanced settings")}</button>
                  {showAdvanced && <>
                    <label title={t("Hurwicz rule: how optimistic to be. 0 = judge each plan only by its worst future, 1 = only by its best future. It only changes the 'best Hurwicz' pick, not minimax regret.")}>{t("Optimism (Hurwicz rule):")}</label>
                    <input type="range" min={0} max={1} step={0.1} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} style={{ width: 120 }} />
                    <span>{fmtN(alpha, 1)}</span>
                    <span className="small muted">{t("0 = only the worst future counts · 1 = only the best")}</span>
                  </>}
                  {optBusy && <span className="small">{t("Optimising {d} / {n}…", { d: optBusy.done + 1, n: optBusy.total })}</span>}
                </div>
                {!measureRows.length ? <div className="muted">{t("Flag buildings in the Ranking step to plan measures for them.")}</div>
                  : !decision ? <div className="muted">{t("Waiting for the energy model results of the flagged buildings…")}</div> : (
                  <div className="sunken-panel grow" style={{ padding: 0, minHeight: 0 }}>
                    <table className="list sheet wrap-head">
                      <thead><tr>
                        <th>{t("Plan")}</th><th className="num">{t("Investment")}</th><th className="num" title={t("Life-cycle carbon over {n} years: embodied + operational", { n: ASSUMPTIONS.studyPeriodYr.value })}>{t("t CO₂e ({n} yr)", { n: ASSUMPTIONS.studyPeriodYr.value })}</th><th className="num">{t("Climate goal")}</th>
                        {PRICE_SCENARIOS.map((s) => <th key={s.key} className="num">{t(s.label)}</th>)}
                        <th className="num">{t("Max regret")}</th>{showAdvanced && <th className="num">{t("Hurwicz rule")}</th>}<th />
                      </tr></thead>
                      <tbody>
                        {decision.rows.map((r) => {
                          const strat = strategies.find((s) => s.id === r.id);
                          const tags = [decision.picks.minimaxRegret === r.id && t("★ minimax regret"), showAdvanced && decision.picks.hurwicz === r.id && t("best Hurwicz"),
                            decision.picks.mostRobust === r.id && t("smallest range")].filter(Boolean).join(" · ");
                          return (
                            <tr key={r.id} style={decision.picks.minimaxRegret === r.id ? { background: "#fff6c8" } : r.isBaseline ? { color: "#666" } : undefined}>
                              <td>{t(r.label)}{tags && <div className="small" style={{ color: "#00505a" }}>{tags}</div>}</td>
                              <td className="num">{sekShort(r.invest)}</td>
                              <td className="num">{fmtN(r.carbonT)}</td>
                              <td className="num">{r.meet} / {r.n}</td>
                              {r.benefits.map((b, k) => <td key={k} className="num" style={{ color: b < 0 ? "#a00000" : undefined }}>{sekShort(b)}</td>)}
                              <td className="num"><b>{r.isBaseline ? "–" : sekShort(r.maxRegret)}</b></td>
                              {showAdvanced && <td className="num">{r.isBaseline ? "–" : sekShort(r.hurwicz)}</td>}
                              <td>{!r.isBaseline && r.id !== "yours" && strat?.byRow &&
                                <button className="btn mini" onClick={() => applyPackages(strat.byRow!)} title={t("Make this plan your plan in the Measures step")}>{t("Use plan")}</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="small muted">{t("All plans here use the degree-day estimate anchored on each building's energy-model result, so they compare like with like. Price futures: today's prices ×0.5, ×1, ×2, and electricity ×2 with district heating unchanged.")}</div>
              </fieldset>
            </>
          )}

          {!loading && step === 5 && (
            <>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Plan settings")}</legend>
                <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
                  <label>{t("Start year")} <input className="field" type="number" style={{ width: 64 }} value={stage.startYear}
                    onChange={(e) => updateStage({ startYear: Number(e.target.value) || stage.startYear })} /></label>
                  <label>{t("Number of years")} <input className="field" type="number" min={1} max={40} style={{ width: 52 }} value={stage.years}
                    onChange={(e) => updateStage({ years: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })} /></label>
                  <label>{t("Budget (SEK, whole period)")} <input className="field" type="number" min={0} step={1000000} style={{ width: 120 }} value={stage.budget}
                    onChange={(e) => updateStage({ budget: Math.max(0, Number(e.target.value) || 0) })} /></label>
                  <span className="small muted">= {sekShort(stage.budget)} · {sekShort(stage.budget / Math.max(1, stage.years))}/{t("yr")}</span>
                  <label title={t("Price put on each tonne of CO₂e saved or embodied; 0 = carbon not priced. Sweden's CO₂ tax is about 1,250 SEK/t.")}>{t("CO₂ price (SEK/t)")} <input className="field" type="number" min={0} step={100} style={{ width: 70 }} value={stage.carbonPriceSekT}
                    onChange={(e) => updateStage({ carbonPriceSekT: Math.max(0, Number(e.target.value) || 0) })} /></label>
                  <label title={t("Real growth of construction prices per year (above inflation)")}>{t("Cost growth (%/yr)")} <input className="field" type="number" step={0.5} style={{ width: 52 }} value={stage.costGrowthPct}
                    onChange={(e) => updateStage({ costGrowthPct: Number(e.target.value) || 0 })} /></label>
                  <label title={t("Contractor capacity / tenant disruption: at most this many buildings under works in one year; empty = no limit")}>{t("Max buildings per year")} <input className="field" type="number" min={1} style={{ width: 48 }} value={stage.maxBuildingsPerYear ?? ""}
                    onChange={(e) => updateStage({ maxBuildingsPerYear: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /></label>
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={stage.urgentFirst} onChange={(e) => updateStage({ urgentFirst: e.target.checked })} />{t("Parts past their service life first")}</label>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {t("The measures are the ones in your plan (Measures step). Rules: the budget is released evenly over the years and unspent money carries over; a heating-system change comes only after that building's envelope measures (so a heat pump is sized for the final building); windows with or after the walls. The optimiser first fits as much of the plan as the budget allows, then picks the timing that saves the most money over {n} years (plus CO₂ at your CO₂ price).", { n: ASSUMPTIONS.studyPeriodYr.value })}
                </div>
              </fieldset>
              <fieldset className="group" style={{ marginTop: 0 }}>
                <legend>{t("Climate milestones")}</legend>
                <table style={{ borderSpacing: "0 2px" }}>
                  <tbody>
                    {stage.milestones.map((m) => {
                      const st = milestoneStatus.find((x) => x.m.id === m.id);
                      const info = MILESTONE_INFO[m.id]!;
                      return (
                        <tr key={m.id}>
                          <td><input type="checkbox" checked={m.enabled} onChange={(e) => setMilestone(m.id, { enabled: e.target.checked })} /></td>
                          <td><input className="field" type="number" style={{ width: 58 }} value={m.year} onChange={(e) => setMilestone(m.id, { year: Number(e.target.value) || m.year })} /></td>
                          <td title={info.source}>{t(info.label).split("{v}")[0]}
                            <input className="field" type="number" style={{ width: 52, margin: "0 3px" }} value={m.value ?? ""} placeholder="?"
                              onChange={(e) => setMilestone(m.id, { value: e.target.value === "" ? null : Number(e.target.value) })} />
                            {t(info.label).split("{v}")[1] ?? ""}
                            <span className="small muted" style={{ marginLeft: 6 }}>ⓘ</span>
                          </td>
                          <td className="small" style={{ paddingLeft: 10 }}>
                            {!m.enabled ? <span className="muted">{t("off")}</span>
                              : m.value == null ? <span className="muted">{t("enter a level to use it")}</span>
                              : m.year < stage.startYear ? <span className="muted">{t("before the plan starts")}</span>
                              : st ? <b style={{ color: st.met ? "var(--good)" : "#a00000" }}>{st.met ? "✓ " : "✗ "}{st.text}</b> : "…"}
                            {st && st.unreachable.length > 0 && <span style={{ color: "#a00000" }}> — {t("your plan cannot reach it for: {b}", { b: st.unreachable.join(", ") })}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="small muted">{t("Milestones come first: the optimiser times the measures so that each ticked milestone is reached by its year as far as the budget allows, then fits the rest of the plan. Hover a milestone for its source. A milestone after the last plan year counts everything in the plan.")}</div>
              </fieldset>
              {!stageBuildings.length ? <div className="muted">{t("Plan measures for the flagged buildings in the Measures step first.")}</div> : (
                <>
                  <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
                    <span>{t("Your plan")}: <b>{stageBuildings.reduce((s, b) => s + b.items.length, 0)}</b> {t("measures")} · <b>{sekShort(planCost)}</b></span>
                    {plan && <span>{t("Fits in the budget")}: <b style={{ color: unscheduled.length ? "#a00000" : "var(--good)" }}>{stageBuildings.reduce((s, b) => s + b.items.length, 0) - unscheduled.length} / {stageBuildings.reduce((s, b) => s + b.items.length, 0)}</b> ({sekShort(plan.covered)})</span>}
                    {planBusy && <span className="small">{t("Optimising the timeline…")}</span>}
                    {planErr && <span className="small" style={{ color: "#a00000" }}>{planErr}</span>}
                    {plan && !planBusy && <span className="small muted">{t("solved in {s} s", { s: plan.seconds })}{plan.status !== "optimal" ? ` (${plan.status})` : ""}</span>}
                  </div>
                  {unscheduled.length > 0 && (
                    <div className="hint small" style={{ color: "#a00000" }}>
                      {t("Does not fit within {y} years and {b}: {n} measures for {c} — raise the budget or the number of years:", { y: stage.years, b: sekShort(stage.budget), n: unscheduled.length, c: sekShort(unscheduled.reduce((s, i) => s + i.cost, 0)) })}{" "}
                      {unscheduled.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)}`).join(" · ")}
                    </div>
                  )}
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <span className="small">{doneItems.length
                      ? <>{t("Already done (kept fixed)")}: {doneItems.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)} (${stage.done[i.id]})`).join(" · ")}</>
                      : t("Nothing recorded as done yet.")}</span>
                    <span className="grow" />
                    <button className="btn" disabled={!plan || planBusy} onClick={advanceYear}
                      title={t("Record the steps planned for {y} as done, move the plan on one year (budget reduced by what was spent) and re-optimise the rest", { y: stage.startYear })}>
                      {t("{y} done → re-plan from {n}", { y: stage.startYear, n: stage.startYear + 1 })}</button>
                    <button className="btn" disabled={!doneItems.length} onClick={() => updateStage({ done: {} })}>{t("Clear done steps")}</button>
                  </div>
                  {stageRegret && (
                    <fieldset className="group" style={{ marginTop: 0 }}>
                      <legend>{t("Which timing holds up if energy prices change? (minimax regret)")}</legend>
                      <table className="list sheet wrap-head">
                        <thead><tr>
                          <th>{t("Plan optimised for")}</th>
                          {PRICE_SCENARIOS.map((s) => <th key={s.key} className="num">{t("Value if prices turn out")}: {t(s.label)}</th>)}
                          <th className="num">{t("Max regret")}</th><th />
                        </tr></thead>
                        <tbody>
                          {stageRegret.rows.filter((r) => !r.isBaseline).map((r) => (
                            <tr key={r.id} style={stageRegret.picks.minimaxRegret === r.id ? { background: "#fff6c8" } : undefined}>
                              <td>{t(r.label)}{stageRegret.picks.minimaxRegret === r.id && <span className="small" style={{ color: "#00505a" }}> ★ {t("minimax regret")}</span>}
                                {(stage.scenario === r.id || (!plans[stage.scenario] && r.id === "base")) && <b> ◄ {t("shown")}</b>}</td>
                              {r.benefits.map((b, k) => <td key={k} className="num" style={{ color: b < 0 ? "#a00000" : undefined }}>{sekShort(b)}</td>)}
                              <td className="num"><b>{sekShort(r.maxRegret)}</b></td>
                              <td><button className="btn mini" disabled={stage.scenario === r.id} onClick={() => updateStage({ scenario: r.id })}>{t("Show this plan")}</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="small muted">{t("The same measures and milestones, timed for each price future. Value = present value over {n} years of what remains to be done (bills saved minus investment and upkeep). Regret = how much less a timing gives than the best timing for the future that actually happens.", { n: ASSUMPTIONS.studyPeriodYr.value })}</div>
                    </fieldset>
                  )}
                  {timeline && <StageChart rows={timeline} years={stage.years} />}
                  {timeline && plan && (
                    <div className="row grow" style={{ gap: 8, alignItems: "stretch", minHeight: 0 }}>
                      <div className="sunken-panel" style={{ padding: 0, minHeight: 0, flex: 3 }}>
                        <table className="list sheet wrap-head">
                          <thead><tr>
                            <th>{t("Year")}</th><th className="num">{t("Spend")}</th><th className="num">{t("Spent so far / budget released")}</th>
                            <th>{t("Measures done this year")}</th><th className="num">{t("Energy bills per year")}</th><th className="num">{t("CO₂ per year (t)")}</th>
                            <th className="num">{t("Buildings meeting the climate goal")}</th>
                          </tr></thead>
                          <tbody>
                            {timeline.map((r, y) => (
                              <tr key={r.year} style={y === stage.years ? { fontWeight: "bold", background: "#eef6f7" } : undefined}>
                                <td>{y === stage.years ? `${r.year} (${t("after the plan")})` : r.year}</td>
                                <td className="num">{r.spend ? sekShort(r.spend) : "–"}</td>
                                <td className="num">{y < stage.years ? `${sekShort(r.cum)} / ${sekShort(r.budgetCum)}` : ""}</td>
                                <td style={{ whiteSpace: "normal" }}>{r.done.map((i) => `${i.address}: ${t(i.part === "Heating" ? "Heating system" : i.part)}`).join(" · ") || ""}</td>
                                <td className="num">{sekShort(r.bill)}</td>
                                <td className="num">{fmtN(r.co2Kg / 1000, 1)}</td>
                                <td className="num">{r.meet} / {stageBuildings.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="sunken-panel" style={{ padding: 0, minHeight: 0, flex: 2 }}>
                        <table className="list sheet">
                          <thead><tr><th>{t("Building")}</th>{doneItems.length > 0 && <th title={t("Already done")}>✓</th>}{Array.from({ length: stage.years }, (_, y) => <th key={y} style={{ textAlign: "center" }}>{String(stage.startYear + y).slice(2)}</th>)}</tr></thead>
                          <tbody>
                            {stageBuildings.map((b) => (
                              <tr key={b.id}>
                                <td>{b.address}</td>
                                {doneItems.length > 0 && <td style={{ textAlign: "center", padding: "1px 2px" }}>
                                  {b.items.filter((i) => isDone(i.id)).map((i) => (
                                    <span key={i.id} className="part-chip" style={{ background: "#808080", cursor: "pointer" }}
                                      title={`${t("Done in {y}", { y: stage.done[i.id] })} — ${t("click to undo")}`}
                                      onClick={() => { const { [i.id]: _gone, ...rest } = stage.done; updateStage({ done: rest }); }}>{COMP_SHORT[i.part === "Heating" ? "Heating system" : i.part]}</span>
                                  ))}
                                </td>}
                                {Array.from({ length: stage.years }, (_, y) => (
                                  <td key={y} style={{ textAlign: "center", padding: "1px 2px" }}>
                                    {b.items.filter((i) => plan.schedule[i.id] === y).map((i) => (
                                      <span key={i.id} className="part-chip" style={{ background: i.urgent ? LEVEL_COLOR.needed : "#00707a" }}
                                        title={`${t(i.part === "Heating" ? "Heating system" : i.part)}: ${i.label} · ${sekShort(i.cost)}`}>{COMP_SHORT[i.part === "Heating" ? "Heating system" : i.part]}</span>
                                    ))}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="small muted" style={{ padding: 4 }}>{t("Red = a part past its service life. Hover a chip for the measure and its price.")}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!loading && step === 6 && (
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
      {compare && models.get(compare.row.id) && (
        <CompareDialog row={compare.row} bm={models.get(compare.row.id)!} bodies={allBodies.filter((x) => compare.row.ids.includes(x.id))}
          prices={prices} initial={compare.initial} onUse={(p) => applyPackages({ [compare.row.id]: p })} onClose={() => setCompare(null)} />
      )}
      <div className="hr" style={{ margin: "0 0 2px" }} />
      <div className="wizard-foot">
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("< Back")}</button>
        <button className="btn default" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>{t("Next >")}</button>
      </div>
    </div>
  );
}

/** A part's measure dropdown: catalogue options grouped by suggested / best value /
 *  meets BBR but dearer / misses BBR / no improvement (disabled). */
function MeasureSelect({ c, u0, value, onChange, width = 92 }: { c: MeasureComponent; u0: number | null; value: string; onChange: (code: string) => void; width?: number }) {
  const [, t] = useLang();
  const g = measureOptions(c, u0, recommendedMeasure(c)?.code);
  const nf = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(v);
  const opt = (m: Measure, prefix = "", disabled = false) =>
    <option key={m.code} value={m.code} disabled={disabled}>{`${prefix}U ${m.u} · ${nf(m.costPerM2)} kr/m² · ${m.label}`}</option>;
  const target = BBR_RENOVATION_U[c];
  const cur = value ? MEASURE_BY_CODE.get(value) : undefined;
  return (
    <select className="field" style={{ width, minHeight: 18 }} value={value} onChange={(e) => onChange(e.target.value)}
      title={cur ? `U ${cur.u} · ${nf(cur.costPerM2)} kr/m² · ${cur.label}` : t("no measure")}>
      <option value="">{t("no measure")}</option>
      {g.suggested && <optgroup label={t("★ Suggested: cheapest that meets the building regulations (U ≤ {u})", { u: target })}>{opt(g.suggested, "★ ")}</optgroup>}
      {g.recommended.length > 0 && <optgroup label={t("Recommended: meets the building regulations, best value for its U")}>{g.recommended.map((m) => opt(m))}</optgroup>}
      {g.other.length > 0 && <optgroup label={t("Meets the building regulations, but a cheaper option is as good")}>{g.other.map((m) => opt(m))}</optgroup>}
      {g.weak.length > 0 && <optgroup label={t("Not recommended: misses the building regulations' requirement (U ≤ {u})", { u: target })}>{g.weak.map((m) => opt(m))}</optgroup>}
      {g.worse.length > 0 && <optgroup label={t("Not selectable: no better than today's U ({u})", { u: u0 ?? "?" })}>{g.worse.map((m) => opt(m, "", true))}</optgroup>}
      {cur && ![g.suggested, ...g.recommended, ...g.other, ...g.weak].includes(cur) && !g.worse.includes(cur) && opt(cur)}
    </select>
  );
}

/* ── staged plan chart: spend per year (bars) vs budget released per year (dashed),
   and CO₂ per year (line, right axis) ── */
function StageChart({ rows, years }: { rows: ReturnType<typeof stageTimeline>; years: number }) {
  const [, t] = useLang();
  const W = 900, H = 150, L = 56, Rm = 50, Tm = 10, Bm = 22;
  const iw = W - L - Rm, ih = H - Tm - Bm;
  const plan = rows.slice(0, years);
  const maxSpend = Math.max(1, ...plan.map((r) => r.spend), ...plan.map((r, i) => r.budgetCum - (i ? plan[i - 1]!.budgetCum : 0)));
  const maxCo2 = Math.max(1, ...rows.map((r) => r.co2Kg / 1000));
  const bw = iw / years;
  const x = (i: number) => L + i * bw;
  const ySpend = (v: number) => Tm + ih - (v / maxSpend) * ih;
  const yCo2 = (v: number) => Tm + ih - (v / maxCo2) * ih;
  const nf = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: v >= 10 ? 0 : 1 }).format(v);
  const perYear = plan.length ? plan[0]!.budgetCum : 0;
  return (
    <div className="sunken-panel" style={{ padding: 4, background: "#fff", flexShrink: 0, overflow: "visible" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 150, display: "block" }} role="img" aria-label={t("Spend and CO₂ per year")}>
        <line x1={L} y1={Tm + ih} x2={L + iw} y2={Tm + ih} stroke="#808080" />
        <text x={4} y={Tm + 8} fontSize="10" fill="#00505a">MSEK</text>
        <text x={4} y={Tm + 20} fontSize="10" fill="#00505a">{nf(maxSpend / 1e6)}</text>
        <text x={W - Rm + 4} y={Tm + 8} fontSize="10" fill="#a00000">t CO₂</text>
        <text x={W - Rm + 4} y={Tm + 20} fontSize="10" fill="#a00000">{nf(maxCo2)}</text>
        {plan.map((r, i) => (
          <g key={r.year}>
            <rect x={x(i) + bw * 0.15} y={ySpend(r.spend)} width={bw * 0.7} height={Tm + ih - ySpend(r.spend)} fill="#00707a">
              <title>{`${r.year}: ${nf(r.spend / 1e6)} MSEK`}</title>
            </rect>
            <text x={x(i) + bw / 2} y={H - 6} fontSize="10" textAnchor="middle">{r.year}</text>
          </g>
        ))}
        <line x1={L} y1={ySpend(perYear)} x2={L + iw} y2={ySpend(perYear)} stroke="#00505a" strokeDasharray="5 4" />
        <polyline fill="none" stroke="#a00000" strokeWidth={2}
          points={rows.map((r, i) => `${L + Math.min(i, years) * bw},${yCo2(r.co2Kg / 1000)}`).join(" ")} />
      </svg>
      <div className="small" style={{ display: "flex", gap: 14, padding: "0 4px" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#00707a" }} /> {t("spend per year")}</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "2px dashed #00505a", verticalAlign: "middle" }} /> {t("budget released per year")}</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "2px solid #a00000", verticalAlign: "middle" }} /> {t("CO₂ per year (right axis)")}</span>
      </div>
    </div>
  );
}

/* ── compare several packages for one building ──────────────────────────────── */
interface Variant { id: string; name: string; pkg: Package }
const envKey = (e: Envelope) => JSON.stringify(MEASURE_COMPONENTS.map((c) => e[c] ?? ""));

function CompareDialog({ row, bm, bodies, prices, initial, onUse, onClose }: {
  row: Row; bm: BuildingModel; bodies: RcBody[]; prices: Prices; initial: Variant[];
  onUse: (p: Package) => void; onClose: () => void;
}) {
  const [, t] = useLang();
  const [variants, setVariants] = useState<Variant[]>(initial);
  const [rc, setRc] = useState<Record<string, number | "busy" | "error">>({});   // envelope key → RC space heat
  const [tryPart, setTryPart] = useState<MeasureComponent>("Walls");
  const seq = useRef(initial.length);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const nf = (v: number, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const sek = (v: number) => (Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} MSEK` : Math.abs(v) >= 1e4 ? `${nf(v / 1e3)} kSEK` : `${nf(v)} SEK`);
  const base = baselineEval(bm, prices);
  const add = (name: string, pkg: Package) => setVariants((vs) => [...vs, { id: `v${++seq.current}`, name, pkg }]);
  const patch = (id: string, f: (v: Variant) => Variant) => setVariants((vs) => vs.map((v) => (v.id === id ? f(v) : v)));

  async function simulate() {
    const todo = [...new Set(variants.map((v) => envKey(v.pkg.envelope)))].filter((k) => rc[k] == null || rc[k] === "error");
    for (const k of todo) {
      const v = variants.find((x) => envKey(x.pkg.envelope) === k)!;
      const u: Partial<Record<string, number>> = {};
      for (const c of MEASURE_COMPONENTS) { const m = v.pkg.envelope[c] ? MEASURE_BY_CODE.get(v.pkg.envelope[c]!) : undefined; if (m) u[U_FIELD[c]] = m.u; }
      if (!Object.keys(u).length) { setRc((s) => ({ ...s, [k]: bm.heat0 })); continue; }
      setRc((s) => ({ ...s, [k]: "busy" }));
      try {
        const res = await rcRun(bodies.map((b) => ({ ...b, edits: { ...b.edits, ...u } })));
        const r = rowResult(row.ids, res);
        setRc((s) => ({ ...s, [k]: r && !r.error && r.heating_kwh != null ? r.heating_kwh : "error" }));
      } catch { setRc((s) => ({ ...s, [k]: "error" })); }
    }
  }

  const evals = variants.map((v) => {
    const sim = rc[envKey(v.pkg.envelope)];
    const e = evaluate(bm, v.pkg, prices, typeof sim === "number" ? sim : null);
    return { v, e, sim, climate: climateCheck(bm, e), money: base.lcc - e.lcc, co2: (base.lifeCarbonKg - e.lifeCarbonKg) / 1000 };
  });
  const best = {
    invest: Math.min(...evals.map((x) => x.e.invest)), money: Math.max(...evals.map((x) => x.money)),
    co2: Math.max(...evals.map((x) => x.co2)), pet: Math.min(...evals.map((x) => x.climate.pet)),
  };
  const B = (on: boolean) => (on && evals.length > 1 ? { fontWeight: "bold" as const, background: "#e6f4e6" } : undefined);
  const first = variants[0]?.pkg ?? { envelope: {}, heating: BASE_SYSTEM };
  const g = measureOptions(tryPart, bm.u0[tryPart], recommendedMeasure(tryPart)?.code);
  const tryList = [g.suggested, ...g.recommended].filter(Boolean) as Measure[];

  return (
    <div className="modal-shade">
      <div className="window active" role="dialog" aria-label={t("Compare packages")}
        style={{ left: "50%", top: "48%", transform: "translate(-50%,-50%)", width: "min(1360px, 96vw)", maxHeight: "90vh", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="title-bar"><span className="title">{t("Compare packages")} – {row.b.addr}</span>
          <div className="title-btns"><button className="title-btn close" aria-label={t("Close")} onClick={onClose}>×</button></div>
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "auto" }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" onClick={() => add(`${t("Variant")} ${variants.length + 1}`, { envelope: { ...first.envelope }, heating: first.heating })}>{t("Add variant")}</button>
            <span className="task-sep" style={{ height: 20 }} />
            <span>{t("Try every recommended option for")}</span>
            <select className="field" value={tryPart} onChange={(e) => setTryPart(e.target.value as MeasureComponent)}>
              {MEASURE_COMPONENTS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
            <button className="btn" disabled={!tryList.length} onClick={() => tryList.forEach((m) =>
              add(`${t(tryPart)}: U ${m.u}`, { envelope: { ...first.envelope, [tryPart]: m.code }, heating: first.heating }))}>
              {t("Add {n} variants", { n: tryList.length })}</button>
            <span className="small muted">{t("(the other parts as in the first row)")}</span>
            <span className="grow" />
            <button className="btn default" onClick={simulate}>{t("Simulate all with the energy model")}</button>
          </div>
          <div className="sunken-panel" style={{ padding: 0, minHeight: 0, overflow: "auto" }}>
            <table className="list sheet wrap-head">
              <thead><tr>
                <th>{t("Variant")}</th>{MEASURE_COMPONENTS.map((c) => <th key={c}>{t(c)}</th>)}<th>{t("Heating system")}</th>
                <th className="num">{t("Heat saved per year")}</th><th className="num">{t("Investment")}</th>
                <th className="num">{t("Money saved vs doing nothing ({n} yr)", { n: ASSUMPTIONS.studyPeriodYr.value })}</th>
                <th className="num">{t("CO₂ saved vs doing nothing (t, {n} yr)", { n: ASSUMPTIONS.studyPeriodYr.value })}</th>
                <th className="num">{t("Climate goal: primary energy ≤ {g}", { g: ASSUMPTIONS.petGoal.value })}</th><th />
              </tr></thead>
              <tbody>
                {evals.map(({ v, e, sim, climate, money, co2 }) => (
                  <tr key={v.id}>
                    <td><input className="field" style={{ width: 120 }} value={v.name} onChange={(ev) => patch(v.id, (x) => ({ ...x, name: ev.target.value }))} /></td>
                    {MEASURE_COMPONENTS.map((c) => (
                      <td key={c}><MeasureSelect c={c} u0={bm.u0[c]} width={112} value={v.pkg.envelope[c] ?? ""}
                        onChange={(code) => patch(v.id, (x) => ({ ...x, pkg: { ...x.pkg, envelope: { ...x.pkg.envelope, [c]: code || undefined } } }))} /></td>
                    ))}
                    <td><select className="field" style={{ width: 110, minHeight: 18 }} value={v.pkg.heating}
                      onChange={(ev) => patch(v.id, (x) => ({ ...x, pkg: { ...x.pkg, heating: ev.target.value } }))}>
                      {HEATING_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{t(s.shortName)}{s.provisional ? " *" : ""}</option>)}
                    </select></td>
                    <td className="num" title={typeof sim === "number" ? t("energy model") : t("Estimate until the energy model has run")}>
                      {sim === "busy" ? "…" : `${typeof sim === "number" ? "" : "≈"}${nf((bm.heat0 - e.heatKwh) / 1000, 1)} MWh`}
                      {sim === "error" && <span style={{ color: "#a00000" }}> !</span>}
                    </td>
                    <td className="num" style={B(e.invest === best.invest)}>{sek(e.invest)}</td>
                    <td className="num" style={{ ...B(money === best.money), color: money < 0 ? "#a00000" : undefined }}>{sek(money)}</td>
                    <td className="num" style={B(co2 === best.co2)}>{nf(co2)}</td>
                    <td className="num" style={{ ...B(climate.pet === best.pet), color: climate.meetsPet ? "var(--good)" : "#a00000" }}>
                      {nf(climate.pet)} {climate.meetsPet ? "≤" : ">"} {ASSUMPTIONS.petGoal.value} {climate.meetsPet ? "✓" : "✗"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn mini" title={t("Make this the building's plan in the Measures step")} onClick={() => { onUse(v.pkg); onClose(); }}>{t("Use plan")}</button>
                      <button className="btn mini" title={t("Remove")} disabled={variants.length < 2} onClick={() => setVariants((vs) => vs.filter((x) => x.id !== v.id))}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted">{t("Green bold = best in its column. ≈ = degree-day estimate anchored on this building's energy-model result; press Simulate to get the energy model's own figure (results are cached, so repeating is instant). Savings are against doing nothing over {n} years.", { n: ASSUMPTIONS.studyPeriodYr.value })}</div>
        </div>
      </div>
    </div>
  );
}

/** What the W / Wi / R / F / H chips and their colours mean (Ranking and Measures). */
function PartsLegend() {
  const [, t] = useLang();
  const chip = (txt: string, color: string) => <span className="part-chip" style={{ background: color }}>{txt}</span>;
  return (
    <div className="hint small row" style={{ flexWrap: "wrap", gap: 10 }}>
      <span><b>{t("Parts")}:</b> {chip("W", LEVEL_COLOR.unknown)} {t("walls")} {chip("Wi", LEVEL_COLOR.unknown)} {t("windows")} {chip("R", LEVEL_COLOR.unknown)} {t("roof")} {chip("F", LEVEL_COLOR.unknown)} {t("floor")} {chip("H", LEVEL_COLOR.unknown)} {t("heating system")}</span>
      <span><b>{t("Colour")}:</b> {chip("\u00a0\u00a0", LEVEL_COLOR.needed)} {t("renovation needed")} {chip("\u00a0\u00a0", LEVEL_COLOR.consider)} {t("worth considering")} {chip("\u00a0\u00a0", LEVEL_COLOR.ok)} {t("OK")} {chip("\u00a0\u00a0", LEVEL_COLOR.unknown)} {t("no data")}</span>
      <span className="muted">{t("Judged on age against typical service lives (IVL Swedish Environmental Research Institute), façade defects and U-value against the Swedish building regulations. Hover a chip for the reasons.")}</span>
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
