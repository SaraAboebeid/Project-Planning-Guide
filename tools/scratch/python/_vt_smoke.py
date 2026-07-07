import urllib.request, json

base = 'http://localhost:8000/api/vasttrafik'
tests = [
    base + '/stops?south=57.68&north=57.72&west=11.95&east=12.00',
    base + '/positions?south=57.68&north=57.72&west=11.95&east=12.00',
    base + '/disruptions',
    base + '/parking',
    base + '/parking/33101/availability',
]
for url in tests:
    try:
        r = urllib.request.urlopen(url, timeout=20)
        d = json.loads(r.read())
        cnt = d.get('count', 'n/a')
        print(f"OK   {url[40:][:55]}  count={cnt}")
    except Exception as e:
        print(f"FAIL {url[40:][:55]}  {e}")
