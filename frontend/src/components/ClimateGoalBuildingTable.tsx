import { CheckCircle2 } from "lucide-react";
import { type BuildingGoalAssessment, type GoalTier } from "../config/climateGoals";

/* Per-building view of the city target: every building's own goal (its baseline
 * cut by the target %), and how each package lands against it — met, how far
 * short, or worse than baseline. Companion to the portfolio ClimateGoalPanel. */

const TIER_COLOR: Record<GoalTier, string> = {
  exceeds: "#2FB477",
  meets: "#2FB477",
  below: "#E8880C",
  worse: "#E2483B",
};

function cellText(reductionPct: number | null, tier: GoalTier | null, targetPct: number) {
  if (reductionPct == null) return "—";
  const r = Math.round(reductionPct);
  if (tier === "worse") return `+${Math.abs(r)}%`;
  // how far short of the target, in percentage points
  const shortfall = targetPct - r;
  if (tier === "below") return `−${r}% · ${shortfall}pp short`;
  return `−${r}%`;
}

export default function ClimateGoalBuildingTable({ a }: { a: BuildingGoalAssessment }) {
  const { goal, rows, columns } = a;
  const gray = "rgba(255,255,255,0.5)";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10, lineHeight: 1.6 }}>
        Each building's own target is its baseline cut by {goal.reductionPct}%. A package "meets" the
        target for a building when that building reaches its own −{goal.reductionPct}% line.
      </div>

      {/* Wide matrix scrolls in its own container — never widens the page. */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={thStyle("left")}>Building</th>
              <th style={thStyle("right")}>Baseline</th>
              <th style={thStyle("right")}>Goal −{goal.reductionPct}%</th>
              {columns.map((c) => (
                <th key={c.label} style={thStyle("right")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {c.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />}
                    {c.label}
                  </span>
                  <div style={{ fontSize: 9, fontWeight: 600, color: c.met === c.total ? "#2FB477" : "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {c.met}/{c.total} meet
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.address}>
                <td style={{ ...tdStyle, color: "#fff", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.address}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: gray }}>{r.baselineEnergy.toFixed(0)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>
                  ≤ {r.targetEnergy.toFixed(0)}
                </td>
                {r.cells.map((cell, i) => {
                  const color = cell.tier ? TIER_COLOR[cell.tier] : gray;
                  const met = cell.tier === "meets" || cell.tier === "exceeds";
                  return (
                    <td key={i} style={{ ...tdStyle, textAlign: "right", background: met ? "rgba(47,180,119,0.08)" : undefined }}>
                      <div style={{ fontWeight: 700, color }}>
                        {cell.energy == null ? "—" : cell.energy.toFixed(0)}
                        {met && <CheckCircle2 size={11} color="#2FB477" style={{ marginLeft: 4, verticalAlign: "-1px" }} />}
                      </div>
                      <div style={{ fontSize: 9.5, color, opacity: 0.85, marginTop: 1 }}>
                        {cellText(cell.reductionPct, cell.tier, goal.reductionPct)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
        <Legend color="#2FB477" label={`Meets target (≥ −${goal.reductionPct}%)`} />
        <Legend color="#E8880C" label="Below target (reduces, not enough)" />
        <Legend color="#E2483B" label="No reduction vs baseline" />
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>values in kWh/m²·yr · pp = percentage points short</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderTop: "1px solid rgba(255,255,255,0.05)",
  whiteSpace: "nowrap",
};

function thStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: "8px 12px",
    textAlign: align,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    whiteSpace: "nowrap",
  };
}
