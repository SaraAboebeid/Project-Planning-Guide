import json

with open('frontend/public/buildings.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

has_both = [b for b in data if b.get('area') and b.get('floors') and b.get('floors') > 0 and b.get('footprint_m2')]
print(f'Buildings with area+floors+footprint_m2: {len(has_both)}')
print()

mismatches = 0
for b in has_both[:20]:
    fp = b['footprint_m2']
    area = b['area']
    floors = b['floors']
    derived = round(area / floors, 1)
    addr = b.get('address', '?')
    diff_pct = abs(fp - derived) / derived * 100 if derived else 0
    status = 'OK' if diff_pct < 30 else 'MISMATCH'
    if status == 'MISMATCH':
        mismatches += 1
    print(f'  {addr}: footprint_m2={fp}  area(Atemp)={area}  floors={floors}  Atemp/floors={derived}  diff={diff_pct:.0f}%  [{status}]')

print(f'\nMismatches in first 20: {mismatches}')
print()

# Also check via polygon area using shapely for a sample
print("Checking polygon area via shapely (EPSG:4326 -> EPSG:3006)...")
try:
    from shapely.geometry import Polygon
    import pyproj
    from shapely.ops import transform as shp_transform

    transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)

    for b in has_both[:5]:
        coords_4326 = b['coordinates'][0]  # [[lon, lat], ...]
        poly_4326 = Polygon(coords_4326)
        poly_3006 = shp_transform(transformer.transform, poly_4326)
        poly_area = round(poly_3006.area, 1)
        fp = b['footprint_m2']
        addr = b.get('address', '?')
        print(f'  {addr}: stored footprint_m2={fp}  computed from polygon={poly_area}  match={abs(fp-poly_area)<1}')
except ImportError as e:
    print(f"  (shapely/pyproj not available: {e})")
