---
description: UI/UX design for this dashboard's React frontend — dark-theme design tokens, the real colour palette, component patterns, chart styling and the known styling traps. Use when building or restyling any page, panel, modal, form control, table or chart in frontend/, or when the user mentions layout, colours, styling, spacing, or "make it look better".
when_to_use: styling a page, adding a panel/card/modal, picking colours, form inputs and dropdowns, tables, charts, wizard steps, responsive layout, accessibility
---

# UI/UX design — Project Planning Guide

React 19 + Vite. Charts use **recharts**, icons **lucide-react**, maps **react-leaflet**, routing **react-router-dom**. Tailwind v4 is installed but **most newer pages use inline `style={{}}` objects** — match the file you're editing rather than converting it.

## The palette (verified — do not guess)

The Tailwind tokens are misleadingly named. **`bg-teal` and `bg-navy` are actually purples.**

| Purpose | Hex | Notes |
|---|---|---|
| Primary purple | `#721CB8` | the "navy" token |
| Light purple | `#B98BE8` / `#9B7FD4` | accents, links |
| **Teal (the real one)** | `#4ECDC4` | **selected/active states** |
| Green | `#96D74C` | success, savings, "good" |
| Amber | `#F59E0B` | warnings, provisional data |
| Red | `#EF4444` | errors, failures |
| Blue | `#4A90E2` | info, UK accent |

**Selected/active states are unified to `#4ECDC4`.** Don't reintroduce per-component selection colours.

## Dark-theme surfaces

```js
background: "rgba(255,255,255,0.03)"      // card
border: "1px solid rgba(255,255,255,0.08)" // card border
color: "rgba(255,255,255,0.85)"            // body text
color: "rgba(255,255,255,0.45)"            // secondary text
background: "#0d1117"                      // modal / tooltip
background: "#11161d"                      // dropdown / popover
```

Helper used throughout: `const white = (o: number) => \`rgba(255,255,255,${o})\``.

Typography runs small and bold: 10–14px, `fontWeight` 700–800 for headings, 600 for labels. Border radius 8–14px.

## Known traps

1. **Native `<select>` goes invisible in dark mode.** The browser themes the trigger dark but the option popup light, so white text lands on white. Always set explicit colours on the select **and every `<option>`**:
   ```jsx
   <select style={{ backgroundColor: "#11161d", color: "#fff" }}>
     <option style={{ backgroundColor: "#11161d", color: "#fff" }}>…</option>
   ```
2. **Cards on the wizard's Step 1** use Tailwind classes (`Card`, `Label` components in `DefineProject/`), while Step 3/4 use inline styles. Follow the local file.
3. Wide content (tables, charts) must scroll in its own `overflow-x: auto` container — never let the page scroll sideways.

## Charts (recharts)

- Set `isAnimationActive={false}` when you drive your own animation, or you get double-animation.
- Custom point colours: use a `shape` render function reading `payload`, not thousands of `<Cell>` elements.
- Fix axis `domain` from the full dataset so the view doesn't jump while animating.
- Grid stroke `rgba(255,255,255,0.06)`, ticks `rgba(255,255,255,0.45)` at 10px.
- See `components/ParetoChart.tsx` for the established pattern (viridis colour scale, colourbar legend, tooltip on `#0d1117`).

## Before you finish

Typecheck must stay at the **60-error baseline** (all pre-existing):

```bash
cd frontend && cat > tsconfig.check.json <<'EOF'
{ "extends": "./tsconfig.json", "compilerOptions": { "ignoreDeprecations": "5.0", "noEmit": true } }
EOF
npx tsc -p tsconfig.check.json --noEmit 2>&1 | grep -c "error TS"; rm -f tsconfig.check.json
```

If the count is 60, you added none. Anything higher is yours to fix.

## Design judgement

State the number *and* its meaning (`153 kWh/m²/yr` + `−18% vs baseline`). Never encode meaning in colour alone — pair it with a label or icon. Show unavailable data as an explicit "—" or "not available", never a fabricated zero.
