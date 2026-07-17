import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationCalcPackage, type RenovationCalcBuildingResult, type RenovationCalcSelection } from "../store/wizard";
import { api } from "../api/client";
import { lineItemsFor, type AreaLineItem } from "../config/componentAreaLineItems";
import { resolveBuildingGeometry, computeAreaForLineItem, quantityUnitLabel, type ResolvedBuildingGeometry } from "../utils/componentAreas";
import { itemsForLineItem, estimateCarbon, recommendationsForLineItem, type KpiKey } from "../utils/materialRecommendation";
import {
  loadUkArchetypes, findUkArchetype, REFURB_TIERS,
  type TabulaArchetypeGB, type RefurbTierKey,
} from "../utils/ukArchetype";
import { UK_PLACEHOLDER_RATES, fmtGBP } from "../config/ukPlaceholderCostCarbon";
import { useWizardStepNav } from "../components/wizardNav";
import type { WikellsItem } from "../config/wikellsData";
import type { BoverketResource, WWRRecord } from "../types";
import { Loader2, CheckCircle2, XCircle, Plus, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

/* Sweden/Gothenburg is the only geometry+cost+carbon-complete dataset - UK
 * buildings resolve via /api/uk/building and get real EPSM energy
 * simulation, but there's no UK cost/carbon catalogue equivalent to
 * Wikells/Boverket yet, so UK packages price via SYNTHETIC placeholder
 * rates (see ukPlaceholderCostCarbon.ts) and use TABULA GB's whole-building
 * refurbishment tiers in place of a per-component material picker.
 *
 * Every package here is submitted as ONE EPSM batch across every building
 * selected in Step 2 (see backend's /api/simulation-batch-submit) - not
 * just the first one - so a package's cost/carbon/energy are per-building
 * (footprint/wall area differ per building) and the comparison table shows
 * portfolio aggregates with a per-building breakdown on expand. */
const CITY_ID = "gothenburg"; // Sweden only - UK omits city_id, server auto-resolves the nearest district from lat/lon
const UK_TIER_SELECTIONS_KEY = "UK::RefurbTier";

const COMPONENT_COLORS: Record<string, string> = {
  "Walls": "#721CB8", "Windows": "#F59E0B", "Doors": "#4ECDC4", "Floor": "#4A90E2",
  "Roof": "#4ECDC4", "Balcony": "#96D74C", "Vertical Extension (New Floor)": "#F97316",
};

function fmtSEK(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " SEK";
}
function uLabel(u?: number) {
  if (!u) return null;
  if (u <= 0.13) return { label: "Excellent", color: "#96D74C" };
  if (u <= 0.20) return { label: "Good", color: "#4ECDC4" };
  if (u <= 0.30) return { label: "Standard", color: "#F59E0B" };
  return { label: "Basic", color: "#EF4444" };
}

function ukOverridesFromTier(tier: TabulaArchetypeGB[RefurbTierKey] | undefined | null): Record<string, number> {
  const overrides: Record<string, number> = {};
  if (!tier) return overrides;
  if (tier.u_wall != null) overrides.u_wall_override = tier.u_wall;
  if (tier.u_roof != null) overrides.u_roof_override = tier.u_roof;
  if (tier.u_window != null) overrides.u_win_override = tier.u_window;
  return overrides;
}

function overridesFromSeSelections(
  selections: Record<string, RenovationCalcSelection>,
  itemByCode: Record<string, WikellsItem>
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const [key, sel] of Object.entries(selections)) {
    const wikellsItem = itemByCode[sel.wikellsCode];
    if (!wikellsItem?.uValue) continue;
    if (key === "Walls" || key === "VertExt::Walls") overrides.u_wall_override = wikellsItem.uValue;
    if (key === "Roof" || key === "VertExt::Roof") overrides.u_roof_override = wikellsItem.uValue;
    if (key === "Windows") overrides.u_win_override = wikellsItem.uValue;
    if (key === "Floor" || key === "VertExt::Floor") overrides.u_floor_override = wikellsItem.uValue;
  }
  return overrides;
}

/** Aggregate a package's per-building rows into portfolio-level figures for
 * the comparison table - energy is averaged (it's a per-m² rate, comparable
 * across differently-sized buildings), cost/carbon are summed (portfolio
 * totals, not rates). */
function pkgAggregate(pkg: RenovationCalcPackage) {
  const n = pkg.buildings.length;
  const completed = pkg.buildings.filter((b) => b.status === "completed").length;
  const failed = pkg.buildings.filter((b) => b.status === "failed").length;
  const avg = (xs: (number | null)[]) => {
    const vals = xs.filter((x): x is number => x != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const sumOrNull = (xs: (number | null)[]) =>
    xs.some((x) => x != null) ? Math.round(xs.reduce((a: number, x) => a + (x ?? 0), 0)) : null;
  return {
    n, completed, failed, pending: n - completed - failed,
    avgHeatingKwhM2Yr: avg(pkg.buildings.map((b) => b.heatingKwhM2Yr)),
    avgCoolingKwhM2Yr: avg(pkg.buildings.map((b) => b.coolingKwhM2Yr)),
    avgTotalKwhM2Yr: avg(pkg.buildings.map((b) => b.totalKwhM2Yr)),
    totalCostSEK: sumOrNull(pkg.buildings.map((b) => b.costSEK)),
    totalCarbonKgCO2e: sumOrNull(pkg.buildings.map((b) => b.carbonKgCO2e)),
  };
}

/* ─── Material picker for one area line item (single-select) ─────────────── */
function LineItemPicker({
  item, items, selectedCode, onSelect, recommendations, boverketResources,
}: {
  item: AreaLineItem;
  items: WikellsItem[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  recommendations: Record<string, KpiKey[]>;
  boverketResources: BoverketResource[];
}) {
  const color = COMPONENT_COLORS[item.parentComponent] ?? "#721CB8";
  if (items.length === 0) {
    return <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No catalogue materials found for this item.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
      {items.map((it) => {
        const checked = selectedCode === it.code;
        const carbon = estimateCarbon(it, boverketResources);
        const ul = uLabel(it.uValue);
        const tags = recommendations[it.code] ?? [];
        return (
          <button
            key={it.code}
            onClick={() => onSelect(it.code)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${checked ? `${color}55` : "transparent"}`,
              background: checked ? `${color}18` : "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{
              width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${checked ? color : "rgba(255,255,255,0.2)"}`,
              background: checked ? color : "transparent",
            }} />
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{it.code}</span>
            <span style={{ flex: 1, fontSize: 11, color: checked ? "#fff" : "rgba(255,255,255,0.65)", lineHeight: 1.3 }}>{it.description}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
              {fmtSEK(it.costSEK)}/{item.quantityKind === "area" ? "m²" : "st"}
            </span>
            {ul && (
              <span style={{ fontSize: 9, fontWeight: 700, color: ul.color, background: `${ul.color}22`, borderRadius: 8, padding: "1px 5px", flexShrink: 0 }}>
                U={it.uValue}
              </span>
            )}
            <span style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", borderRadius: 8, padding: "1px 5px", flexShrink: 0 }}>
              ~{carbon.value} kg CO₂e{carbon.confidence !== "legacy" ? "?" : ""}
            </span>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: 9, fontWeight: 700, color: "#96D74C", background: "rgba(150,215,76,0.14)", borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>
                ★ {t}
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}

/* ─── UK refurbishment-tier picker (whole-building, not per-component) ────── */
function UkTierPicker({
  archetype, selectedTier, onSelect, footprintM2, buildingCount, uSource,
}: {
  archetype: TabulaArchetypeGB | null;
  selectedTier: RefurbTierKey | null;
  onSelect: (tier: RefurbTierKey) => void;
  footprintM2: number | null;
  buildingCount: number;
  uSource: string | null;
}) {
  if (!archetype) {
    return (
      <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
        <p style={{ fontSize: 12, color: "#F59E0B", margin: 0 }}>
          No TABULA GB archetype matched this building's type/era - envelope U-value overrides aren't available, but a
          baseline EnergyPlus simulation can still run on the as-built defaults.
        </p>
      </div>
    );
  }
  const eraLabel = uSource === "known_year" ? "known construction year" : uSource === "ehs_sampled_period" ? "estimated era" : "era unknown";
  const eraColor = uSource === "known_year" ? "#96D74C" : "#F59E0B";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ borderRadius: 10, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span>As-built (TABULA {archetype.type_label}, {archetype.period_label}) - matched from building 1{buildingCount > 1 ? ` of ${buildingCount}` : ""}</span>
          <span style={{ color: eraColor, background: `${eraColor}22`, padding: "1px 7px", borderRadius: 8, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
            {eraLabel}
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {(["u_wall", "u_roof", "u_window", "u_floor"] as const).map((k) => (
            archetype.as_built[k] != null && (
              <span key={k} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {k.replace("u_", "U-")}: <b style={{ color: "rgba(255,255,255,0.8)" }}>{archetype.as_built[k]}</b>
              </span>
            )
          ))}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            TABULA estimate: <b style={{ color: "rgba(255,255,255,0.8)" }}>{archetype.as_built.kwh_m2_yr} kWh/m²/yr</b>
          </span>
        </div>
      </div>

      {REFURB_TIERS.map(({ key, label }) => {
        const tier = archetype[key];
        const checked = selectedTier === key;
        const color = "#721CB8";
        const rate = UK_PLACEHOLDER_RATES[key];
        const estCost = footprintM2 != null ? Math.round(rate.costGbpPerM2 * footprintM2) : null;
        const estCarbon = footprintM2 != null ? Math.round(rate.carbonKgCo2ePerM2 * footprintM2) : null;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${checked ? `${color}55` : "rgba(255,255,255,0.08)"}`,
              background: checked ? `${color}18` : "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${checked ? color : "rgba(255,255,255,0.2)"}`,
                background: checked ? color : "transparent",
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: checked ? "#fff" : "rgba(255,255,255,0.75)" }}>{label}</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingLeft: 23 }}>
              {(["u_wall", "u_roof", "u_window", "u_door"] as const).map((k) => (
                tier[k] != null && (
                  <span key={k} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {k.replace("u_", "U-")}: <b style={{ color: "rgba(255,255,255,0.8)" }}>{tier[k]}</b>
                  </span>
                )
              ))}
              <span style={{ fontSize: 11, color: "#60a5fa" }}>
                TABULA estimate: <b>{tier.kwh_m2_yr} kWh/m²/yr</b>
              </span>
              {estCost != null && estCarbon != null && (
                <span style={{ fontSize: 11, color: "#F59E0B" }}>
                  ~{fmtGBP(estCost)} · ~{estCarbon.toLocaleString("en-GB")} kg CO₂e <i>(building 1, placeholder)</i>
                </span>
              )}
            </div>
          </button>
        );
      })}
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>
        Cost and embodied carbon for UK packages are SYNTHETIC PLACEHOLDER figures (flat £/m² and kg CO₂e/m² rates,
        not derived from any real dataset) shown only to test the calculator pipeline end-to-end - replace with a
        real, licensed UK cost/carbon source before using these numbers for an actual decision. The energy columns
        below come from a real EnergyPlus simulation using this tier's U-values, applied to every selected building.
      </p>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationSimulator() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const isUK = project.country === "United Kingdom";
  const COUNTRY = isUK ? "gb" : "se";

  const components = project.renovationEnvelopeComponents.length > 0
    ? project.renovationEnvelopeComponents
    : ["Walls", "Roof", "Windows"];
  const lineItems = useMemo(() => lineItemsFor(components), [components]);

  /* Every building selected in Step 2 - not just the first one. */
  const buildings = useMemo(() => {
    if (project.lookedUpBuildings.length > 0) return project.lookedUpBuildings;
    if (project.lookedUpBuilding) return [project.lookedUpBuilding];
    return project.bboxRows;
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows]);

  const geometries = useMemo(
    () => buildings.map((b) => resolveBuildingGeometry(b)).filter((g): g is ResolvedBuildingGeometry => g !== null),
    [buildings]
  );

  const [wwrByIndex, setWwrByIndex] = useState<Record<number, WWRRecord | null>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [boverketByComponent, setBoverketByComponent] = useState<Record<string, BoverketResource[]>>({});
  const [activeItemKey, setActiveItemKey] = useState<string>(lineItems[0]?.key ?? "");
  const [draftSelection, setDraftSelection] = useState<Record<string, string>>({});
  const [ukArchetype, setUkArchetype] = useState<TabulaArchetypeGB | null>(null);
  const [ukTier, setUkTier] = useState<RefurbTierKey | null>(null);
  const [packageName, setPackageName] = useState("");
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  // A ref, not state: React StrictMode double-invokes effects in dev without
  // an intervening re-render, so a useState guard here would let both
  // invocations see the same stale "not yet initialized" value and both
  // submit a baseline batch. A ref mutation is synchronous and immediately
  // visible to the second invocation.
  const initializedRef = useRef(false);
  const pollHandles = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const packages = project.renovationCalcPackages;

  const stopPoll = useCallback((packageId: string) => {
    const h = pollHandles.current[packageId];
    if (h) { clearInterval(h); delete pollHandles.current[packageId]; }
  }, []);

  const pollBatch = useCallback((packageId: string, batchId: string) => {
    stopPoll(packageId);
    const tick = async () => {
      try {
        const status = await api.simulationBatchStatus(batchId);
        setProject({
          renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) => {
            if (p.id !== packageId) return p;
            return {
              ...p,
              buildings: p.buildings.map((b, i) => {
                const row = status.buildings[i];
                if (!row) return b;
                return {
                  ...b,
                  status: (row.status as RenovationCalcBuildingResult["status"]) ?? b.status,
                  heatingKwhM2Yr: row.results?.heating_kwh_m2_yr ?? b.heatingKwhM2Yr,
                  coolingKwhM2Yr: row.results?.cooling_kwh_m2_yr ?? b.coolingKwhM2Yr,
                  totalKwhM2Yr: row.results?.total_kwh_m2_yr ?? b.totalKwhM2Yr,
                  error: row.error ?? b.error,
                };
              }),
            };
          }),
        });
        if (status.buildings.every((b) => b.status === "completed" || b.status === "failed")) {
          stopPoll(packageId);
        }
      } catch {
        // Transient network hiccup - keep polling.
      }
    };
    tick();
    pollHandles.current[packageId] = setInterval(tick, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPoll]);

  const submitBatch = useCallback(async (packageId: string, overrides: Record<string, number>, packageLabel?: string) => {
    try {
      const { batch_id } = await api.simulationBatchSubmit({
        country: COUNTRY,
        ...(isUK ? {} : { city_id: CITY_ID }),
        buildings: geometries.map((g) => ({ lat: g.lat, lon: g.lon, address: g.address })),
        package_id: packageId, package_label: packageLabel ?? null,
        ...overrides,
      });
      setProject({
        renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
          p.id === packageId ? { ...p, batchId: batch_id } : p
        ),
      });
      pollBatch(packageId, batch_id);
    } catch (err) {
      setProject({
        renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
          p.id === packageId
            ? { ...p, buildings: p.buildings.map((b) => ({ ...b, status: "failed" as const, error: (err as Error).message })) }
            : p
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries, isUK, pollBatch]);

  function makeBuildingRows(
    costCarbonFor?: (g: ResolvedBuildingGeometry, i: number) => { costSEK: number | null; carbonKgCO2e: number | null }
  ): RenovationCalcBuildingResult[] {
    return geometries.map((g, i) => {
      const cc = costCarbonFor ? costCarbonFor(g, i) : { costSEK: null, carbonKgCO2e: null };
      return {
        address: g.address ?? `Building ${i + 1}`, lat: g.lat, lon: g.lon, status: "queued",
        heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null,
        costSEK: cc.costSEK, carbonKgCO2e: cc.carbonKgCO2e, error: null,
      };
    });
  }

  const submitBaseline = useCallback(() => {
    if (geometries.length === 0) return;
    const pkg: RenovationCalcPackage = {
      id: "baseline", name: "Baseline (as-built)", color: "rgba(255,255,255,0.4)", isBaseline: true,
      selections: {}, batchId: null, buildings: makeBuildingRows(),
    };
    setProject({ renovationCalcPackages: [...useWizardStore.getState().project.renovationCalcPackages.filter((p) => p.id !== "baseline"), pkg] });
    submitBatch("baseline", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries, submitBatch]);

  /* ── fetch WWR (per building) + Boverket/TABULA data + submit baseline ── */
  useEffect(() => {
    if (geometries.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    Promise.all(
      geometries.map((g) => api.lookupWWR(g.lat, g.lon).then((r) => (r.found ? r.record : null)).catch(() => null))
    ).then((records) => setWwrByIndex(Object.fromEntries(records.map((r, i) => [i, r] as const))));

    if (isUK) {
      loadUkArchetypes().then((archetypes) => {
        // tabulaPeriodUsed (not tabulaPeriod) always carries whichever period actually
        // drove the backend's own TABULA lookup - real known year OR an EHS-sampled
        // era - so this matches the SAME archetype the building's as-built u-values
        // came from, rather than falling back to an arbitrary one when the era was
        // sampled (the common case - tabulaPeriod itself stays null for those).
        setUkArchetype(findUkArchetype(archetypes, geometries[0]!.useCat, geometries[0]!.tabulaPeriodUsed));
      }).catch(() => { /* no archetype match available */ });
    } else {
      const uniqueComponents = Array.from(new Set(lineItems.map((li) => li.boverketComponent)));
      Promise.all(uniqueComponents.map((c) => api.boverketMaterials(c).then((res) => [c, res] as const).catch(() => [c, []] as const)))
        .then((pairs) => setBoverketByComponent(Object.fromEntries(pairs)));
    }

    const existing = useWizardStore.getState().project.renovationCalcPackages;
    if (!existing.some((p) => p.isBaseline)) {
      submitBaseline();
    } else {
      for (const pkg of existing) {
        if (pkg.batchId && pkg.buildings.some((b) => b.status === "queued" || b.status === "running")) {
          pollBatch(pkg.id, pkg.batchId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries.length]);

  useEffect(() => {
    const handles = pollHandles.current;
    return () => { Object.values(handles).forEach(clearInterval); };
  }, []);

  /* ── derived: items/areas/recommendations for the active line item (Sweden only) ── */
  const activeItem = lineItems.find((li) => li.key === activeItemKey) ?? lineItems[0];
  const activeCatalogue = activeItem ? itemsForLineItem(activeItem) : [];
  const activeBoverket = activeItem ? (boverketByComponent[activeItem.boverketComponent] ?? []) : [];
  const activeRecommendations = useMemo(
    () => (activeItem ? recommendationsForLineItem(activeCatalogue, activeBoverket, project.selectedKpis) : {}),
    [activeItem, activeCatalogue, activeBoverket, project.selectedKpis]
  );
  const activeQuantity = activeItem && geometries[0] ? computeAreaForLineItem(activeItem, geometries[0], wwrByIndex[0] ?? null, manualOverrides) : null;

  const itemByCode = useMemo(() => {
    const all = lineItems.flatMap((li) => itemsForLineItem(li));
    return Object.fromEntries(all.map((i) => [i.code, i]));
  }, [lineItems]);

  const boverketAll = useMemo(() => Object.values(boverketByComponent).flat(), [boverketByComponent]);

  /* ── add a new package ─────────────────────────────────────────────────── */
  const PACKAGE_COLORS = ["#721CB8", "#4ECDC4", "#F59E0B", "#96D74C", "#F97316", "#5FA5FF"];

  function addPackage() {
    if (geometries.length === 0) return;
    if (isUK) {
      addUkPackage();
      return;
    }
    const selections: Record<string, RenovationCalcSelection> = {};
    for (const item of lineItems) {
      const code = draftSelection[item.key];
      if (!code) continue;
      selections[item.key] = { wikellsCode: code, quantity: 0 };
    }
    if (Object.keys(selections).length === 0) return;

    const id = `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const name = packageName.trim() || `Package ${packages.filter((p) => !p.isBaseline).length + 1}`;
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;

    const buildingRows = makeBuildingRows((g, i) => {
      let costSEK = 0, carbonKgCO2e = 0, any = false;
      for (const item of lineItems) {
        const sel = selections[item.key];
        if (!sel) continue;
        const quantity = computeAreaForLineItem(item, g, wwrByIndex[i] ?? null, manualOverrides);
        if (quantity == null) continue;
        const wikellsItem = itemByCode[sel.wikellsCode];
        if (wikellsItem) {
          any = true;
          costSEK += wikellsItem.costSEK * quantity;
          carbonKgCO2e += estimateCarbon(wikellsItem, boverketAll).value * quantity;
        }
      }
      return any ? { costSEK: Math.round(costSEK), carbonKgCO2e: Math.round(carbonKgCO2e) } : { costSEK: null, carbonKgCO2e: null };
    });

    const pkg: RenovationCalcPackage = { id, name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows };
    setProject({ renovationCalcPackages: [...packages, pkg] });
    setPackageName("");
    setDraftSelection({});
    submitBatch(id, overridesFromSeSelections(selections, itemByCode), name);
  }

  function addUkPackage() {
    if (geometries.length === 0 || !ukArchetype || !ukTier) return;
    const tier = ukArchetype[ukTier];
    const tierMeta = REFURB_TIERS.find((t) => t.key === ukTier)!;
    const rate = UK_PLACEHOLDER_RATES[ukTier];

    const id = `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const name = packageName.trim() || tierMeta.label;
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;

    const buildingRows = makeBuildingRows((g) => {
      const footprint = g.footprintM2 ?? 0;
      return footprint
        ? { costSEK: Math.round(rate.costGbpPerM2 * footprint), carbonKgCO2e: Math.round(rate.carbonKgCo2ePerM2 * footprint) }
        : { costSEK: null, carbonKgCO2e: null };
    });

    const pkg: RenovationCalcPackage = {
      id, name, color, isBaseline: false,
      selections: { [UK_TIER_SELECTIONS_KEY]: { wikellsCode: ukTier, quantity: 1 } },
      batchId: null, buildings: buildingRows,
    };
    setProject({ renovationCalcPackages: [...packages, pkg] });
    setPackageName("");
    setUkTier(null);
    submitBatch(id, ukOverridesFromTier(tier), name);
  }

  function retryPackage(pkg: RenovationCalcPackage) {
    if (geometries.length === 0) return;
    let overrides: Record<string, number> = {};
    if (isUK) {
      const sel = pkg.selections[UK_TIER_SELECTIONS_KEY];
      const tierKey = sel?.wikellsCode as RefurbTierKey | undefined;
      const tier = tierKey && ukArchetype ? ukArchetype[tierKey] : null;
      overrides = ukOverridesFromTier(tier);
    } else {
      overrides = overridesFromSeSelections(pkg.selections, itemByCode);
    }
    setProject({
      renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
        p.id === pkg.id ? { ...p, buildings: p.buildings.map((b) => ({ ...b, status: "queued" as const, error: null })) } : p
      ),
    });
    submitBatch(pkg.id, overrides, pkg.name);
  }

  const baselinePkg = packages.find((p) => p.isBaseline);
  const baselineAgg = baselinePkg ? pkgAggregate(baselinePkg) : null;

  function handleSaveAndContinue() {
    setProject({
      renovationSimResults: packages.filter((p) => !p.isBaseline).map((p, i) => {
        const agg = pkgAggregate(p);
        const total = agg.avgTotalKwhM2Yr ?? baselineAgg?.avgTotalKwhM2Yr ?? 0;
        const baseTotal = baselineAgg?.avgTotalKwhM2Yr ?? total;
        const saving = Math.max(0, Math.round(baseTotal - total));
        const carbonSaving = agg.totalCarbonKgCO2e != null && baselineAgg?.totalCarbonKgCO2e != null
          ? Math.max(0, Math.round(baselineAgg.totalCarbonKgCO2e - agg.totalCarbonKgCO2e))
          : Math.round(saving * 0.2);
        return {
          packageIndex: i + 1,
          components: Object.fromEntries(Object.entries(p.selections).map(([k, s]) => {
            const it = itemByCode[s.wikellsCode];
            return [k, { code: s.wikellsCode, description: it?.description ?? s.wikellsCode, costSEK: it?.costSEK ?? 0, uValue: it?.uValue }];
          })),
          energyUse: total, saving, carbonSaving,
          cost: agg.totalCostSEK ?? 0,
        };
      }),
    });
    navigate("/step/5");
  }

  const canAddPackage = isUK ? ukTier != null : Object.keys(draftSelection).length > 0;

  // The wizard footer's Continue saves this step's results before advancing.
  useWizardStepNav({ onNext: handleSaveAndContinue });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 4
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Renovation Calculator</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          {geometries.length > 1
            ? `Pick ${isUK ? "a TABULA refurbishment tier" : "a material per component"}, add it as a package, and run a real EnergyPlus simulation across all ${geometries.length} buildings selected in Step 2 at once.`
            : isUK
              ? "Pick a TABULA refurbishment tier and compare real EnergyPlus-simulated performance against the building's as-built baseline."
              : "Pick a material per component, add it as a package, and compare real cost, embodied carbon, and EnergyPlus-simulated performance against the building's as-built baseline."}
        </p>
      </div>

      {geometries.length === 0 && (
        <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p style={{ fontSize: 12, color: "#F59E0B", margin: 0 }}>No buildings resolved yet — go back to Step 1/2 and select a location.</p>
        </div>
      )}

      {geometries.length > 0 && isUK && (
        <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(114,28,184,0.2)" }}>
          <UkTierPicker
            archetype={ukArchetype} selectedTier={ukTier} onSelect={setUkTier}
            footprintM2={geometries[0]?.footprintM2 ?? null} buildingCount={geometries.length}
            uSource={geometries[0]?.tabulaUSource ?? null}
          />
        </div>
      )}

      {geometries.length > 0 && !isUK && (
        <>
          {/* Component tabs + material picker (quantities shown are for building 1; each
              building's own quantity is computed at submission time from its own geometry) */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, marginBottom: 4, textTransform: "uppercase" }}>
                Area line items
              </div>
              {lineItems.map((item) => {
                const color = COMPONENT_COLORS[item.parentComponent] ?? "#721CB8";
                const isActive = activeItemKey === item.key;
                const hasSelection = !!draftSelection[item.key];
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveItemKey(item.key)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 10, border: `1px solid ${isActive ? `${color}55` : "rgba(255,255,255,0.07)"}`,
                      background: isActive ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: hasSelection ? color : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>{item.label}</span>
                    </div>
                  </button>
                );
              })}
              {lineItems.length === 0 && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
                  No components selected. Go back to Step 1.
                </p>
              )}
            </div>

            {activeItem && (
              <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: `1px solid ${COMPONENT_COLORS[activeItem.parentComponent] ?? "#721CB8"}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{activeItem.label}</h3>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {activeQuantity != null
                      ? `${activeQuantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${quantityUnitLabel(activeItem.quantityKind)}${geometries.length > 1 ? " (building 1)" : ""}`
                      : "quantity: manual entry needed"}
                  </span>
                </div>
                {activeQuantity == null && (
                  <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number"
                      placeholder={`Enter ${quantityUnitLabel(activeItem.quantityKind)}`}
                      onChange={(e) => setManualOverrides((m) => ({ ...m, [activeItem.key]: Number(e.target.value) || 0 }))}
                      style={{ width: 140, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      {activeItem.key === "Doors" ? "no automatic signal — enter a door count (applied to every building)" : "no data source for this building yet"}
                    </span>
                  </div>
                )}
                <LineItemPicker
                  item={activeItem}
                  items={activeCatalogue}
                  selectedCode={draftSelection[activeItem.key] ?? null}
                  onSelect={(code) => setDraftSelection((d) => ({ ...d, [activeItem.key]: code }))}
                  recommendations={activeRecommendations}
                  boverketResources={activeBoverket}
                />
              </div>
            )}
          </div>
        </>
      )}

      {geometries.length > 0 && (
        <>
          {/* Add package */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="Package name (optional)"
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12 }}
            />
            <button
              onClick={addPackage}
              disabled={!canAddPackage}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1px solid rgba(150,215,76,0.4)", background: "rgba(150,215,76,0.12)", color: "#96D74C",
                cursor: canAddPackage ? "pointer" : "not-allowed",
                opacity: canAddPackage ? 1 : 0.5,
              }}
            >
              <Plus size={13} /> Add package{geometries.length > 1 ? ` (${geometries.length} buildings)` : ""}
            </button>
          </div>

          {/* Comparison table - one row per package, portfolio aggregates, expandable per-building breakdown */}
          <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "24px 1.4fr 110px 110px 110px 110px 110px 110px", gap: 10, padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
              {["", "Package", "Cost", "Carbon", "Heating", "Cooling", "Total", "Status"].map((h) => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>{h}</span>
              ))}
            </div>
            {[...packages].sort((a, b) => (a.isBaseline ? -1 : b.isBaseline ? 1 : 0)).map((pkg) => {
              const agg = pkgAggregate(pkg);
              const expanded = expandedPkg === pkg.id;
              return (
                <div key={pkg.id}>
                  <div style={{ display: "grid", gridTemplateColumns: "24px 1.4fr 110px 110px 110px 110px 110px 110px", gap: 10, padding: "8px 4px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <button
                      onClick={() => setExpandedPkg(expanded ? null : pkg.id)}
                      style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 0 }}
                      title={expanded ? "Hide per-building breakdown" : "Show per-building breakdown"}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span style={{ fontSize: 12, fontWeight: 600, color: pkg.isBaseline ? "rgba(255,255,255,0.5)" : "#fff" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: pkg.color, marginRight: 6 }} />
                      {pkg.name}{agg.n > 1 ? ` (${agg.n} buildings)` : ""}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }} title={isUK && agg.totalCostSEK != null ? "Synthetic placeholder - not a real UK cost source" : undefined}>
                      {agg.totalCostSEK == null ? "—" : isUK ? `${fmtGBP(agg.totalCostSEK)}*` : fmtSEK(agg.totalCostSEK)}
                    </span>
                    <span style={{ fontSize: 12, color: "#60a5fa" }} title={isUK && agg.totalCarbonKgCO2e != null ? "Synthetic placeholder - not a real UK carbon source" : undefined}>
                      {agg.totalCarbonKgCO2e == null ? "—" : isUK ? `${agg.totalCarbonKgCO2e.toLocaleString("en-GB")} kg*` : `${agg.totalCarbonKgCO2e.toLocaleString("sv-SE")} kg`}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{agg.avgHeatingKwhM2Yr ?? "—"}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{agg.avgCoolingKwhM2Yr ?? "—"}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#96D74C" }}>{agg.avgTotalKwhM2Yr ?? "—"}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {agg.pending > 0 && <Loader2 size={13} color="#F59E0B" style={{ animation: "spin 1s linear infinite" }} />}
                      {agg.pending === 0 && agg.failed === 0 && <CheckCircle2 size={13} color="#96D74C" />}
                      {agg.failed > 0 && (
                        <>
                          <XCircle size={13} color="#EF4444" />
                          <button onClick={() => retryPackage(pkg)} title="Retry failed buildings" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#EF4444" }}>
                            <RefreshCw size={12} />
                          </button>
                        </>
                      )}
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{agg.completed}/{agg.n}</span>
                    </span>
                  </div>
                  {expanded && (
                    <div style={{ padding: "6px 4px 10px 34px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {pkg.buildings.map((b) => (
                        <div key={`${pkg.id}-${b.address}-${b.lat}-${b.lon}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 110px 110px 110px 110px 110px", gap: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.address}</span>
                          <span>{b.costSEK == null ? "—" : isUK ? fmtGBP(b.costSEK) : fmtSEK(b.costSEK)}</span>
                          <span>{b.carbonKgCO2e == null ? "—" : `${b.carbonKgCO2e.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}</span>
                          <span>{b.heatingKwhM2Yr ?? "—"}</span>
                          <span>{b.coolingKwhM2Yr ?? "—"}</span>
                          <span>{b.totalKwhM2Yr ?? "—"}</span>
                          <span style={{ color: b.status === "failed" ? "#fca5a5" : b.status === "completed" ? "#96D74C" : "#F59E0B" }} title={b.error ?? undefined}>
                            {b.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {packages.length === 0 && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "8px 4px" }}>No packages yet.</p>
            )}
            {isUK && packages.some((p) => pkgAggregate(p).totalCostSEK != null) && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "6px 4px 0" }}>
                * Synthetic placeholder cost/carbon (not a real UK data source) - see ukPlaceholderCostCarbon.ts.
              </p>
            )}
          </div>

        </>
      )}
    </div>
  );
}
