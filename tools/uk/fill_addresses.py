"""
Fill in missing building addresses from the EPC register, via the same UPRN
footprint placement anchor_epc_uprn.py uses.

Why: anchor_epc_uprn.py drops each certificate onto the footprint it sits in, but
only copies band / SAP / fabric across - never the certificate's address. So in
Rotherham 9,100 buildings carry a certificate yet show no address (85% of the
city has none), because most OSM footprints have no addr:* tags.

This touches ONLY `address` and `address_source` on buildings whose address is
empty. Nothing the energy model or the calibration reads is changed, so no
result moves. Both payload copies (frontend/public/uk, assets/uk) are updated.

    python tools/uk/fill_addresses.py [--city rotherham] [--max-dist 30] [--dry-run]

Address choice per building: the most common building-level label among its
domestic certificates (flat/unit prefix stripped, as ingest_epc.building_label
does), else the newest non-domestic certificate's / DEC's address.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anchor_epc_uprn as A  # noqa: E402
import ingest_epc  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="rotherham")
    ap.add_argument("--max-dist", type=float, default=30.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from cities import CITIES
    city = next(c for c in CITIES if c["id"] == args.city)

    # The shipped payload is what gets patched; footprints are identical to the
    # .bak base the anchoring ran on, so indexes line up either way.
    src = A.OUT_DIRS[0] / f"buildings_{city['id']}.json"
    blds = json.loads(src.read_text(encoding="utf-8"))
    print(f"{city['name']}: {len(blds):,} buildings, "
          f"{sum(1 for b in blds if not (b.get('address') or '').strip()):,} without an address")

    uprn_xy = A.load_uprn_coords(city)
    to_bng = Transformer.from_crs(4326, 27700, always_xy=True)
    polys = []
    for b in blds:
        xs, ys = to_bng.transform(*zip(*b["coordinates"][0]))
        polys.append(Polygon(zip(xs, ys)).buffer(0))
    tree = STRtree(polys)

    def place(uprn: str):
        xy = uprn_xy.get(uprn)
        if not xy:
            return None
        pt = Point(*to_bng.transform(*xy))
        hits = tree.query(pt, predicate="intersects")
        if len(hits):
            return int(hits[0])
        idx = int(tree.nearest(pt))
        return idx if polys[idx].distance(pt) <= args.max_dist else None

    # Newest certificate per dwelling (UPRN), then its address on the footprint.
    newest: dict[str, dict] = {}
    for c in A.load_certificates(city):
        if c["uprn"] not in newest or (c.get("registration_date") or "") > (newest[c["uprn"]].get("registration_date") or ""):
            newest[c["uprn"]] = c
    labels: dict[int, list[str]] = defaultdict(list)
    for uprn, c in newest.items():
        i, addr = place(uprn), (c.get("address") or "").strip()
        if i is not None and addr:
            labels[i].append(ingest_epc.building_label(addr))

    nd_labels: dict[int, list[tuple[str, str]]] = defaultdict(list)
    for kind, items in A.load_nondomestic(city).items():
        for it in items:
            i, addr = place(it["uprn"]), (it.get("address") or "").strip()
            if i is not None and addr:
                nd_labels[i].append((it.get("date") or "", addr))

    filled = Counter()
    for i, b in enumerate(blds):
        if (b.get("address") or "").strip():
            continue
        if labels.get(i):
            b["address"] = Counter(labels[i]).most_common(1)[0][0]
            b["address_source"] = "epc_certificate"
            filled["epc_certificate"] += 1
        elif nd_labels.get(i):
            b["address"] = max(nd_labels[i])[1]
            b["address_source"] = "epc_nondomestic"
            filled["epc_nondomestic"] += 1
    left = sum(1 for b in blds if not (b.get("address") or "").strip())
    print(f"  filled {dict(filled)}; {left:,} still without an address")

    if args.dry_run:
        return
    for d in A.OUT_DIRS:
        out = d / f"buildings_{city['id']}.json"
        if out.exists():
            out.write_text(json.dumps(blds, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            print(f"  wrote {out.relative_to(A.ROOT)}")


if __name__ == "__main__":
    main()
