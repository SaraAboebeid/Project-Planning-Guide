"""
Non-domestic EPCs and Display Energy Certificates (DECs) for one council, from
the EPC register API.

Unlike domestic certificates (searched per postcode), both registers can be
searched by council, so a whole local authority comes back in a few pages.

  * Non-domestic EPC (CEPC): asset rating from an SBEM model - band, floor
    area, building type, main fuel, modelled kWh/m² by end use.
  * DEC: public buildings' OPERATIONAL rating from METERED consumption - gas,
    electricity etc. over a 12-month assessment period, plus floor area.

Search results and full certificate documents are cached under
data/uk_raw/ (raw documents are kept whole, so new fields can be read later
without refetching). Resumable; a sustained rate limit just ends the run.

Usage:
    python tools/uk/ingest_nondomestic_epc.py [--council Rotherham] [--no-details]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import requests

import ingest_epc

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "uk_raw"
DOC_CACHE = RAW / "epc_detail_cache_nondom"
KINDS = {"non-domestic": "cepc", "display": "dec"}


def search_file(council: str, kind: str) -> Path:
    return RAW / f"epc_{KINDS[kind]}_{council.lower().replace(' ', '_')}.json"


def fetch_search(council: str, kind: str, token: str, session: requests.Session) -> list[dict]:
    out_path = search_file(council, kind)
    if out_path.exists():
        return json.loads(out_path.read_text(encoding="utf-8"))
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    rows, page = [], 1
    while True:
        for attempt in range(ingest_epc.MAX_RETRIES):
            r = session.get(f"{ingest_epc.BASE_URL}/api/{kind}/search",
                            params={"council[]": council, "page_size": 5000, "current_page": page},
                            headers=headers, timeout=90)
            if r.status_code == 429:
                time.sleep(min(2 ** attempt * 5, 60))
                continue
            break
        if r.status_code == 404:
            break
        r.raise_for_status()
        payload = r.json()
        rows += payload.get("data") or []
        nxt = (payload.get("pagination") or {}).get("nextPage")
        if not nxt:
            break
        page = nxt
        time.sleep(ingest_epc.RATE_LIMIT_SLEEP)
    out_path.write_text(json.dumps(rows), encoding="utf-8")
    print(f"  {kind}: {len(rows):,} certificates -> {out_path.relative_to(ROOT)}")
    return rows


def fetch_document(cert_number: str, token: str, session: requests.Session) -> dict | None:
    """Full certificate document, cached raw. None on failure (not cached)."""
    DOC_CACHE.mkdir(parents=True, exist_ok=True)
    cache = DOC_CACHE / f"{cert_number}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    for attempt in range(2):
        try:
            r = session.get(f"{ingest_epc.BASE_URL}/api/certificate",
                            params={"certificate_number": cert_number}, headers=headers, timeout=45)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(5)
            continue
        if r.status_code == 429:
            time.sleep(10)
            continue
        if r.status_code != 200:
            return None
        doc = (r.json() or {}).get("data") or {}
        cache.write_text(json.dumps(doc), encoding="utf-8")
        return doc
    return None


def latest_per_uprn(rows: list[dict]) -> list[dict]:
    best: dict[str, dict] = {}
    for c in rows:
        u = str(c.get("uprn") or "")
        if not u:
            continue
        if u not in best or (c.get("registrationDate") or "") > (best[u].get("registrationDate") or ""):
            best[u] = c
    return list(best.values())


def _get(doc: dict, path: str):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def summarise_cepc(doc: dict) -> dict:
    return {
        "band": doc.get("current_energy_efficiency_band"),
        "asset_rating": doc.get("asset_rating"),
        "property_type": doc.get("property_type"),
        "floor_area_m2": _get(doc, "technical_information.floor_area"),
        "main_fuel": _get(doc, "technical_information.main_heating_fuel"),
        "environment": _get(doc, "technical_information.building_environment"),
        # SBEM modelled primary energy intensity, kWh/m²/yr.
        "energy_kwh_m2_yr": _get(doc, "energy_use.energy_consumption_current"),
        "inspection_date": doc.get("inspection_date"),
    }


def summarise_dec(doc: dict) -> dict:
    consumption = doc.get("or_energy_consumption") or {}
    metered = {
        fuel: {"kwh": v.get("consumption"), "start": v.get("start_date"), "end": v.get("end_date"),
               "estimated": bool(v.get("estimate"))}
        for fuel, v in consumption.items() if isinstance(v, dict) and v.get("consumption") is not None
    }
    return {
        "band": doc.get("current_energy_efficiency_band"),
        "operational_rating": _get(doc, "this_assessment.energy_rating"),
        "property_type": doc.get("property_type"),
        "floor_area_m2": _get(doc, "technical_information.floor_area"),
        "main_fuel": _get(doc, "technical_information.main_heating_fuel"),
        "environment": _get(doc, "technical_information.building_environment"),
        "metered": metered,
        "period_start": doc.get("or_assessment_start_date"),
        "period_end": doc.get("or_assessment_end_date"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--council", default="Rotherham")
    ap.add_argument("--no-details", action="store_true")
    args = ap.parse_args()

    token = ingest_epc._token()
    if not token:
        raise SystemExit(f"needs {ingest_epc.TOKEN_ENV} in the environment/.env")
    session = requests.Session()
    rows = {kind: fetch_search(args.council, kind, token, session) for kind in KINDS}
    if args.no_details:
        return

    # DECs first: they carry metered consumption, the scarcer and more valuable data.
    for kind in ("display", "non-domestic"):
        todo = [c["certificateNumber"] for c in latest_per_uprn(rows[kind])
                if not (DOC_CACHE / f"{c['certificateNumber']}.json").exists()]
        print(f"  {kind}: fetching {len(todo):,} certificate documents (newest per UPRN)", flush=True)
        fails = 0
        for i, cn in enumerate(todo, 1):
            fails = 0 if fetch_document(cn, token, session) else fails + 1
            if fails >= 8:
                print(f"    stopped at {i}/{len(todo)} - rate limited; re-run to resume", flush=True)
                return
            time.sleep(ingest_epc.RATE_LIMIT_SLEEP)
            if i % 100 == 0:
                print(f"    {i}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
