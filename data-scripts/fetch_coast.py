# Download OSM tiles along the shoreline (North Head → Cronulla) and keep only
# coastline, islands, rocks and reefs. Output: features.json
import json, time, urllib.request, xml.etree.ElementTree as ET
anchors = [(-33.800,151.300),(-33.815,151.298),(-33.833,151.285),(-33.860,151.283),(-33.890,151.280),
           (-33.910,151.268),(-33.925,151.262),(-33.945,151.262),(-33.965,151.262),(-33.985,151.256),
           (-34.000,151.245),(-33.995,151.225),(-34.005,151.215),(-34.018,151.232),(-34.040,151.222),
           (-34.045,151.185),(-34.050,151.160)]
STEP=0.010; HALF=0.008
tiles=set()
for (a,b),(c,d) in zip(anchors,anchors[1:]):
    n=max(1,int(max(abs(c-a),abs(d-b))/STEP))
    for i in range(n+1):
        lat=a+(c-a)*i/n; lon=b+(d-b)*i/n
        tiles.add((round(lat/STEP)*STEP, round(lon/STEP)*STEP))
print(len(tiles),'tiles',flush=True)
nodes={}; ways={}; lone=[]
KEEP_NAT={'coastline','bare_rock','rock','reef','shoal','stone','cliff'}
for k,(lat,lon) in enumerate(sorted(tiles)):
    bbox=f"{lon-HALF:.4f},{lat-HALF:.4f},{lon+HALF:.4f},{lat+HALF:.4f}"
    url=f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"
    req=urllib.request.Request(url,headers={"User-Agent":"surf-rescue-log-build/1.0 (github.com/PaceyMia/surf-rescue-log)"})
    for attempt in range(3):
        try:
            root=ET.fromstring(urllib.request.urlopen(req,timeout=90).read()); break
        except Exception as e:
            print('retry',bbox,e,flush=True); time.sleep(3)
    else:
        print('FAILED',bbox,flush=True); continue
    for n in root.iter('node'):
        nodes[n.get('id')]=(float(n.get('lat')),float(n.get('lon')))
        tags={t.get('k'):t.get('v') for t in n.iter('tag')}
        if tags.get('natural') in ('rock','bare_rock','stone','reef','shoal') or tags.get('place') in ('islet','island'):
            lone.append(dict(id=n.get('id'),lat=float(n.get('lat')),lon=float(n.get('lon')),tags=tags))
    for w in root.iter('way'):
        tags={t.get('k'):t.get('v') for t in w.iter('tag')}
        if tags.get('natural') in KEEP_NAT or tags.get('place') in ('island','islet'):
            ways[w.get('id')]=dict(tags=tags,nds=[nd.get('ref') for nd in w.iter('nd')])
    print(k+1,bbox,len(ways),flush=True)
    time.sleep(1)
out=[]
for wid,w in ways.items():
    pts=[nodes[r] for r in w['nds'] if r in nodes]
    out.append(dict(id=wid,tags=w['tags'],pts=pts))
uniq={l['id']:l for l in lone}
json.dump(dict(ways=out,points=list(uniq.values())),open('features.json','w'))
print('done ways',len(out),'points',len(uniq))
