import { useMemo } from "react";
import { useWizardStore } from "../store/wizard";
import { ukViewerCityId } from "../config/countryNav";

export default function UKMapViewer() {
  const city = useWizardStore((s) => s.project.city);
  const cityId = ukViewerCityId(city);

  // Include the city in the URL and key the iframe on it, so switching city in the
  // nav remounts the viewer at the new location instead of silently doing nothing.
  const viewerUrl = useMemo(
    () => `/uk_3d.html?v=20260803-scb2&city=${cityId}`,
    [cityId],
  );

  return (
    <div style={{ height: "calc(100vh - 128px)", minHeight: 520 }}>
      <iframe
        key={viewerUrl}
        src={viewerUrl}
        title="United Kingdom 3D Viewer"
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
