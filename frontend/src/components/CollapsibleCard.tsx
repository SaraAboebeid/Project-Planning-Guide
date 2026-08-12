import { useState, type ReactNode } from "react";

/* Shared collapsible reference card + equation row, so every method / model
   block on the Data Explorer (MCDA, decision-under-uncertainty, optimization)
   renders with one consistent style and one consistent collapse behaviour. */

const white = (o: number) => `rgba(255,255,255,${o})`;

export function CollapsibleCard({
  title, subtitle, color = "#721CB8", badge, defaultOpen = false, children,
}: {
  title: string;
  subtitle?: string;
  color?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 12,
      border: `1px solid ${open ? `${color}33` : white(0.08)}`, overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "13px 16px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{title}</span>
          {subtitle && <span style={{ fontSize: 11.5, color: white(0.4) }}>{subtitle}</span>}
          {badge}
        </span>
        <span style={{
          color: white(0.45), fontSize: 11, flexShrink: 0,
          transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s",
        }}>▶</span>
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

/* One equation: a caption, the formula in a mono code box, and an optional note. */
export function EquationRow({ label, tex, explain }: { label: string; tex: string; explain?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: white(0.4), marginBottom: 3 }}>{label}</div>
      <div style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, color: "#f0f4ff",
        background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "7px 10px", overflowX: "auto",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>{tex}</div>
      {explain && <div style={{ fontSize: 10.5, color: white(0.42), marginTop: 3, lineHeight: 1.5 }}>{explain}</div>}
    </div>
  );
}

/* Uppercase sub-heading used inside a card (Assumptions / Equations / Methods). */
export function SubHead({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: white(0.35),
      textTransform: "uppercase", margin: "16px 0 8px",
    }}>{children}</div>
  );
}
