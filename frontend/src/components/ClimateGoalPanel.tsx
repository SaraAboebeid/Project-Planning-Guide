import { Target, CheckCircle2 } from "lucide-react";
import { type GoalAssessment } from "../config/climateGoals";

/* Shows a city climate target and which renovation packages reach it. Used in
 * Step 4 (after packages are simulated) and echoed in the Step 5 report, off the
 * same assessAgainstGoal() result so the two never disagree. */

const MET = "#96D74C";     // green — meets the target
const NEAR = "#F59E0B";    // amber — below the target
const WORSE = "#EF4444";   // red — worse than baseline

function barColor(r: { meets: boolean; reductionPct: number | null }) {
  if (r.meets) return MET;
  if (r.reductionPct != null && r.reductionPct < 0) return WORSE;
  return NEAR;
}

export default function ClimateGoalPanel({ a }: { a: GoalAssessment }) {
  const { goal, rows, achievers, closest } = a;

  // Scale the bars so the target line sits comfortably inside the track.
  const maxRed = Math.max(goal.reductionPct + 8, ...rows.map((r) => r.reductionPct ?? 0));
  const scaleMax = Math.max(maxRed, 10);
  const targetLeft = (goal.reductionPct / scaleMax) * 100;

  const headline = achievers.length
    ? `${achievers[0]!.label} reaches −${achievers[0]!.reductionPct!.toFixed(0)}%, meeting the target`
    + (achievers.length > 1 ? ` (${achievers.length} packages meet it)` : "")
    : closest && closest.reductionPct != null
      ? `No package reaches the target yet — closest is ${closest.label} at −${closest.reductionPct.toFixed(0)}%`
      : "Simulate a package to measure it against the target";

  const accent = achievers.length ? MET : NEAR;

  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${accent}`,
        padding: "18px 20px",
      }}
    >
      {/* Goal statement */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Target size={16} color={accent} />
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>
          {goal.city} climate target
        </h3>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.6,
            padding: "3px 10px",
            borderRadius: 100,
            background: `${accent}1e`,
            color: accent,
            border: `1px solid ${accent}44`,
          }}
        >
          −{goal.reductionPct}% BY {goal.targetYear}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 4px", lineHeight: 1.6 }}>
        Reduce the as-built baseline energy demand by {goal.reductionPct}% by {goal.targetYear}.
      </p>

      {/* Verdict */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 14px" }}>
        {achievers.length ? <CheckCircle2 size={15} color={MET} /> : <Target size={14} color={NEAR} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: achievers.length ? MET : "rgba(255,255,255,0.75)" }}>
          {headline}
        </span>
      </div>

      {/* Per-package bars toward the target */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((r) => {
          const red = r.reductionPct ?? 0;
          const w = Math.max(0, Math.min(red, scaleMax)) / scaleMax * 100;
          const c = barColor(r);
          return (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr 96px", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.color && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 6 }} />}
                {r.label}
              </span>
              {/* Track with the target marker */}
              <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${w}%`, background: c, borderRadius: 5, transition: "width .4s" }} />
                <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} title={`Target −${goal.reductionPct}%`} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: c, textAlign: "right" }}>
                {r.reductionPct == null ? "—" : `${red >= 0 ? "−" : "+"}${Math.abs(red).toFixed(0)}%`}
                {r.meets && <CheckCircle2 size={11} color={MET} style={{ marginLeft: 4, verticalAlign: "-1px" }} />}
              </span>
            </div>
          );
        })}
      </div>

      {/* Target-line legend + source */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)" }}>
          <span style={{ display: "inline-block", width: 2, height: 9, background: "rgba(255,255,255,0.55)", marginRight: 5, verticalAlign: "-1px" }} />
          −{goal.reductionPct}% target · reduction vs baseline energy demand
        </span>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)" }}>{goal.source}</span>
      </div>
    </div>
  );
}
