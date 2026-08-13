import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/* One collapsible section shell so every Step-4 result panel (climate target,
   HVAC, decision analysis, optimizer) shares the same card, header, icon badge
   and collapse chevron. Keeps the page visually consistent. */
const white = (o: number) => `rgba(255,255,255,${o})`;

export default function PanelShell({
  icon, iconColor = "#B98BE8", title, subtitle, badge, defaultOpen = true, children,
}: {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;            // optional pill shown on the right of the header
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ width: 32, height: 32, borderRadius: 9, background: `${iconColor}22`, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>{title}</span>
          {subtitle && <span style={{ display: "block", fontSize: 11, color: white(0.42), marginTop: 1 }}>{subtitle}</span>}
        </span>
        {badge}
        {open ? <ChevronUp size={16} color={white(0.4)} style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color={white(0.4)} style={{ flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: "0 18px 16px" }}>{children}</div>}
    </div>
  );
}
