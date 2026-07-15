import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationCalcPackage } from "../store/wizard";
import { api } from "../api/client";
import { lineItemsFor, type AreaLineItem } from "../config/componentAreaLineItems";
import { resolveBuildingGeometry, computeAreaForLineItem, quantityUnitLabel } from "../utils/componentAreas";
import { itemsForLineItem, estimateCarbon, recommendationsForLineItem, type KpiKey } from "../utils/materialRecommendation";
import { useSimulationPoller } from "../hooks/useSimulationPoller";
import type { WikellsItem } from "../config/wikellsData";
import type { BoverketResource, WWRRecord } from "../types";
import { Loader2, CheckCircle2, XCircle, Plus, RefreshCw } from "lucide-react";

/* Sweden/Gothenburg is the only real building dataset with EPSM weather
 * wired up (see backend's CITY_TO_EPW) - the wizard has no UK-building
 * resolution path yet, unlike the classic 3D viewer. */
const COUNTRY = "se";
const CITY_ID = "gothenburg";

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

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationSimulator() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();
  const { submitAndPoll, resumePoll } = useSimulationPoller();

  const components = project.renovationEnvelopeComponents.length > 0
    ? project.renovationEnvelopeComponents
    : ["Walls", "Roof", "Windows"];
  const lineItems = useMemo(() => lineItemsFor(components), [components]);

  const building = project.lookedUpBuilding ?? project.lookedUpBuildings[0] ?? project.bboxRows[0] ?? null;
  const geometry = useMemo(() => resolveBuildingGeometry(building), [building]);

  const [wwr, setWwr] = useState<WWRRecord | null>(null);
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [boverketByComponent, setBoverketByComponent] = useState<Record<string, BoverketResource[]>>({});
  const [activeItemKey, setActiveItemKey] = useState<string>(lineItems[0]?.key ?? "");
  const [draftSelection, setDraftSelection] = useState<Record<string, string>>({});
  const [packageName, setPackageName] = useState("");
  // A ref, not state: React StrictMode double-invokes effects in dev without
  // an intervening re-render, so a useState guard here would let both
  // invocations see the same stale "not yet initialized" value and both
  // submit a baseline. A ref mutation is synchronous and immediately visible
  // to the second invocation.
  const initializedRef = useRef(false);

  const packages = project.renovationCalcPackages;

  /* ── fetch WWR + Boverket data + hydrate baseline/in-flight packages ──── */
  useEffect(() => {
    if (!geometry || initializedRef.current) return;
    initializedRef.current = true;

    api.lookupWWR(geometry.lat, geometry.lon).then((r) => {
      if (r.found) setWwr(r.record);
    }).catch(() => { /* not critical */ });

    const uniqueComponents = Array.from(new Set(lineItems.map((li) => li.boverketComponent)));
    Promise.all(uniqueComponents.map((c) => api.boverketMaterials(c).then((res) => [c, res] as const).catch(() => [c, []] as const)))
      .then((pairs) => setBoverketByComponent(Object.fromEntries(pairs)));

    api.simulationLookupAll(geometry.lat, geometry.lon).then(({ records }) => {
      // Read live store state, not the `packages` closed over at render time -
      // by the time this async callback runs, that snapshot may be stale.
      const existingIds = new Set(useWizardStore.getState().project.renovationCalcPackages.map((p) => p.id));
      for (const rec of records) {
        const pkgId = (rec.package_id as string) ?? "baseline";
        if (existingIds.has(pkgId)) continue;
        if (pkgId !== "baseline") continue; // only auto-adopt the baseline; user-built packages are session-local until re-added
        const status = rec.status as string;
        if (status === "completed") {
          const results = rec.results as Record<string, number> | null;
          setProject({
            renovationCalcPackages: [
              ...useWizardStore.getState().project.renovationCalcPackages,
              makeBaselinePackage({
                status: "completed",
                simulationId: rec.epsm_simulation_id,
                heatingKwhM2Yr: results?.heating_kwh_m2_yr ?? null,
                coolingKwhM2Yr: results?.cooling_kwh_m2_yr ?? null,
                totalKwhM2Yr: results?.total_kwh_m2_yr ?? null,
                error: null,
              }),
            ],
          });
        } else if (status === "queued" || status === "running") {
          setProject({
            renovationCalcPackages: [
              ...useWizardStore.getState().project.renovationCalcPackages,
              makeBaselinePackage({ status: status as "queued" | "running", simulationId: rec.epsm_simulation_id, heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null, error: null }),
            ],
          });
          resumePoll("baseline", rec.epsm_simulation_id);
        }
        existingIds.add(pkgId);
      }
      // No baseline found anywhere yet - submit one now.
      if (!existingIds.has("baseline")) {
        submitBaseline();
      }
    }).catch(() => {
      if (!useWizardStore.getState().project.renovationCalcPackages.some((p) => p.isBaseline)) submitBaseline();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  function makeBaselinePackage(simulation: RenovationCalcPackage["simulation"]): RenovationCalcPackage {
    return { id: "baseline", name: "Baseline (as-built)", color: "rgba(255,255,255,0.4)", isBaseline: true, selections: {}, costSEK: null, carbonKgCO2e: null, simulation };
  }

  const submitBaseline = useCallback(() => {
    if (!geometry) return;
    const pkg = makeBaselinePackage({ status: "idle", simulationId: null, heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null, error: null });
    setProject({ renovationCalcPackages: [...useWizardStore.getState().project.renovationCalcPackages, pkg] });
    submitAndPoll("baseline", { lat: geometry.lat, lon: geometry.lon, address: geometry.address, country: COUNTRY, city_id: CITY_ID, building: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  /* ── derived: items/areas/recommendations for the active line item ────── */
  const activeItem = lineItems.find((li) => li.key === activeItemKey) ?? lineItems[0];
  const activeCatalogue = activeItem ? itemsForLineItem(activeItem) : [];
  const activeBoverket = activeItem ? (boverketByComponent[activeItem.boverketComponent] ?? []) : [];
  const activeRecommendations = useMemo(
    () => (activeItem ? recommendationsForLineItem(activeCatalogue, activeBoverket, project.selectedKpis) : {}),
    [activeItem, activeCatalogue, activeBoverket, project.selectedKpis]
  );
  const activeQuantity = activeItem && geometry ? computeAreaForLineItem(activeItem, geometry, wwr, manualOverrides) : null;

  const itemByCode = useMemo(() => {
    const all = lineItems.flatMap((li) => itemsForLineItem(li));
    return Object.fromEntries(all.map((i) => [i.code, i]));
  }, [lineItems]);

  const boverketAll = useMemo(() => Object.values(boverketByComponent).flat(), [boverketByComponent]);

  /* ── add a new package ─────────────────────────────────────────────────── */
  const PACKAGE_COLORS = ["#721CB8", "#4ECDC4", "#F59E0B", "#96D74C", "#F97316", "#5FA5FF"];
  function addPackage() {
    if (!geometry) return;
    const selections: Record<string, { wikellsCode: string; quantity: number }> = {};
    let costSEK = 0;
    let carbonKgCO2e = 0;
    for (const item of lineItems) {
      const code = draftSelection[item.key];
      if (!code) continue;
      const quantity = computeAreaForLineItem(item, geometry, wwr, manualOverrides);
      if (quantity == null) continue;
      selections[item.key] = { wikellsCode: code, quantity };
      const wikellsItem = itemByCode[code];
      if (wikellsItem) {
        costSEK += wikellsItem.costSEK * quantity;
        carbonKgCO2e += estimateCarbon(wikellsItem, boverketAll).value * quantity;
      }
    }
    if (Object.keys(selections).length === 0) return;

    const id = `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const name = packageName.trim() || `Package ${packages.filter((p) => !p.isBaseline).length + 1}`;
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;
    const pkg: RenovationCalcPackage = {
      id, name, color, isBaseline: false, selections,
      costSEK: Math.round(costSEK), carbonKgCO2e: Math.round(carbonKgCO2e),
      simulation: { status: "idle", simulationId: null, heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null, error: null },
    };
    setProject({ renovationCalcPackages: [...packages, pkg] });
    setPackageName("");
    setDraftSelection({});

    const overrides: Record<string, number> = {};
    for (const item of lineItems) {
      const sel = selections[item.key];
      if (!sel) continue;
      const wikellsItem = itemByCode[sel.wikellsCode];
      if (!wikellsItem?.uValue) continue;
      if (item.key === "Walls" || item.key === "VertExt::Walls") overrides.u_wall_override = wikellsItem.uValue;
      if (item.key === "Roof" || item.key === "VertExt::Roof") overrides.u_roof_override = wikellsItem.uValue;
      if (item.key === "Windows") overrides.u_win_override = wikellsItem.uValue;
      if (item.key === "Floor" || item.key === "VertExt::Floor") overrides.u_floor_override = wikellsItem.uValue;
    }
    submitAndPoll(id, { lat: geometry.lat, lon: geometry.lon, address: geometry.address, country: COUNTRY, city_id: CITY_ID, building: {}, package_label: name, ...overrides });
  }

  function retryPackage(pkg: RenovationCalcPackage) {
    if (!geometry) return;
    const overrides: Record<string, number> = {};
    for (const [key, sel] of Object.entries(pkg.selections)) {
      const wikellsItem = itemByCode[sel.wikellsCode];
      if (!wikellsItem?.uValue) continue;
      if (key === "Walls" || key === "VertExt::Walls") overrides.u_wall_override = wikellsItem.uValue;
      if (key === "Roof" || key === "VertExt::Roof") overrides.u_roof_override = wikellsItem.uValue;
      if (key === "Windows") overrides.u_win_override = wikellsItem.uValue;
      if (key === "Floor" || key === "VertExt::Floor") overrides.u_floor_override = wikellsItem.uValue;
    }
    submitAndPoll(pkg.id, { lat: geometry.lat, lon: geometry.lon, address: geometry.address, country: COUNTRY, city_id: CITY_ID, building: {}, package_label: pkg.name, ...overrides });
  }

  const baselineTotal = packages.find((p) => p.isBaseline)?.simulation.totalKwhM2Yr ?? null;

  function handleSaveAndContinue() {
    const baseline = packages.find((p) => p.isBaseline);
    setProject({
      renovationBaselineResults: baseline
        ? [{
            address: geometry?.address ?? "", energyUse: baseline.simulation.totalKwhM2Yr ?? 0,
            heating: baseline.simulation.heatingKwhM2Yr ?? 0, cooling: baseline.simulation.coolingKwhM2Yr ?? 0,
            dhw: 0, airLeakage: 0, eClass: null, eClassFromEpc: false,
          }]
        : [],
      renovationSimResults: packages.filter((p) => !p.isBaseline).map((p, i) => {
        const total = p.simulation.totalKwhM2Yr ?? baselineTotal ?? 0;
        const saving = Math.max(0, Math.round((baselineTotal ?? total) - total));
        return {
          packageIndex: i + 1,
          components: Object.fromEntries(Object.entries(p.selections).map(([k, s]) => {
            const it = itemByCode[s.wikellsCode];
            return [k, { code: s.wikellsCode, description: it?.description ?? "", costSEK: it?.costSEK ?? 0, uValue: it?.uValue }];
          })),
          energyUse: total, saving, carbonSaving: Math.round(saving * 0.2),
          cost: p.costSEK ?? 0,
        };
      }),
    });
    navigate("/step/5");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 4
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Renovation Calculator</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          Pick a material per component, add it as a package, and compare real cost, embodied carbon, and
          EnergyPlus-simulated performance against the building's as-built baseline.
        </p>
      </div>

      {!geometry && (
        <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p style={{ fontSize: 12, color: "#F59E0B", margin: 0 }}>No building resolved yet — go back to Step 1/2 and select a location.</p>
        </div>
      )}

      {geometry && (
        <>
          {/* Component tabs + material picker */}
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
                      ? `${activeQuantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${quantityUnitLabel(activeItem.quantityKind)}`
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
                      {activeItem.key === "Doors" ? "no automatic signal — enter a door count" : "no data source for this building yet"}
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
              disabled={Object.keys(draftSelection).length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1px solid rgba(150,215,76,0.4)", background: "rgba(150,215,76,0.12)", color: "#96D74C",
                cursor: Object.keys(draftSelection).length === 0 ? "not-allowed" : "pointer",
                opacity: Object.keys(draftSelection).length === 0 ? 0.5 : 1,
              }}
            >
              <Plus size={13} /> Add package
            </button>
          </div>

          {/* Comparison table */}
          <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 110px 110px 110px 110px 110px", gap: 10, padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
              {["Package", "Cost", "Carbon", "Heating", "Cooling", "Total", "Status"].map((h) => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>{h}</span>
              ))}
            </div>
            {[...packages].sort((a, b) => (a.isBaseline ? -1 : b.isBaseline ? 1 : 0)).map((pkg) => (
              <div key={pkg.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 110px 110px 110px 110px 110px", gap: 10, padding: "8px 4px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: pkg.isBaseline ? "rgba(255,255,255,0.5)" : "#fff" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: pkg.color, marginRight: 6 }} />
                  {pkg.name}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{pkg.costSEK != null ? fmtSEK(pkg.costSEK) : "—"}</span>
                <span style={{ fontSize: 12, color: "#60a5fa" }}>{pkg.carbonKgCO2e != null ? `${pkg.carbonKgCO2e.toLocaleString("sv-SE")} kg` : "—"}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{pkg.simulation.heatingKwhM2Yr != null ? `${pkg.simulation.heatingKwhM2Yr}` : "—"}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{pkg.simulation.coolingKwhM2Yr != null ? `${pkg.simulation.coolingKwhM2Yr}` : "—"}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#96D74C" }}>{pkg.simulation.totalKwhM2Yr != null ? `${pkg.simulation.totalKwhM2Yr}` : "—"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {(pkg.simulation.status === "queued" || pkg.simulation.status === "running") && <Loader2 size={13} color="#F59E0B" style={{ animation: "spin 1s linear infinite" }} />}
                  {pkg.simulation.status === "completed" && <CheckCircle2 size={13} color="#96D74C" />}
                  {pkg.simulation.status === "failed" && (
                    <>
                      <XCircle size={13} color="#EF4444" />
                      <button onClick={() => retryPackage(pkg)} title={pkg.simulation.error ?? "Retry"} style={{ background: "transparent", border: 0, cursor: "pointer", color: "#EF4444" }}>
                        <RefreshCw size={12} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
            {packages.length === 0 && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "8px 4px" }}>No packages yet.</p>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleSaveAndContinue}
              style={{ padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: 0, cursor: "pointer", background: "linear-gradient(90deg,#721CB8,#96D74C)", color: "#fff" }}
            >
              Save & Continue →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
