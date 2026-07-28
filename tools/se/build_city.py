"""Build one city's buildings_<slug>.json from EUBUCCO + national EPC + TABULA.

    python tools/se/build_city.py malmo      # (run from the repo root)

Runs the parameterized data_pipeline.process_data(city) and writes the same
record format the Gothenburg viewer uses, per city.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools" / "se"))

from data_pipeline import process_data     # noqa: E402
from build import _sanitize_records         # noqa: E402 (same cleaning as the Gothenburg build)
from se_cities import get_city              # noqa: E402


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    key = sys.argv[1] if len(sys.argv) > 1 else "malmo"
    city = get_city(key)
    slug = city["slug"]
    data = process_data(key)
    clean = _sanitize_records(data["records"])
    payload = json.dumps(clean, ensure_ascii=False)
    for out in [ROOT / "assets" / f"buildings_{slug}.json",
                ROOT / "frontend" / "public" / f"buildings_{slug}.json"]:
        out.write_text(payload, encoding="utf-8")
        print(f"[write] {out}  ({len(clean):,} buildings)", flush=True)
    # quick quality signal
    with_epc = sum(1 for r in clean if r.get("has_epc"))
    print(f"[done] {city['name']}: {len(clean):,} buildings, {with_epc:,} with EPC "
          f"({100*with_epc/max(1,len(clean)):.0f}%)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
