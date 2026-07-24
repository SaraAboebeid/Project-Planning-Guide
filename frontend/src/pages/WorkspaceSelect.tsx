import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  COUNTRIES,
  defaultCityFor,
  mapCenterFor,
  countryCodeFromName,
  type CountryCode,
} from "../config/countryNav";
import { PROJECT_TYPES, type ProjectType } from "../config/projectConfig";
import {
  Globe, MapPin, Target, Users, User, Lock, Building2, HelpCircle,
  ArrowRight, ExternalLink, Boxes, Zap, CloudSun, Layers, Coins, Compass,
  Database, ShieldCheck, Leaf, ChevronRight,
} from "lucide-react";

/* ── Workspace entry page ─────────────────────────────────────────────────────
   The first screen: choose a country, city and focus, see how ready that city's
   data is, then continue into the existing landing page / wizard. Readiness is
   REAL for cities we've actually ingested (Gothenburg, London, Rotherham) — read
   live from /api/country-profile — and honestly marked "Demo" for the rest, so
   the panel never shows an invented number for a city with no dataset. */

const FLAG: Record<CountryCode, string> = { se: "🇸🇪", gb: "🇬🇧", be: "🇧🇪", ie: "🇮🇪" };

// Cities with a genuinely ingested building dataset. Everything else is a demo
// placeholder — no fabricated readiness figures.
const LIVE_CITIES = new Set(["Gothenburg", "London", "Rotherham"]);

const ACCENT = "#8B5CF6";

interface Readiness {
  dataReadiness: number | null;   // % of buildings with an EPC match
  modelConfidence: number | null; // % of buildings archetype-matched (TABULA)
}

const DATA_LAYERS = [
  { label: "3D Buildings", icon: Boxes },
  { label: "Energy Data", icon: Zap },
  { label: "Climate Data", icon: CloudSun },
  { label: "Renovation Scenarios", icon: Layers },
  { label: "Cost Data", icon: Coins },
];

const FEATURED = [
  { city: "Gothenburg", country: "Sweden", live: true },
  { city: "Stockholm", country: "Sweden", live: false },
  { city: "Malmö", country: "Sweden", live: false },
  { city: "Demo City", country: "Global", live: false },
];

export default function WorkspaceSelect() {
  const navigate = useNavigate();
  const setProject = useWizardStore((s) => s.setProject);

  const [countryCode, setCountryCode] = useState<CountryCode>("se");
  const [city, setCity] = useState<string>("Gothenburg");
  const [focus, setFocus] = useState<ProjectType>("Renovation Planning");
  const [accessMode, setAccessMode] = useState<"guest" | "chalmers" | "partner">("guest");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  // Fade the whole screen out before routing to /home, so the transition reads
  // as "this window fades, then the next page appears" rather than a hard cut.
  const [leaving, setLeaving] = useState(false);

  const country = COUNTRIES.find((c) => c.id === countryCode)!;
  const cityIsLive = LIVE_CITIES.has(city);

  // Keep the city valid when the country changes.
  useEffect(() => {
    if (!country.cities.includes(city)) setCity(defaultCityFor(countryCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  // Real readiness for live cities, straight from the country profile the rest
  // of the app already exposes (buildings / epc_match / tabula_match).
  useEffect(() => {
    let active = true;
    if (!cityIsLive) { setReadiness(null); return; }
    fetch(`/api/country-profile?country=${countryCode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { viewer?: { kpis?: { key: string; value: number }[] } }) => {
        if (!active) return;
        const kpi: Record<string, number> = Object.fromEntries((d.viewer?.kpis ?? []).map((k) => [k.key, k.value]));
        const total = kpi.buildings || 0;
        setReadiness({
          dataReadiness: total ? Math.round(((kpi.epc_match ?? 0) / total) * 100) : null,
          modelConfidence: total ? Math.round(((kpi.tabula_match ?? 0) / total) * 100) : null,
        });
      })
      .catch(() => { if (active) setReadiness(null); });
    return () => { active = false; };
  }, [countryCode, city, cityIsLive]);

  const previewSrc = useMemo(() => {
    const v = mapCenterFor(countryCode, city);
    const p = new URLSearchParams({ lat: String(v.lat), lon: String(v.lon), height: "900", heading: "20" });
    return `/city_bg.html?${p.toString()}`;
  }, [countryCode, city]);

  // Whole-page backdrop follows the selected city too, just from higher up so it
  // reads as a wide cityscape rather than the focused preview.
  const bgSrc = useMemo(() => {
    const v = mapCenterFor(countryCode, city);
    const p = new URLSearchParams({ lat: String(v.lat), lon: String(v.lon), height: "1700", heading: "20" });
    return `/city_bg.html?${p.toString()}`;
  }, [countryCode, city]);

  function enterWorkspace(nextCountry = country.name, nextCity = city, nextFocus: ProjectType = focus) {
    if (leaving) return;
    setProject({ country: nextCountry, city: nextCity, projectType: nextFocus });
    setLeaving(true);
    window.setTimeout(() => navigate("/"), 480);
  }

  return (
    <div className="min-h-screen w-full text-white relative overflow-hidden" style={{ background: "#0a0d14", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Live Gothenburg Cesium as the page backdrop — clearly visible; the
          panels above are opaque so text stays readable over it. */}
      <iframe key={bgSrc} src={bgSrc} title="City backdrop" aria-hidden
        className="fixed inset-0 w-full h-full" style={{ border: 0, opacity: 0.55, pointerEvents: "none", zIndex: 0 }} />
      {/* Gentle wash: accent glow + a light darkening so it reads as a backdrop,
          not so heavy it hides the city again. */}
      <div className="fixed inset-0 pointer-events-none" style={{
        zIndex: 1,
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(139,92,246,0.16), transparent 60%)," +
          "radial-gradient(900px 500px at 100% 0%, rgba(78,205,196,0.10), transparent 55%)," +
          "linear-gradient(180deg, rgba(10,13,20,0.38) 0%, rgba(10,13,20,0.60) 100%)",
      }} />

      {/* Whole screen fades out together on Continue, then /home mounts */}
      <div style={{
        position: "relative", zIndex: 2,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(-8px)" : "none",
        transition: "opacity .48s ease, transform .48s ease",
      }}>

      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-8 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <img src="/CTH_new_logo_white.png" alt="Chalmers University of Technology" style={{ height: 26, opacity: 0.9 }} />
        <span style={{ width: 1, height: 26, background: "rgba(255,255,255,0.12)" }} />
        <img src="/CNL_new_logo_white.png" alt="Chalmers Next Labs" style={{ height: 26, opacity: 0.9 }} />
        <span style={{ width: 1, height: 26, background: "rgba(255,255,255,0.12)" }} />
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ background: "rgba(139,92,246,0.16)", border: "1px solid rgba(139,92,246,0.4)" }}>
            <Building2 size={18} color={ACCENT} />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-bold">Renovation Planning Toolbox</div>
            <div className="text-[11px] text-white/45">Digital Twin Decision Support</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 transition"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }} title="Help">
            <HelpCircle size={17} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white/85 hover:text-white transition"
            style={{ border: "1px solid rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.10)" }}>
            <User size={15} /> Sign in
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 max-w-[1240px] mx-auto px-8 py-8">
        {/* Title */}
        <div className="flex items-start gap-4 mb-6">
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl flex-shrink-0"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)" }}>
            <Building2 size={26} color={ACCENT} />
          </span>
          <div>
            <h1 className="text-[30px] font-extrabold leading-tight">Select Your Toolbox</h1>
            <p className="text-[14px] text-white/50 mt-1">Choose a country, city, and access mode to enter the planning environment.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
          {/* ── Left: selection card ── */}
          <div className="rounded-2xl p-6" style={{ background: "rgba(12,16,24,0.82)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(7px)" }}>
            <SelectRow icon={Globe} label="Country">
              <Select value={countryCode} onChange={(v) => setCountryCode(v as CountryCode)}
                options={COUNTRIES.map((c) => ({ value: c.id, label: `${FLAG[c.id]}  ${c.name}` }))} />
            </SelectRow>

            <SelectRow icon={MapPin} label="City / Study Area">
              {country.cities.length ? (
                <Select value={city} onChange={setCity}
                  options={country.cities.map((c) => ({ value: c, label: `🏙  ${c}` }))} />
              ) : (
                <div className="text-sm text-white/40 px-1 py-2">No study areas available for {country.name} yet.</div>
              )}
            </SelectRow>

            <SelectRow icon={Target} label="Focus">
              <Select value={focus} onChange={(v) => setFocus(v as ProjectType)}
                options={PROJECT_TYPES.map((p) => ({ value: p, label: p }))} />
            </SelectRow>

            {/* Access mode */}
            <div className="flex items-start gap-3 mt-5">
              <span className="w-9 flex justify-center pt-2.5"><Users size={18} className="text-white/45" /></span>
              <div className="flex-1">
                <div className="text-[13px] text-white/55 mb-2">Access mode</div>
                <div className="grid grid-cols-3 gap-2.5">
                  <AccessCard active={accessMode === "guest"} onClick={() => setAccessMode("guest")}
                    icon={User} title="Guest Demo" sub="Explore as guest" />
                  <AccessCard active={accessMode === "chalmers"} soon icon={Lock}
                    title="Chalmers Login" sub="Sign in with Chalmers" />
                  <AccessCard active={accessMode === "partner"} soon icon={Building2}
                    title="Partner Login" sub="Sign in with partner" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button onClick={() => enterWorkspace()}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold transition hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)", boxShadow: "0 6px 22px rgba(139,92,246,0.4)" }}>
                Continue to Toolbox <ArrowRight size={16} />
              </button>
              <button onClick={() => enterWorkspace("Sweden", "Gothenburg", "Renovation Planning")}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold text-white/80 hover:text-white transition"
                style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}>
                <ExternalLink size={15} /> Open Gothenburg Demo
              </button>
            </div>

            {/* Data layers */}
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-2.5">Available data layers</div>
              <div className="flex flex-wrap gap-2">
                {DATA_LAYERS.map(({ label, icon: Icon }) => {
                  const on = cityIsLive;
                  return (
                    <span key={label} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium"
                      style={{
                        color: on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)",
                        background: on ? "rgba(255,255,255,0.04)" : "transparent",
                        border: `1px solid ${on ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                      }}>
                      <Icon size={13} color={on ? ACCENT : "rgba(255,255,255,0.3)"} /> {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: city preview ── */}
          <div className="rounded-2xl p-5" style={{ background: "rgba(12,16,24,0.82)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(7px)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-white/40">City preview</span>
              <span className="flex items-center gap-1.5 text-[12px] text-white/55"><MapPin size={13} color={ACCENT} /> {city}, {country.name}</span>
            </div>

            <div className="relative rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)", height: 260 }}>
              <iframe key={previewSrc} src={previewSrc} title={`${city} preview`}
                className="w-full h-full" style={{ border: 0, pointerEvents: "none" }} />
              <span className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white/80"
                style={{ background: "rgba(8,11,18,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>3D</span>
              <Compass size={20} className="absolute bottom-3 right-14 text-white/70" />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "rgba(139,92,246,0.14)" }}>
                <Building2 size={16} color={ACCENT} />
              </span>
              <span className="text-[15px] font-bold">{city}, {country.name}</span>
              {!cityIsLive && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(245,158,11,0.14)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.4)" }}>Demo</span>
              )}
            </div>

            {cityIsLive ? (
              <div className="space-y-2.5">
                <StatBar icon={Database} label="Data readiness" pct={readiness?.dataReadiness ?? null} />
                <StatBar icon={ShieldCheck} label="Model confidence" pct={readiness?.modelConfidence ?? null} />
                <StatRow icon={Leaf} label="Environmental data" value="Available" valueColor="#4ECDC4" />
                <StatRow icon={Database} label="Cost database" value={country.id === "se" ? "Partial" : "—"} valueColor="#F59E0B" />
                <StatRow icon={Target} label="Recommended workflow" value={focus} valueColor={ACCENT} />
              </div>
            ) : (
              <div className="rounded-xl px-4 py-5 text-[12.5px] leading-relaxed text-white/50"
                style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <strong className="text-white/70">Demo city.</strong> {city}'s building dataset hasn't been ingested yet, so
                readiness figures aren't shown. Explore the tool with the Gothenburg dataset, which is fully live.
              </div>
            )}
          </div>
        </div>

        {/* ── Featured cities ── */}
        <div className="flex items-center justify-between mt-9 mb-3">
          <span className="text-[13px] font-bold text-white/70">Featured cities</span>
          <button className="flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: ACCENT }}>
            View all cities <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURED.map((w) => (
            <button key={w.city}
              onClick={() => {
                if (!w.live) return;
                setCountryCode(countryCodeFromName(w.country)); setCity(w.city);
              }}
              className="text-left rounded-2xl p-3.5 transition hover:brightness-110"
              style={{
                background: "rgba(12,16,24,0.82)",
                border: `1px solid ${w.city === city ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.08)"}`,
                cursor: w.live ? "pointer" : "default",
              }}>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0"
                  style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <Building2 size={18} color={ACCENT} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold truncate">{w.city}</div>
                  <div className="text-[11.5px] text-white/45">{w.country}</div>
                </div>
                <ChevronRight size={16} className="text-white/30" />
              </div>
              <div className="mt-3">
                {w.live ? (
                  <>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-white/45">Readiness</span>
                      <span className="font-bold text-white/80">{readiness?.dataReadiness != null && w.city === city ? `${readiness.dataReadiness}%` : "live"}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <div style={{ width: `${w.city === city ? readiness?.dataReadiness ?? 60 : 60}%`, height: "100%", background: "#4ECDC4" }} />
                    </div>
                  </>
                ) : (
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.35)" }}>
                    Demo · not ingested
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </main>
      </div>{/* end fade layer */}
    </div>
  );
}

/* ── Small building blocks ─────────────────────────────────────────────────── */

function SelectRow({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3.5">
      <span className="w-9 flex justify-center"><Icon size={18} className="text-white/45" /></span>
      <span className="w-28 text-[13px] text-white/55 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg px-4 py-2.5 text-[14px] text-white cursor-pointer focus:outline-none"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}>
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#11161d", color: "#fff" }}>{o.label}</option>
        ))}
      </select>
      <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-white/40 pointer-events-none" />
    </div>
  );
}

function AccessCard({ active, soon, icon: Icon, title, sub, onClick }: {
  active: boolean; soon?: boolean; icon: typeof User; title: string; sub: string; onClick?: () => void;
}) {
  return (
    <button onClick={soon ? undefined : onClick} disabled={soon}
      className="relative flex flex-col items-center text-center gap-1 px-2 py-3 rounded-xl transition"
      style={{
        background: active ? "rgba(139,92,246,0.14)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.09)"}`,
        opacity: soon ? 0.55 : 1, cursor: soon ? "not-allowed" : "pointer",
      }}>
      {active && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: ACCENT }}>✓</span>}
      {soon && <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>Soon</span>}
      <Icon size={17} className={active ? "" : "text-white/50"} color={active ? ACCENT : undefined} />
      <span className="text-[12px] font-semibold text-white/85">{title}</span>
      <span className="text-[10px] text-white/40 leading-tight">{sub}</span>
    </button>
  );
}

function StatBar({ icon: Icon, label, pct }: { icon: typeof Database; label: string; pct: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={15} className="text-white/40 flex-shrink-0" />
      <span className="text-[12.5px] text-white/60 w-32 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div style={{ width: `${pct ?? 0}%`, height: "100%", background: "#4ECDC4", transition: "width .5s" }} />
      </div>
      <span className="text-[13px] font-bold text-white/85 w-11 text-right">{pct != null ? `${pct}%` : "…"}</span>
    </div>
  );
}

function StatRow({ icon: Icon, label, value, valueColor }: { icon: typeof Database; label: string; value: string; valueColor: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={15} className="text-white/40 flex-shrink-0" />
      <span className="text-[12.5px] text-white/60 flex-1">{label}</span>
      <span className="text-[12.5px] font-semibold" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}
