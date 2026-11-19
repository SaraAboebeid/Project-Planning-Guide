import sqlite3,re,json,collections,sys
c=sqlite3.connect('file:/mnt/user-data/uploads/Project-Planning-Guide/boplats_apartments.db?mode=ro',uri=True)
cur=c.execute('select * from apartments'); cols=[d[0] for d in cur.description]
rows=[dict(zip(cols,r)) for r in cur]
def area(s):
  if not s or 'Göteborg' not in s: return (None,None)
  parts=[p.strip() for p in s.split(',')]
  i=max(k for k,p in enumerate(parts) if p.startswith('Göteborg'))
  d=parts[i-2]; d=re.sub(r'^.*(See map|photos|The photo)\s*','',d).strip()
  return d, parts[i-1]
for r in rows:
  r['district'],r['region']=area(r['area_name'])
  r['street']=re.sub(r'\s+',' ',re.sub(r'\s*\d.*$','',r['address'] or '')).strip()
sd=collections.defaultdict(collections.Counter)
for r in rows:
  if r['district']: sd[r['street']][r['district']]+=1
for r in rows:
  if not r['district'] and sd[r['street']]:
    r['district']=sd[r['street']].most_common(1)[0][0]; r['district_inferred']=True
  r.pop('area_name')
print(collections.Counter(r['district'] for r in rows).most_common(25))
backa=[r for r in rows if r['district']=='Backa']
print(len(backa)); print(collections.Counter(r['street'] for r in backa))
json.dump(rows,open('all_rows.json','w'),ensure_ascii=False,indent=0)
json.dump(backa,open('backa_rows.json','w'),ensure_ascii=False,indent=0)
