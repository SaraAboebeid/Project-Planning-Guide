import { useState } from "react";
import { Target, CheckCircle2, ChevronRight, ChevronDown } from "lucide-react";
import { type GoalAssessment } from "../config/climateGoals";

/* Shows a city climate target and which renovation packages reach it. Used in
 * Step 4 (after packages are simulated) and echoed in the Step 5 report, off the
 * same assessAgainstGoal() result so the two never disagree. */

const MET = "#96D74C";     // green — meets the target
const NEAR = "#F59E0B";    // amber — below the target
const WORSE = "#EF4444";   // red — worse than baseline

// Layer build-up chip colors by material category — insulation stands out (teal)
// since it's the layer that answers "which insulation?".
const LAYER_COLOR: Record<string, string> = {
  insulation: "#4ECDC4",
  structure: "#F59E0B",
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

  // Scale the bars so the target line sits comfortably inside the track.
  const maxRed = Math.max(goal.reductionPct + 8, ...rows.map((r) => r.reductionPct ?? 0));
  const scaleMax = Math.max(maxRed, 10);
  const targetLeft = (goal.reductionPct / scaleMax) * 100;

  // A reduction is positive when energy drops. Format with the right sign so a
  // package that's WORSE than baseline reads "+76% (worse)" not "−-76%".
  const fmtRed = (r: number) =>
    r >= 0 ? `−${r.toFixed(0)}%` : `+${Math.abs(r).toFixed(0)}% (worse than baseline)`;

  const headline = achievers.length
    ? `${achievers[0]!.label} reaches −${achievers[0]!.reductionPct!.toFixed(0)}%, meeting the target`
    + (achievers.length > 1 ? ` (${achievers.length} packages meet it)` : "")
    : closest && closest.reductionPct != null
      ? `No package reaches the target yet — closest is ${closest.label} at ${fmtRed(closest.reductionPct)}`
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
        {rows.map((r, i) => {
          const red = r.reductionPct ?? 0;
          const w = Math.max(0, Math.min(red, scaleMax)) / scaleMax * 100;
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
                  <div style={{ position: "absolute", top: -2, bottom: -2, left: `${targetLeft}%`, width: 2, background: "rgba(255,255,255,0.55)" }} title={`Target −${goal.reductionPct}%`} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: c, textAlign: "right" }}>
                  {r.reductionPct == null ? "—" : `${red >= 0 ? "−" : "+"}${Math.abs(red).toFixed(0)}%`}
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
                          <span style={{ fontWeight: 700, color: m.u > 0.4 ? "#EF4444" : m.u > 0.3 ? "#F59E0B" : "#96D74C", flexShrink: 0 }}>
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
          −{goal.reductionPct}% target · reduction vs baseline energy demand
        </span>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)" }}>{goal.source}</span>
      </div>
    </div>
  );
}
