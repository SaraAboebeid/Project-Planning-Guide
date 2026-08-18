import {
  COUNTRIES,
  countryCodeFromName,
  defaultCityFor,
  cityEnabled,
  countryEnabled,
  type CountryCode,
} from "../config/countryNav";
import { useWizardStore } from "../store/wizard";

/* Country → city selector + account avatar. Rendered on every other page by
 * <TopBar/>; this store-driven variant is used in the wizard header (the wizard
 * URLs carry no country, so it reads/writes the project country/city directly)
 * so the same selection stays visible and editable inside Steps 1–5. */
export default function CountryCitySelector() {
  const project = useWizardStore((s) => s.project);
  const setProject = useWizardStore((s) => s.setProject);

  const country: CountryCode = countryCodeFromName(project.country);
  const countryDef = COUNTRIES.find((c) => c.id === country) ?? COUNTRIES[0]!;
  const _city = project.city ?? defaultCityFor(country);
  const city = cityEnabled(country, _city) ? _city : defaultCityFor(country);

  function selectCountry(id: CountryCode) {
    const def = COUNTRIES.find((c) => c.id === id);
    setProject({ country: def?.name ?? null, city: defaultCityFor(id) || null });
  }
  function selectCity(name: string) {
    setProject({ city: name });
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
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      {/* Country */}
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
              background: country === c.id ? "#5A1790" : "transparent",
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

      {/* City */}
      {countryDef.cities.length > 0 && (
        <>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, margin: "0 2px" }}>›</span>
          <div style={pill}>
            {countryDef.cities.map((name) => {
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

      {/* Account */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#5A1790,#421869)",
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
    </div>
  );
}
