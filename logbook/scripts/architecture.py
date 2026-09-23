"""The architecture diagram on the logbook's Tool overview.

One landscape diagram: a step rail across the top, six LETTERED stages (A-F)
flowing left to right, and every external service banded underneath with whether
it needs an API key and whether that key is free or billed.

The stages are lettered on purpose. The rail already numbers the five wizard
steps, and when the stages were numbered too, "3 · Analysis & AI" read as though
it belonged to step 3. They are different axes: the steps are what the user does,
the stages are how a request flows through the system, and every step uses
several stages.

Drawn as inline SVG rather than an image so it (a) follows bright and dark mode
through the same --lb-* variables as the rest of the logbook, (b) stays
selectable, searchable text, and (c) is edited by changing the data below — the
layout, wrapping and column heights are all computed from it.

Every item is stated from what the logbook already documents:
  * services, keys and failure behaviour  → 14. Services, Keys & Access
  * the analyses and where each one runs  → 13. Analysis Inventory
  * the EPSM round trip                   → 6. Energy Simulation — EPSM & IDF
  * the five wizard steps                 → frontend/src/store/wizard.ts

KEY TIERS. "No key" and "needs a key" are read from the repository. Whether a
key is free or paid is NOT recorded there — it is this diagram's own reading of
each provider's terms, so it is labelled as such, and kept to the clear cases:
the AI providers and Street View are metered and billed; the public-sector and
map keys are free registrations.
"""
from __future__ import annotations

import html

# ── colour families ──────────────────────────────────────────────────────────
# Each family maps to a token already in the logbook's palette. Every family
# also carries a symbol: colour is never the only signal.
FAM = {
    "input":  ("info",   ""),    # what comes in
    "build":  ("info",   ""),    # offline pipeline
    "ai":     ("accent", ""),    # analysis and AI
    "core":   ("brand",  ""),    # backend orchestration and our services
    "data":   ("muted",  "▣"),   # stores
    "out":    ("good",   ""),    # deliverables
    "nokey":  ("teal",   "○"),   # external, callable with no credential
    "free":   ("info",   "◐"),   # external, key is a free registration
    "paid":   ("warn",   "●"),   # external, key is metered and billed
}

LEGEND = [
    ("input", "Input / pipeline"),
    ("ai",    "Analysis & AI"),
    ("core",  "Backend & our services"),
    ("data",  "Data store"),
    ("out",   "Output"),
    ("nokey", "External — no key"),
    ("free",  "External — key, free"),
    ("paid",  "External — key, paid"),
]

# ── the five renovation steps ────────────────────────────────────────────────
STEPS = [
    ("1", "Define Project"),
    ("2", "Building Data & Prioritisation"),
    ("3", "Select & Baseline"),
    ("4", "Renovation Calculator"),
    ("5", "Report"),
]

# ── the columns ──────────────────────────────────────────────────────────────
# card = (label, sub, family). A ("§", heading, None) row is a group heading.
def G(text):
    return ("§", text, None)


COLUMNS = [
    {
        "num": "A", "title": "Inputs", "sub": "What the user gives, and the open data behind it",
        "fam": "input", "w": 246,
        "cards": [
            G("From the user"),
            ("Address or area", "Step 1", "input"),
            ("Façade photo", "Step 2", "input"),
            ("Materials & packages", "Step 4", "input"),
            G("Open data, downloaded once"),
            ("EUBUCCO", "Swedish footprints", "nokey"),
            ("Boverket energideklarationer", "energy certificates", "nokey"),
            ("Lantmäteriet footprints", "inside the EPC database", "nokey"),
            ("TABULA / EPISCOPE", "archetypes", "nokey"),
            ("DTCC LiDAR", "terrain & vegetation", "nokey"),
            ("Climate.OneBuilding", "EPW weather", "nokey"),
            ("OpenStreetMap", "UK footprints & streets", "nokey"),
            ("English Housing Survey", "UK band estimates", "nokey"),
            ("Wikells Sektionsfakta", "construction costs", "nokey"),
            ("UK EPC register", "bearer token", "free"),
            G("Scraped on a schedule"),
            ("Boplats", "rents · daily", "nokey"),
            ("Booli", "sales · weekly", "nokey"),
        ],
    },
    {
        "num": "B", "title": "Ingestion & pipeline", "sub": "Offline — none of this runs while the tool is in use",
        "fam": "build", "w": 246,
        "cards": [
            G("Build scripts"),
            ("data_pipeline.py", "the Sweden build", "build"),
            ("tools/uk/", "ingest · UPRN anchor · validate", "build"),
            ("tools/idf/generate_idf.py", "one shoebox IDF per building", "build"),
            ("boplats_scraper.py", "booli_scraper.py", "build"),
            G("What it resolves"),
            ("EPC ↔ footprint matching", "geometric overlap (SE)", "build"),
            ("Address matching", "UK", "build"),
            ("TABULA archetype lookup", "period × building type", "build"),
            ("District tagging", "primärområde", "build"),
        ],
    },
    {
        "num": "C", "title": "Analysis & AI", "sub": "Seventeen analyses — some on the backend, some in the browser",
        "fam": "ai", "w": 296,
        "cards": [
            G("Building energy & cost"),
            ("EnergyPlus simulation", "via EPSM — shoebox, full year", "ai"),
            ("Pareto optimiser", "cost · carbon · energy", "ai"),
            ("Life-cycle assessment", "embodied + operational", "ai"),
            ("Heating-system comparison", "SPF, LCC over 30 yr", "ai"),
            ("Rooftop PV yield", "PVGIS", "nokey"),
            G("Environmental"),
            ("Sun hours", "sun position + shadow test", "ai"),
            ("Incident radiation", "cumulative sky, 145 patches", "ai"),
            ("Thermal comfort", "UTCI + SolarCal", "ai"),
            G("Urban"),
            ("Space-syntax centrality", "street network", "ai"),
            ("Green index · heat-island proxy", "in the browser", "ai"),
            G("Decision support"),
            ("Retrofit prioritisation", "MCDA, AHP weights — Step 2", "ai"),
            ("Decision under uncertainty", "minimax regret — Step 4", "ai"),
            G("AI & vision"),
            ("Data assistant", "tool-calling LLM", "paid"),
            ("Window-to-wall ratio", "vision model", "paid"),
            ("Façade defect detection", "own ML service", "core"),
        ],
    },
    {
        "num": "D", "title": "The engine room", "sub": "One server does all the work. The browser only ever talks to it, so API keys never leave it",
        "fam": "core", "w": 300,
        # Plain language first, the technical name underneath: a reader who does
        # not work on the code can follow the column, and one who does can still
        # find the route.
        "cards": [
            G("What it does"),
            ("Runs the energy simulations", "/api/simulation-*", "core"),
            ("Finds the best renovation packages", "/api/optimize", "core"),
            ("Works out sun, daylight and comfort", "/api/analysis/*", "core"),
            ("Analyses streets and green space", "/api/urban/*", "core"),
            ("Answers questions, reads façade photos", "/api/chat · /api/estimate-wwr", "core"),
            ("Spots defects in a façade photo", "/api/facade-detect", "core"),
            ("Looks up carbon factors and statistics", "/api/boverket · /api/scb", "core"),
            ("Checks today's electricity price", "/api/energy-price", "core"),
            ("Finds addresses and streets", "/api/geocode · /api/osm", "core"),
            ("Reports what is working right now", "/api/health · /api/status", "core"),
            ("Sets up the 3D map", "/api/viewer-config", "core"),
            G("Services we run ourselves"),
            ("Energy simulation service", "EPSM, port 8010", "core"),
            ("EnergyPlus itself", "one run per building", "core"),
            ("Façade defect detector", "our own model, port 8020", "core"),
            ("This logbook", "port 8501", "core"),
        ],
    },
    {
        "num": "E", "title": "Data layer", "sub": "Files that behave like services — and fail like them",
        "fam": "data", "w": 250,
        "cards": [
            G("Served payloads"),
            ("buildings.json", "Sweden — 92,973", "data"),
            ("uk/buildings_<district>.json", "UK — 22,203", "data"),
            ("boplats_data.json · booli_data.json", "market data", "data"),
            G("Databases"),
            ("epc_sweden.duckdb", "461 MB — certificates", "data"),
            ("simulation_database.sqlite3", "1.95 GB — stored runs", "data"),
            ("data/epw/", "weather files", "data"),
            G("Reuse"),
            ("Runs found within 25 m", "why the wizard feels instant", "data"),
        ],
    },
    {
        "num": "F", "title": "Outputs", "sub": "What the tool leaves behind",
        "fam": "out", "w": 238,
        "cards": [
            G("For the user"),
            ("Renovation report", "Step 5", "out"),
            ("Pareto front & chosen package", "", "out"),
            ("Energy class before / after", "", "out"),
            ("Cost, carbon & LCC per option", "", "out"),
            ("Retrofit priority ranking", "top-N buildings", "out"),
            ("Heating-system recommendation", "", "out"),
            G("Kept by the tool"),
            ("Stored simulation runs", "reused, not re-run", "data"),
            ("Logbook exports", "Markdown & zip", "data"),
        ],
    },
]

# ── the external band ────────────────────────────────────────────────────────
EXTERNAL = [
    ("nokey", "No key needed", [
        ("Nominatim · Overpass", "OpenStreetMap"),
        ("PVGIS", "EC Joint Research Centre"),
        ("elprisetjustnu.se", "Nord Pool spot price"),
        ("Octopus Agile", "UK electricity price"),
        ("Boverket klimatdatabas", "carbon factors"),
        ("Statistics Sweden (SCB)", "income by area"),
        ("Esri ArcGIS", "basemaps"),
        ("SCB map service", "viewer layers"),
        ("jsDelivr CDN", "CesiumJS 1.143"),
    ]),
    ("free", "Key — free registration", [
        ("Västtrafik", "OAuth2 id + secret"),
        ("Trafikverket", "API key"),
        ("CARTO", "sharper basemaps"),
        ("UK EPC register", "bearer token"),
        ("Cesium ion", "3D tiles token"),
    ]),
    ("paid", "Key — paid & metered", [
        ("OpenAI", "chat · WWR · vision"),
        ("Anthropic", "tried first for vision"),
        ("Google Street View", "façade capture"),
        ("SMTP provider", "scraper failure alerts"),
    ]),
]

# ── layout constants ─────────────────────────────────────────────────────────
MARGIN = 16
COL_GAP = 20
COL_PAD = 12
HEAD_H = 134          # title block, including the colour key row
RAIL_H = 74           # the five-step rail + the "stages, not steps" caption
COL_HEAD_H = 40       # number + title + subtitle inside a column
CARD_GAP = 6
GROUP_TOP = 11
GROUP_H = 15
LINE_H = 12.5
CHAR_W = 6.0          # Inter at 10.5px
SUB_CHAR_W = 5.35     # Inter at 9.3px


def _esc(s):
    return html.escape(str(s), quote=True)


def _var(fam, part="fg"):
    token = FAM[fam][0]
    if part == "fg":
        return f"var(--lb-{token})"
    return f"var(--lb-chip-{token})"


def _wrap(text, max_chars):
    """Greedy word wrap. Long single tokens (paths) are left to overflow their
    line rather than broken, because a broken path is unreadable."""
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if len(trial) <= max_chars or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _card_h(label, sub, inner_w):
    lines = _wrap(label, max(8, int((inner_w - 20) / CHAR_W)))
    h = 9 + len(lines) * LINE_H + 8
    if sub:
        h += len(_wrap(sub, max(8, int((inner_w - 20) / SUB_CHAR_W)))) * 11
    return h, lines


def _card_svg(x, y, w, label, sub, fam):
    h, lines = _card_h(label, sub, w)
    symbol = FAM[fam][1]
    out = [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" '
           f'fill="{_var(fam, "bg")}" stroke="{_var(fam)}" stroke-width="1"/>']
    tx = x + (20 if symbol else 9)
    ty = y + 9 + LINE_H - 3
    if symbol:
        out.append(f'<text x="{x + 8:.1f}" y="{ty:.1f}" font-size="9" '
                   f'fill="{_var(fam)}" font-weight="700">{symbol}</text>')
    for i, ln in enumerate(lines):
        out.append(f'<text x="{tx:.1f}" y="{ty + i * LINE_H:.1f}" font-size="10.5" '
                   f'font-weight="600" fill="var(--lb-txt)">{_esc(ln)}</text>')
    if sub:
        sy = ty + len(lines) * LINE_H + 1
        for i, ln in enumerate(_wrap(sub, max(8, int((w - 20) / SUB_CHAR_W)))):
            out.append(f'<text x="{tx:.1f}" y="{sy + i * 11:.1f}" font-size="9.3" '
                       f'fill="var(--lb-dim)">{_esc(ln)}</text>')
    return "".join(out), h


def _column_svg(col, x, y):
    """Returns (svg, height). Cards stack; the panel wraps them."""
    inner_x = x + COL_PAD
    inner_w = col["w"] - 2 * COL_PAD
    # The head grows with the subtitle: a fixed height let a two-line subtitle
    # run into the first group heading.
    sub_lines = _wrap(col["sub"], int(inner_w / 5.2))[:3]
    head_h = 26 + len(sub_lines) * 10 + 8
    parts, cy = [], y + head_h

    for label, sub, fam in col["cards"]:
        if label == "§":
            cy += GROUP_TOP
            parts.append(
                f'<text x="{inner_x:.1f}" y="{cy:.1f}" font-size="8.6" font-weight="800" '
                f'letter-spacing="1" fill="var(--lb-dim)">{_esc(sub.upper())}</text>')
            cy += GROUP_H - 4
            continue
        svg, h = _card_svg(inner_x, cy, inner_w, label, sub, fam)
        parts.append(svg)
        cy += h + CARD_GAP

    h = (cy - y) + COL_PAD - CARD_GAP
    head = [
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{col["w"]}" height="{h:.1f}" rx="14" '
        f'fill="{_var(col["fam"], "bg")}" stroke="{_var(col["fam"])}" '
        f'stroke-width="1.2" stroke-opacity="0.55"/>',
        f'<text x="{inner_x:.1f}" y="{y + 20:.1f}" font-size="13" font-weight="800" '
        f'fill="var(--lb-heading)">{col["num"]} · {_esc(col["title"])}</text>',
    ]
    for i, ln in enumerate(sub_lines):
        head.append(f'<text x="{inner_x:.1f}" y="{y + 32 + i * 10:.1f}" font-size="9" '
                    f'fill="var(--lb-dim)">{_esc(ln)}</text>')
    return "".join(head + parts), h


def build_svg() -> str:
    widths = [c["w"] for c in COLUMNS]
    W = MARGIN * 2 + sum(widths) + COL_GAP * (len(widths) - 1)
    body = []

    # ── header ───────────────────────────────────────────────────────────────
    body.append(
        f'<text x="{MARGIN}" y="30" font-size="21" font-weight="900" '
        f'fill="var(--lb-heading)">Renovation Planner — how it fits together</text>')
    body.append(
        f'<text x="{MARGIN}" y="49" font-size="11.5" fill="var(--lb-dim)">'
        f'Inputs on the left, outputs on the right, every external service and its '
        f'API key underneath.</text>')

    # ── colour key ───────────────────────────────────────────────────────────
    # On its own row under the title, not tucked into the far top-right corner:
    # on a diagram this wide that corner is off-screen at normal scroll, so the
    # key was invisible exactly when someone needed it. Each swatch is drawn with
    # the same fill, border and symbol as the cards it explains.
    ky = 72
    body.append(f'<text x="{MARGIN}" y="{ky + 10:.1f}" font-size="9" font-weight="800" '
                f'letter-spacing="1.2" fill="var(--lb-accent)">COLOUR KEY</text>')
    kx = MARGIN + 102
    for fam, text in LEGEND:
        sym = FAM[fam][1]
        w = 16 + (11 if sym else 0) + len(text) * 5.6
        body.append(f'<rect x="{kx:.1f}" y="{ky - 4:.1f}" width="{w:.1f}" height="20" rx="7" '
                    f'fill="{_var(fam, "bg")}" stroke="{_var(fam)}" stroke-width="1"/>')
        tx = kx + 8
        if sym:
            body.append(f'<text x="{tx:.1f}" y="{ky + 10:.1f}" font-size="9" '
                        f'fill="{_var(fam)}" font-weight="700">{sym}</text>')
            tx += 11
        body.append(f'<text x="{tx:.1f}" y="{ky + 10:.1f}" font-size="9.5" '
                    f'fill="var(--lb-txt)">{_esc(text)}</text>')
        kx += w + 9

    # ── the five steps ───────────────────────────────────────────────────────
    ry = HEAD_H - 24
    body.append(f'<text x="{MARGIN}" y="{ry + 6:.1f}" font-size="9" font-weight="800" '
                f'letter-spacing="1.2" fill="var(--lb-accent)">THE FIVE STEPS</text>')
    body.append(f'<text x="{MARGIN}" y="{ry + 17:.1f}" font-size="8.6" '
                f'fill="var(--lb-dim)">what the user does</text>')
    sx = MARGIN + 102
    avail = W - MARGIN - sx
    step_w = (avail - 26 * (len(STEPS) - 1)) / len(STEPS)
    for i, (num, label) in enumerate(STEPS):
        x = sx + i * (step_w + 26)
        body.append(
            f'<rect x="{x:.1f}" y="{ry - 6:.1f}" width="{step_w:.1f}" height="28" rx="14" '
            f'fill="var(--lb-chip-accent)" stroke="var(--lb-accent)" stroke-width="1"/>')
        body.append(f'<text x="{x + 13:.1f}" y="{ry + 12:.1f}" font-size="10.5" '
                    f'font-weight="800" fill="var(--lb-accent)">{num}</text>')
        body.append(f'<text x="{x + 26:.1f}" y="{ry + 12:.1f}" font-size="10.5" '
                    f'font-weight="600" fill="var(--lb-txt)">{_esc(label)}</text>')
        if i < len(STEPS) - 1:
            ax = x + step_w + 5
            body.append(f'<line x1="{ax:.1f}" y1="{ry + 8:.1f}" x2="{ax + 14:.1f}" '
                        f'y2="{ry + 8:.1f}" stroke="var(--lb-accent)" stroke-width="1.4" '
                        f'marker-end="url(#lb-arrow)"/>')

    # ── columns ──────────────────────────────────────────────────────────────
    top = HEAD_H + RAIL_H - 22
    # The stages are lettered, not numbered, because the rail above already owns
    # the numbers 1-5: two numbered sequences on one diagram read as if stage 3
    # were step 3, and they are different axes entirely.
    body.append(f'<text x="{MARGIN}" y="{top - 16:.1f}" font-size="9" font-weight="800" '
                f'letter-spacing="1.2" fill="var(--lb-heading)">HOW IT RUNS — STAGES A to F</text>')
    body.append(f'<text x="{MARGIN + 176:.1f}" y="{top - 16:.1f}" font-size="9" '
                f'fill="var(--lb-dim)">not the five steps above — every step draws on '
                f'several of these stages</text>')
    x, heights, xs = MARGIN, [], []
    for col in COLUMNS:
        svg, h = _column_svg(col, x, top)
        body.append(svg)
        heights.append(h)
        xs.append(x)
        x += col["w"] + COL_GAP

    col_bottom = top + max(heights)

    # flow arrows between columns, at a constant height
    ay = top + 20
    for i in range(len(COLUMNS) - 1):
        ax = xs[i] + COLUMNS[i]["w"] + 3
        body.append(f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{ax + COL_GAP - 7:.1f}" '
                    f'y2="{ay:.1f}" stroke="var(--lb-accent)" stroke-width="1.6" '
                    f'marker-end="url(#lb-arrow)"/>')

    # ── external band ────────────────────────────────────────────────────────
    band_top = col_bottom + 42
    bx = MARGIN + COL_PAD
    inner_w = W - 2 * MARGIN - 2 * COL_PAD
    parts, cy = [], band_top + 58   # clears the band's own title and note
    card_w, gap = 196, 8
    per_row = max(1, int((inner_w + gap) // (card_w + gap)))

    for fam, heading, items in EXTERNAL:
        parts.append(f'<text x="{bx:.1f}" y="{cy:.1f}" font-size="9.4" font-weight="800" '
                     f'letter-spacing="1" fill="{_var(fam)}">'
                     f'{FAM[fam][1]}  {_esc(heading.upper())}</text>')
        cy += 12
        row_h = 0
        for i, (label, sub) in enumerate(items):
            r, c = divmod(i, per_row)
            if c == 0 and r:
                cy += row_h + gap
                row_h = 0
            svg, h = _card_svg(bx + c * (card_w + gap), cy, card_w, label, sub, fam)
            parts.append(svg)
            row_h = max(row_h, h)
        cy += row_h + 13

    band_h = cy - band_top
    body.append(
        f'<rect x="{MARGIN}" y="{band_top:.1f}" width="{W - 2 * MARGIN}" '
        f'height="{band_h:.1f}" rx="14" fill="var(--lb-chip-warn)" '
        f'stroke="var(--lb-warn)" stroke-width="1.2" stroke-opacity="0.55"/>')
    body.append(
        f'<text x="{bx:.1f}" y="{band_top + 22:.1f}" font-size="13" font-weight="800" '
        f'fill="var(--lb-warn)">External services — and which need an API key</text>')
    body.append(
        f'<text x="{bx:.1f}" y="{band_top + 35:.1f}" font-size="9.4" fill="var(--lb-dim)">'
        f'Called from the backend or a pipeline script, so keys never reach the browser. '
        f'Nothing here fails hard — each degrades in its own documented way.</text>')
    body += parts

    # dashed risers from the band into the columns that call out
    for i in (1, 2, 3):
        cx = xs[i] + COLUMNS[i]["w"] / 2
        body.append(
            f'<line x1="{cx:.1f}" y1="{band_top - 4:.1f}" x2="{cx:.1f}" '
            f'y2="{col_bottom + 6:.1f}" stroke="var(--lb-warn)" stroke-width="1.3" '
            f'stroke-dasharray="4 4" marker-end="url(#lb-arrow-warn)"/>')

    H = band_top + band_h + MARGIN

    return (
        f'<svg viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}" '
        f'xmlns="http://www.w3.org/2000/svg" '
        f'font-family="Inter, system-ui, sans-serif" role="img" '
        f'aria-label="Architecture of the Renovation Planner: the five wizard steps, '
        f'then six lettered stages A to F — inputs, ingestion pipeline, analysis and '
        f'AI, backend orchestration, data layer and outputs — with every external '
        f'service and its API key tier. The stages are not the steps; each step uses '
        f'several stages.">'
        f'<defs>'
        f'<marker id="lb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" '
        f'markerHeight="5" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--lb-accent)"/></marker>'
        f'<marker id="lb-arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" '
        f'markerHeight="5" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--lb-warn)"/></marker>'
        f'</defs>' + "".join(body) + "</svg>"
    )
