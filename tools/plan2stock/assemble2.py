# Adds roofs (LiDAR), facade parameters and plan images to backa_model.json
import json, math, hashlib, base64, io
from PIL import Image
from shapely.geometry import Polygon
W='/home/claude/work/'
M=json.load(open(W+'backa_model.json'))
geo=json.load(open(W+'plans_geo.json'))
R={r['i']:r for r in json.load(open('/mnt/user-data/uploads/Project-Planning-Guide/data/dtcc/roofs_gothenburg.json'))['roofs']}
E={e['_i']:e for e in json.load(open(W+'backa_buildings.json'))}
G=json.load(open(W+'groups.json')); B={r['id']:r for r in json.load(open(W+'backa_rows.json'))}
LAT0,LON0=M['origin'][1],M['origin'][0]
def to_m(lon,lat): return [round((lon-LON0)*111320*math.cos(math.radians(LAT0)),2),round((lat-LAT0)*110540,2)]
def hsh(s): return int(hashlib.md5(s.encode()).hexdigest()[:6],16)
MATS=['render_white','render_beige','brick_yellow','brick_red','panel_grey','render_ochre']
def roofinfo(i):
  r=R.get(i)
  if not r: return 0,0
  rise=r['ridge']-r['eave']
  return (round(min(max(rise,0),7),1) if rise>=1.0 else 0), r['az']
# context: rebuild with roof + material
ctx=[]
ring_index=[]
used=[Polygon(b['ring']).buffer(0) for b in M['buildings']]
for i,e in E.items():
  ring=[to_m(*p) for p in e['coordinates'][0]]
  p=Polygon(ring).buffer(0)
  if any(p.intersects(q) and p.intersection(q).area>0.3*min(p.area,q.area) for q in used): continue
  rise,az=roofinfo(i)
  h=e.get('height') or 6
  if e['use_cat']=='komplement': h=min(h,4)
  m=MATS[hsh(str(i))%len(MATS)] if e['use_cat'].startswith('bostad') else ('panel_grey' if hsh(str(i))%2 else 'render_white')
  ctx.append(dict(h=round(h,1),u=e['use_cat'][:4],r=rise,az=az,m=m,g=ring,y=e.get('year')))
M['context']=ctx
# listing buildings: roof from overlapping EUBUCCO+LiDAR, else OSM tag
eu_polys=[(i,Polygon([to_m(*p) for p in e['coordinates'][0]]).buffer(0)) for i,e in E.items()]
for b in M['buildings']:
  p=Polygon(b['ring']).buffer(0); rise=az=0; yr=b['tags'].get('year')
  if b['key'].startswith('eu:'):
    rise,az=roofinfo(int(b['key'][3:]))
  else:
    best=max(eu_polys,key=lambda t: t[1].intersection(p).area if t[1].intersects(p) else 0)
    if best[1].intersects(p) and best[1].intersection(p).area>0.3*p.area:
      rise,az=roofinfo(best[0]); yr=yr or E[best[0]].get('year')
  if not rise and b['tags'].get('roof') in ('hipped','gabled'): rise=3.0; az=None
  b['roof']=dict(rise=rise,az=az,shape=b['tags'].get('roof') or ('gabled' if rise else 'flat'))
  b['mat']=MATS[hsh(b['key'])%len(MATS)]
  w=b['stock'].get('windows',0)
  b['bay']=round(min(max(b['perimeter_m']*b['levels']/max(w,1),2.2),5.0),2)
  b['year']=yr
# plan images cropped to the unit bbox (same frame as the vector geometry)
D='/mnt/user-data/uploads/Project-Planning-Guide/boplats_images/'
for g,pl in M['plans'].items():
  o=geo[g]['geo']; x0,y0,x1,y1=o['px_bbox']
  r=B[G[g][0]]; im=Image.open(D+r['img']).convert('L').crop((x0,y0,x1+1,y1+1))
  s=640/max(im.size); im=im.resize((max(1,int(im.size[0]*s)),max(1,int(im.size[1]*s))))
  buf=io.BytesIO(); im.save(buf,'JPEG',quality=55)
  pl['img']='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
  pl['bbox']=[round((x1-x0)/o['ppm'],3),round((y1-y0)/o['ppm'],3)]
  # refresh geometry from rerun
  pl['outline']=o['outline']; pl['walls']=o['walls']
  pl['openings']=[x for x in o['openings'] if x['kind'] in ('window','ext_door','door')]
  pl['swings']=o['door_swings'][:14]; pl['appl']=o['appliances']; pl['rooms']=o['rooms']; pl['t']=o['wall_t_m']
json.dump(M,open(W+'backa_model2.json','w'),separators=(',',':'))
import os;print(os.path.getsize(W+'backa_model2.json')/1e6,'MB', sum(1 for c in ctx if c['r']),'pitched context of',len(ctx), [ (b['address'][0],b['roof'],b['mat'],b['bay']) for b in M['buildings'][:6]])
