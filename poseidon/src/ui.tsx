/* Small shared display helpers. */
import { locale } from "./i18n";

/** Energy-class colours (A green → G red), the usual Swedish certificate scale. */
export const EPC_COLORS: Record<string, string> = {
  A: "#008000", B: "#3a9a00", C: "#8cb400", D: "#c8b400", E: "#e08a00", F: "#d04a00", G: "#c00000",
};

export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "–" : new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export function EpcChip({ cls }: { cls: string | null | undefined }) {
  if (!cls) return <span className="muted">–</span>;
  return <span className="epc" style={{ background: EPC_COLORS[cls] ?? "#808080" }}>{cls}</span>;
}
