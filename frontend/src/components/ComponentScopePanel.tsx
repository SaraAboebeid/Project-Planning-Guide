import type { GoalAssessment } from "../config/climateGoals";

/* Which envelope components the renovation is allowed to touch. Adding a
 * component makes it appear in the builder below (design a build-up), and brings
 * it into the packages + optimiser + EPSM. Surfaced prominently — and nudged in
 * amber — when the best package falls short of the city climate target, since
 * envelope measures on a subset of components physically cap the reachable
 * reduction (walls+roof alone rarely hit −30%). */

const ADDABLE = ["Walls", "Roof", "Windows", "Floor", "Heating system"] as const;

export default function ComponentScopePanel({ components, onChange, goalAssessment }: {
  components: string[];
  onChange: (next: string[]) => void;
  goalAssessment: GoalAssessment | null;
}) {
  const inScope = (c: string) => components.includes(c);
  const toggle = (c: string) => {
    if (inScope(c)) { if (components.length > 1) onChange(components.filter((x) => x !== c)); }
    else onChange([...components, c]);
  };

  const reached = !!goalAssessment && goalAssessment.achievers.length > 0;

  return (
    <div style={{
      borderRadius: 14, padding: "14px 18px",
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Renovation scope</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          which components to renovate — add more to reach deeper savings
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ADDABLE.map((c) => {
          const on = inScope(c);
          return (
            <button key={c} onClick={() => toggle(c)}
              title={on ? "In scope — click to remove" : "Add to the renovation scope"}
              style={{
                fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 99, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                border: `1px solid ${on ? "#4ECDC4" : "rgba(255,255,255,0.15)"}`,
                borderStyle: on ? "solid" : "dashed",
                background: on ? "rgba(78,205,196,0.15)" : "rgba(255,255,255,0.03)",
                color: on ? "#4ECDC4" : "rgba(255,255,255,0.55)",
              }}>
              <span style={{ fontSize: 11 }}>{on ? "✓" : "＋"}</span>{c}
            </button>
          );
        })}
      </div>

      {reached && (
        <div style={{ marginTop: 11, fontSize: 11.5, color: "#96D74C" }}>
          ✓ The climate target is reached with the current scope.
        </div>
      )}
    </div>
  );
}
