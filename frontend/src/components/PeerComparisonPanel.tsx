/* Step 2 — how each building's energy use compares with similar buildings
   (same EPC category and construction era) in its municipality, from the
   national EPC register (backend /api/benchmark/epc-peers).

   One row per building on a shared kWh/m² axis: grey line = 10th–90th
   percentile of the group, grey band = middle half, tick = median, dot = this
   building. The verdict is spelled out in words and numbers beside it, so
   nothing depends on colour. */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchEpcPeers, type PeerInput, type PeerResult } from "../api/benchmark";
import { useT } from "../i18n";
import { C } from "../config/colors";

export interface PeerBuildingRow extends PeerInput {
  label: string;
}

const REASON: Record<NonNullable<PeerResult["reason"]>, string> = {
  no_energy: "No energy certificate figure for this building.",
  no_category: "Not a building type the certificates cover (e.g. garage, outbuilding).",
  no_year: "Construction year unknown, so its era can't be matched.",
  too_few_peers: "Fewer than 20 similar buildings in the municipality to compare with.",
};

function verdict(pct: number): { label: string; icon: string; color: string } {
  if (pct >= 75) return { label: "Among the most efficient", icon: "▲", color: C.good };
  if (pct <= 25) return { label: "Among the least efficient", icon: "▼", color: C.bad };
  return { label: "Typical", icon: "●", color: "rgba(255,255,255,0.6)" };
}

export default function PeerComparisonPanel({ buildings, cityId }: { buildings: PeerBuildingRow[]; cityId: string }) {
  const t = useT();
  const [results, setResults] = useState<Record<string, PeerResult> | null>(null);
  const [kommun, setKommun] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => buildings.map(({ key, building_use, year, energy_kwh_m2 }) => ({ key, building_use, year, energy_kwh_m2 })), [buildings]);
  useEffect(() => {
    let alive = true;
    setResults(null); setError(null);
    fetchEpcPeers(cityId, payload)
      .then((r) => { if (!alive) return; setKommun(r.kommun); setResults(Object.fromEntries(r.results.map((x) => [x.key, x]))); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [cityId, payload]);

  if (error) return <div role="alert" style={{ fontSize: 12, color: C.bad }}>⚠ {error}</div>;
  if (!results) {
    return <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
      <Loader2 size={13} className="animate-spin" /> {t("Comparing with the energy certificate register…")}
    </div>;
  }

  const compared = buildings.filter((b) => results[b.key]?.median != null);
  const skipped = buildings.filter((b) => results[b.key]?.median == null);
  // One axis for every row, so buildings can be compared with each other too.
  const max = Math.max(50, ...compared.flatMap((b) => [results[b.key]!.p90 ?? 0, b.energy_kwh_m2 ?? 0])) * 1.08;
  const x = (v: number) => `${(v / max) * 100}%`;
  const ticks = [0, 50, 100, 150, 200, 250, 300, 400].filter((v) => v <= max);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
        {t("Each building's energy use per m² against similar buildings in {kommun} — same building type and construction era — using the newest energy certificate of every building in the national register.", { kommun })}
      </p>

      {compared.length > 0 && (
        <div>
          {/* Key: what the marks mean */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.selected, boxShadow: "0 0 0 2px #0d1117" }} /> {t("This building")}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 22, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} /> {t("Middle half of similar buildings")}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 2, height: 12, background: "rgba(255,255,255,0.75)" }} /> {t("Median")}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 22, height: 2, background: "rgba(255,255,255,0.25)" }} /> {t("10–90% of them")}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 200px) 1fr minmax(220px, 300px)", columnGap: 14, rowGap: 4, alignItems: "center" }}>
            {/* Axis */}
            <div />
            <div style={{ position: "relative", height: 16, fontSize: 9.5, color: "rgba(255,255,255,0.35)" }}>
              {ticks.map((v) => <span key={v} style={{ position: "absolute", left: x(v), transform: "translateX(-50%)" }}>{v}</span>)}
            </div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)" }}>kWh/m² · {t("year")}</div>

            {compared.map((b) => {
              const r = results[b.key]!;
              const v = verdict(r.share_using_more_pct!);
              const e = b.energy_kwh_m2!;
              const tip = t("{label}: {e} kWh/m². Similar buildings ({group}, n = {n}): median {median}, middle half {p25}–{p75}.", {
                label: b.label, e, group: `${t(r.group!.category_label)}, ${t(r.group!.era_label)}`, n: r.n!, median: r.median!, p25: r.p25!, p75: r.p75!,
              });
              return (
                <div key={b.key} style={{ display: "contents" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={b.label}>
                    {b.label}
                  </div>
                  {/* Hit area is the whole row height, larger than the marks. */}
                  <div title={tip} style={{ position: "relative", height: 26, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ position: "absolute", top: 12, height: 2, left: x(r.p10!), width: `calc(${x(r.p90!)} - ${x(r.p10!)})`, background: "rgba(255,255,255,0.25)" }} />
                    <div style={{ position: "absolute", top: 8, height: 10, borderRadius: 2, left: x(r.p25!), width: `calc(${x(r.p75!)} - ${x(r.p25!)})`, background: "rgba(255,255,255,0.16)" }} />
                    <div style={{ position: "absolute", top: 5, height: 16, width: 2, left: x(r.median!), transform: "translateX(-1px)", background: "rgba(255,255,255,0.75)" }} />
                    <div style={{ position: "absolute", top: 8, width: 10, height: 10, borderRadius: "50%", left: x(e), transform: "translateX(-5px)",
                      background: C.selected, boxShadow: "0 0 0 2px #0d1117" }} />
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                    <span style={{ color: v.color, fontWeight: 800 }}>{v.icon} {t(v.label)}</span>
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>
                      {" · "}{t("{e} kWh/m², {pct}% of similar buildings use more", { e, pct: r.share_using_more_pct! })}
                    </span>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                      {t("vs {n} {group}, median {median}", { n: r.n!.toLocaleString("sv-SE"), group: `${t(r.group!.category_label)} ${t(r.group!.era_label)}`, median: r.median! })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {skipped.length > 0 && (
        <details style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          <summary style={{ cursor: "pointer" }}>{t("{n} buildings could not be compared", { n: skipped.length })}</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
            {skipped.map((b) => <li key={b.key}><b style={{ color: "rgba(255,255,255,0.65)" }}>{b.label}</b> — {t(REASON[results[b.key]?.reason ?? "no_energy"])}</li>)}
          </ul>
        </details>
      )}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
        {t("Source: Boverket energy performance certificates (national register), specific energy use. A certificate can be up to ten years old, so recent changes may not show yet.")}
      </div>
    </div>
  );
}
