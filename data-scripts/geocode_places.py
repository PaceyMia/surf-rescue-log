import json, time, urllib.request, urllib.parse, sys
sys.path.insert(0,'.')
from places_list import P
out=[]
for name,region,q,aliases,conf in P:
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({"q":q,"format":"json","limit":1,"countrycodes":"au"})
    req=urllib.request.Request(url,headers={"User-Agent":"surf-rescue-log-build/1.0 (github.com/PaceyMia/surf-rescue-log)"})
    try:
        d=json.load(urllib.request.urlopen(req,timeout=20))
    except Exception as e:
        d=[]; print("ERR",name,e,flush=True)
    if d:
        out.append(dict(name=name,region=region,aliases=aliases,confirmed=conf,lat=round(float(d[0]["lat"]),5),lon=round(float(d[0]["lon"]),5),osm=d[0]["display_name"][:80]))
    else:
        out.append(dict(name=name,region=region,aliases=aliases,confirmed=conf,lat=None,lon=None,osm=None)); print("MISS",name,flush=True)
    time.sleep(1.2)
json.dump(out,open("geo.json","w"),indent=1)
print("done",len(out))
