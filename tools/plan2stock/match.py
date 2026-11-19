import json,re,collections
from shapely.geometry import shape,Polygon,Point
Bs=json.load(open('/mnt/user-data/uploads/Project-Planning-Guide/assets/buildings.json'))
dist=json.load(open('/mnt/user-data/uploads/Project-Planning-Guide/data/districts/gbg_primaromraden.geojson'))
print(dist['features'][0]['properties'])
backa=[f for f in dist['features'] if any('Backa' in str(v) for v in f['properties'].values())]
print([f['properties'] for f in backa])
poly=shape(backa[0]['geometry']).buffer(0)
inb=[]
for i,b in enumerate(Bs):
  try: p=Polygon(b['coordinates'][0])
  except Exception: continue
  if poly.contains(p.representative_point()): b['_i']=i; inb.append(b)
print('buildings in Backa',len(inb), collections.Counter(b['use_cat'] for b in inb).most_common(8))
def norm(s): return re.sub(r'\s+',' ',(s or '').lower().replace('gata','gatan' if False else 'gata')).strip()
idx=collections.defaultdict(list)
for b in inb:
  for a in ([b['address']]+(b['all_addresses'] or [] if isinstance(b['all_addresses'],list) else str(b['all_addresses'] or '').split(';'))):
    if a: idx[norm(a)].append(b['_i'])
rows=json.load(open('backa_rows.json'))
hit=0;miss=collections.Counter()
for r in rows:
  a=norm(r['address'])
  if a in idx: hit+=1
  else: miss[a]+=1
print('hit',hit,'of',len(rows)); print(miss.most_common(40))
print([k for k in idx if 'litteratur' in k or 'farmor' in k or 'backadal' in k][:30])
json.dump(inb,open('backa_buildings.json','w'))
