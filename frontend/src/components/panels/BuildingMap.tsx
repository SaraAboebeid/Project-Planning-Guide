import { Map, ExternalLink, Layers, Zap, Calendar, Building2 } from "lucide-react";
import { useWizardStore } from "../../store/wizard";

export default function BuildingMapPanel() {
  const buildingPoints = useWizardStore((s) => s.project.buildingPoints);

  const cesiumUrl = (() => {
    const base = "/gothenburg_3d.html";
    if (buildingPoints.length === 0) return base;
    const pts = buildingPoints
      .map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`)
      .join("|");
    return `${base}?points=${encodeURIComponent(pts)}`;
  })();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center flex-shrink-0">
            <Map className="w-4 h-4 text-navy" />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy leading-tight">
              Gothenburg 3D Explorer
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {buildingPoints.length > 0
                ? `${buildingPoints.length} address${buildingPoints.length > 1 ? "es" : ""} selected — only matching buildings will load`
                : "92,973 buildings · EUBUCCO + EPC energy data · deck.gl / MapLibre"}
            </p>
          </div>
        </div>
        <a
          href={cesiumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-dark transition-colors shadow-sm flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open map
        </a>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col sm:flex-row gap-5">
        <div
          className="w-full sm:w-48 h-32 rounded-xl flex-shrink-0 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)" }}
        >
          <svg viewBox="0 0 192 128" className="absolute inset-0 w-full h-full opacity-70">
            {([
              [20,70,12,30],[36,80,10,20],[52,60,14,40],[68,75,10,25],
              [84,55,16,45],[100,65,12,35],[116,72,10,28],[132,58,14,42],
              [148,68,10,32],[164,74,12,26],[26,82,8,18],[42,87,10,13],
              [58,78,8,22],[74,83,10,17],[90,70,8,30],[106,77,10,23],
              [122,80,8,20],[138,74,10,26],[154,79,8,21],[170,82,10,18],
            ] as number[][]).map(([x,y,w,h],i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx={1}
                fill={["var(--brand-deep)","#2FB477","#6E2AAE","#509724","#3a6e1a"][i % 5]}
                opacity={0.6 + (i % 3) * 0.13}
              />
            ))}
            <line x1="0" y1="100" x2="192" y2="100" stroke="white" strokeOpacity="0.1" strokeWidth="1"/>
          </svg>
          <div className="absolute bottom-2 left-0 right-0 text-center text-[9px] text-white/40 font-mono">
            57.70&deg;N &middot; 12.00&deg;E
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: <Layers className="w-3.5 h-3.5 text-purple-500" />,
              title: "Use type",
              desc: "Color buildings by function: residential, commercial, industrial, outbuildings.",
              accent: "bg-purple-50 border-purple-100",
            },
            {
              icon: <Zap className="w-3.5 h-3.5 text-emerald-500" />,
              title: "Energy class",
              desc: "17,352 EPC buildings colored A-G. Non-EPC buildings dimmed.",
              accent: "bg-emerald-50 border-emerald-100",
            },
            {
              icon: <Calendar className="w-3.5 h-3.5 text-amber-500" />,
              title: "Year / era",
              desc: "TABULA construction periods. Toggle energy compare to shade best to worst within era.",
              accent: "bg-amber-50 border-amber-100",
            },
          ].map((m) => (
            <div key={m.title} className={`rounded-xl border p-3 ${m.accent}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {m.icon}
                <span className="text-[11px] font-semibold text-slate-700">{m.title}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats footer */}
      <div className="border-t border-slate-100 px-5 py-3 flex flex-wrap gap-x-6 gap-y-1">
        {[
          { icon: <Building2 className="w-3 h-3" />, value: "92,973",             label: "buildings" },
          { icon: <Zap       className="w-3 h-3" />, value: "17,352",             label: "with EPC energy class" },
          { icon: <Layers    className="w-3 h-3" />, value: "17,346",             label: "TABULA matched" },
          { icon: <Map       className="w-3 h-3" />, value: "Central Gothenburg", label: "coverage" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="text-slate-400">{s.icon}</span>
            <span className="font-semibold text-slate-700">{s.value}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

    </div>
  );
}