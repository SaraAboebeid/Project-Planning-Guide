/**
 * Central semantic colour tokens — colourblind-tuned (2026-08).
 *
 * The three status hues were deliberately pulled apart so they no longer
 * converge under red-green colour-vision deficiency (deuteranopia / protanopia,
 * ~8% of men):
 *   - "good" gained blue (yellow-green → bluish-green) so it separates from the
 *     warning hue, which shifted amber → orange;
 *   - "bad" deepened slightly for a clearer lightness gap against "good".
 * Brand purple and the selected-state teal are unchanged (product identity).
 *
 * RULE: colour is never the only signal. Every good/bad/warn usage MUST also
 * carry a non-colour cue — an icon, an arrow (▲▼), a +/− sign, or a word
 * ("worse", "failed") — per WCAG 1.4.1. These tokens make the hue consistent;
 * the redundant cue makes the meaning survive when the hue doesn't.
 *
 * Existing inline hex/rgba across the app was retuned to match these values;
 * new code should import from here so the palette stays changeable in one place.
 */
export const C = {
  good:      "#2FB477", // savings · "better than baseline" · success · recommended
  bad:       "#E2483B", // error · "worse than baseline" · failed
  warn:      "#E8880C", // warning · provisional data · running
  info:      "#4A90E2", // neutral info · UK accent
  selected:  "#4ECDC4", // active / selected state (brand teal) — unchanged
  brand:     "#5A1790", // primary purple — unchanged
  brandLite: "#B98BE8", // light purple accent — unchanged
} as const;

export type SemanticColor = keyof typeof C;

/** rgba() tint from a hex token, e.g. tint(C.good, 0.14) → "rgba(47,180,119,0.14)". */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
