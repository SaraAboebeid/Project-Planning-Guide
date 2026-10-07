import { useState } from "react";
import { Target, CheckCircle2, ChevronRight, ChevronDown } from "lucide-react";
import { type GoalAssessment, type ClimateGoal, type RatingAssessment, goalStatement } from "../config/climateGoals";
import PanelShell from "./PanelShell";

/* Shows a city climate target and which renovation packages reach it. Used in
 * Step 4 (after packages are simulated) and echoed in the Step 5 report, off the
 * same assessAgainstGoal() result so the two never disagree. */

const MET = "#2FB477";     // green — meets the target
const NEAR = "#E8880C";    // amber — below the target
const WORSE = "#E2483B";   // red — worse than baseline

// Layer build-up chip colors by material category — insulation stands out (teal)
// since it's the layer that answers "which insulation?".
const LAYER_COLOR: Record<string, string> = {
  insulation: "#4ECDC4",
  structure: "#E8880C",
  board: "#9CA3AF",
  cladding: "#4A90E2",
  cavity: "#A78BFA",
};

function barColor(r: { meets: boolean; reductionPct: number | null }) {
  if (r.meets) return MET;
  if (r.reductionPct != null && r.reductionPct < 0) return WORSE;
  return NEAR;
}

export default function ClimateGoalPanel({ a }: { a: GoalAssessment }) {
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
    r >= 0 ? `−${r.toFixed(0)}%` : `+${Math.abs(r).toFixed(0)}% (worse than baseline)`;

  const lowest = [...rows].sort((x, y) => x.energyUse - y.energyUse)[0];
  const headline = abs
    ? (achievers.length
        ? `${achievers[0]!.label} reaches ${kwh(achievers[0]!.energyUse)}, within the ≤ ${T} target`
          + (achievers.length > 1 ? ` (${achievers.length} packages do)` : "")
        : lowest
          ? `No package reaches ≤ ${T} yet — closest is ${lowest.label} at ${kwh(lowest.energyUse)}, ${Math.round(lowest.energyUse - T)} above`
          : "Simulate a package to measure it against the target")
    : achievers.length
    ? `${achievers[0]!.label} reaches −${achievers[0]!.reductionPct!.toFixed(0)}%, meeting the target`
    + (achievers.length > 1 ? ` (${achievers.length} packages meet it)` : "")
    : closest && closest.reductionPct != null
      ? `No package reaches the target yet — closest is ${closest.label} at ${fmtRed(closest.reductionPct)}`
      : "Simulate a package to measure it against the target";

  const accent = achievers.length ? MET : NEAR;

  return (
    <PanelShell
      icon={<Target size={17} />}
      iconColor={accent}
      title={`${goal.city} climate target`}
      subtitle={goalStatement(goal)}
      badge={
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, padding: "3px 10px", borderRadius: 100, background: `${accent}1e`, color: accent, border: `1px solid ${accent}44`, flexShrink: 0 }}>
          {goal.kind === "absolute" ? `≤ ${goal.targetKwhM2} kWh/m² BY ${goal.targetYear}` : `−${goal.reductionPct}% BY ${goal.targetYear}`}
          {goal.scope === "national" ? " · NATIONAL" : goal.scope === "regional" ? " · REGIONAL" : ""}
        </span>
      }
    >
      <GoalBasis goal={goal} />

      {/* Verdict */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 14px" }}>
        {achievers.length ? <CheckCircle2 size={15} color={MET} /> : <Target size={14} color={NEAR} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: achievers.length ? MET : "rgba(255,255,255,0.75)" }}>
          {headline}
        </span>
      </div>

      {/* Per-package bars toward the target */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {/* Level goals: the as-built building on the same scale, for reference. */}
        {abs && (
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 96px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>As-built today</span>
            <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(a.baselineEnergy / maxE) * 100}%`, background: "rgba(255,255,255,0.25)", borderRadius: 5 }} />
              <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", textAlign: "right" }}>{Math.round(a.baselineEnergy)}</span>
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
                title={hasMat ? (open ? "Hide materials" : "Show the materials in this package") : undefined}
                style={{ display: "grid", gridTemplateColumns: "150px 1fr 96px", gap: 10, alignItems: "center",
                  cursor: hasMat ? "pointer" : "default", borderRadius: 6,
                  background: open ? "rgba(255,255,255,0.04)" : "transparent" }}
              >
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                  {hasMat && (open
                    ? <ChevronDown size={12} style={{ marginRight: 2, flexShrink: 0, opacity: 0.5 }} />
                    : <ChevronRight size={12} style={{ marginRight: 2, flexShrink: 0, opacity: 0.5 }} />)}
                  {r.color && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 6, flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                </span>
                {/* Track with the target marker */}
                <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${w}%`, background: c, borderRadius: 5, transition: "width .4s" }} />
                  <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} title={abs ? `Target ≤ ${T} kWh/m²·yr` : `Target −${goal.reductionPct}%`} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: c, textAlign: "right" }}
                  title={abs && !r.meets ? `${Math.round(r.energyUse - T)} kWh/m²·yr above the target` : undefined}>
                  {abs
                    ? `${Math.round(r.energyUse)}${r.meets ? "" : ` (+${Math.round(r.energyUse - T)})`}`
                    : r.reductionPct == null ? "—" : `${red >= 0 ? "−" : "+"}${Math.abs(red).toFixed(0)}%`}
                  {r.meets && <CheckCircle2 size={11} color={MET} style={{ marginLeft: 4, verticalAlign: "-1px" }} />}
                </span>
              </div>
              {/* Expanded: the assembly on each component of this package */}
              {open && hasMat && (
                <div style={{ margin: "4px 0 6px 20px", padding: "8px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", flexDirection: "column", gap: 8 }}>
                  {r.materials!.map((m, i) => (
                    <div key={`${m.component}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11 }}>
                        <span style={{ minWidth: 78, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{m.component}</span>
                        <span style={{ flex: 1, color: "rgba(255,255,255,0.82)" }}>{m.material}</span>
                        {m.u != null && (
                          <span style={{ fontWeight: 700, color: m.u > 0.4 ? "#E2483B" : m.u > 0.3 ? "#E8880C" : "#2FB477", flexShrink: 0 }}>
                            U {m.u.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Full build-up, outside → inside — names the exact insulation. */}
                      {m.layers && m.layers.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 86 }}>
                          {m.layers.map((l, j) => (
                            <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10,
                              padding: "1px 7px", borderRadius: 6,
                              background: `${LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF"}1e`,
                              border: `1px solid ${LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF"}40`,
                              color: "rgba(255,255,255,0.8)" }}>
                              <span style={{ fontWeight: 700, color: LAYER_COLOR[l.category ?? ""] ?? "#9CA3AF" }}>{l.thicknessMm} mm</span>
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
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)" }}>
          <span style={{ display: "inline-block", width: 2, height: 9, background: "rgba(255,255,255,0.55)", marginRight: 5, verticalAlign: "-1px" }} />
          {abs
            ? `≤ ${T} kWh/m²·yr target · simulated energy use, kWh/m²·yr (+n = above the target)`
            : `−${goal.reductionPct}% target · reduction vs baseline energy demand`}
        </span>
        <SourceLink goal={goal} />
      </div>
    </PanelShell>
  );
}

function SourceLink({ goal }: { goal: ClimateGoal }) {
  const style = { fontSize: 9.5, color: "rgba(255,255,255,0.35)" } as const;
  return goal.sourceUrl
    ? <a href={goal.sourceUrl} target="_blank" rel="noreferrer" style={{ ...style, textDecoration: "underline" }}>{goal.source}</a>
    : <span style={style}>{goal.source}</span>;
}

/** What the official target actually measures - almost never "one building vs
 *  its as-built state" - so the score above is read as the proxy it is. */
function GoalBasis({ goal }: { goal: ClimateGoal }) {
  return (
    <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.5)", margin: "6px 0 0" }}>
      {goal.headline && <div><b style={{ color: "rgba(255,255,255,0.7)" }}>Headline goal:</b> {goal.headline}</div>}
      <div><b style={{ color: "rgba(255,255,255,0.7)" }}>Official target:</b> {goal.basis}</div>
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
      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800, fontSize: 11, padding: "1px 5px", borderRadius: 4, background: `${c}26`, color: c, border: `1px solid ${c}55` }}>{band}</span>
      {sap != null && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{sap}</span>}
    </span>
  );
}

/** Rating goal (Rotherham: EPC band C). Where each package leaves every building
 *  on the EPC scale - estimated from its certificate, see assessRating(). */
export function ClimateGoalRatingPanel({ a }: { a: RatingAssessment }) {
  const { goal, rows, columns, metToday } = a;
  const best = [...columns].sort((x, y) => y.met - x.met || (y.medianSap ?? 0) - (x.medianSap ?? 0))[0];
  const allMet = best && best.met === best.total;
  const accent = allMet ? MET : NEAR;
  const headline = !columns.length
    ? `${metToday} of ${rows.length} building${rows.length === 1 ? "" : "s"} are at band ${goal.targetRating} or better today — simulate a package to see where it takes them`
    : best && best.met > 0
      ? `${best.label} brings ${best.met} of ${best.total} building${best.total === 1 ? "" : "s"} to band ${goal.targetRating} or better (estimated) — ${metToday} today`
      : `No package brings a building to band ${goal.targetRating} yet (estimated) — ${metToday} of ${rows.length} are there today`;
  const fromBand = rows.filter((r) => r.from === "band").length;

  return (
    <PanelShell icon={<Target size={17} />} iconColor={accent}
      title={`${goal.city} climate target`} subtitle={goalStatement(goal)}
      badge={
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, padding: "3px 10px", borderRadius: 100, background: `${accent}1e`, color: accent, border: `1px solid ${accent}44`, flexShrink: 0 }}>
          EPC {goal.targetRating} BY {goal.targetYear}
        </span>
      }>
      <GoalBasis goal={goal} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 12px" }}>
        {allMet ? <CheckCircle2 size={15} color={MET} /> : <Target size={14} color={NEAR} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: allMet ? MET : "rgba(255,255,255,0.75)" }}>{headline}</span>
      </div>

      {/* Share of buildings at the target band: today, then per package. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {[{ label: "Today (certificates)", met: metToday, total: rows.length, color: undefined as string | undefined, medianSap: null as number | null, today: true },
          ...columns.map((c) => ({ ...c, today: false }))].map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 120px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: c.today ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.75)", fontStyle: c.today ? "italic" : "normal",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
              {c.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, marginRight: 6, flexShrink: 0 }} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
            </span>
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.total ? (c.met / c.total) * 100 : 0}%`, background: c.today ? "rgba(255,255,255,0.3)" : (c.met === c.total ? MET : NEAR), borderRadius: 5 }} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, textAlign: "right", color: c.met === c.total ? MET : "rgba(255,255,255,0.7)" }}>
              {c.met}/{c.total} at {goal.targetRating}+
              {c.medianSap != null && <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.4)" }}> · SAP {c.medianSap}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Every building: band today → estimated band under each package. */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5, minWidth: 420 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
              <th style={{ padding: "7px 10px", fontWeight: 700 }}>Building</th>
              <th style={{ padding: "7px 10px", fontWeight: 700 }}>Today</th>
              {columns.map((c) => <th key={c.label} style={{ padding: "7px 10px", fontWeight: 700, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.address} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px 10px", color: "#fff", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.address}{r.from === "band" && <span title="No certificate SAP: starts from the middle of its band" style={{ color: "rgba(255,255,255,0.35)" }}> *</span>}
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 10, fontSize: 9.5, color: "rgba(255,255,255,0.35)" }}>
        <span>
          Band (SAP score) · package bands are estimates: the certificate's SAP moved by the simulated change in fuel use.
          {fromBand > 0 && ` * ${fromBand} building${fromBand === 1 ? " has" : "s have"} no certificate SAP and start from the middle of their band.`}
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
      title={`${goal.city} climate target`} subtitle={goalStatement(goal)}>
      <GoalBasis goal={goal} />
      <div style={{ marginTop: 10 }}><SourceLink goal={goal} /></div>
    </PanelShell>
  );
}
