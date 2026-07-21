import { useMemo, useState } from "react";
import {
  LAYER_MATERIALS, MATERIAL_BY_ID, SURFACE_RESISTANCE, PRESETS,
  computeAssemblyU, type AssemblyLayer, type ComponentKind, type LayerCategory,
} from "../config/assemblyLayers";
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";

/* Compose a wall / roof / floor from its real layers and read the U-value off
   the stack (EN ISO 6946). Replaces picking one catalogue row and calling its
   U-value "the wall" — which is what let bare coverings (U≈3.4) be proposed as
   retrofits. */

const CAT_COLOR: Record<LayerCategory, string> = {
  structure:  "#F59E0B",
  insulation: "#4ECDC4",
  board:      "#9B7FD4",
  cladding:   "#4A90E2",
  cavity:     "#6B7280",
};
const CAT_LABEL: Record<LayerCategory, string> = {
  structure: "Structure", insulation: "Insulation", board: "Board", cladding: "Cladding", cavity: "Cavity",
};

export default function AssemblyBuilder({
  kind, layers, onChange,
}: {
  kind: ComponentKind;
  layers: AssemblyLayer[];
  onChange: (layers: AssemblyLayer[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const result = useMemo(() => computeAssemblyU(layers, kind), [layers, kind]);
  const white = (o: number) => `rgba(255,255,255,${o})`;
  const sr = SURFACE_RESISTANCE[kind];

  const setLayer = (i: number, patch: Partial<AssemblyLayer>) =>
    onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(layers.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const add = (materialId: string) => {
    const m = MATERIAL_BY_ID[materialId];
    if (!m) return;
    onChange([...layers, { materialId, thicknessMm: m.defaultMm }]);
    setAddOpen(false);
  };

  const uText = result.uValue == null ? "—" : result.uValue.toFixed(3);
  const uGood = result.uValue != null && result.uValue <= 0.20;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Presets */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: white(0.4), textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Start from</span>
        {PRESETS[kind].map((p) => (
          <button key={p.label} onClick={() => onChange(p.layers.map((l) => ({ ...l })))}
            style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 99, cursor: "pointer",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${white(0.12)}`, color: white(0.7) }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Result */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 10,
        background: uGood ? "rgba(78,205,196,0.08)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${uGood ? "rgba(78,205,196,0.3)" : white(0.1)}` }}>
        <div>
          <div style={{ fontSize: 9.5, color: white(0.4), textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>U-value</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: uGood ? "#4ECDC4" : "#fff", lineHeight: 1.15 }}>
            {uText} <span style={{ fontSize: 11, fontWeight: 600, color: white(0.45) }}>W/m²·K</span>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: white(0.45), lineHeight: 1.6 }}>
          R<sub>tot</sub> = {result.rTotal.toFixed(2)} m²·K/W<br />
          R<sub>si</sub> {sr.rsi} + R<sub>se</sub> {sr.rse} ({sr.label.split("—")[1]?.trim()})
        </div>
        {result.framingApplied && (
          <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.35)", color: "#F59E0B" }}>
            framing correction applied
          </span>
        )}
      </div>

      {/* Resistance share bar */}
      {result.layers.length > 0 && result.rTotal > 0 && (
        <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: white(0.06) }}>
          {result.layers.map((l, i) => (
            <div key={i} title={`${l.label}: R=${l.r.toFixed(2)} (${Math.round(l.share * 100)}%)`}
              style={{ width: `${l.share * 100}%`, background: CAT_COLOR[MATERIAL_BY_ID[l.materialId]?.category ?? "board"] }} />
          ))}
        </div>
      )}

      {/* Layers, outside → inside as listed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {layers.length === 0 && (
          <p style={{ fontSize: 11, color: white(0.35), fontStyle: "italic" }}>No layers yet — start from a preset or add one below.</p>
        )}
        {layers.map((l, i) => {
          const m = MATERIAL_BY_ID[l.materialId];
          const r = result.layers[i];
          if (!m) return null;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "10px 1fr 92px 78px 54px", gap: 8, alignItems: "center",
              padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.07)}` }}>
              <span style={{ width: 6, height: 26, borderRadius: 3, background: CAT_COLOR[m.category] }} title={CAT_LABEL[m.category]} />
              <select value={l.materialId} onChange={(e) => setLayer(i, { materialId: e.target.value, thicknessMm: MATERIAL_BY_ID[e.target.value]?.defaultMm ?? l.thicknessMm })}
                style={{ background: "#11161d", color: "#fff", border: `1px solid ${white(0.12)}`, borderRadius: 6, padding: "4px 6px", fontSize: 11.5 }}>
                {(["insulation", "structure", "board", "cladding", "cavity"] as LayerCategory[]).map((cat) => (
                  <optgroup key={cat} label={CAT_LABEL[cat]} style={{ background: "#11161d" }}>
                    {LAYER_MATERIALS.filter((mm) => mm.category === cat).map((mm) => (
                      <option key={mm.id} value={mm.id} style={{ background: "#11161d", color: "#fff" }}>{mm.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" value={l.thicknessMm} min={m.minMm} max={m.maxMm}
                  disabled={m.category === "cavity"}
                  onChange={(e) => setLayer(i, { thicknessMm: Math.max(0, Number(e.target.value) || 0) })}
                  style={{ width: 56, background: "#11161d", color: "#fff", border: `1px solid ${white(0.12)}`,
                    borderRadius: 6, padding: "4px 6px", fontSize: 11.5, opacity: m.category === "cavity" ? 0.5 : 1 }} />
                <span style={{ fontSize: 10, color: white(0.35) }}>mm</span>
              </span>
              <span style={{ fontSize: 10.5, color: white(0.5) }} title={m.lambda == null ? "Fixed cavity resistance" : `λ = ${m.lambda} W/m·K`}>
                R {r ? r.r.toFixed(2) : "—"}
              </span>
              <span style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} title="Move out"
                  style={{ background: "transparent", border: 0, cursor: i === 0 ? "default" : "pointer", color: white(i === 0 ? 0.15 : 0.45), padding: 2 }}><ChevronUp size={12} /></button>
                <button onClick={() => move(i, 1)} disabled={i === layers.length - 1} title="Move in"
                  style={{ background: "transparent", border: 0, cursor: i === layers.length - 1 ? "default" : "pointer", color: white(i === layers.length - 1 ? 0.15 : 0.45), padding: 2 }}><ChevronDown size={12} /></button>
                <button onClick={() => remove(i)} title="Remove layer"
                  style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(239,68,68,0.7)", padding: 2 }}><Trash2 size={12} /></button>
              </span>
            </div>
          );
        })}
      </div>

      {/* Add layer */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setAddOpen((o) => !o)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 11px",
            borderRadius: 8, cursor: "pointer", background: "rgba(114,28,184,0.18)", border: "1px solid rgba(114,28,184,0.45)", color: "#D9C3F2" }}>
          <Plus size={12} /> Add layer
        </button>
        {addOpen && (
          <div style={{ position: "absolute", zIndex: 40, marginTop: 4, width: 260, maxHeight: 260, overflowY: "auto",
            background: "#11161d", border: `1px solid ${white(0.14)}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            {(["insulation", "structure", "board", "cladding", "cavity"] as LayerCategory[]).map((cat) => (
              <div key={cat}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                  color: CAT_COLOR[cat], padding: "6px 10px 2px" }}>{CAT_LABEL[cat]}</div>
                {LAYER_MATERIALS.filter((m) => m.category === cat).map((m) => (
                  <button key={m.id} onClick={() => add(m.id)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", fontSize: 11.5,
                      background: "transparent", border: 0, cursor: "pointer", color: white(0.8) }}>
                    {m.label}
                    <span style={{ color: white(0.35), fontSize: 10 }}>
                      {m.lambda != null ? `  λ ${m.lambda}` : "  R 0.18"}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {result.warnings.map((w) => (
        <div key={w} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: "#F59E0B" }}>
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />{w}
        </div>
      ))}

      <p style={{ fontSize: 10, color: white(0.3), lineHeight: 1.6 }}>
        U = 1 / (R<sub>si</sub> + R<sub>se</sub> + Σ d/λ) per EN ISO 6946; design λ from EN ISO 10456 / Swedish BBR.
        Framed layers use the ISO 6946 parallel-path correction, so studs bridging the insulation raise U realistically.
      </p>
    </div>
  );
}
