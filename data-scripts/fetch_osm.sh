#!/usr/bin/env bash
# Downloads OpenStreetMap coastline, outcrops and named water places for the
# route calculator area (Manly → Era, incl. Sydney Harbour, Botany Bay up the
# Georges River and Port Hacking). Run by .github/workflows/osm-data.yml;
# outputs features.json and names.json into the directory given.
set -euo pipefail
OUT="${1:-osm}"
mkdir -p "$OUT"
BBOX="-34.20,151.00,-33.76,151.36"
API="https://overpass-api.de/api/interpreter"

curl -sS --retry 3 -m 300 --data-urlencode "data=[out:json][timeout:240];
(
  way[\"natural\"=\"coastline\"]($BBOX);
  way[\"natural\"~\"^(bare_rock|reef|rock|shoal)$\"]($BBOX);
  node[\"natural\"~\"^(rock|bare_rock|reef|stone)$\"]($BBOX);
  way[\"place\"~\"^(island|islet)$\"]($BBOX);
  node[\"place\"~\"^(island|islet)$\"]($BBOX);
);
out geom;" "$API" -o "$OUT/raw-features.json"

curl -sS --retry 3 -m 300 --data-urlencode "data=[out:json][timeout:240];
(
  nwr[\"natural\"~\"^(beach|bay|cape|peninsula|reef|shoal)$\"][\"name\"]($BBOX);
  nwr[\"place\"~\"^(island|islet)$\"][\"name\"]($BBOX);
  nwr[\"man_made\"=\"lighthouse\"][\"name\"]($BBOX);
  nwr[\"leisure\"=\"marina\"][\"name\"]($BBOX);
  nwr[\"amenity\"=\"ferry_terminal\"][\"name\"]($BBOX);
  nwr[\"place\"~\"^(suburb|locality|village)$\"][\"name\"~\"^(Grays Point|Bundeena|Maianbar|Kurnell|La Perouse|Watsons Bay|Taren Point|Sylvania Waters|Kangaroo Point|Lilli Pilli|Dolans Bay|Burraneer|Yowie Bay|Port Hacking)$\"]($BBOX);
  nwr[\"name\"~\"Tom Ugly|Figure Eight|Figure 8\"]($BBOX);
);
out center tags;" "$API" -o "$OUT/names.json"

# Shape features into the format build_coast.py expects
python3 - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
raw = json.load(open(f"{out}/raw-features.json"))
ways, points = [], []
for e in raw["elements"]:
    tags = e.get("tags", {})
    if e["type"] == "way" and "geometry" in e:
        ways.append({"id": str(e["id"]), "tags": tags, "pts": [(g["lat"], g["lon"]) for g in e["geometry"]]})
    elif e["type"] == "node":
        points.append({"id": str(e["id"]), "lat": e["lat"], "lon": e["lon"], "tags": tags})
json.dump({"ways": ways, "points": points}, open(f"{out}/features.json", "w"))
print("ways", len(ways), "points", len(points), "names", len(json.load(open(f"{out}/names.json"))["elements"]))
PY
rm "$OUT/raw-features.json"
