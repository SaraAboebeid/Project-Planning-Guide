import requests, sys, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Test: OSM API with a small tile — parse cycling ways from XML
bbox = "11.93,57.69,11.98,57.71"   # small central Gothenburg tile
url = f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"
print(f"Fetching {url} ...")
r = requests.get(url, timeout=30)
print(f"Status: {r.status_code}  Size: {len(r.content)} bytes")
print(r.text[:300])

if r.ok:
    root = ET.fromstring(r.content)
    # Index nodes
    nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat")))
             for n in root.iter("node")}
    # Find cycling ways
    bike_ways, foot_ways = 0, 0
    for way in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in way.iter("tag")}
        hw = tags.get("highway", "")
        if hw == "cycleway" or tags.get("bicycle") == "designated":
            bike_ways += 1
        elif hw in ("footway", "pedestrian") or (hw == "path" and tags.get("foot") in ("yes", "designated")):
            foot_ways += 1
    print(f"Bike ways: {bike_ways}, Foot ways: {foot_ways}, Total nodes indexed: {len(nodes)}")
