"""
Plot EUBUCCO building footprints for Gothenburg (SE23)
"""
import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data" / "eubucco"
gpkg_path = DATA_DIR / "SE23.gpkg"

print("Loading SE23 building data...")
gdf = gpd.read_file(gpkg_path)
print(f"  Loaded {len(gdf):,} buildings")
print(f"  Columns: {list(gdf.columns)}")
print(f"  CRS: {gdf.crs}")

# --- Clip to Gothenburg city core (approx bounding box in EPSG:3035) ---
# Gothenburg centre in EPSG:3035: x≈4438605, y≈3845851
from shapely.geometry import box

gothenburg_bbox = box(4425000, 3833000, 4453000, 3860000)
gdf_city = gdf[gdf.geometry.intersects(gothenburg_bbox)].copy()
print(f"  Buildings in Gothenburg city area: {len(gdf_city):,}")

# --- Colour by building type if available ---
type_col = None
for col in ["type", "building_type", "use", "function"]:
    if col in gdf_city.columns:
        type_col = col
        break

fig, axes = plt.subplots(1, 2, figsize=(18, 9))
fig.patch.set_facecolor("#1a1a2e")

# --- Left panel: full SE23 region (centroids, density) ---
ax1 = axes[0]
ax1.set_facecolor("#1a1a2e")
centroids = gdf.copy()
centroids["geometry"] = gdf.geometry.centroid
centroids = centroids.to_crs("EPSG:4326")
ax1.scatter(
    centroids.geometry.x, centroids.geometry.y,
    s=0.005, alpha=0.3, color="#00d4ff", linewidths=0,
)
ax1.set_title("SE23 – All Buildings (1.36M)", color="white", fontsize=13, pad=10)
ax1.set_xlabel("Longitude", color="#aaaaaa", fontsize=9)
ax1.set_ylabel("Latitude", color="#aaaaaa", fontsize=9)
ax1.tick_params(colors="#aaaaaa", labelsize=8)
for spine in ax1.spines.values():
    spine.set_edgecolor("#333355")

# --- Right panel: Gothenburg city footprints ---
ax2 = axes[1]
ax2.set_facecolor("#0d0d1a")

if type_col:
    top_types = gdf_city[type_col].value_counts().head(6).index.tolist()
    colors = ["#00d4ff", "#ff6b6b", "#ffd93d", "#6bcb77", "#ff922b", "#cc5de8"]
    color_map = {t: colors[i] for i, t in enumerate(top_types)}
    gdf_city["_color"] = gdf_city[type_col].map(color_map).fillna("#444466")
    gdf_city.to_crs("EPSG:4326").plot(
        ax=ax2, color=gdf_city["_color"], linewidth=0.1, edgecolor="none"
    )
    patches = [mpatches.Patch(color=color_map[t], label=t) for t in top_types]
    ax2.legend(handles=patches, loc="lower right", fontsize=7,
               facecolor="#1a1a2e", labelcolor="white", edgecolor="#333355")
else:
    gdf_city.to_crs("EPSG:4326").plot(
        ax=ax2, color="#00d4ff", linewidth=0.1, edgecolor="none", alpha=0.7
    )

ax2.set_title("Gothenburg City – Building Footprints", color="white", fontsize=13, pad=10)
ax2.set_xlabel("Longitude", color="#aaaaaa", fontsize=9)
ax2.set_ylabel("Latitude", color="#aaaaaa", fontsize=9)
ax2.tick_params(colors="#aaaaaa", labelsize=8)
for spine in ax2.spines.values():
    spine.set_edgecolor("#333355")

plt.suptitle("EUBUCCO v0.2 – Gothenburg Region (SE23)", color="white",
             fontsize=15, fontweight="bold", y=1.01)
plt.tight_layout()

out_path = DATA_DIR / "gothenburg_buildings_map.png"
plt.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
print(f"\nMap saved to: {out_path}")
plt.show()
