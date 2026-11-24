import { useEffect, useState } from "react";
import {
  COUNTRIES,
  cityEnabled,
  registerSeCity,
  type CountryCode,
} from "../config/countryNav";
import {
  Globe, MapPin, Users, User, Lock, Building2, ArrowRight,
  ChevronRight, Plus, Loader2, CheckCircle2, AlertTriangle, FolderOpen, Trash2,
} from "lucide-react";
import { useWizardStore } from "../store/wizard";
import { useNavigate } from "react-router-dom";
import { useT, useLang, translate } from "../i18n";
import type { ProjectMeta } from "../api/accounts";
import { projectsBackend, useProjectsWhere } from "../utils/projectStore";
import { openProject } from "../utils/projectSave";
import { useAuth } from "../store/auth";
import { RETURN_KEY } from "../pages/Login";
import { LOGIN_ENABLED } from "../config/features";

/* ── Home-page workspace panels ────────────────────────────────────────────────
   The toolbox selection (country, city, add a municipality, focus, access mode)
   and the selected city's dataset in numbers, shown on the landing hero over
   the 3D city. Originally the separate /workspace page; merged into the home
   page so there is one entry screen. A figure that does not exist shows "—". */

const FLAG: Record<CountryCode, string> = { se: "🇸🇪", gb: "🇬🇧", be: "🇧🇪" };
const ACCENT = "#A78DC5";

/* ── Selection card ──────────────────────────────────────────────────────────── */
export interface DatasetMetric { label: string; value: string; color: string }

/** Chalmers accounts get the Chalmers card; every other allowed domain
 *  (Framtiden, Poseidon, Nacka, HSB …) is a partner. */
function isChalmersEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain === "chalmers.se" || domain.endsWith(".chalmers.se");
}

export function WorkspaceCard({ country, city, metrics, onCountry, onCity, onStart }: {
  country: CountryCode; city: string; metrics: DatasetMetric[];
  onCountry: (c: CountryCode) => void; onCity: (c: string) => void;
  onStart: () => void;
}) {
  const navigate = useNavigate();
  // With sign-in switched off everyone is a guest, whatever session lingers.
  const email = useAuth((s) => (LOGIN_ENABLED ? s.email : null));
  const signOut = useAuth((s) => s.signOut);
  // Signed in, the access mode IS the account: it is shown, not chosen.
  const accessMode: "guest" | "chalmers" | "partner" = !email ? "guest" : isChalmersEmail(email) ? "chalmers" : "partner";
  const t = useT();
  // Both logins use the same email-link sign-in (backend/accounts.py); the
  // allowed domains decide who gets in. Come back here afterwards.
  const goSignIn = () => {
    try { sessionStorage.setItem(RETURN_KEY, "/"); } catch { /* storage blocked */ }
    navigate("/login");
  };
  const def = COUNTRIES.find((c) => c.id === country)!;
  const enabledCountries = COUNTRIES.filter((c) => c.cities.some((n) => cityEnabled(c.id, n)));
  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(12,16,24,0.82)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(7px)" }}>
      <SelectRow icon={Globe} label={t("Country")}>
        <Select value={country} onChange={(v) => onCountry(v as CountryCode)}
          options={enabledCountries.map((c) => ({ value: c.id, label: `${FLAG[c.id]}  ${t(c.name)}` }))} />
      </SelectRow>

      <SelectRow icon={MapPin} label={t("City / Study Area")}>
        {def.cities.length ? (
          <Select value={city} onChange={onCity}
            options={def.cities.filter((c) => cityEnabled(country, c)).map((c) => ({ value: c, label: `🏙  ${t(c)}` }))} />
        ) : (
          <div className="text-sm text-white/40 px-1 py-2">{t("No study areas available for {country} yet.", { country: t(def.name) })}</div>
        )}
      </SelectRow>

      {country === "se" && <SeMunicipalityBuilder onBuilt={onCity} />}

      {/* Access mode */}
      <div className="flex items-start gap-3 mt-4">
        <span className="w-9 flex justify-center pt-2.5"><Users size={18} className="text-white/45" /></span>
        <div className="flex-1">
          <div className="text-[13px] text-white/55 mb-2">{t("Access mode")}</div>
          <div className="grid grid-cols-3 gap-2.5">
            <AccessCard active={accessMode === "guest"} onClick={email ? () => signOut() : undefined}
              icon={User} title={t("Guest Demo")} sub={email ? t("Sign out and explore as guest") : t("Explore as guest")} />
            <AccessCard active={accessMode === "chalmers"} soon={!LOGIN_ENABLED} onClick={accessMode === "chalmers" ? undefined : goSignIn} icon={Lock}
              title={t("Chalmers Login")} sub={accessMode === "chalmers" ? email! : t("Sign in with Chalmers")} />
            <AccessCard active={accessMode === "partner"} soon={!LOGIN_ENABLED} onClick={accessMode === "partner" ? undefined : goSignIn} icon={Building2}
              title={t("Partner Login")} sub={accessMode === "partner" ? email! : t("Sign in with partner")} />
          </div>
          {email && LOGIN_ENABLED && (
            <div className="text-[12px] text-white/45 mt-2">
              {t("Signed in — your projects are saved to your account.")}{" "}
              <button onClick={() => navigate("/projects")} className="font-semibold" style={{ color: "#8B6EAD" }}>{t("My projects")}</button>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <button onClick={onStart}
          className="ppg-start-cta flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-[14px] font-semibold transition"
          /* Light purple + dark text here: light mode inverts this panel, so it
             renders as the muted-plum button with white text. */
          style={{ background: "#C6B6D8", color: "#0b1220" }}>
          {t("New project")} <ArrowRight size={16} />
        </button>
      </div>

      <RecentProjects />

      {/* The selected city's dataset, in numbers */}
      {metrics.length > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/35 mb-2.5">{t("{city} dataset", { city: t(city) })}</div>
          <div className="grid grid-cols-3 gap-2">
            {metrics.map((m) => (
              <div key={m.label} className="flex flex-col gap-0.5 px-3 py-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="text-[16px] font-semibold text-white/90 tabular-nums">{m.value}</span>
                <span className="text-[12px] text-white/50 leading-snug">{t(m.label)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Build any Swedish municipality ──────────────────────────────────────────
   Search the 290 municipalities, start tools/se/build_any_city.py through the
   backend, follow its stages, then register the city so it is selectable. */

interface Kommun { code: string; name: string; slug: string; epc_with_energy: number; built: boolean; building: boolean }

// Hand-configured cities go by their app name, not the municipality name.
const STATIC_SE_CITY: Record<string, string> = { "1480": "Gothenburg", "1280": "Malmö" };
interface BuildStatus {
  state: "starting" | "running" | "done" | "failed";
  stage?: string | null; stage_index?: number; stages?: string[];
  stage_labels?: Record<string, string>; log?: string[]; error?: string | null;
  city_id?: string; name?: string; result?: { buildings: number; with_energy: number } | null;
}

export function SeMunicipalityBuilder({ onBuilt }: { onBuilt: (name: string) => void }) {
  const [kommuner, setKommuner] = useState<Kommun[]>([]);
  const [query, setQuery] = useState("");
  const [job, setJob] = useState<{ code: string; status: BuildStatus } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    fetch("/api/se/kommuner").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { kommuner: Kommun[] }) => setKommuner(d.kommuner))
      .catch(() => setErr(t("Municipality list unavailable (backend down?)")));
  }, []);

  const picked = kommuner.find((k) => k.name.toLowerCase() === query.trim().toLowerCase()) ?? null;

  // Poll the running build every 2 s until it finishes.
  useEffect(() => {
    if (!job || job.status.state === "done" || job.status.state === "failed") return;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/se/cities/build/${job.code}`);
        const status = (await r.json()) as BuildStatus;
        setJob({ code: job.code, status });
        if (status.state === "done" && status.city_id && status.name) {
          const cities = await fetch("/api/se/cities").then((x) => x.json()) as
            { cities: { id: string; center?: [number, number] | null }[] };
          registerSeCity(status.name, status.city_id, cities.cities.find((c) => c.id === status.city_id)?.center);
          setKommuner((ks) => ks.map((k) => (k.code === job.code ? { ...k, built: true, building: false } : k)));
          onBuilt(status.name);
        }
      } catch { /* transient: try again next tick */ }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [job, onBuilt]);

  async function build() {
    if (!picked) return;
    setErr(null);
    const r = await fetch("/api/se/cities/build", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: picked.code }),
    });
    if (!r.ok) { setErr(t("Could not start the build ({status})", { status: r.status })); return; }
    setJob({ code: picked.code, status: (await r.json()) as BuildStatus });
  }

  const st = job?.status;
  const running = st && (st.state === "starting" || st.state === "running");
  const nStages = st?.stages?.length ?? 5;
  const pct = st?.state === "done" ? 100 : Math.round((((st?.stage_index ?? 0) + 0.5) / nStages) * 100);

  return (
    <div className="flex items-start gap-3 mb-3.5">
      <span className="w-9 flex justify-center pt-2.5"><Plus size={18} className="text-white/45" /></span>
      <span className="w-28 text-[13px] text-white/55 flex-shrink-0 pt-2.5">{t("Add municipality")}</span>
      <div className="flex-1">
        <div className="flex gap-2">
          <input list="se-kommuner" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!!running}
            placeholder={t("Any Swedish municipality, e.g. Ystad")}
            className="flex-1 rounded-lg px-4 py-2.5 text-[14px] text-white focus:outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }} />
          <datalist id="se-kommuner">
            {kommuner.map((k) => <option key={k.code} value={k.name}>{k.built ? t("built") : t("{n} EPCs", { n: k.epc_with_energy.toLocaleString("en-US") })}</option>)}
          </datalist>
          {picked?.built && !running ? (
            <button onClick={() => {
                const staticName = STATIC_SE_CITY[picked.code];
                if (!staticName) registerSeCity(picked.name, picked.slug, null);
                onBuilt(staticName ?? picked.name);
              }}
              className="px-4 rounded-lg text-[13px] font-semibold text-white/85"
              style={{ border: "1px solid rgba(139,110,173,0.5)", background: "rgba(139,110,173,0.10)" }}>
              {t("Select")}
            </button>
          ) : (
            <button onClick={build} disabled={!picked || !!running}
              className="px-4 rounded-lg text-[13px] font-semibold text-white transition"
              style={{ background: picked && !running ? "#C6B6D8" : "rgba(255,255,255,0.06)", color: picked && !running ? "#0b1220" : undefined,
                       opacity: picked && !running ? 1 : 0.5, cursor: picked && !running ? "pointer" : "not-allowed" }}>
              {t("Build")}
            </button>
          )}
        </div>
        <div className="text-[12px] text-white/40 mt-1.5">
          {picked
            ? picked.built
              ? t("{name} is already built.", { name: picked.name })
              : t("{n} energy declarations. Downloads Lantmäteriet buildings, links EPCs, builds the data set and weather - about 2-5 minutes.", { n: picked.epc_with_energy.toLocaleString("en-US") })
            : t("Builds the buildings, energy declarations and weather for one municipality so Steps 1-5 work there.")}
        </div>
        {err && <div className="text-[12px] mt-2" style={{ color: "#E2483B" }}>{err}</div>}
        {st && (
          <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-white/80">
              {st.state === "done" ? <CheckCircle2 size={15} color="#2FB477" />
                : st.state === "failed" ? <AlertTriangle size={15} color="#E2483B" />
                : <Loader2 size={15} className="animate-spin" color={ACCENT} />}
              {st.state === "done"
                ? t("{name} built: {buildings} buildings, {withEnergy} with EPC energy", { name: st.name ?? "", buildings: st.result?.buildings.toLocaleString("en-US") ?? "", withEnergy: st.result?.with_energy.toLocaleString("en-US") ?? "" })
                : st.state === "failed" ? t("Build failed: {error}", { error: st.error ?? "" })
                : (st.stage && st.stage_labels?.[st.stage]) || t("Starting...")}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: st.state === "failed" ? "#E2483B" : "#8B6EAD", transition: "width .5s" }} />
            </div>
            {st.log && st.log.length > 0 && st.state !== "done" && (
              <div className="text-[11.5px] text-white/35 mt-1.5 font-mono truncate">{st.log[st.log.length - 1]}</div>
            )}
          </div>
        )}
      </div>
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

/* Saved projects to pick up again (account or this browser, utils/projectStore.ts):
   the three most recent, newest first, plus a link to all of them. */
function RecentProjects() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const where = useProjectsWhere();
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    projectsBackend().list().then((l) => { if (alive) setItems(l); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [where]);
  if (!items || items.length === 0) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" });
  return (
    <div className="mt-4">
      <div className="flex items-center mb-1.5">
        <span className="text-[12px] font-medium text-white/50">{t("Continue a project")}</span>
        <button onClick={() => navigate("/projects")} className="ml-auto text-[12px] text-white/50 hover:text-white/85 underline underline-offset-2">
          {t("All projects ({n})", { n: items.length })}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.slice(0, 3).map((p) => (
          <div key={p.id} className="flex items-stretch rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button disabled={!!opening}
              onClick={async () => {
                setOpening(p.id); setErr(null);
                try { const step = await openProject(p.id); navigate(`/step/${step}`); }
                catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOpening(null); }
              }}
              className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left">
              {opening === p.id ? <Loader2 size={14} className="animate-spin text-white/60" /> : <FolderOpen size={14} className="text-white/50" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-white/90 truncate">{p.name}</span>
                <span className="block text-[12px] text-white/45 truncate">
                  {[p.summary?.city ? t(p.summary.city) : null,
                    p.summary?.buildings ? t(p.summary.buildings === 1 ? "{n} building" : "{n} buildings", { n: p.summary.buildings }) : null,
                    p.summary?.step ? t("Step {n}", { n: p.summary.step }) : null,
                    fmt(p.updated_at)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronRight size={14} className="text-white/35" />
            </button>
            <button title={t("Delete")} aria-label={t("Delete “{name}”", { name: p.name })}
              onClick={async () => {
                if (!window.confirm(t("Delete “{name}”? This can't be undone.", { name: p.name }))) return;
                try {
                  await projectsBackend().remove(p.id);
                  // The project open in this tab is no longer saved anywhere.
                  if (useWizardStore.getState().savedProject?.id === p.id) useWizardStore.getState().setSavedProject(null);
                  setItems((prev) => (prev ?? []).filter((x) => x.id !== p.id));
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              }}
              className="px-3 text-white/35 hover:text-red-400"
              style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {err && <div role="alert" className="text-[12px] text-red-300 mt-1.5">⚠ {err}</div>}
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
        background: active ? "rgba(167,141,197,0.14)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "rgba(167,141,197,0.6)" : "rgba(255,255,255,0.09)"}`,
        // Not available yet: fully greyed out (no colour at all), not just faded.
        opacity: soon ? 0.45 : 1, filter: soon ? "grayscale(1)" : undefined, cursor: soon ? "not-allowed" : "pointer",
      }}>
      {active && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-black text-white" style={{ background: ACCENT }}>✓</span>}
      {soon && <span className="absolute top-1.5 right-1.5 text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>{translate("Soon")}</span>}
      <Icon size={17} className={active ? "" : "text-white/50"} color={active ? ACCENT : undefined} />
      <span className="text-[12px] font-semibold text-white/85">{title}</span>
      <span className="text-[11px] text-white/40 leading-tight max-w-full truncate" title={sub}>{sub}</span>
    </button>
  );
}
