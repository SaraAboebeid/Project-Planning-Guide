import json, math, re, collections
import numpy as np
from shapely.geometry import Polygon, shape
from shapely import affinity

W = '/home/claude/work/'
rows = json.load(open(W + 'backa_rows.json'))
G = json.load(open(W + 'groups.json'))
geo = json.load(open(W + 'plans_geo.json'))
osm = json.load(open(W + 'osm_backa.json'))
eub = json.load(open(W + 'backa_buildings.json'))
dist = json.load(open('/mnt/user-data/uploads/Project-Planning-Guide/data/districts/gbg_primaromraden.geojson'))
backa_poly = shape([f for f in dist['features'] if f['properties']['PRIMÄRNAMN'] == 'Backa'][0]['geometry'])

LAT0, LON0 = 57.7425, 11.976
def to_m(lon, lat):
    return [round((lon - LON0) * 111320 * math.cos(math.radians(LAT0)), 2), round((lat - LAT0) * 110540, 2)]

id2grp = {i: g for g, ids in G.items() for i in ids}
FLOOR_H = 2.9

# ---------- per-plan quality + inventory ----------
def unit_inventory(g, row):
    o = geo[g]['geo']
    rooms_n = row['rooms'] or 1
    if o is None:
        return None, 'none'
    bw, bh = o['bbox_m']
    fill = o['gross_px_m2'] / max(bw * bh, 1)
    q = 0
    q += 3 <= min(bw, bh) and max(bw, bh) <= 30
    q += 0.12 <= o['wall_t_m'] <= 0.42
    q += len(o['door_swings']) <= 14
    q += fill > 0.3
    q += len(o['rooms']) >= 2
    grade = 'A' if q == 5 else 'B' if q >= 4 else 'C'
    kinds = collections.Counter(r['kind'] for r in o['rooms'])
    baths = max(1, kinds['bathroom'] + kinds['wc'])
    wins = [x for x in o['openings'] if x['kind'] == 'window']
    inv = {}
    def put(k, v, how):
        inv[k] = {'n': v, 'src': how}
    # windows
    exp_w = rooms_n + 1
    if grade != 'C' and len(wins) >= max(1, exp_w // 2):
        put('windows', len(wins), 'detected')
        glz = sum(x['len'] for x in wins)
    else:
        put('windows', exp_w, 'rule: rooms+kitchen')
        glz = exp_w * 1.2
    inv['glazed_length_m'] = round(glz, 1)
    # doors
    sw = len(o['door_swings'])
    exp_d = rooms_n + baths + (1 if kinds['wardrobe'] else 0)
    if grade != 'C' and 2 <= sw <= 14:
        put('interior_doors', max(sw - 1, 1), 'detected swings')
    else:
        put('interior_doors', exp_d, 'rule: rooms+baths')
    put('entrance_door', 1, 'rule')
    if kinds['balcony'] or kinds['terrace'] or any(x['kind'] == 'ext_door' for x in o['openings']):
        put('balcony_door', 1, 'detected')
    # appliances
    codes = collections.Counter(a['kind'] for a in o['appliances'])
    if codes['fridge_freezer']:
        put('fridge_freezer', codes['fridge_freezer'], 'detected label')
    elif codes['fridge'] or codes['freezer']:
        put('fridge', max(codes['fridge'], 1), 'detected label'); put('freezer', max(codes['freezer'], 1), 'detected label' if codes['freezer'] else 'assumed')
    else:
        put('fridge_freezer', 1, 'assumed (standard in Swedish rentals)')
    put('stove', 1, 'detected label' if codes['stove'] else 'assumed')
    put('oven', 1, 'assumed')
    put('dishwasher', codes['dishwasher'] if codes['dishwasher'] else 0, 'detected label' if codes['dishwasher'] else 'not found on plan')
    put('washing_machine', codes['washing_machine'], 'detected label' if codes['washing_machine'] else 'not found on plan')
    if codes['tumble_dryer']:
        put('tumble_dryer', codes['tumble_dryer'], 'detected label')
    put('toilet', baths, 'per bathroom/WC')
    put('washbasin', baths + (1 if kinds['wc'] and kinds['bathroom'] else 0) * 0, 'per bathroom/WC')
    put('shower', max(kinds['bathroom'], 1), 'per bathroom')
    put('kitchen_sink', 1, 'rule')
    # wall quantities
    wall_area_plan = 0.0
    for p in o['walls']:
        try:
            wall_area_plan += Polygon(p[0], p[1:]).buffer(0).area
        except Exception:
            pass
    wall_len = wall_area_plan / max(o['wall_t_m'], 0.1)
    outline = Polygon(o['outline']).buffer(0)
    inv['wall_length_m'] = round(wall_len, 1)
    inv['perimeter_m'] = round(outline.length, 1)
    inv['interior_wall_area_m2'] = round(max(wall_len - outline.length, 0) * 2.5 * 2, 1)  # both faces
    return inv, grade

units = []
for r in rows:
    g = id2grp[r['id']]
    inv, grade = unit_inventory(g, r)
    units.append(dict(id=r['id'], grp=g, address=re.sub(r'\s+', ' ', r['address']).strip(), rooms=r['rooms'], m2=r['size_m2'],
                      rent=r['rent_sek'], floor=r['floor_current'], floors=r['floor_total'], url=r['url'], img=r['img'],
                      grade=grade, inv=inv))

# ---------- building matching ----------
def norm(a): return re.sub(r'\s+', ' ', re.sub(r'\s+\d{4}$', '', a)).strip()
osm_bld = {b['id']: b for b in osm['blds']}
buildings = {}
def add_bld(key, ring_ll, levels, src, tags=None):
    if key in buildings: return
    ring = [to_m(*p) for p in ring_ll]
    buildings[key] = dict(key=key, ring=ring, levels=levels, src=src, tags=tags or {}, units=[])

for u in units:
    a = norm(u['address'])
    hit = osm['addr'].get(a)
    if hit and hit.get('osm'):
        b = osm_bld[hit['osm']]
        add_bld('osm:%d' % b['id'], b['g'], b.get('l'), 'OpenStreetMap', {'roof': b.get('r')})
        u['bld'] = 'osm:%d' % b['id']; u['placement'] = 'approx building' if hit.get('approx') else 'address match'
        continue
    r = next(x for x in rows if x['id'] == u['id'])
    if r.get('bldg'):
        i = r['bldg'][0]
        e = next(x for x in eub if x['_i'] == i)
        lv = e.get('floors') or (round(e['height'] / 3) if e.get('height') else None)
        add_bld('eu:%d' % i, e['coordinates'][0], lv, 'EUBUCCO/Lantmäteriet (your buildings.json)',
                {'year': e.get('year'), 'height': e.get('height'), 'eclass': e.get('eclass'), 'tabula_wall': e.get('tabula_wall')})
        u['bld'] = 'eu:%d' % i; u['placement'] = 'address match' if r.get('match') == 'exact' else 'nearest house number'
        continue
    if hit and hit.get('pt'):
        u['pin'] = to_m(*hit['pt']); u['placement'] = 'address point only (building not mapped yet)'
    else:
        u['placement'] = 'not placed'

# listing floor_total refines levels
for u in units:
    if u.get('bld'):
        b = buildings[u['bld']]
        try:
            ft = int(u['floors'])
            if ft > 0 and (not b['levels'] or abs(int(b['levels']) - ft) <= 3):
                b['levels'] = max(int(b['levels'] or 0), ft)
        except Exception:
            pass
        b['units'].append(u['id'])

# ---------- building-level stock estimate ----------
umap = {u['id']: u for u in units}
def fsum(invs, k):
    v = [i[k]['n'] if isinstance(i.get(k), dict) else i.get(k, 0) for i in invs]
    return sum(v) / len(v) if v else 0

for b in buildings.values():
    poly = Polygon(b['ring']).buffer(0)
    lv = int(b['levels'] or 4)
    b['levels'] = lv
    b['footprint_m2'] = round(poly.area, 1)
    b['perimeter_m'] = round(poly.length, 1)
    b['height_m'] = round(lv * FLOOR_H + 0.6, 1)
    gfa = poly.area * lv
    us = [umap[i] for i in dict.fromkeys(b['units'])]
    measured = [u for u in us if u['inv']]
    # unique measured unit types in this building
    avg_m2 = np.mean([u['m2'] for u in us if u['m2']]) if us else 60
    nfa = 0.78 * gfa
    est_units = max(len(set(u['grp'] for u in us)), round(nfa / avg_m2))
    invs = [u['inv'] for u in measured]
    keys = ['windows', 'interior_doors', 'entrance_door', 'balcony_door', 'fridge_freezer', 'fridge', 'freezer', 'stove', 'oven',
            'dishwasher', 'washing_machine', 'toilet', 'washbasin', 'shower', 'kitchen_sink']
    stock = {k: round(fsum(invs, k) * est_units) for k in keys if any(k in i for i in invs)}
    glz = fsum(invs, 'glazed_length_m') * est_units
    win_area = glz * 1.3
    facade_gross = poly.length * b['height_m']
    stock['window_area_m2'] = round(win_area)
    stock['facade_gross_m2'] = round(facade_gross)
    stock['facade_opaque_m2'] = round(max(facade_gross - win_area - stock.get('balcony_door', 0) * 2.0, 0))
    stock['roof_m2'] = round(poly.area * (1.15 if b['tags'].get('roof') in ('hipped', 'gabled') else 1.0))
    stock['slabs_m2'] = round(poly.area * (lv + 1))
    stock['interior_wall_area_m2'] = round(fsum(invs, 'interior_wall_area_m2') * est_units)
    b['est_units'] = est_units
    b['measured_unit_types'] = len(set(u['grp'] for u in us))
    b['stock'] = stock
    b['address'] = sorted({u['address'] for u in us})

# ---------- context buildings (all EUBUCCO footprints in Backa) ----------
ctx = []
for e in eub:
    if 'eu:%d' % e['_i'] in buildings: continue
    h = e.get('height') or 6
    ctx.append([round(h, 1), e['use_cat'][:4]] + [to_m(*p) for p in e['coordinates'][0]])
# OSM apartment blocks used for listings may duplicate EUBUCCO ones: drop context footprints overlapping them
used = [Polygon(b['ring']).buffer(0) for b in buildings.values()]
ctx2 = []
for c in ctx:
    p = Polygon(c[2:]).buffer(0)
    if any(p.intersects(q) and p.intersection(q).area > 0.3 * min(p.area, q.area) for q in used):
        continue
    ctx2.append(c)

boundary = [to_m(*p) for p in backa_poly.exterior.coords]

# unit geometry payload (only unique plan groups used)
plans = {}
for g, v in geo.items():
    o = v['geo']
    if not o: continue
    plans[g] = dict(outline=o['outline'], walls=o['walls'], openings=[x for x in o['openings'] if x['kind'] in ('window', 'ext_door', 'door')],
                    swings=o['door_swings'][:14], appl=o['appliances'], rooms=o['rooms'], bbox=o['bbox_m'], t=o['wall_t_m'])

json.dump(dict(units=units, buildings=list(buildings.values()), context=ctx2, boundary=boundary, plans=plans,
               origin=[LON0, LAT0]), open(W + 'backa_model.json', 'w'), separators=(',', ':'))

print('units', len(units), collections.Counter(u['placement'] for u in units))
print('grades', collections.Counter(u['grade'] for u in units))
print('buildings', len(buildings), 'context', len(ctx2))
tot = collections.Counter()
for b in buildings.values():
    tot.update(b['stock'])
print(dict(tot))
