import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "./TopBar";
import ThemeToggle from "./ThemeToggle";

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

const IC = {
  project: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  map: "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  database: "M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4S4 11.21 4 9zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z",
  layers: "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z",
  timeline: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  report: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
};

const STEP_ITEMS = [
  { iconD: IC.project, label: "Step 1", path: "/step/1" },
  { iconD: IC.map, label: "Step 2", path: "/step/2" },
  { iconD: IC.database, label: "Step 3", path: "/step/3" },
  { iconD: IC.layers, label: "Step 4", path: "/step/4" },
  { iconD: IC.timeline, label: "Step 5", path: "/step/5" },
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
  const navigate = useNavigate();
  const location = useLocation();
  // The country/city selector moved into <TopBar/>, which derives the country
  // from the URL itself — see that component.

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0d14",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <aside
        style={{
          width: 60,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 2,
          zIndex: 30,
          background: "#0d1117",
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          onClick={() => navigate("/")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            marginBottom: 12,
            cursor: "pointer",
            background: "linear-gradient(135deg,#721CB8,#421869)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </div>

        {STEP_ITEMS.map((item) => {
          const isActive = item.path === location.pathname;
          return (
            <button
              key={item.path}
              title={item.label}
              onClick={() => navigate(item.path)}
              style={{
                border: 0,
                width: "100%",
                padding: "8px 0",
                borderRadius: 8,
                cursor: "pointer",
                background: isActive ? "#721CB8" : "transparent",
                color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                transition: "all 0.15s",
              }}
            >
              <Icon d={item.iconD} size={18} />
              <span style={{ fontSize: 8, fontWeight: 600 }}>{item.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <ThemeToggle />

        <button
          title="Settings"
          className="sidebar-theme-icon"
          style={{
            border: 0,
            width: "100%",
            padding: "8px 0",
            borderRadius: 8,
            cursor: "pointer",
            background: "transparent",
            color: "var(--sidebar-icon-color)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Icon d={IC.settings} size={18} />
          <span className="text-[9px] tracking-wide font-medium leading-none">Settings</span>
        </button>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopBar />

        <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {/* Pass title="" and accentBadge="" to drop this heading row entirely -
              the 3D viewer is a full-bleed map that names itself, so the label and
              pill only stole vertical space from it. The row disappears with them,
              rather than leaving an empty 16px gap above the content. */}
          {(title || accentBadge) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              {title && (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{title}</span>
              )}
              {accentBadge && (
                <span style={{ padding: "4px 8px", borderRadius: 999, background: accentColor, color: "#0b1220", fontSize: 10, fontWeight: 800, letterSpacing: 0.8 }}>{accentBadge}</span>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
