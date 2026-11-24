/* Step 4 Systems — rooftop solar sized against the building's own hourly
   electricity use (backend /api/pv/optimize, model in backend/pv_optimizer.py).
   Defaults come from optimizationAssumptions.ts (shown in the Data Explorer);
   every price is editable here. */

import { useEffect, useMemo, useState } from "react";
import { Sun, Loader2, ChevronDown, ChevronUp, Play } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, BarChart, Bar, Legend, CartesianGrid } from "recharts";
import { ASSUMPTIONS } from "../config/optimizationAssumptions";
import { useT, useLang } from "../i18n";
import { C } from "../config/colors";

// Validated with the dataviz palette checker against the dark surface (#0d1117).
const SOLAR = "#644686";
const DEMAND = "#A08BB7";

export interface PvBuilding {
  address: string | null;
  lat: number;
  lon: number;
  footprintM2: number | null;
}

interface PvPoint {
  kwp: number; production_kwh: number; self_used_kwh: number; exported_kwh: number;
  self_use_share: number; demand_coverage: number; capex_sek: number; yearly_value_sek: number;
  npv_sek: number; payback_yr: number | null;
}
interface PvResult {
  max_kwp: number; min_kwp: number; roof_usable_m2: number; specific_yield_kwh_kwp: number;
  demand: { households_kwh: number; property_kwh: number; property_source: string; total_kwh: number };
  points: PvPoint[]; best: PvPoint | null; profitable: boolean;
  monthly: { demand_kwh: number[]; production_kwh: number[]; self_used_kwh: number[] };
}

const def = (key: string) => ASSUMPTIONS.SE.find((a) => a.key === key)?.value ?? 0;

function Num({ label, value, onChange, step, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; unit: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input type="number" step={step ?? "any"} value={text} onChange={(e) => setText(e.target.value)}
          onBlur={() => { const v = parseFloat(text.replace(",", ".")); if (Number.isFinite(v) && v >= 0) onChange(v); else setText(String(value)); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{ width: 84, padding: "4px 7px", borderRadius: 6, fontSize: 12, textAlign: "right", color: "#fff",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }} />
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>{unit}</span>
      </span>
    </label>
  );
}

export default function PvOptimizerPanel({ buildings, cityId, discountRate }: { buildings: PvBuilding[]; cityId: string; discountRate: number }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const sek = (v: number) => `${Math.round(v).toLocaleString(locale)} kr`;
  const [idx, setIdx] = useState(0);
  const [households, setHouseholds] = useState(true);
  const [noVatDeduction, setNoVatDeduction] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [p, setP] = useState(() => ({
    spot: def("pv_spot_price"), grid: def("pv_grid_fee"), tax: def("pv_energy_tax"), sellAdder: def("pv_sell_adder"),
    capexSmall: def("pv_capex_10_100"), capexLarge: def("pv_capex_100_250"), lifetime: def("pv_lifetime"),
    degradation: def("pv_degradation"), om: def("pv_om"), discount: discountRate,
  }));
  const [result, setResult] = useState<PvResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const b = buildings[idx];
  // A kWh used in the building saves the whole variable price, VAT included
  // when the owner can't deduct it; an exported kWh earns spot plus the adder.
  const buy = useMemo(() => (p.spot + p.grid + p.tax) * (noVatDeduction ? 1.25 : 1), [p, noVatDeduction]);
  const sell = p.spot + p.sellAdder;

  const run = async () => {
    if (!b || !b.footprintM2) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/pv/optimize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: b.lat, lon: b.lon, address: b.address, city_id: cityId, footprint_m2: b.footprintM2,
          include_households: households, buy_sek_kwh: buy, sell_sek_kwh: sell,
          capex_small_sek_kwp: p.capexSmall, capex_large_sek_kwp: p.capexLarge, vat_on_capex: noVatDeduction,
          discount_rate: p.discount, lifetime_yr: Math.round(p.lifetime), degradation: p.degradation, om_pct_capex: p.om,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `API ${res.status}`);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };
  // Re-run whenever an input changes; the backend caches the solar series, so
  // only the first run per building waits for PVGIS.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [idx, households, noVatDeduction, p]);

  const best = result?.best ?? null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthly = result ? months.map((m, i) => ({
    month: t(m), use: result.monthly.demand_kwh[i], solar: result.monthly.production_kwh[i],
  })) : [];

  const tile = (label: string, value: string, sub?: string) => (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 130, flex: 1 }}>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Sun size={18} color={SOLAR} style={{ marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{t("Rooftop solar — best size")}</h3>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.55 }}>
            {t("Matches hourly solar output with the building's own hourly electricity use and finds the size worth most over the panels' life. Since 2026 exported power earns about the spot price only, so solar the building uses itself is worth far more than solar it sells.")}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
        {buildings.length > 1 && (
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}
            style={{ padding: "5px 9px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#0d1117", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", maxWidth: 260 }}>
            {buildings.map((x, i) => <option key={`${x.lat},${x.lon}`} value={i}>{x.address ?? t("Building {n}", { n: i + 1 })}</option>)}
          </select>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={households} onChange={(e) => setHouseholds(e.target.checked)} style={{ accentColor: C.selected }} />
          {t("Panels also supply the households (shared meter)")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={noVatDeduction} onChange={(e) => setNoVatDeduction(e.target.checked)} style={{ accentColor: C.selected }} />
          {t("Owner can't deduct VAT (e.g. rental housing)")}
        </label>
        <button onClick={() => setShowAssumptions((s) => !s)}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: 0, cursor: "pointer", color: C.selected, fontSize: 12, fontWeight: 600, padding: 0 }}>
          {t("Prices & assumptions")} {showAssumptions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {showAssumptions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Num label={t("Spot price, yearly average")} unit="kr/kWh" value={p.spot} step={0.05} onChange={(v) => setP({ ...p, spot: v })} />
          <Num label={t("Grid fee (per kWh)")} unit="kr/kWh" value={p.grid} step={0.01} onChange={(v) => setP({ ...p, grid: v })} />
          <Num label={t("Energy tax")} unit="kr/kWh" value={p.tax} step={0.01} onChange={(v) => setP({ ...p, tax: v })} />
          <Num label={t("Paid on top of spot when selling")} unit="kr/kWh" value={p.sellAdder} step={0.01} onChange={(v) => setP({ ...p, sellAdder: v })} />
          <Num label={t("Cost 10–100 kWp (excl. VAT)")} unit="kr/kWp" value={p.capexSmall} step={100} onChange={(v) => setP({ ...p, capexSmall: v })} />
          <Num label={t("Cost above 100 kWp (excl. VAT)")} unit="kr/kWp" value={p.capexLarge} step={100} onChange={(v) => setP({ ...p, capexLarge: v })} />
          <Num label={t("Panel life")} unit={t("years")} value={p.lifetime} step={1} onChange={(v) => setP({ ...p, lifetime: v })} />
          <Num label={t("Real discount rate")} unit="" value={p.discount} step={0.005} onChange={(v) => setP({ ...p, discount: v })} />
          <Num label={t("Output loss per year")} unit="" value={p.degradation} step={0.001} onChange={(v) => setP({ ...p, degradation: v })} />
          <Num label={t("Upkeep per year (share of cost)")} unit="" value={p.om} step={0.005} onChange={(v) => setP({ ...p, om: v })} />
          <div style={{ flexBasis: "100%", fontSize: 11.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            {t("Bought electricity: {buy} kr/kWh · sold: {sell} kr/kWh. Sources for every default are listed in the Data Explorer; values marked provisional there still need checking.",
              { buy: buy.toFixed(2), sell: sell.toFixed(2) })}
          </div>
        </div>
      )}

      {!b?.footprintM2 && <div style={{ fontSize: 12, color: C.warn }}>⚠ {t("This building has no footprint area, so its roof can't be sized.")}</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: C.bad, lineHeight: 1.5 }}>⚠ {error}</div>}
      {busy && !result && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          <Loader2 size={13} className="animate-spin" /> {t("Fetching hourly solar data and matching it with the building's electricity use…")}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: busy ? 0.6 : 1 }}>
          {result.points.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)" }}>
              {t("The roof fits about {k} kWp — below the {min} kWp the cost data covers, so no size is suggested.", { k: result.max_kwp, min: result.min_kwp })}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.8)" }}>
                {result.profitable && best
                  ? t("Best size: {kwp} kWp (about {m2} m² of panels). It would cover {cov}% of the electricity the building uses, and {self}% of what it produces would be used on site. It pays back in about {pb} years.",
                      { kwp: best.kwp, m2: Math.round(best.kwp * 5), cov: Math.round(best.demand_coverage * 100), self: Math.round(best.self_use_share * 100), pb: best.payback_yr ?? "—" })
                    + (best.kwp <= result.min_kwp
                      ? ` ${t("This is the smallest size the cost data covers — a smaller system might do slightly better, but its price per kWp isn't known.")}`
                      : "")
                  : t("At these prices no size from {min} to {max} kWp pays back within the panels' life: too much of the output would have to be sold cheaply. Try including the households, or check the prices.",
                      { min: result.min_kwp, max: result.max_kwp })}
              </div>
              {best && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {tile(t("Best size"), `${best.kwp} kWp`, t("roof fits up to {k} kWp", { k: result.max_kwp }))}
                  {tile(t("Value over {n} years", { n: Math.round(p.lifetime) }), sek(best.npv_sek), t("net present value, after the investment"))}
                  {tile(t("Investment"), sek(best.capex_sek), noVatDeduction ? t("incl. VAT") : t("excl. VAT"))}
                  {tile(t("Used on site"), `${Math.round(best.self_use_share * 100)}%`, t("{k} of {p} kWh/yr", { k: best.self_used_kwh.toLocaleString(locale), p: best.production_kwh.toLocaleString(locale) }))}
                  {tile(t("Payback"), best.payback_yr != null ? t("{n} years", { n: best.payback_yr }) : "—")}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>{t("Value over the panels' life by system size")}</div>
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={result.points} margin={{ top: 8, right: 12, bottom: 18, left: 8 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="kwp" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }}
                        label={{ value: "kWp", position: "insideBottom", offset: -10, fontSize: 11, fill: "rgba(255,255,255,0.45)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} width={56}
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                      <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(k) => `${k} kWp`} formatter={(v: number) => [sek(v), t("Net present value")]} />
                      <Line type="monotone" dataKey="npv_sek" stroke={SOLAR} strokeWidth={2} dot={false} isAnimationActive={false} />
                      {best && <ReferenceDot x={best.kwp} y={best.npv_sek} r={5} fill={SOLAR} stroke="#0d1117" strokeWidth={2} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>
                    {best ? t("Electricity use and solar output per month, at {k} kWp", { k: best.kwp }) : t("Electricity use per month")}
                  </div>
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }} width={56}
                        tickFormatter={(v: number) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`} />
                      <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }} formatter={(v: number, name: string) => [`${v.toLocaleString(locale)} kWh`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} iconType="square" />
                      <Bar dataKey="use" name={t("Electricity use")} fill={DEMAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="solar" name={t("Solar output")} fill={SOLAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                {t("Electricity use: households {h} kWh/yr (simulated, Sveby profile) + building {pr} kWh/yr from {src}, spread evenly over the year. Solar: PVGIS hourly data for 2019, {y} kWh per kWp, panels tilted 35° facing south, up to {m2} m² of roof (80% of the footprint).",
                  { h: result.demand.households_kwh.toLocaleString(locale), pr: result.demand.property_kwh.toLocaleString(locale),
                    src: t(result.demand.property_source), y: result.specific_yield_kwh_kwp, m2: result.roof_usable_m2 })}
                {" "}{t("Not included: power (effekt) charges, battery storage, roof orientation, shading and roof repairs before installation.")}
              </div>
            </>
          )}
        </div>
      )}
      {busy && result && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          <Loader2 size={12} className="animate-spin" /> {t("Updating…")}
        </div>
      )}
      {!busy && !result && !error && b?.footprintM2 && (
        <button onClick={run} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: 0, background: "var(--brand-deep)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          <Play size={13} /> {t("Find best size")}
        </button>
      )}
    </div>
  );
}
