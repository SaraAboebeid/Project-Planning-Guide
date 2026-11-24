"""
build_any_city.py - build one Swedish municipality for the 5-step wizard.

    python tools/se/build_any_city.py <kommun code>      e.g. 1286 (Ystad)

Stages, each written to data/se/builds/<code>.json so the entry page can show
progress (the backend starts this script and serves that file):

  register   add the municipality to data/se/dynamic_cities.json
  link       Lantmäteriet buildings + property boundaries, EPCs linked (lm_link_city.py)
  eubucco    EUBUCCO building geometry and heights for the area (download_eubucco_city.py)
  build      the buildings file the wizard reads (build_city.py)
  weather    nearest TMYx weather station (fetch_epw.py)

A municipality already built is rebuilt from cached downloads. Gothenburg and
Malmö are hand-configured in se_cities.py and are never touched by this script.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import se_cities  # noqa: E402
from fetch_epw import nearest_epw  # noqa: E402

KOMMUNER = ROOT / "data" / "se" / "kommuner.json"
BUILDS = ROOT / "data" / "se" / "builds"
STAGES = [
    ("register", "Registering the municipality"),
    ("link", "Downloading Lantmäteriet buildings and linking EPCs"),
    ("eubucco", "Downloading building geometry and heights (EUBUCCO)"),
    ("build", "Building the energy data set"),
    ("weather", "Fetching the nearest weather file"),
]


class Status:
    def __init__(self, code: str, name: str, city_id: str):
        BUILDS.mkdir(parents=True, exist_ok=True)
        self.path = BUILDS / f"{code}.json"
        self.d = {"code": code, "name": name, "city_id": city_id, "state": "running",
                  "stage": None, "stage_index": 0, "stages": [s for s, _ in STAGES],
                  "stage_labels": dict(STAGES), "started": time.time(), "finished": None,
                  "error": None, "log": [], "result": None}
        self.save()

    def save(self):
        """Atomic write. On Windows the replace fails while the backend has the file
        open for a status poll, so retry briefly - and never let a progress update
        abort the build itself (the next save carries the same information)."""
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.d, ensure_ascii=False, indent=1), encoding="utf-8")
        for attempt in range(20):
            try:
                tmp.replace(self.path)
                return
            except PermissionError:
                time.sleep(0.05 * (attempt + 1))

    def stage(self, key: str):
        self.d["stage"] = key
        self.d["stage_index"] = [s for s, _ in STAGES].index(key)
        self.log(f"== {dict(STAGES)[key]}")

    def log(self, line: str):
        self.d["log"] = (self.d["log"] + [line.rstrip()])[-60:]
        self.save()


def run(st: Status, *args: str):
    """Run a pipeline script, streaming its output into the status log."""
    p = subprocess.Popen([sys.executable, *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace", env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
    for line in p.stdout:
        if line.strip():
            st.log(line)
    if p.wait() != 0:
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {p.returncode}) - see the log")


def _args():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("code")
    # Big municipalities can be built for part of their area only (e.g. central
    # Stockholm). Both are remembered in dynamic_cities.json, so a later rebuild
    # from the UI (code only) keeps the same extent and name.
    ap.add_argument("--bbox", help="lon_min,lat_min,lon_max,lat_max (EPSG:4326)")
    ap.add_argument("--name", help="display name, e.g. 'Stockholm (central)'")
    return ap.parse_args()


def main() -> int:
    a = _args()
    code = a.code
    k = next((k for k in json.loads(KOMMUNER.read_text(encoding="utf-8")) if k["code"] == code), None)
    if k is None:
        raise SystemExit(f"unknown municipality code {code} (run tools/se/kommuner.py)")
    city_id = k["slug"]
    if city_id in se_cities.CITIES:
        raise SystemExit(f"{k['name']} is hand-configured in se_cities.py - build it with build_city.py")
    dyn = json.loads(se_cities.DYNAMIC_FILE.read_text(encoding="utf-8")) if se_cities.DYNAMIC_FILE.exists() else {}
    prev = dyn.get(city_id, {})
    bbox = [float(v) for v in a.bbox.split(",")] if a.bbox else prev.get("bbox_custom") or k["bbox4326"]
    name = a.name or prev.get("name_custom") or k["name"]
    k = {**k, "bbox4326": bbox}
    st = Status(code, name, city_id)
    try:
        st.stage("register")
        entry = dyn.get(city_id, {})
        if a.bbox or prev.get("bbox_custom"):
            entry["bbox_custom"] = bbox
        if a.name or prev.get("name_custom"):
            entry["name_custom"] = name
        entry.update({
            "name": name, "nuts2": k["nuts2"], "bbox4326": tuple(k["bbox4326"]), "slug": city_id,
            "eubucco": f"data/eubucco/{city_id}.gpkg", "kommun": k["name"], "region_kommuns": [k["name"]],
            "kommun_codes": {k["name"]: code}, "kommun_code": code, "clip_to_footprints": True,
            "on_demand": True, "built": False,
        })
        dyn[city_id] = entry
        se_cities.DYNAMIC_FILE.parent.mkdir(parents=True, exist_ok=True)
        se_cities.DYNAMIC_FILE.write_text(json.dumps(dyn, ensure_ascii=False, indent=1), encoding="utf-8")

        st.stage("link")
        run(st, "tools/se/lm_link_city.py", city_id)
        st.stage("eubucco")
        run(st, "tools/se/download_eubucco_city.py", city_id)
        st.stage("build")
        run(st, "tools/se/build_city.py", city_id)
        # Sections missing from EUBUCCO, added from OSM (data/se/osm_sections.json).
        run(st, "tools/se/add_osm_sections.py", city_id)
        # Certificates the property link missed, placed by their entrance addresses.
        run(st, "tools/se/place_certificates_by_address.py", city_id)
        st.stage("weather")
        lo, la, LO, LA = k["bbox4326"]
        epw = nearest_epw((la + LA) / 2, (lo + LO) / 2)
        st.log(f"weather: {epw}")

        recs = json.loads((ROOT / "frontend" / "public" / f"buildings_{city_id}.json").read_text(encoding="utf-8"))
        result = {"buildings": len(recs), "with_energy": sum(1 for r in recs if r.get("energy") is not None),
                  "epw": epw}
        dyn = json.loads(se_cities.DYNAMIC_FILE.read_text(encoding="utf-8"))
        # View centre = the densest built-up spot, not the bounding-box middle
        # (Nacka's was open water and forest - the 3D viewer looked broken there).
        from city_view_center import center_for
        center = center_for(city_id) or [round((la + LA) / 2, 5), round((lo + LO) / 2, 5)]
        dyn[city_id].update({"epw": epw, "built": True, "stats": result, "center": center})
        se_cities.DYNAMIC_FILE.write_text(json.dumps(dyn, ensure_ascii=False, indent=1), encoding="utf-8")
        st.d.update(state="done", finished=time.time(), result=result)
        st.log(f"done: {result['buildings']:,} buildings, {result['with_energy']:,} with EPC energy")
        return 0
    except Exception as e:
        st.d.update(state="failed", finished=time.time(), error=str(e))
        st.log(traceback.format_exc().splitlines()[-1])
        return 1


if __name__ == "__main__":
    sys.exit(main())
