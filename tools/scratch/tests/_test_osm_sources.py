"""
Test alternative OSM data sources for Gothenburg green areas.
"""
import requests, json

BBOX = "11.79,57.60,12.15,57.83"   # lon_min,lat_min,lon_max,lat_max

# ── 1. OHSOME API (HeiGIT research infrastructure, different from Overpass) ──
print("=== OHSOME API ===")
ohsome_url = "https://api.ohsome.org/v1/elements/count"
try:
    r = requests.post(ohsome_url, data={
        'bboxes': BBOX,
        'filter': 'leisure=park and type:way',
        'time': '2024-01-01',
    }, timeout=15)
    print(f"Status: {r.status_code}  Body: {r.text[:200]}")
except Exception as e:
    print(f"FAIL: {e}")

# ── 2. OHSOME geometry endpoint ──
print("\n=== OHSOME geometry (count only) ===")
try:
    r = requests.post("https://api.ohsome.org/v1/elements/area", data={
        'bboxes': BBOX,
        'filter': '(leisure=park or leisure=nature_reserve or landuse=grass or landuse=forest) and type:way',
        'time': '2024-01-01',
    }, timeout=15)
    print(f"Status: {r.status_code}  Body: {r.text[:300]}")
except Exception as e:
    print(f"FAIL: {e}")

# ── 3. Nominatim search for parks ──
print("\n=== Nominatim (parks in Gothenburg) ===")
try:
    r = requests.get("https://nominatim.openstreetmap.org/search", params={
        'q': 'park Gothenburg Sweden',
        'format': 'geojson',
        'limit': 5,
        'polygon_geojson': 1,
    }, headers={'User-Agent': 'GothenburgGreenResearch/1.0'}, timeout=10)
    print(f"Status: {r.status_code}  Count: {len(r.json().get('features',[]))}")
    for f in r.json().get('features', [])[:3]:
        print(f"  {f['properties'].get('display_name','')[:60]}")
except Exception as e:
    print(f"FAIL: {e}")

# ── 4. Overpass with different format ──
print("\n=== Overpass XML format ===")
try:
    r = requests.post("https://overpass-api.de/api/interpreter",
                      data={'data': '<osm-script timeout="15" element-limit="1000"><query type="way"><has-kv k="leisure" v="park"/><bbox-query s="57.65" n="57.72" w="11.90" e="12.00"/></query><count/></osm-script>'},
                      headers={'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://overpass-turbo.eu/', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 overpass-turbo/0.7.57'},
                      timeout=12)
    print(f"Status: {r.status_code}  Body: {r.text[:200]}")
except Exception as e:
    print(f"FAIL: {e}")
