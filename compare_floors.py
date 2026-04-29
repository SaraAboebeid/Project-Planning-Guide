"""
Cross-check building floors: EUBUCCO (SE23) vs Swedish EPC database
"""
import duckdb
import geopandas as gpd
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
EPC_DB = DATA_DIR / "sensitivity" / "epc_sweden.duckdb"
EUBUCCO_FILE = DATA_DIR / "eubucco" / "SE23.gpkg"

# ── 1. Load EPC footprints + floors for Gothenburg region (source = GOT) ──────
print("Loading EPC footprints for Gothenburg region...")
epc_con = duckdb.connect(str(EPC_DB), read_only=True)

epc_fp = epc_con.execute("""
    SELECT
        f.FormularId,
        f.geom,
        e.EgenAntalPlan   AS epc_floors,
        e.EgenByggnadsTyp AS building_type,
        e.IdKommun        AS municipality
    FROM footprints f
    JOIN epc e ON f.FormularId = e.FormularId
    WHERE f.source = 'GOT'
      AND e.EgenAntalPlan IS NOT NULL
      AND e.EgenAntalPlan > 0
""").df()
epc_con.close()

print(f"  {len(epc_fp):,} EPC buildings with floors data in GOT region")

# Convert WKB geometry
epc_gdf = gpd.GeoDataFrame(
    epc_fp,
    geometry=gpd.GeoSeries.from_wkb(epc_fp["geom"].apply(bytes)),
    crs="EPSG:4326"
).to_crs("EPSG:3035")
epc_gdf = epc_gdf.drop(columns=["geom"])

# ── 2. Load EUBUCCO buildings (floors only, keep geometry centroid for speed) ──
print("Loading EUBUCCO SE23 buildings...")
eubucco = gpd.read_file(EUBUCCO_FILE, columns=["floors", "height", "type", "geometry"])
print(f"  {len(eubucco):,} EUBUCCO buildings")

# ── 3. Spatial join: match EPC footprint centroids → EUBUCCO polygons ─────────
print("Spatial joining (EPC centroid within EUBUCCO footprint)...")
epc_centroids = epc_gdf.copy()
epc_centroids["geometry"] = epc_gdf.geometry.centroid

joined = gpd.sjoin(
    epc_centroids[["FormularId", "epc_floors", "building_type", "geometry"]],
    eubucco[["floors", "height", "geometry"]].rename(columns={"floors": "eubucco_floors"}),
    how="inner",
    predicate="within"
)

print(f"  Matched {len(joined):,} buildings")
if len(joined) == 0:
    raise RuntimeError("No spatial matches found — check CRS or bounding boxes.")

# ── 4. Clean & compare ─────────────────────────────────────────────────────────
df = joined[["epc_floors", "eubucco_floors", "building_type"]].copy()
df = df.dropna(subset=["epc_floors", "eubucco_floors"])
df["epc_floors"]    = pd.to_numeric(df["epc_floors"],    errors="coerce")
df["eubucco_floors"] = pd.to_numeric(df["eubucco_floors"], errors="coerce")
df = df.dropna()
df = df[(df["epc_floors"] >= 1) & (df["eubucco_floors"] >= 1)]
df = df[(df["epc_floors"] <= 30) & (df["eubucco_floors"] <= 30)]  # remove outliers

n = len(df)
exact_match   = (df["epc_floors"] == df["eubucco_floors"]).sum()
within_1      = (abs(df["epc_floors"] - df["eubucco_floors"]) <= 1).sum()
diff          = df["eubucco_floors"] - df["epc_floors"]
mae           = diff.abs().mean()
rmse          = np.sqrt((diff**2).mean())
mean_err      = diff.mean()

print(f"\n{'='*50}")
print(f"FLOORS COMPARISON — EUBUCCO vs EPC (n={n:,})")
print(f"{'='*50}")
print(f"Exact match:          {exact_match:,}  ({100*exact_match/n:.1f}%)")
print(f"Within ±1 floor:      {within_1:,}  ({100*within_1/n:.1f}%)")
print(f"MAE:                  {mae:.2f} floors")
print(f"RMSE:                 {rmse:.2f} floors")
print(f"Mean error (bias):    {mean_err:+.2f} floors  {'(EUBUCCO overestimates)' if mean_err>0 else '(EUBUCCO underestimates)'}")
print(f"{'='*50}")

# Per building type
print("\nBreakdown by building type:")
for btype, grp in df.groupby("building_type"):
    g_exact = (grp["epc_floors"] == grp["eubucco_floors"]).mean() * 100
    g_mae   = (grp["eubucco_floors"] - grp["epc_floors"]).abs().mean()
    print(f"  {btype:<30}  n={len(grp):>6,}  exact={g_exact:5.1f}%  MAE={g_mae:.2f}")

# ── 5. Plot ───────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(16, 5))
fig.suptitle("EUBUCCO vs EPC — Number of Floors (Gothenburg region, SE23)", fontsize=13)

# A) Scatter
ax = axes[0]
max_f = int(max(df["epc_floors"].max(), df["eubucco_floors"].max()))
counts = df.groupby(["epc_floors", "eubucco_floors"]).size().reset_index(name="count")
sc = ax.scatter(counts["epc_floors"], counts["eubucco_floors"],
                s=counts["count"] / counts["count"].max() * 600 + 10,
                c=counts["count"], cmap="YlOrRd", alpha=0.8, edgecolors="gray", linewidths=0.3)
ax.plot([0, max_f], [0, max_f], "k--", lw=1, label="1:1 line")
ax.set_xlabel("EPC floors (reported)")
ax.set_ylabel("EUBUCCO floors (estimated)")
ax.set_title("Scatter (bubble = frequency)")
ax.legend(fontsize=8)
plt.colorbar(sc, ax=ax, label="# buildings")

# B) Error distribution
ax = axes[1]
err_counts = diff.value_counts().sort_index()
colors = ["#d73027" if i != 0 else "#4dac26" for i in err_counts.index]
ax.bar(err_counts.index, err_counts.values, color=colors, edgecolor="white", linewidth=0.5)
ax.set_xlabel("EUBUCCO − EPC (floors)")
ax.set_ylabel("Number of buildings")
ax.set_title(f"Error distribution\nMAE={mae:.2f}, Bias={mean_err:+.2f}")
ax.axvline(0, color="black", lw=1.5)
ax.xaxis.set_major_locator(mticker.MaxNLocator(integer=True))
pct_exact = 100 * exact_match / n
ax.text(0.97, 0.97, f"Exact: {pct_exact:.1f}%\n±1: {100*within_1/n:.1f}%",
        transform=ax.transAxes, ha="right", va="top",
        bbox=dict(boxstyle="round", fc="white", alpha=0.8), fontsize=9)

# C) Heatmap confusion matrix
ax = axes[2]
max_show = min(int(df["epc_floors"].quantile(0.99)), int(df["eubucco_floors"].quantile(0.99)), 10)
matrix = pd.crosstab(
    df["eubucco_floors"].clip(upper=max_show),
    df["epc_floors"].clip(upper=max_show)
)
im = ax.imshow(matrix.values, cmap="Blues", aspect="auto",
               extent=[0.5, max_show + 0.5, max_show + 0.5, 0.5])
ax.set_xlabel("EPC floors")
ax.set_ylabel("EUBUCCO floors")
ax.set_title(f"Confusion matrix (floors 1–{max_show})")
ax.set_xticks(range(1, max_show + 1))
ax.set_yticks(range(1, max_show + 1))
plt.colorbar(im, ax=ax, label="# buildings")

plt.tight_layout()
out_path = DATA_DIR / "eubucco" / "floors_comparison_eubucco_vs_epc.png"
plt.savefig(out_path, dpi=150, bbox_inches="tight")
print(f"\nPlot saved to: {out_path}")
plt.show()
