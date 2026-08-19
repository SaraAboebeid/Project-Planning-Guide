import { useRef, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { wizardNav, useWizardCanNext, useWizardNextError } from "./wizardNav";
import SettingsModal from "./SettingsModal";
import { LIBRARY_TABS, tabPathFor, countryCodeFromName } from "../config/countryNav";
import CountryCitySelector from "./CountryCitySelector";
import ThemeToggle from "./ThemeToggle";

// ── Confetti ─────────────────────────────────────────────────────────────────
// Tiny self-contained canvas burst (no dependency) fired once when the user
// lands on the final step. Cleans itself up after ~2.6 s.
function fireConfetti() {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  const dpr = window.devicePixelRatio || 1;
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  const COLORS = ["#2FB477", "#4ECDC4", "var(--brand-deep)", "#E8880C", "#E2483B", "#4A90E2", "#B98BE8"];
  const parts = Array.from({ length: 170 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.35,
    y: H * 0.32 + (Math.random() - 0.5) * 60 * dpr,
    vx: (Math.random() - 0.5) * 15 * dpr,
    vy: (Math.random() * -9 - 5) * dpr,
    size: (5 + Math.random() * 6) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    color: COLORS[(Math.random() * COLORS.length) | 0]!,
  }));
  const start = performance.now();
  const g = 0.34 * dpr;
  function frame(now: number) {
    const t = now - start;
    ctx!.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx!.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

// ── Icons ──────────────────────────────────────────────────────────────────
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}
const IC = {
  project:  "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  map:      "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  database: "M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4S4 11.21 4 9zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z",
  layers:   "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z",
  timeline: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  check:    "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  globe:    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  save:     "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
  arrowL:   "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  arrowR:   "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  chevronR: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  budget:   "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  report:   "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
};

function SideNavItem({
  iconD,
  label,
  title,
  active = false,
  onClick,
  className,
}: {
  iconD: string;
  label: string;
  /** Full name shown on hover; defaults to the visible label. */
  title?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const clickable = !!onClick;
  return (
    <button onClick={onClick} title={title ?? label}
            disabled={!clickable}
            className={`group flex flex-col items-center gap-1 w-full py-2.5 rounded-lg transition-all border-0 ${
              active
                ? "bg-white/12 text-white"
                : clickable
                  ? "text-white/40 hover:text-white/80 hover:bg-white/8 cursor-pointer"
                  : "text-white/20 cursor-not-allowed opacity-60"
            } ${className ?? ""}`}>
      <Icon d={iconD} size={19} />
      <span className="text-[9px] tracking-wide font-medium leading-none text-center px-0.5">{label}</span>
    </button>
  );
}

const STEP_ICONS = [IC.project, IC.map, IC.database, IC.layers, IC.timeline];

// Library tabs come from the shared config (countryNav.ts) — the same list the
// landing page and DataLayout render through <TopBar/> — so the wizard header
// can't drift from them again (it used to have its own hardcoded copy that was
// missing Project Team and the per-country routing).

const PT_LABEL: Record<string, string> = {
  renovation:       "Renovation Planning",
  energy_community: "Energy Community Planning",
  renewable:        "Renewable Energy Planning",
};

// ── Right panel sub-components ─────────────────────────────────────────────
function ContextRow({ icon, label, value, valueColor }: {
  icon: string; label: string; value: string; valueColor?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5 shrink-0">
        <span style={{ color: "rgba(255,255,255,0.30)" }}><Icon d={icon} size={12} /></span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      </div>
      <span className="text-[11px] font-semibold text-right leading-snug"
            style={{ color: valueColor ?? "rgba(255,255,255,0.85)" }}>
        {value}
      </span>
    </div>
  );
}

function ProgressRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
        <span className="text-[11px] font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function DataNeededRow({ label, status }: {
  label: string; status: "available" | "partial" | "missing";
}) {
  const color = status === "available" ? "#2FB477" : status === "partial" ? "#E8880C" : "#E2483B";
  const text  = status === "available" ? "Available" : status === "partial" ? "Partial" : "Missing";
  const iconD = status === "available"
    ? IC.check
    : "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z";
  return (
    <div className="flex items-center justify-between py-1.5"
         style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--brand-deep)" }}><Icon d={iconD} size={12} /></span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
      </div>
      <span className="text-[10px] font-semibold" style={{ color }}>{text}</span>
    </div>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────
export default function WizardLayout() {
  const navigate = useNavigate();
  const canNext = useWizardCanNext();
  const nextError = useWizardNextError();
  const location = useLocation();
  const { steps, project, currentStep, setStep } = useWizardStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stepIndex = steps.findIndex((s) => s.path === location.pathname);
  const safeIndex = stepIndex < 0 ? 0 : stepIndex;
  const activeStep = steps[safeIndex]!;
  const isLastStep = safeIndex === steps.length - 1;
  const highestUnlockedStep = Math.max(1, currentStep);

  useEffect(() => {
    // Keep future steps locked, but allow normal sequential progression
    // (e.g. Step 2 -> Step 3 via Continue) to unlock the next step.
    if (activeStep.number > highestUnlockedStep + 1) {
      navigate(steps[highestUnlockedStep - 1]!.path, { replace: true });
      return;
    }
    if (activeStep.number > currentStep) {
      setStep(activeStep.number);
    }
  }, [activeStep.number, currentStep, highestUnlockedStep, navigate, setStep, steps]);

  function goToStep(stepNumber: number, path: string) {
    if (stepNumber > highestUnlockedStep) return;
    navigate(path);
  }

  // Arrival splash on the final step (Report): a full-screen message appears with
  // a confetti burst, then fades out to reveal the report behind it.
  //   "in"   → shown (text animates in, confetti fires)
  //   "out"  → fading away (report becomes visible behind)
  //   "gone" → removed
  const [splash, setSplash] = useState<"in" | "out" | "gone">("gone");
  useEffect(() => {
    if (!isLastStep) { setSplash("gone"); return; }
    setSplash("in");
    const tC = window.setTimeout(fireConfetti, 350);
    const tOut = window.setTimeout(() => setSplash("out"), 2100);
    const tGone = window.setTimeout(() => setSplash("gone"), 3000);
    return () => { window.clearTimeout(tC); window.clearTimeout(tOut); window.clearTimeout(tGone); };
  }, [isLastStep]);

  const hasBuilding = (project.buildingPoints?.length ?? 0) > 0 || !!project.bboxStats;
  const componentsCount = project.renovationEnvelopeComponents?.length ?? 0;
  const dataReadiness   = hasBuilding ? 78 : 42;
  const modelConfidence = hasBuilding ? 72 : 38;
  const nextStepLabel   = safeIndex < steps.length - 1 ? steps[safeIndex + 1]!.label : "Complete";
  // One plain-language line about what the NEXT step does, keyed by the current
  // step number — shown in the footer so the user knows what Continue leads to.
  // Kept in step with each page's own brief, so the promise made here matches
  // what the next screen actually says it does.
  const NEXT_STEP_HINT: Record<number, string> = {
    1: "review each building's data, fill any gaps, and choose which buildings carry forward.",
    2: "simulate the as-built performance of the selected buildings — the baseline to compare against.",
    3: "design renovation packages and simulate each against the baseline for energy, cost and carbon.",
    4: "compile everything into a shareable report.",
  };
  const nextHint = NEXT_STEP_HINT[activeStep.number];

  const goBack = () => {
    if (safeIndex > 0) navigate(steps[safeIndex - 1]!.path);
    else navigate("/");
  };
  const goNext = () => {
    if (safeIndex < steps.length - 1) navigate(steps[safeIndex + 1]!.path);
  };

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Reset twice: once now, once after layout. A step whose content arrives
    // asynchronously (Step 3 waits on geometry and baseline lookups) can grow
    // after this effect runs, which left the new page opening part-scrolled.
    // Also reset the window, since not every step scrolls inside <main>.
    const toTop = () => {
      mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    toTop();
    const raf = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  return (
    <div className="wizard-shell flex h-screen overflow-hidden"
         style={{ background: "#0a0d14", fontFamily: "'Inter', system-ui, sans-serif", color: "#fff" }}>

      {/* ── Final-step arrival splash — fades out to reveal the Report behind ── */}
      {splash !== "gone" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: 24,
          background: "radial-gradient(circle at 50% 42%, rgba(24,20,44,0.90) 0%, rgba(8,11,18,0.95) 70%)",
          opacity: splash === "out" ? 0 : 1,
          transition: "opacity 0.85s ease",
          pointerEvents: splash === "out" ? "none" : "auto",
        }}>
          <div style={{ animation: "splashIn 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase", color: "#B98BE8", marginBottom: 16 }}>
              Step {activeStep.number} · {activeStep.label}
            </div>
            <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: 14 }}>
              You've reached the final step 🎉
            </div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.62)", maxWidth: 540, lineHeight: 1.6, margin: "0 auto" }}>
              Your renovation plan is ready — review the report, download it, and share.
            </div>
          </div>
          <style>{`@keyframes splashIn{from{opacity:0;transform:translateY(18px) scale(0.96)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}

      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
      <aside className="w-[62px] shrink-0 flex flex-col items-center py-3 gap-0.5 z-30"
             style={{ background: "#0a0d14", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 shadow-lg shrink-0 cursor-pointer theme-preserve"
             style={{ background: "linear-gradient(135deg,var(--brand-deep),var(--brand-dark))" }}
             onClick={() => navigate("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </div>

        {steps.map((step, i) => (
          <SideNavItem
            key={step.path}
            iconD={STEP_ICONS[i] ?? IC.project}
            label={`Step ${step.number}`}
            title={step.label}
            active={location.pathname === step.path}
            onClick={step.number <= highestUnlockedStep ? () => goToStep(step.number, step.path) : undefined}
          />
        ))}

        <div className="flex-1" />
        <ThemeToggle />
        <SideNavItem iconD={IC.settings} label="Settings" className="sidebar-theme-icon" onClick={() => setSettingsOpen(true)} />
      </aside>

      {/* ── MAIN COLUMN ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── TOP BAR ─────────────────────────────────────────────────── */}
        <header className="shrink-0 flex flex-col z-20"
                style={{ background: "#0d1117", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>

          <div className="flex items-center gap-3 px-6 py-3">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 800,
                background: "rgba(var(--brand-rgb),0.25)",
                border: "1px solid rgba(var(--brand-rgb),0.55)",
                color: "#fff",
              }}>
                {activeStep.number}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                {activeStep.label}
              </span>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              {LIBRARY_TABS.map((tab) => {
                const targetPath = tabPathFor(tab, countryCodeFromName(project.country));
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
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />

            {/* Country → city selector + account — same as every other page's
                TopBar, so it stays visible (and editable) inside the steps. */}
            <CountryCitySelector />
          </div>

        </header>

        {/* ── CONTENT + RIGHT PANEL ───────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Scrollable main content */}
          <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-5">
            <Outlet />
          </main>

        </div>

        {/* ── BOTTOM NAV BAR (the single wizard nav — pages register custom
             Continue/Back behavior via useWizardStepNav rather than drawing
             their own duplicate buttons) ──────────────────────────────── */}
        <footer className="shrink-0 flex items-center gap-3 px-6 py-3 z-20"
                style={{ background: "#0d1117", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => (wizardNav.onBack ? wizardNav.onBack() : goBack())} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
            borderRadius: 12, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.65)",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer", transition: "all 0.15s",
          }}>
            <Icon d={IC.arrowL} size={16} /> Back
          </button>
          {/* A validation message ("Add X to continue") takes over the centre when
              the step blocks Continue; otherwise a preview of the next step. */}
          {!isLastStep ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center", padding: "0 16px" }}>
              {nextError ? (
                <div style={{ maxWidth: 660, fontSize: 12, fontWeight: 600, color: "#fca5a5", lineHeight: 1.4, textAlign: "center", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: "#E2483B", fontSize: 15, lineHeight: 1 }}>⚠</span> {nextError}
                </div>
              ) : (
                <div style={{ maxWidth: 620, fontSize: 11.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.45, textAlign: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginRight: 7 }}>Next</span>
                  <b style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>{nextStepLabel}</b>
                  {nextHint ? <span style={{ color: "rgba(255,255,255,0.42)" }}> — {nextHint}</span> : null}
                </div>
              )}
            </div>
          ) : <div style={{ flex: 1 }} />}
          {/* No Continue on the final step (Report) — nothing comes after it. */}
          {!isLastStep && (
            <button
              onClick={() => { if (canNext) (wizardNav.onNext ? wizardNav.onNext() : goNext()); }}
              disabled={!canNext}
              title={canNext ? undefined : "Fix the highlighted issue to continue"}
              className="no-hover-shadow theme-preserve"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 24px",
                borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff",
                background: canNext ? "linear-gradient(135deg,var(--brand-deep),var(--brand-dark))" : "rgba(255,255,255,0.10)",
                boxShadow: canNext ? "0 4px 14px rgba(var(--brand-rgb),0.45)" : "none", border: 0,
                cursor: canNext ? "pointer" : "not-allowed",
                opacity: canNext ? 1 : 0.55, transition: "all 0.15s",
              }}>
              Continue <Icon d={IC.arrowR} size={16} />
            </button>
          )}
        </footer>

      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

