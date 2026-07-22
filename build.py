"""
build.py — assemble the 3D viewers from viewer/ source files + data pipelines.

Usage:
    python build.py            # both countries
    python build.py --se       # Sweden only (skips the ~2 min data pipeline for UK)
    python build.py --uk       # UK only (skips the ~2 min Swedish data pipeline)

Both viewers are assembled from the SAME viewer/index.html + viewer/js/ sources.
Everything country-specific lives in a VIEWER_PROFILE constant written into that
country's meta script: the cities, the camera, the data payload, the construction
eras. bootstrap.js reads the profile at load time, so there is exactly one Cesium
codebase serving Gothenburg and the UK.

Steps:
    1. Runs data_pipeline.process_data()  (~2 min, Sweden)
    2. Reads  viewer/styles/main.css + viewer/index.html
    3. Copies viewer/js/*.js -> assets/viewer/js/
    4. Writes <country>_3d.meta.js with the profile + shared constants
    5. Writes assets/<country>_3d.html
    6. Writes assets/buildings.json -> frontend/public/buildings.json

UK building payloads are produced separately by tools/uk/uk_data_pipeline.py; this
script only reads frontend/public/uk/cities.json to learn what exists.
"""

import argparse
import json
import os
import re
import shutil
from datetime import datetime

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


def _normalize_encoding_artifacts(text: str) -> str:
    """Normalize common mojibake artifacts and prefer ASCII-safe punctuation."""
    replacements = {
        "\u2026": "...",
        "â€¦": "...",
        "â€”": "-",
        "â€“": "-",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text


JS_FILES = [
    "bootstrap.js",
    "layer_docs.js",
    "legend.js",
    "cesium.js",
    "ui.js",
    "pvgis.js",
    "energy_sim.js",
    "facade_inspector.js",
    "search.js",
    "roads.js",
    "trafik_canvas.js",
    "vasttrafik.js",
    "trafikverket.js",
    "urban_analysis.js",
    "layers.js",
    "scb_layers.js",
    "city_switcher.js",
]

# Construction eras. Sweden uses TABULA periods; the UK uses the English Housing
# Survey dwelling-age bands, which is what tools/uk/uk_data_pipeline.py tags
# buildings with. The viewer reads whichever set its profile carries.
UK_PERIOD_LABELS = {
    "pre-1919": "Pre-1919",
    "1919-44": "1919-44",
    "1945-64": "1945-64",
    "1965-80": "1965-80",
    "1981-90": "1981-90",
    "1991-2002": "1991-2002",
    "2003-2013": "2003-2013",
    "post-2013": "Post-2013",
}
UK_PERIOD_COLORS = {
    "pre-1919": "rgb(100,149,237)",
    "1919-44": "rgb(255,165,50)",
    "1945-64": "rgb(154,205,50)",
    "1965-80": "rgb(218,165,32)",
    "1981-90": "rgb(255,99,71)",
    "1991-2002": "rgb(147,112,219)",
    "2003-2013": "rgb(70,210,140)",
    "post-2013": "rgb(59,130,246)",
}


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", errors="replace") as f:
        f.write(text)
    print(f"  {path}: {os.path.getsize(path) / 1e6:.2f} MB")


def assemble(slug, build_version, profile, meta_consts, template_vars, css):
    """
    Write assets/<slug>_3d.{html,css,meta.js} from the shared viewer/ template.

    `profile` becomes window.VIEWER_PROFILE, which bootstrap.js reads to decide
    the cities, camera, data payload and construction eras. Nothing else in the
    viewer is country-aware.
    """
    html = open("viewer/index.html", encoding="utf-8").read()

    meta = f"const VIEWER_BUILD_VERSION = {json.dumps(build_version)};\n"
    for name, value in meta_consts.items():
        meta += f"const {name} = {value};\n"
    meta += f"const VIEWER_PROFILE = {json.dumps(profile, ensure_ascii=False)};\n"

    vars_ = dict(template_vars)
    vars_.setdefault("CSS_FILE", f"{slug}_3d.css")
    vars_.setdefault("META_FILE", f"{slug}_3d.meta.js")
    vars_["BUILD_VERSION"] = build_version
    for key, value in vars_.items():
        html = html.replace("{{" + key + "}}", str(value))
    html = _normalize_encoding_artifacts(html)

    _write(f"assets/{slug}_3d.css", css)
    _write(f"assets/{slug}_3d.meta.js", meta)
    _write(f"assets/{slug}_3d.html", html)


def _sweden_from_cache():
    """
    Rebuild the Swedish template vars from the last pipeline run.

    The data pipeline needs the geo stack (geopandas et al). When only the viewer
    template has changed - which is the common case - the building data is already
    on disk and re-running a ~2 minute geo pipeline to re-render an HTML shell is
    wasted work. Recover the pipeline's outputs from the previous meta script and
    buildings.json instead.
    """
    meta_path = "assets/gothenburg_3d.meta.js"
    data_path = "frontend/public/buildings.json"
    if not (os.path.exists(meta_path) and os.path.exists(data_path)):
        return None

    meta = open(meta_path, encoding="utf-8").read()
    consts = {}
    for name in ("PERIOD_CARDS", "ECLASS_CARDS", "USE_CARDS", "PERIOD_STATS", "MAP_CENTER"):
        m = re.search(rf"^const {name}\s*=\s*(.*);\s*$", meta, re.M)
        if not m:
            return None
        consts[name] = m.group(1)

    records = json.load(open(data_path, encoding="utf-8"))
    centre = re.search(r"lon:\s*(-?[\d.]+),\s*lat:\s*(-?[\d.]+)", consts["MAP_CENTER"])

    return {
        "records": records,
        "consts": consts,
        "cx": float(centre.group(1)),
        "cy": float(centre.group(2)),
        "n_total": len(records),
        "n_epc_matched": sum(1 for r in records if r.get("has_epc")),
        "n_eclass_total": sum(1 for r in records if r.get("eclass")),
    }


def build_sweden(build_version, css, skip_pipeline=False):
    print("=" * 60)

    cached = None
    if skip_pipeline:
        cached = _sweden_from_cache()
        if cached is None:
            raise SystemExit(
                "--skip-pipeline needs a previous build: assets/gothenburg_3d.meta.js "
                "and frontend/public/buildings.json must both exist."
            )
        print("Sweden: reusing cached pipeline output (--skip-pipeline)")
    else:
        print("Sweden: running data pipeline ...")
        # Imported here rather than at module scope so `build.py --uk` does not pay
        # for the Swedish pipeline's heavy imports.
        try:
            from data_pipeline import process_data
        except ImportError as err:
            cached = _sweden_from_cache()
            if cached is None:
                raise SystemExit(
                    f"data_pipeline needs the geo stack ({err.name}), and there is no "
                    "previous build to fall back on. Install it, or run: pip install geopandas"
                ) from err
            print(
                f"  data_pipeline needs '{err.name}', which is not installed.\n"
                "  Falling back to the cached pipeline output - the building data is\n"
                "  unchanged, only the viewer template is re-rendered. Install the geo\n"
                "  stack and re-run without --skip-pipeline to regenerate the data."
            )

    if cached is not None:
        data = cached
        meta_consts = cached["consts"]
    else:
        data = process_data()
        meta_consts = {
            "PERIOD_CARDS": data["period_cards_js"],
            "ECLASS_CARDS": data["eclass_cards_js"],
            "USE_CARDS": data["use_cards_js"],
            "PERIOD_STATS": data["period_stats_js"],
            "MAP_CENTER": f"{{lon: {data['cx']:.6f}, lat: {data['cy']:.6f}}}",
        }

    profile = {
        "country": "se",
        "country_name": "Sweden",
        "cities": [
            {
                "id": "gothenburg",
                "name": "Gothenburg",
                "district": "Lindholmen",
                "lat": round(data["cy"], 6),
                "lon": round(data["cx"], 6),
                "camera_height": 800,
                "data_file": "buildings.json",
            }
        ],
        # Swedish periods are the viewer's built-in default, but state them
        # explicitly so both countries are described the same way.
        "period_labels": {
            "...1960": "Pre-1960",
            "1961-1975": "1961-1975",
            "1976-1985": "1976-1985",
            "1986-1995": "1986-1995",
            "1996-2005": "1996-2005",
            "post-2005": "Post-2005",
        },
        "period_colors": {
            "...1960": "rgb(100,149,237)",
            "1961-1975": "rgb(255,165,50)",
            "1976-1985": "rgb(154,205,50)",
            "1986-1995": "rgb(218,165,32)",
            "1996-2005": "rgb(255,99,71)",
            "post-2005": "rgb(147,112,219)",
        },
    }

    assemble(
        "gothenburg",
        build_version,
        profile,
        meta_consts=meta_consts,
        template_vars={
            "VIEWER_TITLE": "Gothenburg 3D",
            "VIEWER_SUBTITLE": f"EUBUCCO v0.2 + EPC &middot; {data['n_total']:,} buildings",
            "TOTAL_BUILDINGS": f"{data['n_total']:,}",
            "N_EPC_MATCHED": f"{data['n_epc_matched']:,}",
            "N_ECLASS_TOTAL": f"{data['n_eclass_total']:,}",
            "STAT_1_LABEL": "EPC matched",
            "STAT_2_LABEL": "TABULA matched",
            "BUILDINGS_PILL": "EUBUCCO + EPC",
            "BUILDINGS_DESC": (
                f"{data['n_total']:,} building footprints with 3D volumes for Gothenburg. "
                "Coloured by use type, energy class, or construction year. EPC data linked "
                "from the Boverket register."
            ),
            "BUILDINGS_SOURCE": "EUBUCCO v0.2 · Boverket EPC register",
        },
        css=css,
    )

    if cached is not None:
        # The data came from the previous build; re-serialising it would be a no-op.
        print(f"  buildings.json unchanged: {data['n_total']:,} buildings")
        return

    clean_records = _sanitize_records(data["records"])
    with open("assets/buildings.json", "w", encoding="utf-8") as f:
        f.write(json.dumps(clean_records, ensure_ascii=False))
    print(f"  assets/buildings.json: {len(data['records']):,} buildings")

    if os.path.isdir("frontend/public"):
        shutil.copy("assets/buildings.json", "frontend/public/buildings.json")
        print("  Copied -> frontend/public/buildings.json")


def build_uk(build_version, css):
    print("=" * 60)
    print("UK: assembling viewer ...")

    registry_path = "frontend/public/uk/cities.json"
    if not os.path.exists(registry_path):
        print(
            f"  SKIP: {registry_path} not found.\n"
            "  Run: python tools/uk/ingest_ehs.py && python tools/uk/uk_data_pipeline.py"
        )
        return

    registry = json.load(open(registry_path, encoding="utf-8"))
    cities = registry["cities"]
    if not cities:
        print("  SKIP: no cities built yet")
        return

    profile = {
        "country": "gb",
        "country_name": "United Kingdom",
        "cities": [
            {
                "id": c["id"],
                "name": c["name"],
                "district": c["district"],
                "lat": c["lat"],
                "lon": c["lon"],
                "camera_height": 800,
                # Served from frontend/public/uk/ and assets/uk/ alike.
                "data_file": c["data_file"],
            }
            for c in cities
        ],
        "period_labels": UK_PERIOD_LABELS,
        "period_colors": UK_PERIOD_COLORS,
    }

    first = cities[0]
    total = sum(c["buildings"] for c in cities)
    with_epc = sum(c["with_epc"] for c in cities)
    estimated = sum(c["estimated_from_ehs"] for c in cities)

    assemble(
        "uk",
        build_version,
        profile,
        meta_consts={
            # The UK payload carries no per-era energy statistics yet (that needs
            # real certificates), so the legend renders counts only. Empty objects
            # keep legend.js on its "no cards" path rather than crashing.
            "PERIOD_CARDS": "{}",
            "ECLASS_CARDS": "{}",
            "USE_CARDS": "{}",
            "PERIOD_STATS": "{}",
            "MAP_CENTER": f"{{lon: {first['lon']:.6f}, lat: {first['lat']:.6f}}}",
        },
        template_vars={
            "VIEWER_TITLE": "United Kingdom 3D",
            "VIEWER_SUBTITLE": f"{first['name']} &mdash; {first['district']}",
            "TOTAL_BUILDINGS": f"{total:,}",
            "N_EPC_MATCHED": f"{with_epc:,}",
            "N_ECLASS_TOTAL": f"{estimated:,}",
            "STAT_1_LABEL": "EPC matched",
            "STAT_2_LABEL": "EHS estimated",
            "BUILDINGS_PILL": "OSM + EPC",
            "BUILDINGS_DESC": (
                f"{total:,} building footprints across {len(cities)} UK focus area(s). "
                "Coloured by use type, EPC band, or construction era. Bands come from the "
                "Energy Performance of Buildings Register where a certificate matches, "
                "otherwise they are estimated from English Housing Survey 2024-25 "
                "distributions and marked as estimates."
            ),
            "BUILDINGS_SOURCE": (
                "OpenStreetMap · EPB Register (MHCLG) · English Housing Survey 2024-25"
            ),
        },
        css=css,
    )

    # The viewer is served two ways: from assets/ by launch.py (port 8765) and from
    # frontend/public/ by Vite. The payloads are generated into frontend/public/uk/,
    # so mirror them into assets/uk/ for the standalone server.
    os.makedirs("assets/uk", exist_ok=True)
    for c in cities:
        src = os.path.join("frontend/public", c["data_file"])
        if os.path.exists(src):
            shutil.copy(src, os.path.join("assets", c["data_file"]))
    for extra in ("cities.json", "ehs_2024_25.json", "epc_band_priors.json",
                  "retrofit_cost_band_c.json", "tabula_gb.json"):
        src = os.path.join("frontend/public/uk", extra)
        if os.path.exists(src):
            shutil.copy(src, os.path.join("assets/uk", extra))
    print(f"  Mirrored UK payloads -> assets/uk/")

    district_labels = [f"{c['name']} ({c['district']})" for c in cities]
    print(f"  {total:,} buildings across {len(cities)} district(s): {', '.join(district_labels)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--se", action="store_true", help="build Sweden only")
    ap.add_argument("--uk", action="store_true", help="build the UK only")
    ap.add_argument(
        "--skip-pipeline",
        action="store_true",
        help="re-render the Swedish viewer from the last pipeline run (no geo stack needed)",
    )
    args = ap.parse_args()

    do_se = args.se or not args.uk
    do_uk = args.uk or not args.se

    build_version = datetime.now().strftime("%Y%m%d-%H%M%S")

    print("Reading viewer/ source files ...")
    css = open("viewer/styles/main.css", encoding="utf-8").read()

    os.makedirs("assets/viewer/js", exist_ok=True)
    for js_file in JS_FILES:
        shutil.copy(f"viewer/js/{js_file}", f"assets/viewer/js/{js_file}")
    print(f"  Copied {len(JS_FILES)} viewer scripts -> assets/viewer/js/")

    if do_se:
        build_sweden(build_version, css, skip_pipeline=args.skip_pipeline)
    if do_uk:
        build_uk(build_version, css)

    print("=" * 60)
    print("Done.  Open http://localhost:8765 after running: python launch.py")


if __name__ == "__main__":
    main()
