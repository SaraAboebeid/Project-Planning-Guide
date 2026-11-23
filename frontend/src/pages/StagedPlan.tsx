/* Step 4.5 — Staged plan (a view of Step 4): the packages chosen in Step 4, spread over the years
   within a budget.

   Each building's package is split into one step per component
   (utils/stagedPlan.ts); the timing optimiser (backend/staged_plan.py, a MILP
   solved with HiGHS) then picks the year of every step:
     - the budget is released evenly over the years, unspent money carries over
     - windows go with or after the walls of the same building
     - climate milestones (the city's goal by its year, optional EU / 2050
       levels) are reached first, as far as the budget allows
     - then as much of the plan as fits, then the timing worth most over the
       study period (bills saved, CO2 at an optional carbon price)
   The plan is solved for each energy-price future and compared with minimax
   regret. "Year done → re-plan" records a year's steps as carried out and
   re-optimises the rest (a rolling plan). The result is saved with the project
   and printed in the Step 5 report. */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Target, Scale } from "lucide-react";
import { useWizardStore, type StagedMilestone, type StagedPlanState } from "../store/wizard";
import { useT } from "../i18n";
import PanelShell from "../components/PanelShell";
import { ASSUMPTIONS, STUDY_PERIOD_YR } from "../config/optimizationAssumptions";
import { climateGoalFor } from "../config/climateGoals";
import { WIKELLS_CHAPTERS, type WikellsItem } from "../config/wikellsData";
import { estimateCarbon } from "../utils/materialRecommendation";
import {
  bKey, buildStages, milestoneRows, milestoneStatus, stageTimeline, stepValue, type StageEconomics, type StageStep,
} from "../utils/stagedPlan";

const white = (o: number) => `rgba(255,255,255,${o})`;
const ACCENT = "#B98BE8";
const PRICE_FUTURES = [
  { key: "low", label: "Prices ×0.5", mult: 0.5 },
  { key: "base", label: "Today's prices", mult: 1 },
  { key: "high", label: "Prices ×2", mult: 2 },
];
const WIN_M2 = 1.5;   // m² per window when windows (counted) are weighed against walls (m²)

type Country = "SE" | "UK" | "BE";
const countryOf = (c: string | null | undefined): Country => (c === "United Kingdom" ? "UK" : c === "Belgium" ? "BE" : "SE");
const assumption = (c: Country, key: string) => ASSUMPTIONS[c].find((a) => a.key === key)?.value ?? null;

const input = { background: "#0d1117", color: "#fff", border: `1px solid ${white(0.15)}`, borderRadius: 7, padding: "5px 8px", fontSize: 13 } as const;
const btn = (primary = false) => ({ padding: "6px 12px", borderRadius: 8, border: `1px solid ${primary ? ACCENT : white(0.18)}`, background: primary ? `${ACCENT}22` : "transparent", color: primary ? "#E5D4FA" : white(0.85), fontSize: 12.5, fontWeight: 600, cursor: "pointer" }) as const;

/** `embedded`: shown as view 4.5 inside Step 4 (no page title of its own). */
export default function StagedPlan({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useT();
  const project = useWizardStore((s) => s.project);
  const setProject = useWizardStore((s) => s.setProject);
  const cc = countryOf(project.country);
  const currency = cc === "UK" ? "GBP" : cc === "BE" ? "EUR" : "SEK";
  const fmt = (v: number, d = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  const money = (v: number) => (Math.abs(v) >= 1e6 ? `${fmt(v / 1e6, 1)} M${currency}` : Math.abs(v) >= 1e4 ? `${fmt(v / 1e3)} k${currency}` : `${fmt(v)} ${currency}`);

  /* ── settings (saved with the project) ── */
  const goal = climateGoalFor(project.city, project.country);
  const defaultMilestones = (): StagedMilestone[] => [
    ...(goal && goal.kind === "pct" ? [{ id: "city", year: goal.targetYear, kind: "building-pct" as const, value: goal.reductionPct, enabled: true }] : []),
    ...(goal && goal.kind === "absolute" && goal.targetKwhM2 != null ? [{ id: "city", year: goal.targetYear, kind: "building-level" as const, value: goal.targetKwhM2, enabled: true }] : []),
    { id: "eu2030", year: 2030, kind: "portfolio-pct", value: 16, enabled: false },
    { id: "eu2035", year: 2035, kind: "portfolio-pct", value: 20, enabled: false },
    { id: "y2050", year: 2050, kind: "building-level", value: null, enabled: false },
  ];
  const settings: StagedPlanState["settings"] = useMemo(() => ({
    startYear: new Date().getFullYear() + 1, years: 10, budget: 20_000_000, carbonPriceSekT: 0, costGrowthPct: 0,
    maxBuildingsPerYear: null, scenario: "base", milestones: defaultMilestones(), done: {},
    ...(project.stagedPlan?.settings ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [project.stagedPlan?.settings, project.city]);
  const update = (p: Partial<StagedPlanState["settings"]>) =>
    setProject({ stagedPlan: { ...(project.stagedPlan ?? {}), settings: { ...settings, ...p } } as StagedPlanState });
  const setMilestone = (id: string, p: Partial<StagedMilestone>) => update({ milestones: settings.milestones.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const [priceOverride, setPriceOverride] = useState<number | null>(null);

  const econ: StageEconomics = {
    price: priceOverride ?? assumption(cc, cc === "UK" ? "gas_price" : "energy_price") ?? (cc === "SE" ? 0.8 : 0.08),
    carbonFactor: assumption(cc, "carbon_factor_heat") ?? 0.022,
    discountRate: assumption(cc, "discount_rate") ?? 0.03,
    studyPeriodYr: STUDY_PERIOD_YR, carbonPriceT: settings.carbonPriceSekT, costGrowthPct: settings.costGrowthPct,
  };

  /* ── the plan's steps ── */
  const { buildings, skipped } = useMemo(() => {
    const items = new Map<string, WikellsItem>(WIKELLS_CHAPTERS.flatMap((c) => c.subGroups.flatMap((g) => g.items)).map((i) => [i.code, i]));
    const configs = Object.values(project.renovationConfigs ?? {}).flat() as { id: string; name?: string; uValue?: number; costPerM2?: number; carbonPerM2?: number }[];
    const cfgById = new Map(configs.map((c) => [c.id, c]));
    const rowsLookup = (project.lookedUpBuildings ?? []) as unknown as Record<string, number | null>[];
    const rowsBbox = (project.bboxRows ?? []) as unknown as Record<string, number | null>[];
    const near = (rows: Record<string, number | null>[], lat: number, lon: number) =>
      rows.find((r) => r.lat != null && r.lon != null && Math.abs((r.lat as number) - lat) < 2e-4 && Math.abs((r.lon as number) - lon) < 4e-4);
    return buildStages({
      packages: project.renovationCalcPackages ?? [],
      selectedByBuilding: project.selectedPackageByBuilding ?? {},
      baseline: project.renovationBaselineResults ?? [],
      uBefore: (lat, lon, part) => {
        const a = near(rowsLookup, lat, lon), b = near(rowsBbox, lat, lon);
        const v = part === "Walls" ? a?.tabula_u_wall ?? b?.u_wall : part === "Roof" ? a?.tabula_u_roof ?? b?.u_roof
          : part === "Windows" || part === "Doors" ? a?.tabula_u_win ?? b?.u_window : null;
        return typeof v === "number" ? v : null;
      },
      describe: (sel, part) => {
        const cfg = sel.configId ? cfgById.get(sel.configId) : undefined;
        const it = sel.wikellsCode ? items.get(sel.wikellsCode) : undefined;
        const perArea = part === "Windows" || part === "Doors" || part === "Balcony" ? 1 / WIN_M2 : 1;
        if (cfg) return { label: sel.customLabel ?? cfg.name ?? sel.wikellsCode, u: sel.customUValue ?? cfg.uValue ?? null, unitCost: (cfg.costPerM2 ?? 0) * perArea, unitCarbon: (cfg.carbonPerM2 ?? 0) * perArea };
        if (it) return { label: `${it.code} ${it.description}`, u: sel.customUValue ?? it.uValue ?? null, unitCost: it.costSEK * perArea, unitCarbon: estimateCarbon(it, []).value * perArea };
        return { label: sel.customLabel ?? sel.wikellsCode ?? part, u: sel.customUValue ?? null, unitCost: 0, unitCarbon: 0 };
      },
    });
  }, [project.renovationCalcPackages, project.selectedPackageByBuilding, project.renovationBaselineResults, project.renovationConfigs, project.lookedUpBuildings, project.bboxRows]);
  const allSteps = buildings.flatMap((b) => b.steps);
  const isDone = (id: string) => settings.done[id] != null;
  const ms = useMemo(() => milestoneRows(buildings, settings.milestones, settings.startYear, settings.years, isDone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildings, settings.milestones, settings.startYear, settings.years, settings.done]);

  /* ── solve once per price future (debounced) ── */
  type Plan = { schedule: Record<string, number | null>; status: string; covered: number; seconds: number; shortfall: Record<string, number> };
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify([settings, econ.price, allSteps.map((s) => [s.id, Math.round(s.cost), Math.round(s.saveKwhYr)])]);
  const seq = useRef(0);
  useEffect(() => {
    if (!allSteps.length) return;
    const my = ++seq.current;
    const h = setTimeout(async () => {
      setBusy(true); setErr(null);
      const g = 1 + settings.costGrowthPct / 100;
      const open = allSteps.filter((s) => !isDone(s.id));
      const after: [string, string][] = [];
      for (const b of buildings) {
        const wall = b.steps.find((s) => s.part === "Walls"), win = b.steps.find((s) => s.part === "Windows");
        if (wall && win && !isDone(wall.id) && !isDone(win.id)) after.push([wall.id, win.id]);
      }
      try {
        const res = await Promise.all(PRICE_FUTURES.map(async (f) => {
          const r = await fetch("/api/staged-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            years: settings.years, budget: settings.budget, after, max_buildings_per_year: settings.maxBuildingsPerYear || null, milestones: ms.rows,
            items: open.map((s) => ({ id: s.id, building: s.building, cost0: s.cost,
              costs: Array.from({ length: settings.years }, (_, y) => s.cost * Math.pow(g, y)),
              values: Array.from({ length: settings.years }, (_, y) => stepValue(s, y, econ, f.mult)) })),
          }) });
          const j = await r.json();
          if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : `HTTP ${r.status}`);
          return [f.key, j as Plan] as const;
        }));
        if (my === seq.current) setPlans(Object.fromEntries(res));
      } catch (e) { if (my === seq.current) setErr((e as Error).message); }
      finally { if (my === seq.current) setBusy(false); }
    }, 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const plan = plans[settings.scenario] ?? plans.base ?? null;
  const schedule = useMemo(() => {
    if (!plan) return null;
    const s: Record<string, number | null> = { ...plan.schedule };
    for (const id of Object.keys(settings.done)) s[id] = -1;
    return s;
  }, [plan, settings.done]);
  const timeline = useMemo(() => (schedule ? stageTimeline(buildings, schedule, settings.years, settings.startYear, settings.budget, econ) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, buildings, settings.years, settings.startYear, settings.budget, econ.price, econ.carbonFactor, settings.costGrowthPct]);
  const status = useMemo(() => (schedule ? milestoneStatus(buildings, ms.info, schedule, settings.startYear) : []), [schedule, buildings, ms.info, settings.startYear]);
  const unscheduled = plan ? allSteps.filter((s) => !isDone(s.id) && plan.schedule[s.id] == null) : [];
  const doneSteps = allSteps.filter((s) => isDone(s.id));
  const planCost = allSteps.filter((s) => !isDone(s.id)).reduce((a, s) => a + s.cost, 0);

  /* minimax regret over the price futures */
  const regret = useMemo(() => {
    if (PRICE_FUTURES.some((f) => !plans[f.key])) return null;
    const val = (sched: Record<string, number | null>, mult: number) =>
      allSteps.reduce((a, s) => { const y = sched[s.id]; return y == null || isDone(s.id) ? a : a + stepValue(s, y, econ, mult); }, 0);
    const rows = PRICE_FUTURES.map((p) => ({ key: p.key, label: p.label, v: PRICE_FUTURES.map((f) => val(plans[p.key]!.schedule, f.mult)) }));
    const best = PRICE_FUTURES.map((_, i) => Math.max(...rows.map((r) => r.v[i]!)));
    const withR = rows.map((r) => ({ ...r, maxRegret: Math.max(...r.v.map((x, i) => best[i]! - x)) }));
    return { rows: withR, pick: withR.reduce((a, b) => (b.maxRegret < a.maxRegret ? b : a)).key };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, allSteps]);

  const partName = (p: string) => t(p === "Windows" ? "Windows" : p);
  const msLabel = (m: StagedMilestone) => m.id === "city" && goal
    ? (m.kind === "building-pct" ? t("{city}: every building −{v} % energy by {y}", { city: t(goal.city), v: m.value ?? "?", y: m.year }) : t("{city}: every building ≤ {v} kWh/m² by {y}", { city: t(goal.city), v: m.value ?? "?", y: m.year }))
    : m.kind === "portfolio-pct" ? t("EU {y}: the plan's buildings −{v} % energy on average", { y: m.year, v: m.value ?? "?" })
    : t("{y}: every building ≤ {v} kWh/m²", { y: m.year, v: m.value ?? "?" });

  /* save a snapshot for the Step 5 report */
  useEffect(() => {
    if (!timeline || !plan) return;
    const result: StagedPlanState["result"] = {
      computedAt: new Date().toISOString(), currency,
      measures: allSteps.length, fitted: allSteps.length - unscheduled.length, fittedCost: plan.covered, planCost,
      unscheduled: unscheduled.map((s) => `${s.address}: ${partName(s.part)}`),
      milestones: status.map((st) => `${st.met ? "✓" : "✗"} ${msLabel(st.m)}: ${st.n != null ? t("{ok} of {n} buildings", { ok: st.ok, n: st.n }) : `−${st.ok} %`}${st.unreachable.length ? ` — ${t("the plan cannot reach it for: {b}", { b: st.unreachable.join(", ") })}` : ""}`),
      done: doneSteps.map((s) => `${s.address}: ${partName(s.part)} (${settings.done[s.id]})`),
      robustness: regret ? t("Timing shown: optimised for {s}. Most robust to energy prices (minimax regret): optimised for {r}.", {
        s: t(PRICE_FUTURES.find((f) => f.key === (plans[settings.scenario] ? settings.scenario : "base"))!.label), r: t(PRICE_FUTURES.find((f) => f.key === regret.pick)!.label) }) : null,
      rows: timeline.map((r, i) => ({ year: r.year, spend: r.spend, cum: r.cum, budgetCum: r.budgetCum, bill: r.bill, co2T: r.co2Kg / 1000, final: i === settings.years,
        done: r.done.map((s) => `${s.address}: ${partName(s.part)}`).join(" · ") })),
    };
    const prev = JSON.stringify({ ...project.stagedPlan?.result, computedAt: "" });
    if (prev !== JSON.stringify({ ...result, computedAt: "" })) setProject({ stagedPlan: { settings, result } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, plan, regret, status]);

  function advanceYear() {
    if (!plan) return;
    const first = allSteps.filter((s) => !isDone(s.id) && plan.schedule[s.id] === 0);
    const spent = first.reduce((a, s) => a + s.cost, 0);
    update({ done: { ...settings.done, ...Object.fromEntries(first.map((s) => [s.id, settings.startYear])) },
      startYear: settings.startYear + 1, years: Math.max(1, settings.years - 1), budget: Math.max(0, settings.budget - spent) });
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const field = (label: string, value: number | null | string, on: (v: string) => void, w = 90, title?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: white(0.6) }} title={title}>
      {label}<input style={{ ...input, width: w }} type="number" value={value ?? ""} onChange={(e) => on(e.target.value)} />
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0 30px" }}>
      {embedded ? (
        <p style={{ margin: 0, color: white(0.6), fontSize: 13 }}>{t("Spread the packages chosen above over the years within a budget. Enter the number of years and the budget; the optimiser decides which measure is done in which year and recalculates the timeline.")}</p>
      ) : (
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: ACCENT, fontWeight: 700 }}>{t("Renovation Planning · Step 4")}</div>
        <h1 style={{ margin: "4px 0", fontSize: 24, color: "#fff" }}>{t("Staged plan")}</h1>
        <p style={{ margin: 0, color: white(0.6), fontSize: 13.5 }}>{t("Spread the packages chosen in Step 4 over the years within a budget. Enter the number of years and the budget; the optimiser decides which measure is done in which year and recalculates the timeline.")}</p>
      </div>
      )}

      {!buildings.length ? (
        <div style={{ padding: 18, borderRadius: 12, background: white(0.03), border: `1px solid ${white(0.08)}`, color: white(0.7) }}>
          {t("No simulated packages yet. In Step 4, simulate at least one renovation package (and pick one per building if you like); the staged plan spreads those over the years.")}
        </div>
      ) : (<>
      <PanelShell icon={<CalendarClock size={16} />} iconColor={ACCENT} title={t("Plan settings")}
        subtitle={t("{n} buildings, {m} measures, {c} in total", { n: buildings.length, m: allSteps.length, c: money(allSteps.reduce((a, s) => a + s.cost, 0)) })}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field(t("Start year"), settings.startYear, (v) => update({ startYear: Number(v) || settings.startYear }), 80)}
          {field(t("Number of years"), settings.years, (v) => update({ years: Math.max(1, Math.min(40, Number(v) || 1)) }), 70)}
          {field(t("Budget ({c}, whole period)", { c: currency }), settings.budget, (v) => update({ budget: Math.max(0, Number(v) || 0) }), 130)}
          <span style={{ fontSize: 12, color: white(0.5), paddingBottom: 7 }}>= {money(settings.budget / Math.max(1, settings.years))} / {t("year")}</span>
          {field(t("Energy price ({c}/kWh)", { c: currency }), econ.price, (v) => setPriceOverride(num(v)), 80, t("Today's price per kWh of delivered energy (from the planner's assumptions); change it to test your own tariff."))}
          {field(t("CO₂ price ({c}/t)", { c: currency }), settings.carbonPriceSekT, (v) => update({ carbonPriceSekT: Math.max(0, Number(v) || 0) }), 80, t("Price put on each tonne of CO₂e saved or embodied; 0 = carbon not priced."))}
          {field(t("Cost growth (%/yr)"), settings.costGrowthPct, (v) => update({ costGrowthPct: Number(v) || 0 }), 70, t("Real growth of construction prices per year (above inflation)"))}
          {field(t("Max buildings per year"), settings.maxBuildingsPerYear, (v) => update({ maxBuildingsPerYear: v ? Math.max(1, Number(v)) : null }), 70, t("Contractor capacity / tenant disruption; empty = no limit"))}
        </div>
        <p style={{ fontSize: 11.5, color: white(0.45), margin: "10px 0 0" }}>
          {t("Rules: the budget is released evenly over the years and unspent money carries over; windows go with or after the walls of the same building. The optimiser first reaches the ticked climate milestones, then fits as much of the plan as the budget allows, then picks the timing that saves the most money over {n} years.", { n: STUDY_PERIOD_YR })}
          {skipped.length > 0 && <> {t("Left out (no baseline result): {b}.", { b: skipped.join(", ") })}</>}
        </p>
      </PanelShell>

      <PanelShell icon={<Target size={16} />} iconColor="#2FB477" title={t("Climate milestones")}
        subtitle={goal ? `${goal.source}` : t("No climate goal is defined for this city.")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {settings.milestones.map((m) => {
            const st = status.find((x) => x.m.id === m.id);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: white(0.85) }}>
                <input type="checkbox" checked={m.enabled} onChange={(e) => setMilestone(m.id, { enabled: e.target.checked })} />
                <input style={{ ...input, width: 70 }} type="number" value={m.year} onChange={(e) => setMilestone(m.id, { year: Number(e.target.value) || m.year })} />
                <span style={{ minWidth: 320 }}>{msLabel(m)}</span>
                <input style={{ ...input, width: 70 }} type="number" placeholder="?" value={m.value ?? ""} onChange={(e) => setMilestone(m.id, { value: num(e.target.value) })} />
                <span style={{ fontSize: 12, color: !m.enabled || m.value == null ? white(0.4) : st?.met ? "#2FB477" : "#F87171", fontWeight: 600 }}>
                  {!m.enabled ? t("off") : m.value == null ? t("enter a level to use it") : m.year < settings.startYear ? t("before the plan starts")
                    : st ? `${st.met ? "✓" : "✗"} ${st.n != null ? t("{ok} of {n} buildings by {y}", { ok: st.ok, n: st.n, y: m.year }) : t("−{p} % by {y}", { p: st.ok, y: m.year })}` : "…"}
                  {st && st.unreachable.length > 0 && <span style={{ color: "#F87171", fontWeight: 400 }}> — {t("the plan cannot reach it for: {b}", { b: st.unreachable.join(", ") })}</span>}
                </span>
              </div>
            );
          })}
          <p style={{ fontSize: 11.5, color: white(0.45), margin: "4px 0 0" }}>
            {t("The city goal is scored per building against its own simulated baseline. The EU levels follow the Energy Performance of Buildings Directive (residential stock −16 % by 2030 and −20 to 22 % by 2035 vs 2020; today's level stands in for 2020). No 2050 level is set by default — Sweden has not yet set its zero-emission threshold; enter your own.")}
          </p>
        </div>
      </PanelShell>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontSize: 13, color: white(0.8) }}>
        {plan && <span>{t("Fits in the budget")}: <b style={{ color: unscheduled.length ? "#F87171" : "#2FB477" }}>{allSteps.length - doneSteps.length - unscheduled.length} / {allSteps.length - doneSteps.length}</b> {t("measures")} ({money(plan.covered)} {t("of")} {money(planCost)})</span>}
        {busy && <span style={{ color: white(0.5) }}>{t("Optimising the timeline…")}</span>}
        {err && <span style={{ color: "#F87171" }}>{err}</span>}
        {plan && !busy && <span style={{ fontSize: 11.5, color: white(0.4) }}>{t("solved in {s} s", { s: plan.seconds })}</span>}
        <span style={{ flex: 1 }} />
        <button style={btn()} disabled={!plan || busy} onClick={advanceYear}
          title={t("Record the steps planned for {y} as done, move the plan on one year (budget reduced by what was spent) and re-optimise the rest", { y: settings.startYear })}>
          {t("{y} done → re-plan from {n}", { y: settings.startYear, n: settings.startYear + 1 })}</button>
        <button style={btn()} disabled={!doneSteps.length} onClick={() => update({ done: {} })}>{t("Clear done steps")}</button>
      </div>
      {doneSteps.length > 0 && <div style={{ fontSize: 12, color: white(0.6) }}>{t("Already done (kept fixed)")}: {doneSteps.map((s) => `${s.address}: ${partName(s.part)} (${settings.done[s.id]})`).join(" · ")}</div>}
      {unscheduled.length > 0 && (
        <div style={{ fontSize: 12.5, color: "#FCA5A5", padding: "8px 12px", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
          {t("Does not fit within {y} years and {b}: {n} measures for {c} — raise the budget or the number of years:", { y: settings.years, b: money(settings.budget), n: unscheduled.length, c: money(unscheduled.reduce((a, s) => a + s.cost, 0)) })}{" "}
          {unscheduled.map((s) => `${s.address}: ${partName(s.part)}`).join(" · ")}
        </div>
      )}

      {regret && (
        <PanelShell icon={<Scale size={16} />} iconColor="#4ECDC4" title={t("Which timing holds up if energy prices change? (minimax regret)")} defaultOpen={false}
          subtitle={t("Most robust: optimised for {s}", { s: t(PRICE_FUTURES.find((f) => f.key === regret.pick)!.label) })}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: white(0.85) }}>
            <thead><tr style={{ color: white(0.5), textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: 6 }}>{t("Plan optimised for")}</th>
              {PRICE_FUTURES.map((f) => <th key={f.key} style={{ padding: 6 }}>{t("Value if prices turn out")}: {t(f.label)}</th>)}
              <th style={{ padding: 6 }}>{t("Max regret")}</th><th />
            </tr></thead>
            <tbody>
              {regret.rows.map((r) => (
                <tr key={r.key} style={{ borderTop: `1px solid ${white(0.06)}`, background: regret.pick === r.key ? "rgba(185,139,232,0.10)" : undefined }}>
                  <td style={{ padding: 6 }}>{t(r.label)}{regret.pick === r.key && <span style={{ color: ACCENT }}> ★ {t("minimax regret")}</span>}{(settings.scenario === r.key) && <b> ◄ {t("shown")}</b>}</td>
                  {r.v.map((v, i) => <td key={i} style={{ padding: 6, textAlign: "right", color: v < 0 ? "#FCA5A5" : undefined }}>{money(v)}</td>)}
                  <td style={{ padding: 6, textAlign: "right", fontWeight: 700 }}>{money(r.maxRegret)}</td>
                  <td style={{ padding: 6 }}><button style={btn()} disabled={settings.scenario === r.key} onClick={() => update({ scenario: r.key })}>{t("Show this plan")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11.5, color: white(0.45), margin: "8px 0 0" }}>{t("The same measures and milestones, timed for each price future. Value = present value over {n} years of what remains to be done (bills saved minus investment and replacements). Regret = how much less a timing gives than the best timing for the future that actually happens.", { n: STUDY_PERIOD_YR })}</p>
        </PanelShell>
      )}

      {timeline && <StageChart rows={timeline} years={settings.years} money={money} />}

      {timeline && schedule && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 12 }}>
          <div style={{ borderRadius: 12, border: `1px solid ${white(0.08)}`, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: white(0.85) }}>
              <thead><tr style={{ color: white(0.5), background: white(0.03) }}>
                <th style={{ textAlign: "left", padding: 7 }}>{t("Year")}</th><th style={{ textAlign: "right", padding: 7 }}>{t("Spend")}</th>
                <th style={{ textAlign: "right", padding: 7 }}>{t("Spent so far / budget released")}</th><th style={{ textAlign: "left", padding: 7 }}>{t("Measures done this year")}</th>
                <th style={{ textAlign: "right", padding: 7 }}>{t("Energy bills per year")}</th><th style={{ textAlign: "right", padding: 7 }}>{t("CO₂ per year (t)")}</th>
              </tr></thead>
              <tbody>
                {timeline.map((r, i) => (
                  <tr key={r.year} style={{ borderTop: `1px solid ${white(0.06)}`, fontWeight: i === settings.years ? 700 : undefined, background: i === settings.years ? white(0.03) : undefined }}>
                    <td style={{ padding: 7 }}>{i === settings.years ? `${r.year} (${t("after the plan")})` : r.year}</td>
                    <td style={{ padding: 7, textAlign: "right" }}>{r.spend ? money(r.spend) : "–"}</td>
                    <td style={{ padding: 7, textAlign: "right" }}>{i < settings.years ? `${money(r.cum)} / ${money(r.budgetCum)}` : ""}</td>
                    <td style={{ padding: 7 }}>{r.done.map((s) => `${s.address}: ${partName(s.part)}`).join(" · ")}</td>
                    <td style={{ padding: 7, textAlign: "right" }}>{money(r.bill)}</td>
                    <td style={{ padding: 7, textAlign: "right" }}>{fmt(r.co2Kg / 1000, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${white(0.08)}`, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: white(0.85) }}>
              <thead><tr style={{ color: white(0.5), background: white(0.03) }}>
                <th style={{ textAlign: "left", padding: 6 }}>{t("Building")}</th>
                {doneSteps.length > 0 && <th style={{ padding: 6 }} title={t("Already done")}>✓</th>}
                {Array.from({ length: settings.years }, (_, y) => <th key={y} style={{ padding: 6 }}>{String(settings.startYear + y).slice(2)}</th>)}
              </tr></thead>
              <tbody>
                {buildings.map((b) => (
                  <tr key={b.key} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }} title={`${t("Package")}: ${b.packageName}`}>{b.address}</td>
                    {doneSteps.length > 0 && <td style={{ padding: 4, textAlign: "center" }}>{b.steps.filter((s) => isDone(s.id)).map((s) => <Chip key={s.id} s={s} color="#6B7280" title={`${t("Done in {y}", { y: settings.done[s.id] })} — ${t("click to undo")}`}
                      onClick={() => { const { [s.id]: _x, ...rest } = settings.done; update({ done: rest }); }} />)}</td>}
                    {Array.from({ length: settings.years }, (_, y) => (
                      <td key={y} style={{ padding: 4, textAlign: "center" }}>{b.steps.filter((s) => !isDone(s.id) && schedule[s.id] === y).map((s) => <Chip key={s.id} s={s} color={ACCENT} title={`${partName(s.part)}: ${s.label} · ${money(s.cost)}`} />)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: white(0.4), padding: 6 }}>{t("Hover a chip for the measure and its price.")}</div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

const SHORT: Record<string, string> = { Walls: "W", Windows: "Wi", Roof: "R", Floor: "F", Doors: "D", Balcony: "B" };
function Chip({ s, color, title, onClick }: { s: StageStep; color: string; title: string; onClick?: () => void }) {
  return <span title={title} onClick={onClick} style={{ display: "inline-block", minWidth: 18, padding: "0 4px", margin: 1, borderRadius: 4, background: color, color: "#fff", fontSize: 10.5, fontWeight: 700, cursor: onClick ? "pointer" : "default" }}>{SHORT[s.part] ?? s.part.slice(0, 2)}</span>;
}

/* spend per year (bars) vs budget released per year (dashed), CO₂ per year (line) */
function StageChart({ rows, years, money }: { rows: ReturnType<typeof stageTimeline>; years: number; money: (v: number) => string }) {
  const t = useT();
  const W = 900, H = 170, L = 60, R = 56, T = 12, B = 24, iw = W - L - R, ih = H - T - B;
  const plan = rows.slice(0, years);
  const perYear = plan[0]?.budgetCum ?? 0;
  const maxS = Math.max(1, perYear, ...plan.map((r) => r.spend));
  const maxC = Math.max(1, ...rows.map((r) => r.co2Kg / 1000));
  const bw = iw / years;
  const yS = (v: number) => T + ih - (v / maxS) * ih, yC = (v: number) => T + ih - (v / maxC) * ih;
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${white(0.08)}`, background: white(0.02), padding: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 170, display: "block" }} role="img" aria-label={t("Spend and CO₂ per year")}>
        <line x1={L} y1={T + ih} x2={L + iw} y2={T + ih} stroke={white(0.2)} />
        <text x={4} y={T + 9} fontSize="10" fill={ACCENT}>{money(maxS)}</text>
        <text x={W - R + 4} y={T + 9} fontSize="10" fill="#F87171">{Math.round(maxC)} t CO₂</text>
        {plan.map((r, i) => (
          <g key={r.year}>
            <rect x={L + i * bw + bw * 0.15} y={yS(r.spend)} width={bw * 0.7} height={T + ih - yS(r.spend)} fill={ACCENT} opacity={0.85}><title>{`${r.year}: ${money(r.spend)}`}</title></rect>
            <text x={L + i * bw + bw / 2} y={H - 6} fontSize="10" textAnchor="middle" fill={white(0.55)}>{r.year}</text>
          </g>
        ))}
        <line x1={L} y1={yS(perYear)} x2={L + iw} y2={yS(perYear)} stroke="#E5D4FA" strokeDasharray="5 4" opacity={0.7} />
        <polyline fill="none" stroke="#F87171" strokeWidth={2} points={rows.map((r, i) => `${L + Math.min(i, years) * bw},${yC(r.co2Kg / 1000)}`).join(" ")} />
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 11, color: white(0.55), padding: "0 4px" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: ACCENT, marginRight: 4 }} />{t("spend per year")}</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "2px dashed #E5D4FA", verticalAlign: "middle", marginRight: 4 }} />{t("budget released per year")}</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "2px solid #F87171", verticalAlign: "middle", marginRight: 4 }} />{t("CO₂ per year (right axis)")}</span>
      </div>
    </div>
  );
}
