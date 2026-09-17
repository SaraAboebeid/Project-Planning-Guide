"""
Validate the Rotherham building payload against the landlord ground truth.

Ground truth (not in the repo, kept next to it in ``Rotherham callibration/``):
  * ``Copy of Rotherham Properties Chalmers.xlsx`` - 114 surveyed dwellings with
    EPC band, calculated SAP, construction date, heating, walls, windows.
    NB its ``UPRN`` column is the landlord property ref, not an OS UPRN.
  * ``Copy of Rotherham_from_QGIS 1.xlsx`` - the same refs (``PRO_PROPRE``) with
    British National Grid eastings/northings.

Each dwelling is placed on a payload building (point-in-footprint, else the
nearest footprint within ``--max-dist`` m). Several flats usually share one
building, so metrics are reported per dwelling and per building (modal band,
median SAP, median year). Everything is split by the payload's ``epc_source``
so register-matched values and EHS priors are judged separately, and compared
with the "always predict the most common band" baseline.

Usage:
    python tools/uk/validate_rotherham.py [--gt-dir DIR] [--payload FILE] [--out JSON]
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
from pyproj import Transformer
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
BANDS = "ABCDEFG"
# Metres per degree near Rotherham (53.4 N) - good enough for a 30 m radius.
M_PER_DEG_LAT = 111_320
M_PER_DEG_LON = 111_320 * 0.5962


def load_ground_truth(gt_dir: Path) -> pd.DataFrame:
    props = pd.read_excel(gt_dir / "Copy of Rotherham Properties Chalmers.xlsx", sheet_name=0)
    geo = pd.read_excel(gt_dir / "Copy of Rotherham_from_QGIS 1.xlsx", sheet_name=0)
    geo = geo[["PRO_PROPRE", "PRO_EASTIN", "PRO_NORTHI"]].drop_duplicates("PRO_PROPRE")
    df = props.merge(geo, left_on="UPRN", right_on="PRO_PROPRE", how="left")
    to_wgs = Transformer.from_crs(27700, 4326, always_xy=True)
    df["lon"], df["lat"] = to_wgs.transform(df["PRO_EASTIN"].values, df["PRO_NORTHI"].values)
    df["gt_year"] = pd.to_datetime(df["Construction_Date"], errors="coerce").dt.year
    df["gt_sap"] = pd.to_numeric(df["Calculated SAP score"], errors="coerce")
    return df.rename(columns={"UPRN": "ref"})


def load_buildings(payload: Path):
    blds = json.loads(payload.read_text(encoding="utf-8"))
    polys = []
    for b in blds:
        ring = b["coordinates"][0]
        # Scale lon so distances in the tree are roughly isotropic.
        polys.append(Polygon([(x * M_PER_DEG_LON, y * M_PER_DEG_LAT) for x, y in ring]).buffer(0))
    return blds, polys, STRtree(polys)


def place(row, polys, tree, max_dist):
    p = Point(row.lon * M_PER_DEG_LON, row.lat * M_PER_DEG_LAT)
    hits = [i for i in tree.query(p, predicate="intersects")]
    if hits:
        return int(hits[0]), 0.0
    i = int(tree.nearest(p))
    d = polys[i].distance(p)
    return (i, d) if d <= max_dist else (None, d)


def band_metrics(pairs):
    """pairs: [(truth_band, predicted_band)] with predicted possibly None."""
    scored = [(t, p) for t, p in pairs if p in BANDS]
    if not scored:
        return {"n": 0}
    diff = [abs(BANDS.index(t) - BANDS.index(p)) for t, p in scored]
    return {
        "n": len(scored),
        "exact": round(sum(d == 0 for d in diff) / len(diff), 3),
        "within_1": round(sum(d <= 1 for d in diff) / len(diff), 3),
        "confusion": dict(Counter(f"{t}->{p}" for t, p in scored).most_common()),
    }


def mae(pairs):
    pairs = [(a, b) for a, b in pairs if a is not None and b is not None
             and not pd.isna(a) and not pd.isna(b)]
    if not pairs:
        return {"n": 0}
    err = [b - a for a, b in pairs]
    return {"n": len(err), "mae": round(statistics.mean(abs(e) for e in err), 2),
            "bias": round(statistics.mean(err), 2)}


def summarise(label, dwell, by_bld, blds):
    out = {"label": label}
    out["dwellings"] = {
        "band": band_metrics([(r.EPC, blds[r.bidx].get("eclass")) for r in dwell]),
        "sap": mae([(r.gt_sap, blds[r.bidx].get("sap")) for r in dwell]),
        "year": mae([(r.gt_year, blds[r.bidx].get("year")) for r in dwell]),
    }
    b_pairs, s_pairs, y_pairs = [], [], []
    for bidx, rows in by_bld.items():
        truth = Counter(r.EPC for r in rows).most_common(1)[0][0]
        b_pairs.append((truth, blds[bidx].get("eclass")))
        saps = [r.gt_sap for r in rows if not pd.isna(r.gt_sap)]
        if saps:
            s_pairs.append((statistics.median(saps), blds[bidx].get("sap")))
        yrs = [r.gt_year for r in rows if not pd.isna(r.gt_year)]
        if yrs:
            y_pairs.append((statistics.median(yrs), blds[bidx].get("year")))
    out["buildings"] = {"band": band_metrics(b_pairs), "sap": mae(s_pairs), "year": mae(y_pairs)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt-dir", type=Path, default=ROOT.parent / "Rotherham callibration")
    ap.add_argument("--payload", type=Path, default=ROOT / "assets" / "uk" / "buildings_rotherham.json")
    ap.add_argument("--max-dist", type=float, default=30.0)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    gt = load_ground_truth(args.gt_dir)
    blds, polys, tree = load_buildings(args.payload)

    rows, unplaced = [], []
    for r in gt[["ref", "EPC", "gt_sap", "gt_year", "lon", "lat"]].itertuples(index=False):
        if pd.isna(r.lon):
            unplaced.append((r.ref, "no coordinates"))
            continue
        bidx, d = place(r, polys, tree, args.max_dist)
        if bidx is None:
            unplaced.append((r.ref, f"nearest footprint {d:.0f} m"))
        else:
            rows.append(SimpleNamespace(**r._asdict(), bidx=bidx, dist=d))

    groups = defaultdict(list)
    for x in rows:
        groups[blds[x.bidx].get("epc_source") or "none"].append(x)

    def by_building(rs):
        g = defaultdict(list)
        for x in rs:
            g[x.bidx].append(x)
        return g

    modal = Counter(gt["EPC"]).most_common(1)[0][0]
    report = {
        "ground_truth_dwellings": len(gt),
        "placed_dwellings": len(rows),
        "placed_inside_footprint": sum(x.dist == 0 for x in rows),
        "distinct_buildings": len({x.bidx for x in rows}),
        "unplaced": unplaced,
        "baseline_always_" + modal: band_metrics([(t, modal) for t in gt["EPC"]]),
        "all": summarise("all", rows, by_building(rows), blds),
        "by_epc_source": {k: summarise(k, v, by_building(v), blds) for k, v in groups.items()},
        "building_source_counts": dict(Counter(
            blds[b].get("epc_source") or "none" for b in {x.bidx for x in rows})),
    }
    txt = json.dumps(report, indent=2, default=str)
    print(txt)
    if args.out:
        args.out.write_text(txt, encoding="utf-8")


if __name__ == "__main__":
    main()
