/**
 * BaselineLoadProfile - monthly / hourly load profile for the Step 3 baseline.
 *
 * The 8760-hour trace already comes back from EnergyPlus with every run and is
 * kept in the simulation database; this panel fetches it aggregated (see the
 * backend's /api/simulation-timeseries) rather than holding megabytes of time
 * series in the wizard store.
 *
 * Monthly is a stacked bar - the shape of the heating season is the point.
 * Hourly is a line with a brush, because 8760 stacked areas read as mud and the
 * useful question there is "what does a winter week actually look like".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, Brush, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { C, tint } from "../config/colors";

type Resolution = "monthly" | "hourly";
type EndUse = "heating" | "cooling" | "lighting" | "equipment" | "dhw";

/** Stacking order is coldest-to-warmest by meaning, not alphabetical, so the
 *  heating band (the one a retrofit moves) always sits at the bottom. */
const END_USES: { key: EndUse; label: string; color: string }[] = [
  { key: "heating", label: "Heating", color: C.bad },
  { key: "dhw", label: "Hot water", color: "#93c5fd" },
  { key: "cooling", label: "Cooling", color: C.info },
  { key: "lighting", label: "Lighting", color: C.warn },
  { key: "equipment", label: "Equipment", color: C.good },
];

const white = (a: number) => `rgba(255,255,255,${a})`;

/** Hour index -> "12 Feb 14:00", for the hourly tooltip. Cheap arithmetic on a
 *  non-leap year, matching the backend's own 8760 month boundaries. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function hourLabel(hour: number): string {
  let day = Math.floor(hour / 24);
  const h = hour % 24;
  for (let m = 0; m < 12; m++) {
    if (day < MONTH_DAYS[m]!) return `${day + 1} ${MONTH_NAMES[m]} ${String(h).padStart(2, "0")}:00`;
    day -= MONTH_DAYS[m]!;
  }
  return `h${hour}`;
}

export default function BaselineLoadProfile({
  batchId, addresses,
}: {
  batchId: string;
  /** Fallback labels for the building picker when a run has no address. */
  addresses: string[];
}) {
  const [resolution, setResolution] = useState<Resolution>("monthly");
  const [buildingIdx, setBuildingIdx] = useState(0);
  const [perM2, setPerM2] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.simulationTimeseries>> | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    // Hourly is 8760 points per series, so never fetch it for every building at
    // once - the picker decides which one is on screen.
    api.simulationTimeseries(batchId, resolution, resolution === "hourly" ? buildingIdx : undefined)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [batchId, resolution, buildingIdx]);

  const building = useMemo(() => {
    if (!data) return null;
    return data.buildings.find((b) => b.idf_idx === buildingIdx) ?? data.buildings[0] ?? null;
  }, [data, buildingIdx]);

  /** kWh straight from the backend, divided by floor area only when the user
   *  asks for intensity - so the axis unit always matches the toggle. */
  const divisor = perM2 && building?.total_floor_area_m2 ? building.total_floor_area_m2 : 1;
  const unit = divisor === 1 ? "kWh" : "kWh/m²";

  const present = useMemo(
    () => END_USES.filter((e) => (building?.series[e.key]?.length ?? 0) > 0),
    [building],
  );

  const rows = useMemo(() => {
    if (!building) return [];
    const n = Math.max(0, ...present.map((e) => building.series[e.key]?.length ?? 0));
    return Array.from({ length: n }, (_, i) => {
      const row: Record<string, number | string> = {
        label: resolution === "monthly" ? String(data?.labels[i] ?? i) : hourLabel(i),
      };
      for (const e of present) row[e.key] = Math.round(((building.series[e.key]?.[i] ?? 0) / divisor) * 1000) / 1000;
      return row;
    });
  }, [building, present, divisor, resolution, data]);

  const downloadCsv = useCallback(() => {
    if (!building || !rows.length) return;
    const header = [resolution === "monthly" ? "month" : "hour", ...present.map((e) => `${e.key}_${unit.replace("/", "_per_")}`)];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([`"${r.label}"`, ...present.map((e) => r[e.key] ?? 0)].join(","));
    }
    const name = (building.address || `building_${building.idf_idx}`).replace(/[^\w-]+/g, "_");
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epsm_baseline_${resolution}_${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [building, rows, present, resolution, unit]);

  const pill = (active: boolean) => ({
    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
    background: active ? C.selected : tint(C.selected, 0.12),
    border: `1px solid ${active ? C.selected : tint(C.selected, 0.35)}`,
    color: active ? "#0b1220" : C.selected,
  });

  return (
    <div style={{ borderRadius: 14, padding: "14px 18px", background: white(0.03), border: `1px solid ${white(0.08)}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Load profile</span>
        <span style={{ fontSize: 11, color: white(0.35) }}>
          real EnergyPlus output, {resolution === "monthly" ? "summed per calendar month" : "hour by hour"}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setResolution("monthly")} style={pill(resolution === "monthly")}>Monthly</button>
          <button onClick={() => setResolution("hourly")} style={pill(resolution === "hourly")}>Hourly</button>
          <button onClick={() => setPerM2((v) => !v)} style={pill(perM2)} title="Toggle between absolute energy and intensity">
            {perM2 ? "kWh/m²" : "kWh"}
          </button>
          <button
            onClick={downloadCsv}
            disabled={!rows.length}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              cursor: rows.length ? "pointer" : "not-allowed",
              background: tint(C.selected, 0.08), border: `1px solid ${tint(C.selected, 0.35)}`,
              color: rows.length ? C.selected : white(0.25),
            }}
          >
            <Download size={11} /> CSV
          </button>
        </span>
      </div>

      {addresses.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {addresses.map((addr, i) => (
            <button
              key={`${addr}-${i}`}
              onClick={() => setBuildingIdx(i)}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
                background: i === buildingIdx ? C.selected : white(0.03),
                color: i === buildingIdx ? "#0b1220" : white(0.4),
                border: `1px solid ${i === buildingIdx ? C.selected : white(0.08)}`,
                maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {addr}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 0", color: white(0.4), fontSize: 12 }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading {resolution} profile…
        </div>
      )}

      {!loading && error && (
        <p style={{ fontSize: 12, color: C.bad, margin: "12px 0" }}>Could not load the profile: {error}</p>
      )}

      {!loading && !error && !present.length && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "14px 0" }}>
          <AlertTriangle size={14} color={C.warn} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11.5, color: white(0.5), margin: 0 }}>
            This run carries no hourly trace, so there is no profile to draw — that means the data is absent, not that
            demand was zero. Re-run the baseline to record one.
          </p>
        </div>
      )}

      {!loading && !error && present.length > 0 && (
        <>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              {resolution === "monthly" ? (
                <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={white(0.06)} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: white(0.4) }} stroke={white(0.12)} />
                  <YAxis tick={{ fontSize: 10, fill: white(0.4) }} stroke={white(0.12)}
                         label={{ value: unit, angle: -90, position: "insideLeft", fill: white(0.35), fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0f1523", border: `1px solid ${white(0.12)}`, borderRadius: 8, fontSize: 11 }}
                           formatter={(v: number, n: string) => [`${v} ${unit}`, END_USES.find((e) => e.key === n)?.label ?? n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n: string) => END_USES.find((e) => e.key === n)?.label ?? n} />
                  {present.map((e) => (
                    <Bar key={e.key} dataKey={e.key} stackId="a" fill={e.color} />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={white(0.06)} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: white(0.4) }} stroke={white(0.12)} minTickGap={60} />
                  <YAxis tick={{ fontSize: 10, fill: white(0.4) }} stroke={white(0.12)}
                         label={{ value: unit, angle: -90, position: "insideLeft", fill: white(0.35), fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0f1523", border: `1px solid ${white(0.12)}`, borderRadius: 8, fontSize: 11 }}
                           formatter={(v: number, n: string) => [`${v} ${unit}`, END_USES.find((e) => e.key === n)?.label ?? n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n: string) => END_USES.find((e) => e.key === n)?.label ?? n} />
                  {present.map((e) => (
                    // 8760 points x N series: dots and animation would make this
                    // unusable, and the brush is how you actually read it.
                    <Line key={e.key} type="monotone" dataKey={e.key} stroke={e.color}
                          dot={false} strokeWidth={1} isAnimationActive={false} />
                  ))}
                  <Brush dataKey="label" height={22} travellerWidth={8}
                         stroke={tint(C.selected, 0.5)} fill={white(0.03)}
                         startIndex={0} endIndex={Math.min(rows.length - 1, 24 * 14)} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          {resolution === "hourly" && (
            <p style={{ fontSize: 10, color: white(0.28), margin: "6px 0 0" }}>
              Showing the first two weeks — drag the handles under the chart to pan across the year.
            </p>
          )}
          {present.some((e) => e.key === "cooling") && (
            <p style={{ fontSize: 10, color: white(0.28), margin: "6px 0 0", fontStyle: "italic" }}>
              Cooling here is the ideal-loads zone cooling the trace records. It is NOT in the headline total above:
              EPSM's end-use table carries only electricity and district heating columns, so district cooling falls
              through. A single-zone shoebox with no openable windows also overheats more readily than the real
              building would.
            </p>
          )}
        </>
      )}
    </div>
  );
}
