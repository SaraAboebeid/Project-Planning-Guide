"""
Try Lantmäteriet (Swedish National Geodata) and correct Nominatim approaches.
"""
import requests, json, time

HDR = {'User-Agent': 'GothenburgGreenStudy/1.0'}

# ── 1. Nominatim free-text search for parks in Gothenburg ──
print("=== Nominatim free-text search ===")
queries = ['park Gothenburg', 'forest Gothenburg', 'garden Gothenburg']
features = []
for q in queries:
    time.sleep(1)
    r = requests.get("https://nominatim.openstreetmap.org/search", params={
        'q': q,
        'viewbox': '11.79,57.60,12.15,57.83',
        'bounded': 1,
        'format': 'geojson',
        'polygon_geojson': 1,
        'limit': 50,
        'addressdetails': 0,
    }, headers=HDR, timeout=12)
    feats = r.json().get('features', [])
    print(f"  '{q}': {len(feats)}  status={r.status_code}")
    # Only keep Polygon/MultiPolygon (park shapes, not point results)
    for f in feats:
        if f['geometry']['type'] in ('Polygon', 'MultiPolygon'):
            features.append(f)

# Deduplicate
seen = set()
unique = [f for f in features if not (f['properties'].get('osm_id') in seen or seen.add(f['properties'].get('osm_id')))]
print(f"Polygon features: {len(unique)}")

# ── 2. OSM API with tiny bboxes ──
print("\n=== OSM API tiny tiles ===")
tiles = [
    ('11.93,57.685,11.955,57.70', 'Haga/center'),
    ('11.90,57.69,11.925,57.705', 'Slottsskogen'),
    ('11.96,57.70,11.985,57.715', 'Kungsparken'),
]
for bbox, name in tiles:
    try:
        r = requests.get(f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}",
                         headers=HDR, timeout=15)
        print(f"  {name} bbox={bbox}: {r.status_code} {len(r.text)} bytes")
        if r.status_code == 200:
            parks = r.text.count('k="leisure" v="park"')
            forests = r.text.count('k="landuse" v="forest"')
            grass = r.text.count('k="landuse" v="grass"')
            print(f"    parks={parks} forests={forests} grass={grass}")
    except Exception as e:
        print(f"  {name}: FAIL {str(e)[:50]}")

# ── 3. Lantmäteriet Open API ──
print("\n=== Lantmäteriet API ===")
try:
    r = requests.get("https://api.lantmateriet.se/distribution/produkter/topowebb/v2/", 
                     headers=HDR, timeout=10)
    print(f"  Lantmateriet topo: {r.status_code} {r.text[:100]}")
except Exception as e:
    print(f"  Lantmateriet: FAIL {str(e)[:60]}")

# ── 4. Overpass with small central bbox + Referer ──
print("\n=== Overpass small bbox ===")
q = '[out:json][timeout:20][maxsize:500000];(way["leisure"="park"](57.67,11.90,57.74,12.02);way["landuse"="grass"](57.67,11.90,57.74,12.02);way["landuse"="forest"](57.67,11.90,57.74,12.02););out geom;'
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
    try:
        r = requests.post(url, data={'data': q},
                          headers={**HDR, 'Referer': 'https://overpass-turbo.eu/'},
                          timeout=20)
        print(f"  {url.split('/')[2]}: {r.status_code} {r.text[:100]}")
    except Exception as e:
        print(f"  {url.split('/')[2]}: FAIL {str(e)[:60]}")
