import json,re,collections
from shapely.geometry import Polygon
inb=json.load(open('backa_buildings.json'))
def norm(s):
  s=(s or '').lower(); s=re.sub(r'\s+',' ',s).strip()
  s=re.sub(r'^(.*?\d+\s?[a-z]?)\b.*$',r'\1',s)  # cut after house number(+letter)
  return s.replace(' ','')
def num(s):
  m=re.match(r'(\D+?)\s*(\d+)',(s or '').lower().strip()); return (m.group(1).strip().replace(' ',''),int(m.group(2))) if m else None
idx=collections.defaultdict(set); street=collections.defaultdict(list)
for b in inb:
  for a in str(b['address'] or '').split('|')+str(b['all_addresses'] or '').split('|'):
    a=a.strip()
    if not a: continue
    idx[norm(a)].add(b['_i']); n=num(a)
    if n: street[n[0]].append((n[1],b['_i']))
rows=json.load(open('backa_rows.json'))
res=collections.Counter(); unmatched=collections.Counter()
for r in rows:
  k=norm(re.sub(r'\s+\d{4}$','',r['address']))
  if k in idx: r['bldg']=sorted(idx[k]); r['match']='exact'
  else:
    n=num(r['address'])
    if n and street.get(n[0]):
      best=min(street[n[0]],key=lambda t:abs(t[0]-n[1]))
      if abs(best[0]-n[1])<=4: r['bldg']=[best[1]]; r['match']=f'near({best[0]})'
  res[r.get('match','none')[:4]]+=1
  if 'bldg' not in r: unmatched[r['address']]+=1
print(res); print(unmatched)
print(sorted(street.keys()))
json.dump(rows,open('backa_rows.json','w'),ensure_ascii=False,indent=0)
