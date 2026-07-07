"""
Download Gothenburg OSM green areas (parks, forests, gardens, grass) via Overpass API
using a tiled approach to avoid rate limiting.
Saves compact JSON of polygon centroids to assets/gothenburg_greenspaces.json
"""
import requests, json, math, time, os, xml.etree.ElementTree as ET

OUT_FILE = os.path.join(os.path.dirname(__file__), 'assets', 'gothenburg_greenspaces.json')
HEADERS = {
    'User-Agent': 'Mozilla/5.0 GothenburgGreenResearch/1.0',
    'Referer': 'https://overpass-turbo.eu/',
}

# Gothenburg bounding box
LAT0, LAT1 = 57.60, 57.83
LON0, LON1 = 11.79, 12.15

# Split into tiles — 3x4 grid (each ~7km x 9km)
ROWS, COLS = 3, 4
dlat = (LAT1 - LAT0) / ROWS
dlon = (LON1 - LON0) / COLS

GREEN_TAGS = [
    ('leisure', 'park'),
    ('leisure', 'garden'),
    ('leisure', 'nature_reserve'),
    ('landuse', 'grass'),
    ('landuse', 'forest'),
    ('landuse', 'recreation_ground'),
    ('landuse', 'meadow'),
    ('natural', 'wood'),
    ('natural', 'scrub'),
    ('natural', 'grassland'),
]

OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]


def poly_centroid(nodes_map, nd_refs):
    """Compute centroid of a polygon from OSM node refs."""
    pts = [nodes_map[r] for r in nd_refs if r in nodes_map]
    if len(pts) < 3:
        return None
    lo = sum(p[0] for p in pts) / len(pts)
    la = sum(p[1] for p in pts) / len(pts)
    return lo, la


def poly_area_m2(nodes_map, nd_refs):
    """Approximate polygon area in m² using Shoelace + flat-Earth."""
    pts = [nodes_map[r] for r in nd_refs if r in nodes_map]
    if len(pts) < 3:
        return 0
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i+1][1] - pts[i+1][0] * pts[i][1]
    return abs(a / 2) * 111320 * 111320 * 0.536  # rough m²


def fetch_tile(s, w, n, e):
    """Fetch green area ways AND relations for a bbox tile via Overpass."""
    tag_filters = ''.join(
        f'way["{k}"="{v}"]({s},{w},{n},{e});rel["{k}"="{v}"]({s},{w},{n},{e});'
        for k, v in GREEN_TAGS
    )
    query = f'[out:xml][timeout:45][maxsize:100000000];({tag_filters});out body;>;out skel qt;'
    
    for mirror in OVERPASS_MIRRORS:
        try:
            r = requests.post(mirror, data={'data': query},
                              headers=HEADERS, timeout=35)
            if r.status_code == 200:
                return r.text, mirror
            print(f"    {mirror.split('/')[2]}: {r.status_code}")
        except Exception as e:
            print(f"    {mirror.split('/')[2]}: {str(e)[:50]}")
        time.sleep(1)
    return None, None


def parse_ways(xml_text):
    """Parse Overpass XML into list of {lat, lon, type, area_m2, name}.
    Handles both simple ways and multipolygon relations."""
    root = ET.fromstring(xml_text)

    # Build node map: id → (lon, lat)
    nodes = {}
    for node in root.findall('node'):
        nid = node.get('id')
        lat = float(node.get('lat', 0))
        lon = float(node.get('lon', 0))
        nodes[nid] = (lon, lat)

    # Build way map: id → nd_refs  (needed for relation parsing)
    ways_map = {}
    for way in root.findall('way'):
        wid = way.get('id')
        ways_map[wid] = [nd.get('ref') for nd in way.findall('nd')]

    results = []

    # ── Simple ways ──────────────────────────────────────────────────────────
    # Only include ways that are NOT members of a relation (to avoid double-counting)
    rel_way_ids = set()
    for rel in root.findall('relation'):
        for member in rel.findall('member'):
            if member.get('type') == 'way':
                rel_way_ids.add(member.get('ref'))

    for way in root.findall('way'):
        wid = way.get('id')
        if wid in rel_way_ids:
            continue  # will be covered by the relation
        tags = {t.get('k'): t.get('v') for t in way.findall('tag')}
        nd_refs = ways_map.get(wid, [])
        gtype = None
        for k, v in GREEN_TAGS:
            if tags.get(k) == v:
                gtype = f'{k}={v}'
                break
        if gtype is None:
            continue
        ctr = poly_centroid(nodes, nd_refs)
        if ctr is None:
            continue
        area = poly_area_m2(nodes, nd_refs)
        results.append({
            'lon': round(ctr[0], 6),
            'lat': round(ctr[1], 6),
            'type': gtype,
            'area': round(area),
            'name': tags.get('name', ''),
        })

    # ── Relations (multipolygons) ─────────────────────────────────────────────
    for rel in root.findall('relation'):
        tags = {t.get('k'): t.get('v') for t in rel.findall('tag')}
        gtype = None
        for k, v in GREEN_TAGS:
            if tags.get(k) == v:
                gtype = f'{k}={v}'
                break
        if gtype is None:
            continue
        # Collect outer member ways; compute area per ring (not concatenated)
        outer_rings = []
        for member in rel.findall('member'):
            if member.get('type') == 'way' and member.get('role') in ('outer', ''):
                nds = ways_map.get(member.get('ref'), [])
                if nds:
                    outer_rings.append(nds)
        if not outer_rings:
            continue
        # Centroid from all outer-ring nodes
        all_nd_refs = [nd for ring in outer_rings for nd in ring]
        ctr = poly_centroid(nodes, all_nd_refs)
        if ctr is None:
            continue
        # Area: sum each ring separately (correct Shoelace), cap at 10 km²
        area = min(sum(poly_area_m2(nodes, ring) for ring in outer_rings), 10_000_000)
        results.append({
            'lon': round(ctr[0], 6),
            'lat': round(ctr[1], 6),
            'type': gtype,
            'area': round(area),
            'name': tags.get('name', ''),
        })

    return results


def main():
    all_greens = []
    seen_locs = set()
    total_tiles = ROWS * COLS
    
    print(f"Fetching {total_tiles} tiles ({ROWS}x{COLS} grid)...")
    
    for row in range(ROWS):
        for col in range(COLS):
            s = round(LAT0 + row * dlat, 5)
            n = round(min(s + dlat, LAT1), 5)
            w = round(LON0 + col * dlon, 5)
            e = round(min(w + dlon, LON1), 5)
            
            tile_num = row * COLS + col + 1
            print(f"  Tile {tile_num}/{total_tiles}: ({s},{w}) → ({n},{e})", end=' ... ')
            
            xml_text, mirror = fetch_tile(s, w, n, e)
            if not xml_text:
                print("FAILED (skipped)")
                continue
            
            features = parse_ways(xml_text)
            # Deduplicate by rounded centroid
            new = 0
            for f in features:
                key = (round(f['lon'], 4), round(f['lat'], 4))
                if key not in seen_locs:
                    seen_locs.add(key)
                    all_greens.append(f)
                    new += 1
            
            print(f"OK via {mirror.split('/')[2]} — {len(features)} features, {new} new")
            time.sleep(2)  # be polite
    
    print(f"\nTotal green features: {len(all_greens)}")
    
    # Save
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as fp:
        json.dump(all_greens, fp, ensure_ascii=False, separators=(',', ':'))
    
    size_kb = os.path.getsize(OUT_FILE) // 1024
    print(f"Saved to {OUT_FILE} ({size_kb} KB)")
    
    # Summary
    from collections import Counter
    counts = Counter(f['type'] for f in all_greens)
    for t, n in counts.most_common():
        print(f"  {t}: {n}")


if __name__ == '__main__':
    main()
