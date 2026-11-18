import json,sys,traceback,numpy as np
from concurrent.futures import ProcessPoolExecutor
import plan2geo as P
D='/mnt/user-data/uploads/Project-Planning-Guide/boplats_images/'
G=json.load(open('groups.json')); B={r['id']:r for r in json.load(open('backa_rows.json'))}
def conv(o):
  if isinstance(o,dict): return {k:conv(v) for k,v in o.items()}
  if isinstance(o,list): return [conv(v) for v in o]
  if isinstance(o,(np.floating,)): return float(o)
  if isinstance(o,(np.integer,)): return int(o)
  return o
def run(g):
  r=B[G[g][0]]
  if g=='25': return g,None,'photo, not a plan'
  try:
    o=P.extract(D+r['img'],r['size_m2']); return g,conv(o),None
  except Exception as e: return g,None,repr(e)
if __name__=='__main__':
  out={}
  with ProcessPoolExecutor(8) as ex:
    for g,o,err in ex.map(run,list(G)):
      out[g]={'geo':o,'err':err}
  json.dump(out,open('plans_geo.json','w'))
  print(sum(1 for v in out.values() if v['geo']), 'ok;', [ (g,v['err']) for g,v in out.items() if v['err']])
