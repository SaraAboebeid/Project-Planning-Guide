"""
build_be_viewer.py - the Belgian 3D viewer (Brussels, Liège) (assets/be_3d.html + .css + .meta.js)

Why not `build.py --be`: build.py copies viewer/js/*.js over assets/viewer/js/,
and the built assets currently hold work that is not in viewer/ (see the note
in the project memory "assets-ahead-of-source"). So this derives the Belgian
page from the already-built UK page - the shared viewer scripts treat every
non-"se" country the same way - and writes only NEW files:

  assets/be_3d.html       uk_3d.html with Belgian title/labels/sources
  assets/be_3d.css        copy of uk_3d.css
  assets/be_3d.meta.js    VIEWER_PROFILE for country "be" (Brussels + Liège districts)

and mirrors the payloads into frontend/public/ so Vite serves the page too.
Nothing UK or Swedish is written.

    python tools/be/build_be_viewer.py
"""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "frontend" / "public"

# TABULA BE periods, as tools/be/ingest_tabula.py keys them.
PERIOD_LABELS = {
    "pre-1946": "Before 1946", "1946-1970": "1946-1970", "1971-1990": "1971-1990",
    "1991-2005": "1991-2005", "2006-2011": "2006-2011", "2012-": "2012+",
}
PERIOD_COLORS = {
    "pre-1946": "rgb(100,149,237)", "1946-1970": "rgb(255,165,50)", "1971-1990": "rgb(218,165,32)",
    "1991-2005": "rgb(147,112,219)", "2006-2011": "rgb(70,210,140)", "2012-": "rgb(59,130,246)",
}


def main() -> None:
    registry = json.loads((PUBLIC / "be" / "cities.json").read_text(encoding="utf-8"))
    # The app offers Brussels and Liège; Gent's payload exists but is not exposed yet.
    cities = [c for c in registry["cities"] if c["region"] in ("Brussels-Capital", "Wallonia")]
    if not cities:
        raise SystemExit("no Brussels/Liège districts built - run tools/be/be_data_pipeline.py first")
    version = datetime.now().strftime("%Y%m%d-%H%M%S") + "-be"
    first = cities[0]
    total = sum(c["buildings"] for c in cities)
    residential = sum(c.get("residential", 0) for c in cities)
    tabula = sum(c.get("tabula_matched", 0) for c in cities)

    profile = {
        "country": "be",
        "country_name": "Belgium",
        "cities": [{
            "id": c["id"], "name": c["name"], "district": c["district"],
            "lat": c["lat"], "lon": c["lon"], "camera_height": 800, "data_file": c["data_file"],
        } for c in cities],
        "period_labels": PERIOD_LABELS,
        "period_colors": PERIOD_COLORS,
    }
    meta = "\n".join([
        f'const VIEWER_BUILD_VERSION = "{version}";',
        "const PERIOD_CARDS = {};",
        "const ECLASS_CARDS = {};",
        "const USE_CARDS = {};",
        "const PERIOD_STATS = {};",
        f"const MAP_CENTER = {{lon: {first['lon']:.6f}, lat: {first['lat']:.6f}}};",
        f"const VIEWER_PROFILE = {json.dumps(profile, ensure_ascii=False)};",
        "",
    ])
    (ASSETS / "be_3d.meta.js").write_text(meta, encoding="utf-8")
    shutil.copy(ASSETS / "uk_3d.css", ASSETS / "be_3d.css")

    html = (ASSETS / "uk_3d.html").read_text(encoding="utf-8")
    html = re.sub(r"uk_3d\.css\?v=[^\"']+", f"be_3d.css?v={version}", html)
    html = re.sub(r"uk_3d\.meta\.js\?v=[^\"']+", f"be_3d.meta.js?v={version}", html)
    html = html.replace("United Kingdom 3D", "Belgium 3D")
    # The first stat box is filled by the viewer with the EPC-matched count - 0 in
    # Belgium, which has no open EPCs - so its "EPC matched" label stays as is.
    html = html.replace(">OSM + EPC<", ">UrbIS / PICC 3D + TABULA<")
    (ASSETS / "be_3d.html").write_text(html, encoding="utf-8")

    for base in (ASSETS, PUBLIC):
        (base / "be").mkdir(parents=True, exist_ok=True)
    for c in cities:
        src = PUBLIC / c["data_file"]
        if src.exists():
            shutil.copy(src, ASSETS / c["data_file"])
    for name in ("be_3d.html", "be_3d.css", "be_3d.meta.js"):
        shutil.copy(ASSETS / name, PUBLIC / name)
    print(f"be_3d viewer: {total:,} buildings ({residential:,} residential, {tabula:,} TABULA) "
          f"across {', '.join(c['district'] for c in cities)} -> assets/ and frontend/public/")


if __name__ == "__main__":
    main()
