#!/usr/bin/env python3
# STALE / verify-before-use: alignment constants below (sx=1.24, tx=1675, ty=1102)
# were tuned for an older source image and may no longer match
# src/data/pyatnitskaya-regions-source.svg. Do not run without re-verifying
# the transform against the current render/photo pair.
"""Split the user SVG planar graph into lot faces; run from the site directory.

The authoritative drawing is src/data/pyatnitskaya-regions-source.svg.
Only one uniform scale and translation align the complete drawing to the photo.
Individual vertices/edges must not be adjusted separately.
"""
from pathlib import Path
import re,json
from collections import Counter
s=Path('src/data/pyatnitskaya-regions-source.svg').read_text();d=re.search(' d="([^"]+)"',s)[1]
segments=[];current=None
for command,values in re.findall(r'([MLHV])([^MLHV]+)',d):
 nums=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',values)))
 if command in 'ML':next=(nums[0],nums[1])
 elif command=='H':next=(nums[0],current[1])
 else:next=(current[0],nums[0])
 if command!='M':segments.append((current,next))
 current=next
# Extract planar faces using the exact source vertices/edges.
import math
adj={}
for a,b in segments:
 adj.setdefault(a,set()).add(b);adj.setdefault(b,set()).add(a)
ordered={a:sorted(bs,key=lambda b:math.atan2(b[1]-a[1],b[0]-a[0])) for a,bs in adj.items()}
visited=set();faces=[]
for a,bs in ordered.items():
 for b in bs:
  if (a,b) in visited:continue
  cycle=[];u,v=a,b
  while (u,v) not in visited:
   visited.add((u,v));cycle.append(u);neighbors=ordered[v];w=neighbors[(neighbors.index(u)-1)%len(neighbors)];u,v=v,w
  area=sum(p[0]*q[1]-p[1]*q[0] for p,q in zip(cycle,cycle[1:]+cycle[:1]))/2
  if area>0:faces.append(cycle)

# Labels by upper/middle/lower pair, preserving all original boundary vertices.
faces.sort(key=lambda f:sum(y for x,y in f)/len(f))
# Identify source faces by landmarks instead of a visual guess.
ids=[]
for f in faces:
 fs=set(f)
 if (843.52,89.6279) in fs:id='gain' if (3.85558,700.012) in fs else 'value'
 elif (1388.02,730.07) in fs:id='profit' if (16.2201,933.512) in fs else 'revenue'
 else:id='traffic' if (26.5195,1128.01) in fs else 'flow'
 ids.append(id)
# Alignment to the original, uncropped photograph.
sx=sy=1.24;tx=1675;ty=1102
out=[]
for face,lot in zip(faces,ids):
 points=[(tx+x*sx,ty+y*sy) for x,y in face]
 out.append({'id':lot,'d':'M'+'L'.join(f'{x:.4f},{y:.4f}' for x,y in points)+'Z'})
order=['gain','value','profit','revenue','traffic','flow']
assert len(faces)==6 and sorted(ids)==sorted(order), 'Expected exactly six lot regions'
# A face decomposition may reuse a shared edge, but may not invent geometry.
edge_key=lambda a,b: tuple(sorted((a,b)))
source_edges={edge_key(a,b) for a,b in segments}
face_edges=Counter(edge_key(a,b) for f in faces for a,b in zip(f,f[1:]+f[:1]))
assert set(face_edges)==source_edges
assert all(count in (1,2) for count in face_edges.values())
groups=[]
for lot in order:
 face=faces[ids.index(lot)]
 path='M'+'L'.join(f'{x:.10g},{y:.10g}' for x,y in face)+'Z'
 groups.append(f'  <g id="{lot}" data-lot="{lot}"><path d="{path}"/></g>')
Path('public/assets/buildings/pyatnitskaya-lots.svg').write_text(
 '<svg xmlns="http://www.w3.org/2000/svg" width="2054" height="1570" viewBox="0 0 2054 1570" fill="none" stroke="currentColor">\n'+'\n'.join(groups)+'\n</svg>\n')
out.sort(key=lambda r:order.index(r['id']))
Path('src/data/render-regions.json').write_text(json.dumps(out,indent=2)+'\n')
print('Generated six regions from the supplied SVG without changing source vertices.')
