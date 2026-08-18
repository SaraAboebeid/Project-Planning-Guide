import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Cell,
} from "recharts";
import { Info, ChevronDown, ChevronUp, Calendar, Calculator, BookOpen } from "lucide-react";

/* ─── constants ──────────────────────────────────────────────────── */
const CONSULTANT_RATES: Record<string, number> = {
  SEK: 1400, EUR: 140, USD: 150, GBP: 130, NOK: 1500, DKK: 1050,
};
const EFFORT_BASE: Record<string, number> = {
  "Renovation Planning":        65,
  "Energy Community Planning":  60,
  "Renewable Energy Planning":  50,
};
const SCALE_MULT: Record<string, number> = { Building: 1.0, Neighborhood: 1.8, City: 2.5 };
const PHASE_SPLIT: [string, number][] = [
  ["Scoping",              0.10],
  ["Data Collection",      0.30],
  ["Modelling & Analysis", 0.35],
  ["Validation & QA",      0.15],
  ["Reporting",            0.10],
];
const TL_COLORS = ["var(--brand-deep)", "#6E2AAE", "#2FB477", "#509724", "#3a6e1a"];

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtNum(n: number) { return n.toLocaleString(); }

/* ─── Collapsible guide box ──────────────────────────────────────── */
function GuideBox({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderRadius: 10, border: "1px solid rgba(47,180,119,0.2)",
      background: "rgba(47,180,119,0.04)", marginBottom: 4,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "9px 14px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <BookOpen size={13} color="#2FB477" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#2FB477", flex: 1 }}>{title}</span>
        {open
          ? <ChevronUp size={13} color="#2FB477" />
          : <ChevronDown size={13} color="#2FB477" />}
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px", fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Section card ───────────────────────────────────────────────── */
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 16, background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</div>
        <span style={{ fontWeight: 700, fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{title}</span>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

/* ─── Formula step ───────────────────────────────────────────────── */
function FormulaRow({
  label, formula, result, currency, highlight = false,
}: {
  label: string; formula: string; result: number; currency: string; highlight?: boolean;
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1.6fr auto",
      alignItems: "center", gap: 12,
      padding: "9px 0",
      borderBottom: highlight ? "none" : "1px solid rgba(255,255,255,0.06)",
      marginTop: highlight ? 6 : 0,
      borderTop: highlight ? "2px solid rgba(255,255,255,0.12)" : "none",
    }}>
      <span style={{ fontSize: 12.5, color: highlight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)", fontWeight: highlight ? 700 : 500 }}>
        {label}
      </span>
      <span style={{
        fontSize: 11, color: "rgba(47,180,119,0.7)",
        background: "rgba(47,180,119,0.06)", borderRadius: 6,
        padding: "2px 8px", fontFamily: "monospace",
      }}>
        {formula}
      </span>
      <span style={{
        fontSize: highlight ? 15 : 13, fontWeight: highlight ? 800 : 600,
        color: highlight ? "#2FB477" : "rgba(255,255,255,0.75)",
        minWidth: 120, textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}>
        {fmtNum(result)} {currency}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function Budget() {
  const navigate = useNavigate();
  const { project } = useWizardStore();

  /* ─── Effort from wizard (or defaults) ── */
  const baseHours  = EFFORT_BASE[project.projectType ?? ""] ?? 60;
  const scaleMult  = SCALE_MULT[project.scale ?? "Building"] ?? 1.0;
  const estHours   = Math.round(baseHours * scaleMult);

  const [currency, setCurrency] = useState("SEK");
  const [rate, setRate]         = useState<number>(CONSULTANT_RATES.SEK!);

  /* ─── Timeline ── */
  const [phaseHours, setPhaseHours] = useState<Record<string, number>>(
    () => Object.fromEntries(PHASE_SPLIT.map(([p, f]) => [p, Math.round(estHours * f)]))
  );
  const [startDate, setStartDate] = useState(fmt(new Date()));
  const userTotalHours = useMemo(() => Object.values(phaseHours).reduce((a, b) => a + b, 0), [phaseHours]);
  const userWeeks      = Math.max(1, Math.round(userTotalHours / 30));
  const maxPhaseHrs    = Math.max(...Object.values(phaseHours), 1);

  const timelineRows = useMemo(() => {
    let cur = new Date(startDate);
    return PHASE_SPLIT.map(([phase]) => {
      const hrs   = phaseHours[phase] ?? 0;
      const weeks = Math.max(1, Math.round(hrs / 30));
      const end   = addDays(cur, weeks * 7);
      const row   = { phase, start: fmt(cur), end: fmt(end), hrs, weeks };
      cur = end;
      return row;
    });
  }, [phaseHours, startDate]);

  /* ─── Service cost (Swedish LKP model) ── */
  const baseLaborCost  = Math.round(userTotalHours * rate);
  const lkpCost        = Math.round(baseLaborCost * 0.575);
  const overheadCost   = Math.round(baseLaborCost * 0.30);
  const serviceCost    = baseLaborCost + lkpCost + overheadCost;

  /* ─── OPEX ── */
  const [opex, setOpex] = useState({ energy: 0, maintenance: 0, staffing: 0, other: 0 });
  const opexTotal = Object.values(opex).reduce((a, b) => a + b, 0);

  /* ─── Timeline bar data ── */
  const barData = PHASE_SPLIT.map(([phase], i) => ({
    phase: phase.replace(" & ", " &\n"),
    hours: phaseHours[phase] ?? 0,
    fill: TL_COLORS[i],
  }));

  /* ─── Total cost summary ── */
  const totalCost = serviceCost + opexTotal;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 8px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Page header ── */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Planning & Cost Estimate
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          Planning & Cost Estimate
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>
          {project.projectType
            ? `${project.projectType} · ${project.scale ?? "Building"} scale · ${project.country ?? ""}`
            : "Configure project type in Step 1 for auto-filled estimates."}
        </p>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { v: `${fmtNum(serviceCost)} ${currency}`, l: "Consultant Service Cost", c: "var(--brand-deep)", bg: "rgba(var(--brand-rgb),0.10)", border: "rgba(var(--brand-rgb),0.25)" },
          { v: `${fmtNum(opexTotal)} ${currency}`,   l: "Annual OPEX",             c: "#2FB477", bg: "rgba(47,180,119,0.10)", border: "rgba(47,180,119,0.25)" },
        ].map(s => (
          <div key={s.l} style={{ borderRadius: 14, background: s.bg, border: `1px solid ${s.border}`, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ══ 1. SERVICE COST CALCULATOR ══ */}
      <Card title="Service Cost Calculator" icon={<Calculator size={16} color="var(--brand-deep)" />}>

        <GuideBox title="How consultant service cost is calculated">
          <p style={{ margin: "0 0 8px" }}>
            The service cost uses the <strong style={{ color: "rgba(255,255,255,0.75)" }}>Swedish LKP model</strong> — the standard for Swedish consultancy billing:
          </p>
          <ol style={{ margin: 0, paddingLeft: 16 }}>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Base Labour</strong> = Total hours × Hourly rate</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>LKP (Lönekostnadspålägg)</strong> = Base × 57.5% — employer social charges mandated by Swedish law (pension, sick leave, parental leave, etc.)</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Overhead</strong> = Base × 30% — office, software, insurance, management</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Total Service Cost</strong> = Base + LKP + Overhead</li>
          </ol>
        </GuideBox>

        {/* Currency + rate */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, marginBottom: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Currency</label>
            <select
              value={currency}
              onChange={e => { setCurrency(e.target.value); setRate(CONSULTANT_RATES[e.target.value] ?? 150); }}
              style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "8px 12px", fontSize: 13 }}
            >
              {Object.keys(CONSULTANT_RATES).map(c => <option key={c} style={{ background: "#1e1e2e" }}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Consultant Hourly Rate ({currency})</label>
            <input
              type="number" min={0} value={rate}
              onChange={e => setRate(Number(e.target.value))}
              style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "8px 12px", fontSize: 13 }}
            />
          </div>
        </div>

        {/* Formula breakdown */}
        <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", padding: "4px 16px 4px" }}>
          <FormulaRow label="Base Labour"  formula={`${userTotalHours} hrs × ${fmtNum(rate)} ${currency}`}     result={baseLaborCost} currency={currency} />
          <FormulaRow label="LKP (57.5%)"  formula={`${fmtNum(baseLaborCost)} × 0.575`}                        result={lkpCost}       currency={currency} />
          <FormulaRow label="Overhead (30%)" formula={`${fmtNum(baseLaborCost)} × 0.30`}                        result={overheadCost}  currency={currency} />
          <FormulaRow label="Total Service Cost" formula="Base + LKP + Overhead"                                result={serviceCost}   currency={currency} highlight />
        </div>
      </Card>

      {/* ══ 2. OPEX ══ */}
      <Card title="Annual OPEX — Operating Expenditure" icon={<Info size={16} color="#509724" />}>

        <GuideBox title="What is OPEX and what to include">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Energy & Utilities</strong> — ongoing electricity, district heating, cooling costs post-renovation</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Maintenance</strong> — scheduled inspections, replacements (typically 1–2% of CAPEX/year)</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Staffing</strong> — energy manager, caretaker, community energy coordinator</li>
            <li><strong style={{ color: "rgba(255,255,255,0.75)" }}>Other</strong> — insurance, licenses, monitoring subscriptions</li>
          </ul>
          <p style={{ margin: "8px 0 0" }}>
            <strong style={{ color: "rgba(255,255,255,0.75)" }}>Net OPEX</strong> — for renovation or PV projects, energy savings will reduce energy costs. Enter savings as a negative value.
          </p>
        </GuideBox>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          {([
            ["energy",      "Energy & Utilities"],
            ["maintenance", "Maintenance"],
            ["staffing",    "Staffing"],
            ["other",       "Other"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5 }}>{label} ({currency}/yr)</label>
              <input
                type="number" value={opex[key]}
                onChange={e => setOpex(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "8px 12px", fontSize: 13 }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, borderRadius: 10, background: "rgba(80,151,36,0.08)", border: "1px solid rgba(80,151,36,0.2)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Annual OPEX Total</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: opexTotal < 0 ? "#2FB477" : "rgba(255,255,255,0.85)" }}>{fmtNum(opexTotal)} {currency}/yr</span>
        </div>
      </Card>

      {/* ══ 3. PROJECT TIMELINE ══ */}
      <Card title="Project Timeline" icon={<Calendar size={16} color="#6E2AAE" />}>

        <GuideBox title="How project hours are estimated">
          <p style={{ margin: "0 0 8px" }}>
            Base hours come from the project type and scale factor:
          </p>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>Renovation Planning: <strong style={{ color: "rgba(255,255,255,0.75)" }}>65 h</strong> base · Energy Community: <strong style={{ color: "rgba(255,255,255,0.75)" }}>60 h</strong> · Renewable Energy: <strong style={{ color: "rgba(255,255,255,0.75)" }}>50 h</strong></li>
            <li>Scale multiplier: Building ×1.0 · Neighbourhood ×1.8 · City ×2.5</li>
            <li>Hours are then split across phases: Scoping 10% · Data Collection 30% · Modelling 35% · Validation 15% · Reporting 10%</li>
            <li>Each phase duration = phase hours ÷ 30 h/week (rounded up to whole weeks)</li>
          </ul>
          {project.projectType && (
            <p style={{ margin: "8px 0 0", color: "rgba(47,180,119,0.8)" }}>
              Auto-estimate for your project: {baseHours} h × {scaleMult} = <strong>{estHours} h</strong>
            </p>
          )}
        </GuideBox>

        {/* Start date + reset */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 0 16px", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5 }}>Start date</label>
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "7px 12px", fontSize: 13 }}
            />
          </div>
          <button
            onClick={() => setPhaseHours(Object.fromEntries(PHASE_SPLIT.map(([p, f]) => [p, Math.round(estHours * f)])))}
            style={{ alignSelf: "flex-end", fontSize: 12, color: "#2FB477", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            ↺ Reset to estimates
          </button>
        </div>

        {/* Phase bars + hour inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {PHASE_SPLIT.map(([phase], idx) => {
            const hrs = phaseHours[phase] ?? 0;
            const pct = (hrs / maxPhaseHrs) * 100;
            return (
              <div key={phase} style={{ display: "grid", gridTemplateColumns: "160px 70px 1fr", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{phase}</span>
                <input
                  type="number" min={0} value={hrs}
                  onChange={e => setPhaseHours(prev => ({ ...prev, [phase]: Number(e.target.value) }))}
                  style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "5px 8px", fontSize: 12, textAlign: "center", width: "100%" }}
                />
                <div style={{ height: 20, borderRadius: 100, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 100, background: TL_COLORS[idx], width: `${pct}%`, transition: "width .2s" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar chart */}
        <div style={{ height: 160, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="phase" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
              <Tooltip
                contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v} hours`, "Hours"]}
              />
              {barData.map((entry, i) => (
                <Bar key={entry.phase} dataKey="hours" fill={TL_COLORS[i]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                </Bar>
              ))}
              <Bar dataKey="hours" fill="var(--brand-deep)" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell key={i} fill={TL_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gantt table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Phase", "Start", "End", "Duration", "Hours"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((r, i) => (
                <tr key={r.phase} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{r.phase}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>{r.start}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>{r.end}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ background: TL_COLORS[i], color: "#fff", borderRadius: 100, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>
                      {r.weeks} wk
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.6)", fontVariantNumeric: "tabular-nums" }}>{r.hrs} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10 }}>
          <span>Total: <strong style={{ color: "rgba(255,255,255,0.8)" }}>{userTotalHours} hours</strong></span>
          <span>Duration: <strong style={{ color: "rgba(255,255,255,0.8)" }}>{userWeeks} weeks</strong></span>
          <span>Completion: <strong style={{ color: "#2FB477" }}>{timelineRows.length ? timelineRows[timelineRows.length - 1].end : "—"}</strong></span>
        </div>
      </Card>



      {/* ══ 4. TOTAL SUMMARY ══ */}
      <div style={{
        borderRadius: 16, background: "rgba(var(--brand-rgb),0.10)",
        border: "1px solid rgba(var(--brand-rgb),0.25)", padding: "20px 24px",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>Total Estimate</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Consultant Service Cost</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-deep)" }}>{fmtNum(serviceCost)} {currency}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Annual OPEX</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#2FB477" }}>{fmtNum(opexTotal)} {currency}/yr</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>Consultant + OPEX Total</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{fmtNum(totalCost)} {currency}</div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8 }}>
        <button onClick={() => navigate("/step/4")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/")} className="ppg-btn-primary">Finish & Return Home</button>
      </div>
    </div>
  );
}
