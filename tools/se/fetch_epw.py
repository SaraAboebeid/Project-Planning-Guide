"""
fetch_epw.py - nearest TMYx weather file for a point in Sweden.

climate.onebuilding.org publishes TMYx 2011-2025 files per weather station,
named by WMO number. Station coordinates come from NOAA's ISD station history
(USAF = WMO number + a trailing 0). The nearest station with a 2011-2025 file
is downloaded into data/epw/ (cached) and its filename returned.

    python tools/se/fetch_epw.py 55.43 13.82      # prints the EPW filename
"""

from __future__ import annotations

import csv
import io
import math
import re
import sys
import zipfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
EPW_DIR = ROOT / "data" / "epw"
CACHE = ROOT / "data" / "se"
BASE = "https://climate.onebuilding.org/WMO_Region_6_Europe/SWE_Sweden/"
ISD = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv"
HEADERS = {"User-Agent": "ppg-research/1.0 (Chalmers)"}


def _stations() -> list[tuple[str, float, float]]:
    """(zip path, lat, lon) for every Swedish TMYx 2011-2025 file."""
    CACHE.mkdir(parents=True, exist_ok=True)
    idx = CACHE / "onebuilding_sweden_index.html"
    if not idx.exists():
        idx.write_text(requests.get(BASE + "index.html", headers=HEADERS, timeout=60).text, encoding="utf-8")
    zips = sorted(set(re.findall(r'href="([^"]+?\.(\d{6})_TMYx\.2011-2025\.zip)"', idx.read_text(encoding="utf-8"))))
    isd = CACHE / "isd-history-se.csv"
    if not isd.exists():
        rows = [r for r in csv.reader(io.StringIO(requests.get(ISD, headers=HEADERS, timeout=120).text)) if len(r) > 7 and r[3] == "SW"]
        isd.write_text("\n".join(",".join(r[:8]) for r in rows), encoding="utf-8")
    coords = {}
    for r in csv.reader(isd.read_text(encoding="utf-8").splitlines()):
        try:
            coords.setdefault(r[0][:6], (float(r[6]), float(r[7])))
        except (ValueError, IndexError):
            pass
    return [(z, *coords[w]) for z, w in zips if w in coords]


def nearest_epw(lat: float, lon: float) -> str:
    def dist(s):
        return math.hypot(s[1] - lat, (s[2] - lon) * math.cos(math.radians(lat)))
    zpath, _, _ = min(_stations(), key=dist)
    name = Path(zpath).name.replace(".zip", ".epw")
    out = EPW_DIR / name
    if not out.exists():
        r = requests.get(BASE + zpath, headers=HEADERS, timeout=300)
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            member = next(n for n in z.namelist() if n.endswith(".epw"))
            out.write_bytes(z.read(member))
    return name


if __name__ == "__main__":
    print(nearest_epw(float(sys.argv[1]), float(sys.argv[2])))
