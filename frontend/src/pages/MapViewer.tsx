import { useMemo } from "react";
import { useWizardStore } from "../store/wizard";
import { seCityId } from "../config/countryNav";

export default function MapViewer() {
  // The Swedish viewer serves several cities (?city=); open the project's own.
  const cityId = seCityId(useWizardStore((s) => s.project.city));
  // Keep iframe src stable during component re-renders; only bump `v=` when needed.
  const viewerUrl = useMemo(() => `/gothenburg_3d.html?v=20261016-malmo&city=${cityId}`, [cityId]);

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
