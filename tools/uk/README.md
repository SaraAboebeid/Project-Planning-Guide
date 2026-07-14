# UK data pipeline

Builds the building payloads the 3D viewer extrudes for UK focus districts
(currently 4, all in London — see `cities.py`). Mirrors the Swedish pipeline's
output schema exactly, so the existing viewer, legend, and Data Explorer need
no changes when a new district is added.

## Sources

| Source | What it provides | Needs |
|---|---|---|
| **OpenStreetMap** (Overpass) | Building footprints, address tags, UPRN | nothing — public API |
| **EUBUCCO v0.2** | Height, floors, construction year, dwelling subtype | a NUTS2-region `.parquet` file in `data/eubucco/` (see below) |
| **EPC register** (get-energy-performance-data.communities.gov.uk) | Real energy certificates | `UK_EPC_API_TOKEN` in `.env` (GOV.UK One Login) |
| **English Housing Survey 2024-25** | National band/cost priors, used when no certificate matches | nothing — already ingested |
| **EPISCOPE/TABULA England** (BRE brochure) | Envelope U-values by dwelling type + era | nothing — already ingested |

## One-time setup (already done, listed for reference)

```
python tools/uk/ingest_ehs.py --download     # -> frontend/public/uk/ehs_2024_25.json, epc_band_priors.json, retrofit_cost_band_c.json
python tools/uk/ingest_tabula.py --download  # -> frontend/public/uk/tabula_gb.json
```

These are national datasets, not per-city — never need re-running unless a
newer EHS/TABULA edition is published.

## Adding a new district

1. **Find its EUBUCCO NUTS2 file.** EUBUCCO's public bucket is organised at
   NUTS2 granularity (4-char codes like `UKI3`), not the 5-char NUTS3 codes
   Wikipedia's tables show — a NUTS3-keyed URL 404s even though EUBUCCO
   genuinely has the data. Look up which NUTS2 region the new spot falls in
   (Eurostat/Wikipedia "NUTS statistical regions of the United Kingdom"),
   then check if `data/eubucco/<CODE>.parquet` already exists:
   - `UKI3` = Inner London West (Camden, Westminster, Kensington & Chelsea,
     Hammersmith & Fulham, Wandsworth) — **already downloaded**
   - `UKI4` = Inner London East (Hackney, Tower Hamlets, Islington, Southwark,
     Lewisham, Lambeth) — **already downloaded**
   - `UKG3` = West Midlands (Birmingham, Solihull, Coventry, ...) — **already downloaded**
   - `UKF1` = Derbyshire & Nottinghamshire — **already downloaded**
   - Anywhere else (Outer London, other UK cities) needs a new download:
     ```
     curl -L -o data/eubucco/<CODE>.parquet \
       https://s3.eubucco.com/eubucco/v0.2/buildings/parquet/nuts_id=<CODE>/<CODE>.parquet
     ```
     Verify the code resolves before assuming coverage — try a HEAD request first.

2. **Add an entry to `cities.py`** — `id`, `name`, `district`, `region` (an EHS
   region key: London / West Midlands / East Midlands / etc — must match a key
   in `frontend/public/uk/epc_band_priors.json`'s `priors.region`), `lat`,
   `lon`, `radius_m` (900-1200 has worked well — a few thousand buildings),
   `local_authority`, `eubucco_file` (the NUTS2 file from step 1).

3. **Run the pipeline:**
   ```
   python tools/uk/uk_data_pipeline.py --city <new_id>
   ```
   This fetches OSM footprints (cached in `data/uk_raw/osm_<id>.json`),
   real EPC certificates if `UK_EPC_API_TOKEN` is set (cached per-postcode in
   `data/uk_raw/epc_cache/`), EUBUCCO height/floors/type enrichment, and TABULA
   envelope matching — then writes
   `frontend/public/uk/buildings_<id>.json` and updates `cities.json`.

4. **Rebuild the viewer:**
   ```
   python build.py --uk
   ```

### EPC rate limit — be patient, don't parallelise

The API's real burst limit is much tighter than its documented "6000
requests/5 min" — it can 429 after as few as ~25 requests even at a slow pace,
and the cooldown doesn't clear on retry backoff alone; it needs real wall-clock
time to pass. `ingest_epc.py` already paces at 2s/request with patient
retries (`RATE_LIMIT_SLEEP`, `MAX_RETRIES`), which comfortably avoided the
limit across all 4 existing districts. If you do get a `429` that won't clear,
just wait a few minutes and re-run — already-cached postcodes are skipped, so
nothing already fetched is lost.

Certificate **detail** enrichment (floor area, property type, age band, SAP
score — beyond just the band) needs a second request *per matched
certificate*, which can be thousands of extra requests. It's opt-in:
```
python tools/uk/uk_data_pipeline.py --city <new_id> --epc-details
```

## Files

- `cities.py` — the city/district registry (single source of truth for lat/lon/radius/region/eubucco_file)
- `ingest_epc.py` — EPC register client (real bearer-token API; also reads the bulk CSV export as an alternative)
- `ingest_eubucco.py` — loads + spatially filters a EUBUCCO NUTS2 file for one city
- `ingest_ehs.py` — parses the English Housing Survey 2024-25 annex tables (`.ods`) into band priors + retrofit costs
- `ingest_tabula.py` — parses the EPISCOPE/TABULA England brochure (`.pdf`) into envelope archetypes
- `uk_data_pipeline.py` — orchestrates all of the above per city, joins OSM+EUBUCCO+EPC+EHS+TABULA, writes the building payload

## Known gap

`frontend/public/uk/{eubucco,epc,tabula}_uk_sample.json` and
`english_housing_survey_2024_2025_sample.json` are leftover placeholder files
from before this pipeline existed — nothing references them anymore
(confirmed via repo-wide search). Safe to delete whenever; left alone for now
since deleting wasn't asked for.
