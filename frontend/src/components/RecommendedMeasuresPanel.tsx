/* Step 4 — "Recommended measures". Shows, per component, whether the buildings
   need it and why (renovationRecommendations.ts), and lets the user include or
   exclude it. The resulting scope is what the rest of Step 4 designs packages
   for — it replaced the component question that used to sit in Step 1. */

import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useT } from "../i18n";
import { C, tint } from "../config/colors";
import { IVL_SOURCE, BBR_SOURCE } from "../config/serviceLifeSE";
import { OPTIONAL_COMPONENTS, type ComponentRec, type RecLevel, type RecReason } from "../utils/renovationRecommendations";

const LEVEL_META: Record<RecLevel | "info", { label: string; icon: string; color: string }> = {
  needed:   { label: "Needed",             icon: "⚠", color: C.bad },
  consider: { label: "Worth considering",  icon: "◐", color: C.warn },
  ok:       { label: "Not a priority",     icon: "✓", color: C.good },
  unknown:  { label: "Not enough data",    icon: "?", color: "rgba(255,255,255,0.45)" },
  info:     { label: "Note",               icon: "ℹ", color: C.info },
};

function LevelPill({ level }: { level: RecLevel }) {
  const t = useT();
  const m = LEVEL_META[level];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 99, whiteSpace: "nowrap",
      fontSize: 10.5, fontWeight: 800, color: m.color, background: level === "unknown" ? "rgba(255,255,255,0.06)" : tint(m.color, 0.14),
      border: `1px solid ${level === "unknown" ? "rgba(255,255,255,0.12)" : tint(m.color, 0.4)}` }}>
      <span aria-hidden>{m.icon}</span>{t(m.label)}
    </span>
  );
}

function ReasonLine({ r }: { r: RecReason }) {
  const t = useT();
  const m = LEVEL_META[r.level];
  return (
    <div style={{ display: "flex", gap: 7, fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,0.7)" }}>
      <span aria-hidden style={{ color: m.color, width: 12, flexShrink: 0, textAlign: "center" }}>{m.icon}</span>
      <span>{t(r.msg, r.params)}</span>
    </div>
  );
}

export default function RecommendedMeasuresPanel({
  recs, scope, overrides, onToggle, onReset, buildingCount, showBbr,
}: {
  recs: ComponentRec[];
  /** BBR targets are Swedish law — only cited when the energy rule used them. */
  showBbr: boolean;
  scope: string[];
  overrides: Record<string, boolean>;
  onToggle: (component: string, include: boolean) => void;
  onReset: () => void;
  buildingCount: number;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const edited = Object.keys(overrides).length > 0;

  const summary = (r: ComponentRec) => {
    if (buildingCount <= 1) return null;
    const parts: string[] = [];
    if (r.counts.needed) parts.push(t("needed in {n}", { n: r.counts.needed }));
    if (r.counts.consider) parts.push(t("worth considering in {n}", { n: r.counts.consider }));
    if (r.counts.unknown) parts.push(t("no data for {n}", { n: r.counts.unknown }));
    return parts.length ? `${parts.join(" · ")} ${t("of {n} buildings", { n: buildingCount })}` : t("not a priority in any of the {n} buildings", { n: buildingCount });
  };

  return (
    <div style={{ borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>{t("Recommended measures")}</h3>
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.55 }}>
            {t("What these buildings likely need, judged from their age, recorded renovations, façade condition and energy performance. Ticked components are the ones you design packages for below — change any of them.")}
          </p>
        </div>
        {edited && (
          <button onClick={onReset} title={t("Go back to the recommended scope")}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: 0, cursor: "pointer",
              color: C.selected, fontSize: 11, fontWeight: 700, padding: 2, whiteSpace: "nowrap" }}>
            <RotateCcw size={12} /> {t("Use recommendation")}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recs.map((r) => {
          const included = scope.includes(r.component);
          const isOpen = open === r.component;
          // One building: its reasons are the whole story, so show them inline.
          const single = buildingCount <= 1 ? r.buildings[0] : null;
          return (
            <div key={r.component} style={{ borderRadius: 10, border: `1px solid ${included ? tint(C.selected, 0.35) : "rgba(255,255,255,0.07)"}`,
              background: included ? tint(C.selected, 0.05) : "rgba(255,255,255,0.015)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
                <input type="checkbox" checked={included} onChange={(e) => onToggle(r.component, e.target.checked)}
                  aria-label={t("Include {c}", { c: t(r.component) })}
                  style={{ width: 15, height: 15, accentColor: C.selected, cursor: "pointer", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: included ? "#fff" : "rgba(255,255,255,0.6)", minWidth: 110 }}>{t(r.component)}</span>
                <LevelPill level={r.level} />
                <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 0 }}>
                  {summary(r)}
                  {overrides[r.component] != null && overrides[r.component] !== r.defaultInclude && (
                    <span style={{ marginLeft: 6, color: C.warn }}>· {t(included ? "added by you" : "excluded by you")}</span>
                  )}
                </span>
                <button onClick={() => setOpen(isOpen ? null : r.component)}
                  style={{ display: "flex", alignItems: "center", gap: 3, background: "transparent", border: 0, cursor: "pointer",
                    color: "rgba(255,255,255,0.45)", fontSize: 11, padding: 2, whiteSpace: "nowrap" }}>
                  {t(isOpen ? "Hide why" : "Why")} {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
              {single && !isOpen && single.reasons[0] && (
                <div style={{ padding: "0 12px 9px 37px" }}><ReasonLine r={single.reasons[0]} /></div>
              )}
              {isOpen && (
                <div style={{ padding: "2px 12px 11px 37px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {r.buildings.map((b) => (
                    <div key={b.key}>
                      {buildingCount > 1 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{b.label}</span>
                          <LevelPill level={b.level} />
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {b.reasons.length
                          ? b.reasons.map((reason, i) => <ReasonLine key={i} r={reason} />)
                          : <ReasonLine r={{ level: "unknown", msg: "No information about this component for this building." }} />}
                      </div>
                    </div>
                  ))}
                  {r.life && (
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginTop: 2 }}>
                      {t("Expected technical life:")} {t(r.life.basis)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {OPTIONAL_COMPONENTS.map((c) => {
          const included = scope.includes(c);
          return (
            <label key={c} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
              border: `1px dashed ${included ? tint(C.selected, 0.35) : "rgba(255,255,255,0.1)"}` }}>
              <input type="checkbox" checked={included} onChange={(e) => onToggle(c, e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.selected, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: included ? "#fff" : "rgba(255,255,255,0.6)", minWidth: 110 }}>{t("Vertical extension")}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {t("Optional — a new storey is a development choice, not something the building's condition calls for.")}
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 10, lineHeight: 1.6 }}>
        {t("Without a recorded renovation, age counts from the construction year — record past renovations in Step 2 to correct it. U-values are mostly typical for the building's era, not measured.")}{" "}
        {t("Sources:")} <a href={IVL_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.5)" }}>{IVL_SOURCE.label}</a>
        {showBbr && <>{" · "}<a href={BBR_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.5)" }}>{BBR_SOURCE.label}</a></>}
      </div>
    </div>
  );
}
