import { FileText, ExternalLink, Building2, MapPin, Zap } from "lucide-react";
import { SAMPLE_REPORTS } from "../utils/sampleReportData";
import { generateReport } from "../utils/reportGenerator";

/* ─── icon map ─────────────────────────────────────────────────────────── */
const TYPE_ICONS: Record<string, React.ReactNode> = {
  "Renovation Planning":       <Building2 className="w-5 h-5" />,
  "Energy Community Planning": <Zap       className="w-5 h-5" />,
  "Renewable Energy Planning": <Zap       className="w-5 h-5" />,
};

/* ─── open report in new tab ─────────────────────────────────────────── */
function openReport(idx: number) {
  const s   = SAMPLE_REPORTS[idx];
  const html = generateReport(s.project, s.computed);
  const win  = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function SampleReports() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 8px 48px" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
          color: "rgba(255,255,255,0.3)", marginBottom: 8, textTransform: "uppercase",
        }}>
          Report Samples
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>
          Example Project Reports
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", maxWidth: 560, margin: 0, lineHeight: 1.6 }}>
          Fully generated sample reports for each project type. Click{" "}
          <strong style={{ color: "rgba(255,255,255,0.75)" }}>Preview Report</strong>{" "}
          to open a print-ready HTML report in a new tab — ready to save as PDF.
        </p>
      </div>

      {/* ── Cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {SAMPLE_REPORTS.map((s, idx) => (
          <SampleCard key={s.id} sample={s} index={idx} />
        ))}
      </div>

      {/* ── Footer note ── */}
      <p style={{
        marginTop: 36, fontSize: 12, color: "rgba(255,255,255,0.3)",
        lineHeight: 1.7, maxWidth: 640,
      }}>
        Sample data is illustrative only. All addresses, measurements, and costs are
        representative figures based on typical Swedish building stock and Wikells
        Sektionsfakta material prices. Values are not suitable for real procurement decisions.
      </p>
    </div>
  );
}

/* ─── Single card ─────────────────────────────────────────────────────── */
function SampleCard({
  sample,
  index,
}: {
  sample: (typeof SAMPLE_REPORTS)[number];
  index: number;
}) {
  const icon = TYPE_ICONS[sample.label] ?? <FileText className="w-5 h-5" />;

  return (
    <div style={{
      borderRadius: 16,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${sample.accentBorder}`,
      overflow: "hidden",
    }}>
      {/* ── Top colour bar ── */}
      <div style={{ height: 4, background: sample.color }} />

      <div style={{ padding: "22px 24px 24px" }}>

        {/* ── Header row ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: sample.accentBg,
              border: `1px solid ${sample.accentBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: sample.color,
            }}>
              {icon}
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: sample.color, marginBottom: 3 }}>
                {sample.label}
              </p>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>
                {sample.project.projectName}
              </h2>
            </div>
          </div>

          {/* Preview button */}
          <button
            onClick={() => openReport(index)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              background: sample.color, color: "#fff",
              fontSize: 13, fontWeight: 700, flexShrink: 0,
              boxShadow: `0 0 18px ${sample.color}40`,
            }}
          >
            <FileText size={14} />
            Preview Report
            <ExternalLink size={12} style={{ opacity: 0.8 }} />
          </button>
        </div>

        {/* ── Meta pills ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <Pill icon={<MapPin size={11} />} text={sample.summary.location} color={sample.color} />
          <Pill icon={<Building2 size={11} />} text={sample.summary.building} color={sample.color} />
        </div>

        {/* ── Highlight bar ── */}
        <div style={{
          background: sample.accentBg,
          border: `1px solid ${sample.accentBorder}`,
          borderRadius: 8, padding: "10px 14px",
          fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5,
        }}>
          {sample.summary.highlight}
        </div>

        {/* ── Report sections preview ── */}
        <SectionsList sample={sample} />
      </div>
    </div>
  );
}

/* ─── Small pill ─────────────────────────────────────────────────────── */
function Pill({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 100,
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      fontSize: 11, color: "rgba(255,255,255,0.55)",
    }}>
      <span style={{ color }}>{icon}</span>
      {text}
    </span>
  );
}

/* ─── Section list (what's inside the report) ──────────────────────── */
function SectionsList({ sample }: { sample: (typeof SAMPLE_REPORTS)[number] }) {
  const isRenovation = sample.project.projectType === "Renovation Planning";

  const sections = [
    { num: "1", label: "Project Definition",      sub: `${sample.project.systemsInScope.length} systems · ${sample.project.selectedKpis.length} KPIs` },
    { num: "2", label: "Location & Building Data", sub: sample.project.lookedUpBuilding
        ? `${sample.project.lookedUpBuilding.address} — ${sample.project.lookedUpBuilding.year}`
        : sample.project.bboxStats
          ? `${sample.project.bboxStats.count} buildings in bounding box`
          : "Location summary" },
    { num: "3", label: "Data Coverage",            sub: `${Object.keys(sample.project.dataInputs).length} parameters assessed` },
    ...(isRenovation ? [{ num: "4", label: "Renovation Packages", sub: `${sample.computed.packageTotals.length} packages compared` }] : []),
    { num: isRenovation ? "5" : "4", label: "Expected Deliverables", sub: `${sample.computed.delivSections.reduce((a, [, items]) => a + items.length, 0) + 3} deliverables` },
    { num: isRenovation ? "6" : "5", label: "Project Timeline",      sub: `${sample.computed.totalHours} h · ${sample.computed.userWeeks} weeks` },
    { num: isRenovation ? "7" : "6", label: "Budget & Cost",          sub: `${(sample.computed.serviceCost / 1000).toFixed(0)},000 SEK service cost` },
  ];

  return (
    <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
      {sections.map(s => (
        <div
          key={s.num}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "7px 12px",
            fontSize: 11,
          }}
        >
          <span style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
            background: "rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.4)",
          }}>
            {s.num}
          </span>
          <div>
            <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{s.label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{s.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
