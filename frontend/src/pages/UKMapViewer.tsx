import { useMemo } from "react";
import { useWizardStore } from "../store/wizard";

// The 3D viewer resolves its location from `?city=<id>` (see viewer/js/bootstrap.js),
// but the top-nav city selector stores a city *name* ("London" / "Rotherham") in the
// wizard store. Map the name to the viewer's city id so selecting a city actually
// loads it — without this the viewer always fell back to cities[0] (King's Cross).
// "London" opens on the King's Cross district (the profile's default London area);
// the other London districts remain switchable from inside the viewer.
const CITY_NAME_TO_ID: Record<string, string> = {
  London: "london_kings_cross",
  Rotherham: "rotherham",
};

export default function UKMapViewer() {
  const city = useWizardStore((s) => s.project.city);
  const cityId = (city && CITY_NAME_TO_ID[city]) || "london_kings_cross";

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
