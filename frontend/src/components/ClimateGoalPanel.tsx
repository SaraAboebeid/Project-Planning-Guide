import { useState } from "react";
import { Target, CheckCircle2, ChevronRight, ChevronDown } from "lucide-react";
import { type GoalAssessment, type ClimateGoal, type RatingAssessment, goalStatement, goalTitle } from "../config/climateGoals";
import PanelShell from "./PanelShell";
import { useT } from "../i18n";

/* Shows a city climate target and which renovation packages reach it. Used in
 * Step 4 (after packages are simulated) and echoed in the Step 5 report, off the
 * same assessAgainstGoal() result so the two never disagree. */

const MET = "#2FB477";     // green — meets the target
const NEAR = "#E8880C";    // amber — below the target
const WORSE = "#E2483B";   // red — worse than baseline

// Layer build-up chip colors by material category — insulation stands out (teal)
// since it's the layer that answers "which insulation?".
const LAYER_COLOR: Record<string, string> = {
  insulation: "#8B6EAD",
  structure: "#E8880C",
  board: "#9CA3AF",
  cladding: "#4A90E2",
  cavity: "#C1AFD6",
};

/* The EU-wide target, shown as a reference line under each package. Not scored:
 * it is an economy-wide emissions goal, not a per-building energy target. The UK
 * is outside the EU, so its cities do not get it. */
const EU_TARGET_TEXT = "EU target: −55% net greenhouse-gas emissions by 2030 vs 1990";
const EU_TARGET_URL = "https://www.consilium.europa.eu/en/policies/fit-for-55/";
const NON_EU_CITIES = new Set(["London", "Rotherham"]);

function barColor(r: { meets: boolean; reductionPct: number | null }) {
  if (r.meets) return MET;
  if (r.reductionPct != null && r.reductionPct < 0) return WORSE;
  return NEAR;
}

export default function ClimateGoalPanel({ a }: { a: GoalAssessment }) {
  const t = useT();
  const { goal, rows, achievers, closest } = a;
  // Which package row is expanded to show its materials. Keyed by ROW INDEX, not
  // label: look-alike packages share the same truncated label, so keying on the
  // label opened (and React-reconciled) every matching row at once.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // A level goal (Brussels, Liège) is shown in its own unit - kWh/m²·yr against
  // the target line - not translated into a percentage nobody set.
  const abs = goal.kind === "absolute" && goal.targetKwhM2 != null;
  const T = goal.targetKwhM2 ?? 0;
  const maxE = Math.max(a.baselineEnergy, T, ...rows.map((r) => r.energyUse)) * 1.05;
  const kwh = (e: number) => `${Math.round(e)} kWh/m²·yr`;

  // Scale the bars so the target line sits comfortably inside the track.
  const maxRed = Math.max(goal.reductionPct + 8, ...rows.map((r) => r.reductionPct ?? 0));
  const scaleMax = Math.max(maxRed, 10);
  const targetLeft = abs ? (T / maxE) * 100 : (goal.reductionPct / scaleMax) * 100;

  // A reduction is positive when energy drops. Format with the right sign so a
  // package that's WORSE than baseline reads "+76% (worse)" not "−-76%".
  const fmtRed = (r: number) =>
    r >= 0 ? `−${r.toFixed(0)}%` : `+${Math.abs(r).toFixed(0)}% ${t("(worse than baseline)")}`;

  const lowest = [...rows].sort((x, y) => x.energyUse - y.energyUse)[0];
  const headline = abs
    ? (achievers.length
        ? t("{pkg} reaches {kwh}, within the ≤ {target} target", { pkg: achievers[0]!.label, kwh: kwh(achievers[0]!.energyUse), target: T })
          + (achievers.length > 1 ? ` ${t("({n} packages do)", { n: achievers.length })}` : "")
        : lowest
          ? t("No package reaches ≤ {target} yet — closest is {pkg} at {kwh}, {diff} above", { target: T, pkg: lowest.label, kwh: kwh(lowest.energyUse), diff: Math.round(lowest.energyUse - T) })
          : t("Simulate a package to measure it against the target"))
    : achievers.length
    ? t("{pkg} reaches −{pct}%, meeting the target", { pkg: achievers[0]!.label, pct: achievers[0]!.reductionPct!.toFixed(0) })
    + (achievers.length > 1 ? ` ${t("({n} packages meet it)", { n: achievers.length })}` : "")
    : closest && closest.reductionPct != null
      ? t("No package reaches the target yet — closest is {pkg} at {pct}", { pkg: closest.label, pct: fmtRed(closest.reductionPct) })
      : t("Simulate a package to measure it against the target");

  const accent = achievers.length ? MET : NEAR;

  return (
    <PanelShell
      icon={<Target size={17} />}
      iconColor={accent}
      title={goalTitle(goal)}
      subtitle={goalStatement(goal)}
      badge={
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, padding: "3px 10px", borderRadius: 100, background: `${accent}1e`, color: accent, border: `1px solid ${accent}44`, flexShrink: 0 }}>
          {goal.kind === "absolute" ? t("≤ {kwh} kWh/m² BY {year}", { kwh: goal.targetKwhM2 ?? "", year: goal.targetYear }) : t("−{pct}% BY {year}", { pct: goal.reductionPct, year: goal.targetYear })}
          {goal.scope === "national" ? ` · ${t("NATIONAL")}` : goal.scope === "regional" ? ` · ${t("REGIONAL")}` : ""}
        </span>
      }
    >
      <GoalBasis goal={goal} />

      {/* Verdict */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 14px" }}>
        {achievers.length ? <CheckCircle2 size={15} color={MET} /> : <Target size={14} color={NEAR} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: achievers.length ? MET : "rgba(255,255,255,0.75)" }}>
          {headline}
        </span>
      </div>

      {/* Per-package bars toward the target */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {/* Level goals: the as-built building on the same scale, for reference. */}
        {abs && (
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 96px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>{t("As-built today")}</span>
            <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(a.baselineEnergy / maxE) * 100}%`, background: "rgba(255,255,255,0.25)", borderRadius: 5 }} />
              <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", textAlign: "right" }}>{Math.round(a.baselineEnergy)}</span>
          </div>
        )}
        {rows.map((r, i) => {
          const red = r.reductionPct ?? 0;
          const w = abs
            ? Math.min(100, (r.energyUse / maxE) * 100)
            : Math.max(0, Math.min(red, scaleMax)) / scaleMax * 100;
          const c = barColor(r);
          const hasMat = !!r.materials && r.materials.length > 0;
          const open = openIdx === i;
          return (
            <div key={i}>
              <div
                onClick={() => hasMat && setOpenIdx(open ? null : i)}
                title={hasMat ? (open ? t("Hide materials") : t("Show the materials in this package")) : undefined}
                style={{ display: "grid", gridTemplateColumns: "150px 1fr 96px", gap: 10, alignItems: "center",
                  cursor: hasMat ? "pointer" : "default", borderRadius: 6,
                  background: open ? "rgba(255,255,255,0.04)" : "transparent" }}
              >
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                  {hasMat && (open
                    ? <ChevronDown size={12} style={{ marginRight: 2, flexShrink: 0, opacity: 0.5 }} />
                    : <ChevronRight size={12} style={{ marginRight: 2, flexShrink: 0, opacity: 0.5 }} />)}
                  {r.color && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 6, flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                </span>
                {/* Track with the target marker */}
                <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${w}%`, background: c, borderRadius: 5, transition: "width .4s" }} />
                  <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} title={abs ? t("Target ≤ {kwh} kWh/m²·yr", { kwh: T }) : t("Target −{pct}%", { pct: goal.reductionPct })} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: c, textAlign: "right" }}
                  title={abs && !r.meets ? t("{n} kWh/m²·yr above the target", { n: Math.round(r.energyUse - T) }) : undefined}>
                  {abs
                    ? `${Math.round(r.energyUse)}${r.meets ? "" : ` (+${Math.round(r.energyUse - T)})`}`
                    : r.reductionPct == null ? "—" : `${red >= 0 ? "−" : "+"}${Math.abs(red).toFixed(0)}%`}
                  {r.meets && <CheckCircle2 size={11} color={MET} style={{ marginLeft: 4, verticalAlign: "-1px" }} />}
                </span>
              </div>
              {/* EU reference line under every package (EU cities only). */}
              {!NON_EU_CITIES.has(goal.city) && (
                <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, marginTop: 3 }}>
                  <span />
                  <a href={EU_TARGET_URL} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
                    title={t("The European Union's binding climate target (European Climate Law). Shown for reference; it is an economy-wide emissions target, not scored per building.")}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "#4A90E2", marginRight: 5, verticalAlign: "0px" }} />
                    {t(EU_TARGET_TEXT)}
                  </a>
                </div>
              )}
              {/* Expanded: the assembly on each component of this package */}
              {open && hasMat && (
                <div style={{ margin: "4px 0 6px 20px", padding: "8px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", flexDirection: "column", gap: 8 }}>
                  {r.materials!.map((m, i) => (
                    <div key={`${m.component}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
                        <span style={{ minWidth: 78, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{t(m.component)}</span>
                        <span style={{ flex: 1, color: "rgba(255,255,255,0.82)" }}>{m.material}</span>
                        {m.u != null && (
                          <span style={{ fontWeight: 600, color: m.u > 0.4 ? "#E2483B" : m.u > 0.3 ? "#E8880C" : "#2FB477", flexShrink: 0 }}>
                            U {m.u.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Full build-up, outside → inside — names the exact insulation. */}
                      {m.layers && m.layers.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 86 }}>
                          {m.layers.map((l, j) => (
                            <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
                              padding: "1px 7px", borderRadius: 6,
                              background: `${LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF"}1e`,
                              border: `1px solid ${LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF"}40`,
                              color: "rgba(255,255,255,0.8)" }}>
                              <span style={{ fontWeight: 600, color: LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF" }}>{l.thicknessMm} mm</span>
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Target-line legend + source */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          <span style={{ display: "inline-block", width: 2, height: 9, background: "rgba(255,255,255,0.55)", marginRight: 5, verticalAlign: "-1px" }} />
          {abs
            ? t("≤ {kwh} kWh/m²·yr target · simulated energy use, kWh/m²·yr (+n = above the target)", { kwh: T })
            : t("−{pct}% target · reduction vs baseline energy demand", { pct: goal.reductionPct })}
        </span>
        <SourceLink goal={goal} />
      </div>
    </PanelShell>
  );
}

function SourceLink({ goal }: { goal: ClimateGoal }) {
  const style = { fontSize: 11, color: "rgba(255,255,255,0.35)" } as const;
  return goal.sourceUrl
    ? <a href={goal.sourceUrl} target="_blank" rel="noreferrer" style={{ ...style, textDecoration: "underline" }}>{goal.source}</a>
    : <span style={style}>{goal.source}</span>;
}

/** What the official target actually measures - almost never "one building vs
 *  its as-built state" - so the score above is read as the proxy it is. */
function GoalBasis({ goal }: { goal: ClimateGoal }) {
  const t = useT();
  return (
    <div style={{ fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.5)", margin: "6px 0 0" }}>
      {goal.headline && <div><b style={{ color: "rgba(255,255,255,0.7)" }}>{t("Headline goal:")}</b> {t(goal.headline)}</div>}
      <div><b style={{ color: "rgba(255,255,255,0.7)" }}>{t("Official target:")}</b> {t(goal.basis)}</div>
    </div>
  );
}

const BAND_COLOR: Record<string, string> = {
  A: "#2FB477", B: "#2FB477", C: "#7BC67E", D: "#E8880C", E: "#E8880C", F: "#E2483B", G: "#E2483B",
};

function BandChip({ band, sap, faded }: { band: string | null; sap: number | null; faded?: boolean }) {
  if (!band) return <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>;
  const c = BAND_COLOR[band] ?? "#9CA3AF";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: faded ? 0.75 : 1 }}>
      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, fontSize: 12, padding: "1px 5px", borderRadius: 4, background: `${c}26`, color: c, border: `1px solid ${c}55` }}>{band}</span>
      {sap != null && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{sap}</span>}
    </span>
  );
}

/** Rating goal (Rotherham: EPC band C). Where each package leaves every building
 *  on the EPC scale - estimated from its certificate, see assessRating(). */
export function ClimateGoalRatingPanel({ a }: { a: RatingAssessment }) {
  const t = useT();
  const { goal, rows, columns, metToday } = a;
  const best = [...columns].sort((x, y) => y.met - x.met || (y.medianSap ?? 0) - (x.medianSap ?? 0))[0];
  const allMet = best && best.met === best.total;
  const accent = allMet ? MET : NEAR;
  const headline = !columns.length
    ? t("{met} of {n} {buildings} are at band {band} or better today — simulate a package to see where it takes them", { met: metToday, n: rows.length, buildings: rows.length === 1 ? t("building") : t("buildings"), band: goal.targetRating ?? "" })
    : best && best.met > 0
      ? t("{pkg} brings {met} of {total} {buildings} to band {band} or better (estimated) — {today} today", { pkg: best.label, met: best.met, total: best.total, buildings: best.total === 1 ? t("building") : t("buildings"), band: goal.targetRating ?? "", today: metToday })
      : t("No package brings a building to band {band} yet (estimated) — {met} of {n} are there today", { band: goal.targetRating ?? "", met: metToday, n: rows.length });
  const fromBand = rows.filter((r) => r.from === "band").length;

  return (
    <PanelShell icon={<Target size={17} />} iconColor={accent}
      title={goalTitle(goal)} subtitle={goalStatement(goal)}
      badge={
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, padding: "3px 10px", borderRadius: 100, background: `${accent}1e`, color: accent, border: `1px solid ${accent}44`, flexShrink: 0 }}>
          {t("EPC {band} BY {year}", { band: goal.targetRating ?? "", year: goal.targetYear })}
        </span>
      }>
      <GoalBasis goal={goal} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 12px" }}>
        {allMet ? <CheckCircle2 size={15} color={MET} /> : <Target size={14} color={NEAR} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: allMet ? MET : "rgba(255,255,255,0.75)" }}>{headline}</span>
      </div>

      {/* Share of buildings at the target band: today, then per package. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {[{ label: t("Today (certificates)"), met: metToday, total: rows.length, color: undefined as string | undefined, medianSap: null as number | null, today: true },
          ...columns.map((c) => ({ ...c, today: false }))].map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 120px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: c.today ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.75)", fontStyle: c.today ? "italic" : "normal",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
              {c.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, marginRight: 6, flexShrink: 0 }} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
            </span>
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.total ? (c.met / c.total) * 100 : 0}%`, background: c.today ? "rgba(255,255,255,0.3)" : (c.met === c.total ? MET : NEAR), borderRadius: 5 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", color: c.met === c.total ? MET : "rgba(255,255,255,0.7)" }}>
              {t("{met}/{total} at {band}+", { met: c.met, total: c.total, band: goal.targetRating ?? "" })}
              {c.medianSap != null && <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.4)" }}> · SAP {c.medianSap}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Every building: band today → estimated band under each package. */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, minWidth: 420 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
              <th style={{ padding: "7px 10px", fontWeight: 600 }}>{t("Building")}</th>
              <th style={{ padding: "7px 10px", fontWeight: 600 }}>{t("Today")}</th>
              {columns.map((c) => <th key={c.label} style={{ padding: "7px 10px", fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.address} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px 10px", color: "#fff", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.address}{r.from === "band" && <span title={t("No certificate SAP: starts from the middle of its band")} style={{ color: "rgba(255,255,255,0.35)" }}> *</span>}
                </td>
                <td style={{ padding: "6px 10px" }}><BandChip band={r.nowBand} sap={r.nowSap} faded /></td>
                {r.cells.map((cell, i) => (
                  <td key={i} style={{ padding: "6px 10px", background: cell.meets ? "rgba(47,180,119,0.08)" : undefined }}>
                    <BandChip band={cell.band} sap={cell.sap} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
        <span>
          {t("Band (SAP score) · package bands are estimates: the certificate's SAP moved by the simulated change in fuel use.")}
          {fromBand > 0 && ` * ${fromBand === 1 ? t("{n} building has no certificate SAP and start from the middle of their band.", { n: fromBand }) : t("{n} buildings have no certificate SAP and start from the middle of their band.", { n: fromBand })}`}
        </span>
        <SourceLink goal={goal} />
      </div>
    </PanelShell>
  );
}

/** For a target the simulation cannot score (Flanders' label A, threshold not
 *  verified): the goal as context, with no pass/fail line pretending otherwise. */
export function ClimateGoalInfo({ goal }: { goal: ClimateGoal }) {
  return (
    <PanelShell icon={<Target size={17} />} iconColor="#4A90E2"
      title={goalTitle(goal)} subtitle={goalStatement(goal)}>
      <GoalBasis goal={goal} />
      <div style={{ marginTop: 10 }}><SourceLink goal={goal} /></div>
    </PanelShell>
  );
}
