"""Find Poseidon's apartments among the scraped Boplats listings.

Boplats hides the landlord's name from logged-out visitors, and the scraper
never stored it. The floor-plan images do carry it, though: every Poseidon plan
uses one of four recognisable drawing layouts.

  A_classic  "Obj.nr NNNN-NNNN" + bold 0-10 m scale bar + "SKALA" (bottom left)
  B_newer    same idea, newer font, scale bar flush left
  C_logo     new-build sheet with the current statue + POSEIDON logo (top)
  D_oldlogo  older sheet with the "BOSTADS AB POSEIDON" logo (top)

No OCR is installed, so each layout is recognised by normalised
cross-correlation against a crop from a reference plan (logos at several sizes).
Thresholds were set by eye from contact sheets of the borderline scores;
the other Gothenburg landlords' plans (Familjebostäder, Bostadsbolaget,
Gårdstensbostäder, Tornet, ByggVesta…) all score below them.

    .venv/Scripts/python tools/poseidon/find_poseidon_listings.py

Writes data/poseidon/boplats_listings_scored.json (every listing + scores).
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "boplats_apartments.db"
OUT = REPO / "data" / "poseidon" / "boplats_listings_scored.json"
REF_W = 1412  # plans are A4 renders ~1412 px wide

# name, reference plan id, work width, crop box at full res, mode
TEMPLATES = [
    ("A_classic", "6A0AE58400ACA898CCF5C379", 353, (190, 1800, 900, 1900), "fixed"),
    ("B_newer",   "6A74B1E8F95AC5A1382EB08B", 353, (70, 1825, 780, 1935), "fixed"),
    ("C_logo",    "6A24EF1B01D6BB948519B095", 176, (1000, 105, 1310, 315), "scan"),
    ("D_oldlogo", "6A0DDCFB00CE1C1BCFB4C379", 176, (1060, 115, 1315, 290), "scan"),
]
# Set for precision: the logo scores of other landlords' sheets (Tornet,
# Gårdstensbostäder, Familjebostäder, Bostadsbolaget) reach ~0.68, so some
# Poseidon sheets in that band are missed; the map lets the user add those.
THRESHOLDS = {"A_classic": 0.60, "B_newer": 0.80, "C_logo": 0.85, "D_oldlogo": 0.75}
LOGO_SCALES = (0.55, 0.65, 0.75, 0.85, 1.0, 1.15)


def load(path: Path, width: int):
    im = Image.open(path).convert("L")
    if im.width < 1000:  # thumbnails / photos, not plan renders
        return None
    h = round(im.height * width / im.width)
    return 1 - np.asarray(im.resize((width, h), Image.BILINEAR), dtype=np.float32) / 255.0


def ncc_max(region: np.ndarray, tpl: np.ndarray, min_std: float = 0.02) -> float:
    th, tw = tpl.shape
    if region.shape[0] < th or region.shape[1] < tw:
        return -1.0
    win = swv(region, (th, tw))
    t = (tpl - tpl.mean()) / (tpl.std() + 1e-6)
    m = win.mean(axis=(2, 3))
    s = win.std(axis=(2, 3))
    c = (np.einsum("ijkl,kl->ij", win, t) / t.size - m * t.mean()) / np.maximum(s, 1e-3)
    c[s < min_std] = -1
    return float(c.max())


def build_refs():
    refs = []
    for name, rid, w, (x0, y0, x1, y1), mode in TEMPLATES:
        img = load(REPO / "boplats_images" / f"{rid}.jpg", w)
        k = w / REF_W
        ys, xs = round(y0 * k), round(x0 * k)
        tpl = img[ys:round(y1 * k), xs:round(x1 * k)]
        if mode == "scan":
            tpls = []
            for sc in LOGO_SCALES:
                h, ww = max(6, round(tpl.shape[0] * sc)), max(6, round(tpl.shape[1] * sc))
                t = np.asarray(Image.fromarray((tpl * 255).astype(np.uint8)).resize((ww, h), Image.BILINEAR),
                               dtype=np.float32) / 255.0
                tpls.append(t)
            refs.append((name, w, tpls, None, None, mode))
        else:
            refs.append((name, w, [tpl], ys, xs, mode))
    return refs


def score(path: Path, refs) -> dict:
    out, cache = {}, {}
    for name, w, tpls, ys, xs, mode in refs:
        img = cache.get(w)
        if img is None:
            img = cache[w] = load(path, w)
        if img is None:
            out[name] = None
            continue
        if mode == "fixed":
            r, t = 12, tpls[0]
            th, tw = t.shape
            reg = img[max(0, ys - r):ys + r + th, max(0, xs - r):xs + r + tw]
            out[name] = round(ncc_max(reg, t), 3)
        else:  # Poseidon's logo always sits top-right; search that corner at several sizes.
            # min_std skips near-empty patches (a faint line matches anything).
            reg = img[: round(img.shape[0] * 0.26), round(img.shape[1] * 0.45):]
            out[name] = round(max(ncc_max(reg, t, min_std=0.08) for t in tpls), 3)
    return out


def main():
    refs = build_refs()
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = con.execute(
        "select id, url, address, area_name, rooms, size_m2, rent_sek, floorplan_image_path, first_seen, last_seen "
        "from apartments").fetchall()
    out = []
    for i, (rid, url, addr, area, rooms, size, rent, img, first, last) in enumerate(rows):
        rec = {"id": rid, "url": url, "address": addr, "area": area, "rooms": rooms, "size_m2": size,
               "rent_sek": rent, "image": img, "first_seen": first, "last_seen": last}
        p = REPO / img if img else None
        if p and p.exists():
            rec["scores"] = score(p, refs)
            hits = [k for k, v in rec["scores"].items() if v is not None and v >= THRESHOLDS[k]]
            rec["poseidon"] = bool(hits)
            rec["matched_layout"] = hits[0] if hits else None
        else:
            rec["scores"], rec["poseidon"], rec["matched_layout"] = {}, None, None
        out.append(rec)
        if i % 250 == 0:
            print(f"{i}/{len(rows)}", flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    pos = [r for r in out if r["poseidon"]]
    print(f"listings: {len(out)}  with plan: {sum(r['poseidon'] is not None for r in out)}  "
          f"Poseidon: {len(pos)}  addresses: {len({(r['address'] or '').strip().lower() for r in pos})}")
    for k in THRESHOLDS:
        print(f"  {k}: {sum(r['matched_layout'] == k for r in pos)}")


if __name__ == "__main__":
    main()
