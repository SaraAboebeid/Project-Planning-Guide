import { useLocation, useNavigate } from "react-router-dom";
import {
  COUNTRIES,
  LIBRARY_TABS,
  tabPathFor,
  countryFromPath,
  pathForCountry,
  countryCodeFromName,
  defaultCityFor,
  cityEnabled,
  countryEnabled,
  type CountryCode,
} from "../config/countryNav";
import { useWizardStore } from "../store/wizard";

/* The application top bar — logos, library tabs, country/city selector, account.
 *
 * One component so every page renders the SAME bar. It previously existed twice:
 * once inline in LandingPage and once inline in DataLayout, and the two had
 * already drifted — the landing page had a city selector and an avatar that the
 * five tool pages (Pathways, Data Explorer, Analysis Tools, 3D Viewer, Sample
 * Reports) did not, and the bars were different heights and background colours.
 *
 * Controlled or uncontrolled:
 *   • Pass country/city + handlers (LandingPage does) when the page drives its
 *     own content from the selection — the landing hero re-aims its 3D camera.
 *   • Pass nothing (DataLayout does) and the bar reads the country from the URL
 *     and the city from the wizard store, persisting the choice across pages.
 */
export default function TopBar({
  country: countryProp,
  city: cityProp,
  onCountryChange,
  onCityChange,
}: {
  country?: CountryCode;
  city?: string;
  onCountryChange?: (c: CountryCode) => void;
  onCityChange?: (city: string) => void;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const project = useWizardStore((s) => s.project);
  const setProject = useWizardStore((s) => s.setProject);

  // Uncontrolled: the URL is the source of truth for country, so the bar always
  // matches what's on screen even after a hard refresh or a direct link to
  // e.g. /viewer/uk. The store carries the city, which has no URL of its own.
  const country: CountryCode =
    countryProp ?? (location.pathname === "/" ? countryCodeFromName(project.country) : countryFromPath(location.pathname));
  const countryDef = COUNTRIES.find((c) => c.id === country) ?? COUNTRIES[0];
  const safeCountryDef = countryDef ?? COUNTRIES[0];
  const _city = cityProp ?? project.city ?? defaultCityFor(country);
  const city = cityEnabled(country, _city) ? _city : defaultCityFor(country);

  function selectCountry(id: CountryCode) {
    const def = COUNTRIES.find((c) => c.id === id);
    const firstCity = defaultCityFor(id);
    if (onCountryChange) {
      onCountryChange(id);
    } else {
      setProject({ country: def?.name ?? null, city: firstCity || null });
    }
    // Already on a page that has a per-country build (Data Explorer, 3D Viewer)?
    // Swap to that country's version so the pill and the page can't disagree.
    const swap = pathForCountry(location.pathname, id);
    if (swap && swap !== location.pathname) navigate(swap);
  }

  function selectCity(name: string) {
    if (onCityChange) onCityChange(name);
    else setProject({ city: name });
  }

  const pill = {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
  } as const;

  return (
    <header
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 56,
        zIndex: 30,
        background: "#0d1117",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <img src="/CTH_new_logo_white.png" alt="Chalmers" style={{ height: 28, opacity: 0.8 }} />
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
        <img src="/CNL_new_logo_white.png" alt="Chalmers Next Labs" style={{ height: 28, opacity: 0.8 }} />
      </div>

      {/* Library tabs */}
      <div style={{ ...pill, marginLeft: 16, padding: 4 }}>
        {LIBRARY_TABS.map((tab) => {
          const targetPath = tabPathFor(tab, country);
          const isActive = location.pathname === tab.path || location.pathname === targetPath;
          return (
            <button
              key={tab.label}
              onClick={() => navigate(targetPath)}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                whiteSpace: "nowrap",
                color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                background: isActive ? "#721CB8" : "transparent",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Country → city selector. Switching to a country or city that has no
          build yet is a no-op for the page content; the pill still moves so the
          selection is never silently ignored. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={pill}>
          {COUNTRIES.map((c) => {
            const enabled = countryEnabled(c.id);
            return (
            <button
              key={c.id}
              onClick={enabled ? () => selectCountry(c.id) : undefined}
              disabled={!enabled}
              title={enabled ? undefined : "Coming soon — not available yet"}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: 0,
                cursor: enabled ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: country === c.id ? 700 : 500,
                background: country === c.id ? "#721CB8" : "transparent",
                color: !enabled ? "rgba(255,255,255,0.32)"
                      : country === c.id ? "#fff" : "rgba(255,255,255,0.72)",
                opacity: enabled ? 1 : 0.6,
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </button>
            );
          })}
        </div>

        {safeCountryDef.cities.length > 0 && (
          <>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, margin: "0 2px" }}>›</span>
            <div style={pill}>
              {safeCountryDef.cities.map((name) => {
                const enabled = cityEnabled(country, name);
                return (
                <button
                  key={name}
                  onClick={enabled ? () => selectCity(name) : undefined}
                  disabled={!enabled}
                  title={enabled ? undefined : "Coming soon — not available yet"}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: 0,
                    cursor: enabled ? "pointer" : "not-allowed",
                    fontSize: 11,
                    fontWeight: city === name ? 700 : 500,
                    background: city === name ? "#4ECDC4" : "transparent",
                    color: !enabled ? "rgba(255,255,255,0.32)"
                      : city === name ? "#0b1220" : "rgba(255,255,255,0.72)",
                    opacity: enabled ? 1 : 0.6,
                    transition: "all .15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#721CB8,#421869)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          SA
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </div>
    </header>
  );
}
