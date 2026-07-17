"""
Print a sample of building -> EPC matches for review, and write a JSON sample.

For each UK district it shows a handful of buildings that matched a real EPC
certificate (has_epc), the aggregated building record, and the underlying raw
certificates that were matched (address + band + SAP) so the many-flats->one-
building aggregation is visible.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_epc
import uk_data_pipeline as P

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "uk"
RAW = ROOT / "data" / "uk_raw"

CITIES = ["london_kings_cross", "london_westminster", "london_canary_wharf",
          "london_southwark", "rotherham"]


def _load_certs_for(osm_elements) -> dict:
    pcs = set()
    for e in osm_elements:
        for pc in ((e.get("tags") or {}).get("addr:postcode") or "").split(";"):
            if pc.strip():
                pcs.add(ingest_epc.norm_postcode(pc.strip()))
    certs = []
    for pc in pcs:
        f = RAW / "epc_cache" / f"{pc.replace(' ', '_')}.json"
        if f.exists():
            certs += json.loads(f.read_text(encoding="utf-8"))
    return ingest_epc.index_by_address(certs)


def main(per_city: int = 4):
    sample_out = {}
    for city in CITIES:
        bf = OUT / f"buildings_{city}.json"
        if not bf.exists():
            continue
        buildings = json.loads(bf.read_text(encoding="utf-8"))
        matched = [b for b in buildings if b.get("has_epc")]
        total = len(buildings)
        print("=" * 78)
        print(f"{city}:  {len(matched):,} / {total:,} buildings matched to a real EPC certificate")
        print("=" * 78)

        # Raw certificate index so we can show the underlying certs per building.
        osm = json.loads((RAW / f"osm_{city}_v2.json").read_text(encoding="utf-8"))
        els = osm.get("elements", [])
        b_els = [e for e in els if e.get("type") in ("way", "relation") and (e.get("tags") or {}).get("building")]
        nodes = [e for e in els if e.get("type") == "node" and (e.get("tags") or {}).get("addr:housenumber")]
        idx = _load_certs_for(b_els + nodes)
        ai = P._build_addr_index(nodes)
        by_osmid = {f"{e.get('type')}/{e.get('id')}": e for e in b_els}

        rows = []
        # Prefer flat blocks (multiple certs) so the aggregation is visible.
        for b in sorted(matched, key=lambda x: -(x.get("epc_certificates") or 0))[:per_city]:
            el = by_osmid.get(b.get("osm_id"))
            certs = []
            if el is not None:
                ring = P.ring_of(el)
                tags = el.get("tags") or {}
                sources = [tags] + (P._addr_tags_in_ring(ai, ring) if ring else [])
                seen = {}
                for t in sources:
                    u = str(t.get("ref:GB:uprn") or "").strip()
                    if u:
                        for c in idx.get(("UPRN", u), []):
                            seen[c["certificate_number"]] = c
                    h = ingest_epc.norm_house(t.get("addr:housenumber") or "")
                    for pc in (t.get("addr:postcode") or "").split(";"):
                        pc = ingest_epc.norm_postcode(pc.strip())
                        if pc and h:
                            for c in idx.get((pc, h), []):
                                seen[c["certificate_number"]] = c
                certs = list(seen.values())

            print(f"\n  BUILDING  {b.get('address')}   [{b.get('use_cat')}]")
            print(f"    band(modal)={b.get('eclass')}  SAP={b.get('sap')}  "
                  f"TABULA_kWh/m2/yr={b.get('tabula_kwh_m2_yr')}  matched_certs={b.get('epc_certificates')}")
            for c in certs[:6]:
                print(f"      cert  band={c.get('band') or '-'}  {c.get('address')}")
            if len(certs) > 6:
                print(f"      ... +{len(certs) - 6} more certificate(s)")

            rows.append({
                "building_address": b.get("address"),
                "use_cat": b.get("use_cat"),
                "band_modal": b.get("eclass"),
                "sap_mean": b.get("sap"),
                "tabula_kwh_m2_yr": b.get("tabula_kwh_m2_yr"),
                "matched_cert_count": b.get("epc_certificates"),
                "certificates": [
                    {"band": c.get("band"), "address": c.get("address"),
                     "sap": c.get("sap"), "certificate_number": c.get("certificate_number")}
                    for c in certs
                ],
            })
        sample_out[city] = rows

    out_file = OUT / "epc_match_sample.json"
    out_file.write_text(json.dumps(sample_out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\n" + "=" * 78)
    print(f"Wrote {out_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
