"""
lm_link_city.py - Lantmäteriet buildings linked to Boverket EPCs, for any Swedish city.

Gothenburg's EPC chain runs on the `footprints` table inside
data/sensitivity/epc_sweden.duckdb: Lantmäteriet building footprints that already
carry the EPC FormularId and the property designation (fastighetsbeteckning).
That table arrived pre-built and covers only the Gothenburg region. This script
builds the same thing for another city, with the method of
Sara_Lantmateriet_scripts/enrich_footprints.py:

  1. Download the city's municipalities from Lantmäteriet's open data (CC0,
     STAC catalogue api.lantmateriet.se/stac-vektor/v1): collection `byggnader`
     (building footprints) and `fastighetsindelning` (property polygons).
  2. Spatial: each building's representative point -> the FASTIGHET polygon it
     falls in (largest-overlap fallback) -> fastighetsbeteckning.
  3. Attribute: (fastighetsbeteckning, husnummer) -> latest EPC FormularId; then
     fastighetsbeteckning alone where the property's EPCs name one husnummer or
     the building has none; then any other property the building touches.
  4. Write data/lm/footprints_<slug>.parquet with the columns data_pipeline.py
     reads from the Gothenburg table (geom = WKB, EPSG:4326).

Downloads need a Geotorget account: LANTMATERIET_USER / LANTMATERIET_PASSWORD
in .env (never in code). Downloads are cached in data/lm/raw/.

    python tools/se/lm_link_city.py malmo
"""

from __future__ import annotations

import io
import os
import sys
import time
import zipfile
from pathlib import Path

import duckdb
import geopandas as gpd
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from se_cities import get_city  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "lm" / "raw"
OUT = ROOT / "data" / "lm"
STAC = "https://api.lantmateriet.se/stac-vektor/v1"
EPC_DB = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"


def _auth() -> tuple[str, str]:
    """Geotorget login from the environment, the project .env, or the .env next to
    the original Lantmäteriet scripts (../Sara_Lantmateriet_scripts, LM_USER/LM_PASS)."""
    def read(p: Path) -> dict:
        out = {}
        if p.exists():
            for line in p.read_text(encoding="utf-8-sig").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip().strip('"').strip("'")
        return out
    for env in (dict(os.environ), read(ROOT / ".env"), read(ROOT.parent / "Sara_Lantmateriet_scripts" / ".env")):
        user = env.get("LANTMATERIET_USER") or env.get("LM_USER")
        pwd = env.get("LANTMATERIET_PASSWORD") if env.get("LANTMATERIET_USER") else env.get("LM_PASS")
        if user and pwd:
            return user, pwd
    raise SystemExit("No Geotorget login: set LANTMATERIET_USER/LANTMATERIET_PASSWORD in .env "
                     "(or LM_USER/LM_PASS in ../Sara_Lantmateriet_scripts/.env).")


def _kommun_codes(names: list[str]) -> dict[str, str]:
    """Municipality name -> 4-digit code, from the EPC table itself (IdKommun / _kommunkod_4digit)."""
    con = duckdb.connect(str(EPC_DB), read_only=True)
    rows = con.execute(
        "SELECT DISTINCT IdKommun, _kommunkod_4digit FROM epc WHERE IdKommun IN ("
        + ",".join("?" * len(names)) + ")", names).fetchall()
    con.close()
    return {n: c for n, c in rows if c}


def _download(session: requests.Session, collection: str, code: str) -> Path:
    """One municipality's GeoPackage from the STAC collection (cached)."""
    RAW.mkdir(parents=True, exist_ok=True)
    out = RAW / f"{collection}_kn{code}.gpkg"
    if out.exists():
        return out
    item = session.get(f"{STAC}/collections/{collection}/items/{code}", timeout=60)
    item.raise_for_status()
    href = item.json()["assets"]["data"]["href"]
    r = session.get(href, timeout=600)
    if r.status_code in (401, 403):
        raise SystemExit(f"Lantmäteriet refused {collection} {code} ({r.status_code}) - check the Geotorget "
                         "account and that the open-data product is ordered.")
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        name = next(n for n in z.namelist() if n.endswith(".gpkg"))
        out.write_bytes(z.read(name))
    print(f"    {collection} {code}: {out.stat().st_size / 1e6:.1f} MB")
    return out


def _epc_lookup(codes: list[str]) -> pd.DataFrame:
    con = duckdb.connect(str(EPC_DB), read_only=True)
    epc = con.execute(
        "SELECT FormularId, IdFastBet, IdHusnr FROM epc WHERE _kommunkod_4digit IN ("
        + ",".join("?" * len(codes)) + ")", codes).fetchdf()
    con.close()
    epc["_fb"] = epc["IdFastBet"].str.strip().str.upper()
    epc["_hn"] = pd.to_numeric(epc["IdHusnr"], errors="coerce").astype("Int64")
    # Latest certificate per (property, building number).
    return (epc.sort_values("FormularId", ascending=False)
               .drop_duplicates(subset=["_fb", "_hn"])[["_fb", "_hn", "FormularId"]])


def _clean_fastighet(s: pd.Series) -> pd.Series:
    return s.fillna("").str.split(">").str[0].str.strip()


def link(byggnad: gpd.GeoDataFrame, fastighet: gpd.GeoDataFrame, epc: pd.DataFrame) -> gpd.GeoDataFrame:
    # One row per building: prefer the roof-edge (Takkant) outline, then the largest.
    rank = {"Takkant": 0, "Fasad": 1, "Ospecificerad": 2, "Illustrativt läge": 3}
    byggnad = (byggnad.assign(_r=byggnad["insamlingslage"].map(rank).fillna(9), _a=byggnad.geometry.area)
                      .sort_values(["_r", "_a"], ascending=[True, False])
                      .drop_duplicates("objektidentitet").drop(columns=["_r", "_a"]).reset_index(drop=True))
    # Ordinary property parcels only (not joint-property / samfällighet areas). The
    # designation is built as the EPC writes it: "TRAKT block:enhet", or "TRAKT enhet"
    # when the district has no blocks.
    f = fastighet.loc[fastighet["objekttyp"] == "fastighetsområde"].copy()
    blk = f["block"].fillna("").astype(str).str.strip()
    f["fastighet"] = (f["trakt"].fillna("").str.strip() + " "
                      + blk.where(blk == "", blk + ":") + f["enhet"].astype("Int64").astype(str))
    parcels = f[["fastighet", "geometry"]].reset_index(drop=True)

    pts = byggnad[["objektidentitet", "geometry"]].copy()
    pts["geometry"] = pts.geometry.representative_point()
    cj = (gpd.sjoin(pts, parcels, how="left", predicate="within")
             .drop_duplicates("objektidentitet").set_index("objektidentitet")["fastighet"])
    byggnad["fastighet_raw"] = byggnad["objektidentitet"].map(cj)

    miss = byggnad["fastighet_raw"].isna()
    if miss.any():
        hits = gpd.sjoin(byggnad.loc[miss, ["objektidentitet", "geometry"]], parcels, how="inner", predicate="intersects")
        if len(hits):
            hits["_ov"] = [g.intersection(parcels.geometry.iloc[j]).area for g, j in zip(hits.geometry, hits["index_right"])]
            best = hits.sort_values("_ov", ascending=False).drop_duplicates("objektidentitet").set_index("objektidentitet")["fastighet"]
            byggnad.loc[miss, "fastighet_raw"] = byggnad.loc[miss, "objektidentitet"].map(best)

    byggnad["fastighetsbeteckning"] = _clean_fastighet(byggnad["fastighet_raw"])
    byggnad["_fb"] = byggnad["fastighetsbeteckning"].str.upper()
    byggnad["_hn"] = pd.to_numeric(byggnad["husnummer"], errors="coerce").astype("Int64")

    m = byggnad.merge(epc, on=["_fb", "_hn"], how="left")
    n_exact = int(m["FormularId"].notna().sum())

    # Property-only match where it cannot pick the wrong building of the property.
    single = set(epc.groupby("_fb")["_hn"].nunique().loc[lambda s: s == 1].index)
    fb_one = epc.sort_values("FormularId", ascending=False).drop_duplicates("_fb").set_index("_fb")["FormularId"]
    can = m["FormularId"].isna() & (m["_fb"] != "") & (m["_fb"].isin(single) | m["_hn"].isna())
    m.loc[can, "FormularId"] = m.loc[can, "_fb"].map(fb_one)
    n_prop = int(m["FormularId"].notna().sum()) - n_exact

    # Buildings spanning parcels: try every property they touch.
    still = m["FormularId"].isna()
    if still.any():
        sub = gpd.GeoDataFrame(m.loc[still, ["objektidentitet", "_hn", "geometry"]], geometry="geometry", crs=byggnad.crs)
        hits = gpd.sjoin(sub, parcels, how="inner", predicate="intersects")
        if len(hits):
            hits["_fb"] = _clean_fastighet(hits["fastighet"]).str.upper()
            alt = (hits.merge(epc, on=["_fb", "_hn"], how="inner")
                       .sort_values("FormularId", ascending=False).drop_duplicates("objektidentitet")
                       .set_index("objektidentitet"))
            sel = m["objektidentitet"].isin(alt.index) & still
            m.loc[sel, "FormularId"] = m.loc[sel, "objektidentitet"].map(alt["FormularId"])
            m.loc[sel, "fastighetsbeteckning"] = m.loc[sel, "objektidentitet"].map(alt["_fb"])
    n_multi = int(m["FormularId"].notna().sum()) - n_exact - n_prop

    n = len(m)
    res = m["objekttyp"].eq("Bostad")
    print(f"  buildings {n:,}  on a property {int((m['fastighetsbeteckning'] != '').sum()):,}  "
          f"EPC-linked {int(m['FormularId'].notna().sum()):,} (exact {n_exact:,}, property {n_prop:,}, "
          f"multi-parcel {n_multi:,});  residential with EPC {int((res & m['FormularId'].notna()).sum()):,}/{int(res.sum()):,}")
    return gpd.GeoDataFrame(m.drop(columns=["_fb", "_hn", "fastighet_raw"]), geometry="geometry", crs=byggnad.crs)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python tools/se/lm_link_city.py <city_key>")
    city = get_city(sys.argv[1])
    t0 = time.time()
    names = city["region_kommuns"]
    # On-demand municipalities carry their code; hand-written cities resolve names via the EPC table.
    codes = city.get("kommun_codes") or _kommun_codes(names)
    print(f"{city['name']}: {len(codes)} municipalities {sorted(codes)}")
    s = requests.Session()
    s.auth = _auth()
    s.headers["User-Agent"] = "ppg-research/1.0 (Chalmers)"

    # Only the working bbox is needed, but Lantmäteriet serves whole municipalities.
    lo, la, LO, LA = city["bbox4326"]
    frames = []
    epc = _epc_lookup(list(codes.values()))
    for name, code in sorted(codes.items()):
        b = gpd.read_file(_download(s, "byggnader", code), layer="byggnad")
        f = gpd.read_file(_download(s, "fastighetsindelning", code), layer="registerenhetsomradesyta")  # property polygons
        clip = gpd.GeoSeries.from_xy([lo, LO], [la, LA], crs=4326).to_crs(b.crs).total_bounds
        b = b.cx[clip[0] - 200:clip[2] + 200, clip[1] - 200:clip[3] + 200]
        if b.empty:
            continue
        print(f"  {name} ({code}):")
        linked = link(b, f.to_crs(b.crs), epc)
        linked["source"] = code
        frames.append(linked)

    allb = pd.concat(frames, ignore_index=True).to_crs(4326)
    cols = ["objektidentitet", "versiongiltigfran", "lagesosakerhetplan", "lagesosakerhethojd",
            "ursprunglig_organisation", "objektversion", "objekttypnr", "objekttyp", "insamlingslage",
            "byggnadsnamn1", "byggnadsnamn2", "byggnadsnamn3", "husnummer", "huvudbyggnad",
            "andamal1", "andamal2", "andamal3", "andamal4", "andamal5", "source", "FormularId",
            "fastighetsbeteckning"]
    df = pd.DataFrame({c: allb[c] if c in allb else None for c in cols})
    df["FormularId"] = pd.to_numeric(df["FormularId"], errors="coerce").astype("Int64")
    df["geom"] = allb.geometry.to_wkb()
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"footprints_{city['slug']}.parquet"
    df.to_parquet(out, index=False)
    print(f"-> {out.relative_to(ROOT)}: {len(df):,} footprints, {int(df['FormularId'].notna().sum()):,} "
          f"with an EPC ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
