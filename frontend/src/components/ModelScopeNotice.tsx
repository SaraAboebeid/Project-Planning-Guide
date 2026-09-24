/**
 * ModelScopeNotice — says when the energy model is not a fair representation of
 * this building, instead of letting the number speak for itself.
 *
 * The shoebox is one thermal zone with generic internal gains and no process
 * equipment. For a swimming pool, a hospital or a factory it is not simply less
 * accurate, it is answering a different question: against Rotherham's Display
 * Energy Certificates those buildings simulated at 0.16-0.28x their metered
 * energy, while the schools the model is built for came out at 1.03.
 *
 * The backend decides (main.py _model_scope) and the flag travels with the
 * results, so this component only renders what it is given.
 */
import type { ModelScope } from "../types";
import { C, tint } from "../config/colors";

export default function ModelScopeNotice({
  scope,
  compact = false,
}: {
  scope?: ModelScope | null;
  compact?: boolean;
}) {
  if (!scope) return null;
  const blocking = scope.level === "out_of_scope";
  const accent = blocking ? C.bad : C.warn;

  return (
    <div
      role="note"
      style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        padding: compact ? "8px 10px" : "11px 13px",
        borderRadius: 10,
        background: tint(accent, 0.12),
        border: `1px solid ${tint(accent, 0.45)}`,
        margin: compact ? "8px 0" : "10px 0",
      }}
    >
      <span aria-hidden style={{ color: accent, fontWeight: 800, lineHeight: 1.3 }}>
        {blocking ? "!" : "?"}
      </span>
      <div style={{ fontSize: compact ? 11.5 : 12.5, lineHeight: 1.55 }}>
        <strong style={{ color: accent }}>
          {blocking
            ? "This building is outside what the energy model can represent"
            : "Part of this building's energy use is not modelled"}
        </strong>
        <div style={{ color: "rgba(255,255,255,0.72)", marginTop: 2 }}>
          {scope.reason}
          {scope.matched ? (
            <span style={{ color: "rgba(255,255,255,0.45)" }}> (matched on “{scope.matched}”)</span>
          ) : null}
        </div>
        {blocking && (
          <div style={{ color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            Treat any simulated figure and any saving derived from it as not applicable to this
            building, rather than as an estimate with a wide margin.
          </div>
        )}
      </div>
    </div>
  );
}
