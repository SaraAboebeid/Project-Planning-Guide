/* Step 2 — how each building's energy use compares with similar buildings
   (same EPC category and construction era) in its municipality, from the
   national EPC register (backend /api/benchmark/epc-peers).

   Written to be read without statistics: each building gets one sentence
   ("uses 17% less energy than a typical …"), a rating bar from "uses least
   energy" to "uses most energy" with the building marked on it, and the plain
   numbers underneath. The verdict is always spelled out in words, never only
   by colour. */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchEpcPeers, type PeerInput, type PeerResult } from "../api/benchmark";
import { useT, useLang } from "../i18n";
import { C, tint } from "../config/colors";

export interface PeerBuildingRow extends PeerInput {
  label: string;
}

const REASON: Record<NonNullable<PeerResult["reason"]>, string> = {
  no_energy: "No energy certificate figure for this building.",
  no_category: "Not a building type the certificates cover (e.g. garage, outbuilding).",
  no_year: "Construction year unknown, so its era can't be matched.",
  too_few_peers: "Fewer than 20 similar buildings in the municipality to compare with.",
};

/** Where the building sits, as a word: by its share of similar buildings that use more. */
function verdict(betterThanPct: number): { label: string; icon: string; color: string } {
  if (betterThanPct >= 75) return { label: "Among the most efficient", icon: "▲", color: C.good };
  if (betterThanPct <= 25) return { label: "Among the least efficient", icon: "▼", color: C.bad };
  return { label: "About average", icon: "●", color: "rgba(255,255,255,0.75)" };
}

export default function PeerComparisonPanel({ buildings, cityId }: { buildings: PeerBuildingRow[]; cityId: string }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>
        {t("Is each building better or worse than others like it? We compare its energy use per m² with buildings of the same kind and age in {kommun}, using their energy certificates. Using less energy is better.", { kommun })}
      </p>

      {compared.map((b) => {
        const r = results[b.key]!;
        const e = b.energy_kwh_m2!;
        const median = r.median!;
        const betterThan = r.share_using_more_pct!;           // % of similar buildings that use MORE
        const position = 100 - betterThan;                     // 0 = least energy … 100 = most
        const v = verdict(betterThan);
        const diff = Math.round(((e - median) / median) * 100);
        const group = `${t(r.group!.category_label)} ${t(r.group!.era_label)}`;
        const sentence = Math.abs(diff) < 3
          ? t("Uses about the same energy as a typical similar building ({group}).", { group })
          : diff < 0
            ? t("Uses {pct}% less energy than a typical similar building ({group}).", { pct: Math.abs(diff), group })
            : t("Uses {pct}% more energy than a typical similar building ({group}).", { pct: diff, group });
        return (
          <div key={b.key} style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{b.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: v.color }}>{v.icon} {t(v.label)}</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
                · {t("better than {n} of 100 similar buildings", { n: betterThan })}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>{sentence}</div>

            {/* Rating bar: least energy (left) → most energy (right). */}
            <div style={{ position: "relative", height: 14, borderRadius: 7, overflow: "hidden", display: "flex" }}
              title={t("{e} kWh/m² — {n}% of {total} similar buildings use more", { e, n: betterThan, total: r.n!.toLocaleString(locale) })}>
              <div style={{ width: "25%", background: tint(C.good, 0.35) }} />
              <div style={{ width: "50%", background: "rgba(255,255,255,0.12)" }} />
              <div style={{ width: "25%", background: tint(C.bad, 0.35) }} />
            </div>
            <div style={{ position: "relative", height: 0 }}>
              <div style={{ position: "absolute", left: `${Math.min(98, Math.max(2, position))}%`, top: -19, transform: "translateX(-50%)",
                width: 18, height: 18, borderRadius: "50%", background: "#fff", border: `4px solid ${v.color === "rgba(255,255,255,0.75)" ? C.selected : v.color}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              <span>◀ {t("Uses least energy")}</span>
              <span>{t("Uses most energy")} ▶</span>
            </div>

            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
              {t("This building: {e} kWh/m² per year · typical for similar buildings: {median} kWh/m² · compared with {n} buildings", {
                e, median: Math.round(median), n: r.n!.toLocaleString(locale) })}
            </div>
          </div>
        );
      })}

      {skipped.length > 0 && (
        <details style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          <summary style={{ cursor: "pointer" }}>{t(skipped.length === 1 ? "{n} building could not be compared" : "{n} buildings could not be compared", { n: skipped.length })}</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
            {skipped.map((b) => <li key={b.key}><b style={{ color: "rgba(255,255,255,0.7)" }}>{b.label}</b> — {t(REASON[results[b.key]?.reason ?? "no_energy"])}</li>)}
          </ul>
        </details>
      )}

      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
        {t("Source: Boverket energy performance certificates (national register), specific energy use. A certificate can be up to ten years old, so recent changes may not show yet.")}
      </div>
    </div>
  );
}
