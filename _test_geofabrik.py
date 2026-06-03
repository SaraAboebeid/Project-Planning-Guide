import requests

urls = [
    'https://download.geofabrik.de/europe/sweden/vastsvenska-regionen-latest.osm.pbf',
    'https://download.geofabrik.de/europe/sweden/vastsverige-latest.osm.pbf',
    'https://download.geofabrik.de/europe/sweden/vastsvenska-regionen-latest-free.shp.zip',
]

for url in urls:
    fname = url.split('/')[-1]
    try:
        r = requests.get(url, timeout=8, allow_redirects=True, stream=True)
        cl = r.headers.get('Content-Length', 0)
        mb = int(cl) // 1024 // 1024 if cl else '?'
        print(f'{fname}: {r.status_code} {mb} MB | final_url={r.url[:80]}')
        r.close()
    except Exception as e:
        print(f'{fname}: FAIL {str(e)[:80]}')
