import {
  Treemap, ResponsiveContainer, Tooltip,
  Sankey, Rectangle,
  RadialBarChart, RadialBar, Legend, PolarAngleAxis,
} from "recharts";
import { getImportanceRanking, BASELINE_HEATING_KWH } from "../../config/sensitivityData";

// ===== Treemap Hierarchy View =====
export function TreemapView() {
  const ranking = getImportanceRanking();
  
  const data = ranking.map((r) => ({
    name: r.label,
    size: r.range_kwh,
    pct: r.pct,
    fill: getColorByImportance(r.pct),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">📊 Hierarchical Impact View</h3>
        <span className="text-xs text-gray-500">Size = Impact magnitude</span>
      </div>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            stroke="#fff"
            content={<CustomTreemapContent />}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                    <div className="text-xs font-semibold text-slate-800">{data.name}</div>
                    <div className="text-xs text-gray-600">Impact: {data.pct.toFixed(1)}%</div>
                    <div className="text-xs text-gray-600">Range: {Math.round(data.size).toLocaleString()} kWh</div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 italic">
        Larger boxes = greater uncertainty contribution. Color indicates criticality level.
      </p>
    </div>
  );
}

const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, pct, fill } = props;
  
  if (width < 50 || height < 50) return null;
  
  return (
    <g>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
      />
      {width > 80 && height > 40 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 10}
            textAnchor="middle"
            fill="#fff"
            fontSize={12}
            fontWeight="600"
          >
            {name.length > 20 ? name.substring(0, 18) + '...' : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="#fff"
            fontSize={14}
            fontWeight="bold"
          >
            {pct.toFixed(1)}%
          </text>
        </>
      )}
    </g>
  );
};

// ===== Sankey Flow Diagram =====
export function SankeyFlowView() {
  const ranking = getImportanceRanking();
  
  // Categorize parameters
  const categories = {
    envelope: ["Construction Quality", "Glazing Quality", "Roof Shape & Angle", "Window-to-Wall Ratio"],
    geometry: ["Number of Floors", "Building Length", "Building Width"],
    systems: ["Infiltration Rate", "Heating Setpoint"],
  };

  const nodes = [
    { name: "Building Envelope" },
    { name: "Building Geometry" },
    { name: "Systems & Operations" },
    { name: "Heating Uncertainty" },
  ];

  const links: any[] = [];
  let envelopeSum = 0, geometrySum = 0, systemsSum = 0;

  ranking.forEach(r => {
    if (categories.envelope.includes(r.label)) {
      envelopeSum += r.range_kwh;
    } else if (categories.geometry.includes(r.label)) {
      geometrySum += r.range_kwh;
    } else if (categories.systems.includes(r.label)) {
      systemsSum += r.range_kwh;
    }
  });

  if (envelopeSum > 0) links.push({ source: 0, target: 3, value: envelopeSum });
  if (geometrySum > 0) links.push({ source: 1, target: 3, value: geometrySum });
  if (systemsSum > 0) links.push({ source: 2, target: 3, value: systemsSum });

  const data = { nodes, links };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">🌊 Uncertainty Flow Diagram</h3>
        <span className="text-xs text-gray-500">Flow width = Impact contribution</span>
      </div>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            node={{ fill: "#721CB8", stroke: "#fff", strokeWidth: 2 }}
            link={{ stroke: "#2FB477", opacity: 0.5 }}
            nodePadding={50}
            margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
          >
            <Tooltip
              content={({ payload }) => {
                if (!payload?.[0]) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                    <div className="text-xs font-semibold text-slate-800">
                      {data.source?.name} → {data.target?.name}
                    </div>
                    <div className="text-xs text-gray-600">
                      Flow: {Math.round(data.value).toLocaleString()} kWh range
                    </div>
                  </div>
                );
              }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="ppg-stat ppg-stat-navy">
          <div className="font-bold">{Math.round(envelopeSum).toLocaleString()}</div>
          <div className="text-gray-500">Envelope (kWh)</div>
        </div>
        <div className="ppg-stat ppg-stat-green">
          <div className="font-bold">{Math.round(geometrySum).toLocaleString()}</div>
          <div className="text-gray-500">Geometry (kWh)</div>
        </div>
        <div className="ppg-stat ppg-stat-teal">
          <div className="font-bold">{Math.round(systemsSum).toLocaleString()}</div>
          <div className="text-gray-500">Systems (kWh)</div>
        </div>
      </div>
      <p className="text-xs text-gray-500 italic">
        Shows how parameter categories contribute to total heating demand uncertainty.
      </p>
    </div>
  );
}

// ===== Radial/Sunburst View =====
export function RadialImpactView() {
  const ranking = getImportanceRanking().slice(0, 8); // Top 8 parameters
  
  const data = ranking.map((r) => ({
    name: r.label.length > 20 ? r.label.substring(0, 18) + '...' : r.label,
    value: r.pct,
    fill: getColorByImportance(r.pct),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">🌅 Radial Impact View</h3>
        <span className="text-xs text-gray-500">Top 8 parameters</span>
      </div>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="20%"
            outerRadius="90%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background
              dataKey="value"
              cornerRadius={10}
              label={{ position: 'insideStart', fill: '#fff', fontSize: 11 }}
            />
            <Legend
              iconSize={10}
              layout="vertical"
              verticalAlign="middle"
              align="right"
              wrapperStyle={{ fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                    <div className="text-xs font-semibold text-slate-800">{data.name}</div>
                    <div className="text-xs text-gray-600">Impact: {data.value.toFixed(1)}%</div>
                  </div>
                );
              }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 italic">
        Radial bars show relative impact magnitude. Larger arc = greater uncertainty.
      </p>
    </div>
  );
}

// ===== Bubble/Scatter Matrix =====
export function BubbleScatterView() {
  const ranking = getImportanceRanking();
  
  const data = ranking.map(r => {
    return {
      name: r.label,
      impact: r.pct,
      range_mwh: r.range_kwh / 1000,
      pct_of_baseline: (r.range_kwh / BASELINE_HEATING_KWH) * 100,
      fill: getColorByImportance(r.pct),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">🔵 Impact Landscape</h3>
        <span className="text-xs text-gray-500">Bubble size = % of baseline</span>
      </div>
      <div className="h-[400px] relative">
        {/* Simple scatter plot with custom bubbles */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="100%" height="100%" viewBox="0 0 600 400">
            <g transform="translate(60, 20)">
              {/* Axes */}
              <line x1="0" y1="350" x2="520" y2="350" stroke="#e2e8f0" strokeWidth="2" />
              <line x1="0" y1="0" x2="0" y2="350" stroke="#e2e8f0" strokeWidth="2" />
              
              {/* Grid lines */}
              {[0, 10, 20, 30, 40, 50].map(y => (
                <line key={y} x1="0" y1={350 - y * 7} x2="520" y2={350 - y * 7} stroke="#f1f5f9" strokeWidth="1" />
              ))}
              
              {/* Axis labels */}
              <text x="260" y="385" textAnchor="middle" fontSize="11" fill="#64748b">
                Importance (%)
              </text>
              <text x="-175" y="-25" transform="rotate(-90)" textAnchor="middle" fontSize="11" fill="#64748b">
                Range (MWh/yr)
              </text>
              
              {/* Bubbles */}
              {data.map((d, i) => {
                const x = (d.impact / 50) * 520;
                const y = 350 - (d.range_mwh / 250) * 350;
                const r = Math.sqrt(d.pct_of_baseline) * 3;
                
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={d.fill}
                      opacity="0.7"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    {i < 5 && (
                      <text
                        x={x}
                        y={y - r - 5}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#64748b"
                        fontWeight="600"
                      >
                        {d.name.substring(0, 12)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
      <div className="flex justify-between items-center text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Critical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span>High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>Low</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 italic">
        X-axis shows importance %, Y-axis shows absolute range. Bubble size = impact relative to baseline.
      </p>
    </div>
  );
}

// Helper functions
function getColorByImportance(pct: number): string {
  if (pct >= 30) return "#dc2626"; // red-600 - Critical
  if (pct >= 20) return "#ea580c"; // orange-600 - High
  if (pct >= 10) return "#E8880C"; // yellow-500 - Medium
  return "#84cc16"; // lime-500 - Low
}
