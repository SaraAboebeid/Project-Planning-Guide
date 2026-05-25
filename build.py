"""
build.py — assemble assets/gothenburg_3d.html from viewer/ source files + data pipeline.

Usage:
    python build.py

Steps:
    1. Runs data_pipeline.process_data()  (~2 min)
    2. Reads  viewer/styles/main.css
    3. Reads  viewer/index.html
    4. Reads  viewer/js/*.js  (in order)
    5. Injects CSS + data constants + JS into HTML template
    6. Writes assets/gothenburg_3d.html   (~58 MB)
    7. Writes assets/buildings.json
    8. Copies buildings.json -> frontend/public/buildings.json
"""

import os
import json
import shutil
from data_pipeline import process_data

# ---------------------------------------------------------------------------
# JS constants written directly (not from data pipeline)
# These are static lookup tables that mirror the Python USE_LABELS / ECLASS_LABELS dicts
# ---------------------------------------------------------------------------
_USE_LABELS_JS_ENTRIES = """\
  bostad_enfamilj:   'Single-family residential',
  bostad_flerfamilj: 'Multi-family residential',
  verksamhet:        'Commercial / Workplace',
  industri:          'Industrial',
  samhalle:          'Public / School / Care',
  komplement:        'Complement (garage/shed)',
  ovrigt:            'Other / Unknown',"""

_ECLASS_LABELS_JS_ENTRIES = """\
  A:'A \u2013 Very efficient', B:'B \u2013 Efficient', C:'C \u2013 Above average',
  D:'D \u2013 Average', E:'E \u2013 Below average', F:'F \u2013 Poor', G:'G \u2013 Very poor',"""

_PERIOD_LABELS_JS_ENTRIES = """\
  '...1960':'Pre-1960','1961-1975':'1961\u20131975','1976-1985':'1976\u20131985',
  '1986-1995':'1986\u20131995','1996-2005':'1996\u20132005','post-2005':'Post-2005',"""

_USE_CSS_JS_ENTRIES = """\
  bostad_enfamilj:'rgb(255,165,50)',   bostad_flerfamilj:'rgb(255,210,60)',
  verksamhet:'rgb(70,180,255)',         industri:'rgb(200,80,60)',
  samhalle:'rgb(70,210,140)',           komplement:'rgb(140,140,160)',
  ovrigt:'rgb(160,120,200)',"""

_ECLASS_CSS_JS_ENTRIES = """\
  A:'rgb(22,163,74)',   B:'rgb(74,222,128)',  C:'rgb(190,242,60)',
  D:'rgb(250,204,21)',  E:'rgb(251,146,60)',  F:'rgb(239,68,68)',
  G:'rgb(153,27,27)',"""

_PERIOD_CSS_JS_ENTRIES = """\
  '...1960':'rgb(100,149,237)', '1961-1975':'rgb(255,165,50)',
  '1976-1985':'rgb(154,205,50)','1986-1995':'rgb(218,165,32)',
  '1996-2005':'rgb(255,99,71)', 'post-2005':'rgb(147,112,219)',"""


def _sanitize_records(obj):
    """Replace NaN/Inf with None so json.dumps produces strictly valid JSON."""
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_records(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_records(v) for v in obj]
    return obj


def main():
    # 1. Data pipeline ──────────────────────────────────────────────────────
    print("=" * 60)
    print("build.py: running data pipeline ...")
    data = process_data()

    # 2. Read viewer source files ───────────────────────────────────────────
    print("Reading viewer/ source files ...")
    css  = open("viewer/styles/main.css",  encoding="utf-8").read()
    html = open("viewer/index.html",       encoding="utf-8").read()

    js_files = [
        "legend.js",
        "cesium.js",
        "ui.js",
        "pvgis.js",
        "facade_inspector.js",
        "search.js",
        "roads.js",
        "vasttrafik.js",
        "layers.js",
    ]
    all_js = "\n\n".join(
        open(f"viewer/js/{f}", encoding="utf-8").read()
        for f in js_files
    )

    # 3. Build data script ─────────────────────────────────────────────────
    # Note: double braces {{ }} in the f-string below are literal { } in the output JS
    data_script = (
        f"const DATA = {data['records_json']};\n"
        f"const PERIOD_CARDS  = {data['period_cards_js']};\n"
        f"const ECLASS_CARDS  = {data['eclass_cards_js']};\n"
        f"const USE_CARDS     = {data['use_cards_js']};\n"
        f"const PERIOD_STATS  = {data['period_stats_js']};\n"
        f"const MAP_CENTER = {{lon: {data['cx']:.6f}, lat: {data['cy']:.6f}}};\n"
    )

    # 4. Assemble HTML ──────────────────────────────────────────────────────
    print("Assembling HTML ...")
    html = html.replace("/* INJECT:CSS */",    css)
    html = html.replace("<!-- INJECT:DATA -->",
                        f"<script>\n{data_script}\n</script>")
    html = html.replace("<!-- INJECT:JS -->",
                        f"<script>\n{all_js}\n</script>")

    # Replace template placeholders (double braces in viewer/index.html)
    html = html.replace("{{TOTAL_BUILDINGS}}", f"{data['n_total']:,}")
    html = html.replace("{{N_EPC_MATCHED}}",   f"{data['n_epc_matched']:,}")
    html = html.replace("{{N_ECLASS_TOTAL}}",  f"{data['n_eclass_total']:,}")

    # 5. Write assets/ ──────────────────────────────────────────────────────
    os.makedirs("assets", exist_ok=True)
    out_html = "assets/gothenburg_3d.html"
    print(f"Writing {out_html} ...")
    with open(out_html, "w", encoding="utf-8", errors="replace") as f:
        f.write(html)
    size_mb = os.path.getsize(out_html) / 1e6
    print(f"  {out_html}: {size_mb:.1f} MB")

    # Write buildings.json (used by backend /api/buildings and frontend)
    clean_records = _sanitize_records(data["records"])
    buildings_json_str = json.dumps(clean_records, ensure_ascii=False)
    with open("assets/buildings.json", "w", encoding="utf-8") as f:
        f.write(buildings_json_str)
    print(f"  assets/buildings.json: {len(data['records']):,} buildings")

    # Copy to frontend/public/ if the folder exists
    fp = "frontend/public/buildings.json"
    if os.path.isdir("frontend/public"):
        shutil.copy("assets/buildings.json", fp)
        print(f"  Copied -> {fp}")

    # 6. Build kepler.gl map (optional – skipped if template not downloaded yet)

    print("=" * 60)
    print(f"Done.  Open http://localhost:8765 after running: python launch.py")


if __name__ == "__main__":
    main()
