import requests, urllib.parse

q = '[out:json][timeout:30];(way["leisure"="park"](57.60,11.79,57.83,12.15););out count;'

HEADERS = {'User-Agent': 'Mozilla/5.0 GothenburgResearch/1.0', 'Accept': 'application/json'}

# Test GET method on the main mirrors
get_mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
]
for url in get_mirrors:
    try:
        r = requests.get(url, params={'data': q}, timeout=12, headers=HEADERS)
        print(f'GET {url} → {r.status_code}: {r.text[:100]}')
    except Exception as e:
        print(f'GET {url} → FAIL: {str(e)[:80]}')

# Try alternative endpoints
alt = [
    ('https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'POST'),
    ('https://overpass.openstreetmap.fr/api/interpreter', 'POST'),
    ('https://overpass.openstreetmap.ru/api/interpreter', 'POST'),
]
for url, method in alt:
    try:
        if method == 'POST':
            r = requests.post(url, data={'data': q}, timeout=12, headers=HEADERS)
        else:
            r = requests.get(url, params={'data': q}, timeout=12, headers=HEADERS)
        print(f'{method} {url} → {r.status_code}: {r.text[:120]}')
    except Exception as e:
        print(f'{method} {url} → FAIL: {str(e)[:80]}')
