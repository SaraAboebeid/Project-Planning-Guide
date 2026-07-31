import { useMemo } from "react";

export default function MapViewer() {
  // Keep iframe src stable during component re-renders; only bump `v=` when needed.
  const viewerUrl = useMemo(() => `/gothenburg_3d.html?v=20260731-hover`, []);

  return (
    <div style={{ height: "calc(100vh - 128px)", minHeight: 520 }}>
      <iframe
        key={viewerUrl}
        src={viewerUrl}
        title="Gothenburg 3D Viewer"
        style={{
          width: "100%",
          height: "100%",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          background: "#0a0d14",
        }}
      />
    </div>
  );
}
