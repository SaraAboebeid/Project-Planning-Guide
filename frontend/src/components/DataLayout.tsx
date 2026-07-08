import { useNavigate, useLocation } from "react-router-dom";

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

const IC = {
  home:     "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  map:      "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  database: "M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4S4 11.21 4 9zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z",
  globe:    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  arrowL:   "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
};

const NAV_ITEMS = [
  { iconD: "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z", label: "Pathways",  path: "/pathways"  },
  { iconD: IC.database, label: "Data",      path: "/data"      },
  { iconD: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z", label: "Analysis",   path: "/analysis"  },
  { iconD: IC.map,      label: "Map",       path: "__3d"       },
  { iconD: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z", label: "Budget",     path: "/budget"    },
  { iconD: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z", label: "Reports",    path: "/reports"   },
];

export default function DataLayout({
  children,
  title = "Data Explorer",
  accentColor = "#4A90E2",
  accentBadge = "Gothenburg Digital Twin",
}: {
  children: React.ReactNode;
  title?: string;
  accentColor?: string;
  accentBadge?: string;
}) {
  const navigate  = useNavigate();
  const location  = useLocation();

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      background: "#0a0d14", fontFamily: "'Inter', system-ui, sans-serif", color: "#fff",
    }}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 60, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "16px 0", gap: 2, zIndex: 30,
        background: "#0d1117", borderRight: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Logo */}
        <div
          onClick={() => navigate("/")}
          style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 12, cursor: "pointer",
            background: "linear-gradient(135deg,#721CB8,#421869)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </div>

        {NAV_ITEMS.map((item) => {
          const isActive = item.path === location.pathname;
          return (
            <button
              key={item.path}
              title={item.label}
              onClick={() => item.path === "__3d"
                ? window.open("http://localhost:8765/gothenburg_3d.html", "_blank")
                : navigate(item.path)
              }
              style={{
                border: 0, width: "100%", padding: "8px 0", borderRadius: 8, cursor: "pointer",
                background: isActive ? "rgba(114,28,184,0.28)" : "transparent",
                color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                transition: "all 0.15s",
              }}
            >
              <Icon d={item.iconD} size={18} />
              <span style={{ fontSize: 8, fontWeight: 600 }}>{item.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <button title="Settings" style={{
          border: 0, width: "100%", padding: "8px 0", borderRadius: 8, cursor: "pointer",
          background: "transparent", color: "rgba(255,255,255,0.28)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        }}>
          <Icon d={IC.settings} size={18} />
          <span style={{ fontSize: 8 }}>Settings</span>
        </button>
      </aside>

      {/* ── MAIN COLUMN ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* ── TOP BAR ────────────────────────────────────────────────────── */}
        <header style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 24px",
          minHeight: 56, background: "#0d1117", borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <button
            onClick={() => navigate(-1 as never)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
            }}
          >
            <Icon d={IC.arrowL} size={14} /> Back
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "#fff", margin: 0 }}>
            {title}
          </h1>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 99,
            background: `${accentColor}26`, border: `1px solid ${accentColor}55`,
            color: accentColor,
          }}>
            {accentBadge}
          </span>
        </header>

        {/* ── SCROLLABLE CONTENT ─────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
