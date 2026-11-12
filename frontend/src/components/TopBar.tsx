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
import { Building2, Settings as SettingsIcon, Check, FolderOpen, LogIn, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useT, useLang, setLang, LANGS } from "../i18n";
import SettingsModal from "./SettingsModal";
import ProjectSaveControl from "./ProjectSaveControl";
import { useAuth, initialsOf } from "../store/auth";
import { RETURN_KEY } from "../pages/Login";

/** Distance from the window's right edge to the right edge of the home-page
 *  tabs: bar padding (20) + gap (12) + avatar block (4 margin + 28 + 6 + 12).
 *  LandingPage places its workspace card at the same offset so they line up. */
export const HOME_TABS_RIGHT_OFFSET = 20 + 12 + (4 + 28 + 6 + 12);

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
  hideLocationPicker = false,
  tabsRightWidth,
  step,
  showLocationBadge = false,
}: {
  country?: CountryCode;
  city?: string;
  onCountryChange?: (c: CountryCode) => void;
  onCityChange?: (city: string) => void;
  /** The home page selects country/city in its workspace card instead. */
  hideLocationPicker?: boolean;
  /** Home page: put the tabs at the right edge at this width, lined up with the card below. */
  tabsRightWidth?: number;
  /** Wizard: the step being worked on, shown as a chip after the product name. */
  step?: { number: number; label: string };
  /** Wizard: show the project's country › city as a read-only badge, so it is
   *  always clear what the steps are planning for. Changed from the home page. */
  showLocationBadge?: boolean;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const project = useWizardStore((s) => s.project);
  const setProject = useWizardStore((s) => s.setProject);
  const t = useT();
  const lang = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const email = useAuth((s) => s.email);
  const signOut = useAuth((s) => s.signOut);

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

  // Badge reads the project's own location (the wizard URLs carry no country).
  const badgeCountry = COUNTRIES.find((c) => c.id === countryCodeFromName(project.country)) ?? COUNTRIES[0];
  const badgeCityRaw = project.city ?? defaultCityFor(badgeCountry!.id);
  const badgeCity = cityEnabled(badgeCountry!.id, badgeCityRaw) ? badgeCityRaw : defaultCityFor(badgeCountry!.id);

  const pill = {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
  } as const;

  // Library tabs. On the home page they sit at the right, just left of the
  // avatar, at the card's width so the tabs and the card below line up.
  const tabs = (
    <div style={{ ...pill, marginLeft: tabsRightWidth ? 8 : 16, padding: 4,
      ...(tabsRightWidth ? { width: tabsRightWidth, justifyContent: "space-between", flexShrink: 0 } : {}) }}>
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
              background: isActive ? "var(--brand-deep)" : "transparent",
              transition: "all 0.15s",
            }}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );

  const menuItem: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 8, border: 0, cursor: "pointer",
    fontSize: 12.5, fontWeight: 600, textAlign: "left", background: "transparent", color: "rgba(255,255,255,0.8)",
  };

  // Avatar = account menu: sign in/out, saved projects, language and Settings,
  // available on every page (the home page has no sidebar, so this is its way
  // into Settings).
  const avatar = (
    <div style={{ position: "relative", marginLeft: 4, flexShrink: 0 }}>
    <button onClick={() => setMenuOpen((o) => !o)} title={t("Account and settings")} aria-haspopup="menu" aria-expanded={menuOpen}
      style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "linear-gradient(135deg,var(--brand-deep),var(--brand-dark))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {email ? initialsOf(email) : <User size={14} />}
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
        <path d="M7 10l5 5 5-5z" />
      </svg>
    </button>
    {menuOpen && (<>
      <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div role="menu" style={{ position: "absolute", right: 0, top: 36, zIndex: 41, width: 230, padding: 8, borderRadius: 12,
        background: "#0d1117", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
        {email ? (<>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", padding: "4px 8px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={email}>
            {email}
          </div>
          <button role="menuitem" onClick={() => { setMenuOpen(false); navigate("/projects"); }} style={menuItem}>
            <FolderOpen size={14} /> {t("My projects")}
          </button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); signOut(); }} style={menuItem}>
            <LogOut size={14} /> {t("Sign out")}
          </button>
        </>) : (
          <button role="menuitem" style={menuItem}
            onClick={() => { setMenuOpen(false); try { sessionStorage.setItem(RETURN_KEY, location.pathname); } catch { /**/ } navigate("/login"); }}>
            <LogIn size={14} /> {t("Sign in")}
          </button>
        )}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", padding: "4px 8px 6px" }}>
          {t("Language")}
        </div>
        {LANGS.map((l) => (
          <button key={l.id} role="menuitemradio" aria-checked={lang === l.id} onClick={() => { setLang(l.id); setMenuOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 8, border: 0, cursor: "pointer",
              fontSize: 12.5, fontWeight: lang === l.id ? 700 : 500, textAlign: "left",
              background: lang === l.id ? "rgba(139,92,246,0.16)" : "transparent", color: lang === l.id ? "#fff" : "rgba(255,255,255,0.75)" }}>
            <span style={{ width: 14, display: "inline-flex" }}>{lang === l.id && <Check size={14} color="#8B5CF6" />}</span>
            {l.label}
          </button>
        ))}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
        <button role="menuitem" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }} style={menuItem}>
          <SettingsIcon size={14} /> {t("Settings")}
        </button>
      </div>
    </>)}
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );

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
        <img src="/CTH_new_logo_white.png" alt="Chalmers" className="brand-logo" style={{ height: 28, opacity: 0.8 }} />
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
        <img src="/CNL_new_logo_white.png" alt="Chalmers Next Labs" className="brand-logo" style={{ height: 28, opacity: 0.8 }} />
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
        {/* Product name + mark. The text folds away on narrower screens so the
            tabs and the country/city pills keep their room. */}
        <button onClick={() => navigate("/")} title={t("Renovation Planning Toolbox — home")}
          style={{ display: "flex", alignItems: "center", gap: 9, border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8,
            background: "rgba(139,92,246,0.16)", border: "1px solid rgba(139,92,246,0.4)", flexShrink: 0 }}>
            <Building2 size={16} color="#8B5CF6" />
          </span>
          <span className="hidden 2xl:block" style={{ textAlign: "left", lineHeight: 1.15 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{t("Renovation Planning Toolbox")}</span>
            <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>{t("Digital Twin Decision Support")}</span>
          </span>
        </button>
      </div>

      {step && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
          <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff",
            background: "rgba(var(--brand-rgb),0.25)", border: "1px solid rgba(var(--brand-rgb),0.55)" }}>
            {step.number}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{t(step.label)}</span>
        </div>
      )}

      {!tabsRightWidth && tabs}

      <div style={{ flex: 1 }} />

      {showLocationBadge && (
        <div title={t("Planning location — change it from the home page")}
          style={{ ...pill, padding: "5px 12px", gap: 7, flexShrink: 0, fontSize: 11, whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 700, color: "#fff" }}>{t(badgeCountry!.name)}</span>
          {badgeCity && (<>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>›</span>
            <span style={{ fontWeight: 700, color: "#4ECDC4" }}>{t(badgeCity)}</span>
          </>)}
        </div>
      )}

      {/* Country → city selector. Switching to a country or city that has no
          build yet is a no-op for the page content; the pill still moves so the
          selection is never silently ignored. */}
      {!hideLocationPicker && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={pill}>
          {COUNTRIES.map((c) => {
            const enabled = countryEnabled(c.id);
            return (
            <button
              key={c.id}
              onClick={enabled ? () => selectCountry(c.id) : undefined}
              disabled={!enabled}
              title={enabled ? undefined : t("Coming soon — not available yet")}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: 0,
                cursor: enabled ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: country === c.id ? 700 : 500,
                background: country === c.id ? "var(--brand-deep)" : "transparent",
                color: !enabled ? "rgba(255,255,255,0.32)"
                      : country === c.id ? "#fff" : "rgba(255,255,255,0.72)",
                opacity: enabled ? 1 : 0.6,
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}
            >
              {t(c.name)}
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
                  title={enabled ? undefined : t("Coming soon — not available yet")}
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
                  {t(name)}
                </button>
                );
              })}
            </div>
          </>
        )}
      </div>}

      {/* Saving belongs to the wizard, where there is a project to save. */}
      {step && <ProjectSaveControl />}

      {tabsRightWidth ? <>{tabs}{avatar}</> : avatar}
    </header>
  );
}
