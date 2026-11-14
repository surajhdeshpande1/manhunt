# Bagalkot buildings -> vector tiles z12-16 (layer "buildings"); places -> slim GeoJSON with a colour group.
import json, math, os, re, shutil, sys
import numpy as np, shapely
from shapely import STRtree, clip_by_rect
import mapbox_vector_tile as mvt

OUT = sys.argv[1]
R = 6378137.0
def merc(c):  # Nx2 lon/lat -> web mercator metres
    x = np.radians(c[:, 0]) * R
    y = np.log(np.tan(np.pi / 4 + np.radians(np.clip(c[:, 1], -85, 85)) / 2)) * R
    return np.column_stack([x, y])
def tile_bounds(z, x, y):
    n = 2 ** z; size = 2 * math.pi * R / n; ox = -math.pi * R
    return (ox + x * size, math.pi * R - (y + 1) * size, ox + (x + 1) * size, math.pi * R - y * size)
def tile_of(lon, lat, z):
    n = 2 ** z; lr = math.radians(lat)
    return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n)

fc = json.load(open('buildings.geojson'))
geoms, props = [], []
for f in fc['features']:
    g = shapely.transform(shapely.geometry.shape(f['geometry']), merc)
    if not g.is_valid: g = shapely.make_valid(g)
    if g.is_empty: continue
    geoms.append(g)
    p = {}
    if f['properties'].get('names'): p['n'] = f['properties']['names'][:60]
    if f['properties'].get('height'): p['h'] = round(float(f['properties']['height']), 1)
    props.append(p)
tree = STRtree(geoms)
BOX = (75.62, 16.14, 75.74, 16.22)
if os.path.isdir(OUT): shutil.rmtree(OUT)
total = files = 0
for z in range(12, 17):
    x0, y0 = tile_of(BOX[0], BOX[3], z); x1, y1 = tile_of(BOX[2], BOX[1], z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            b = tile_bounds(z, x, y); pad = (b[2] - b[0]) * 16 / 4096
            q = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
            idx = tree.query(shapely.box(*q))
            if len(idx) == 0: continue
            tol = (b[2] - b[0]) / 4096 * (2.5 if z < 15 else 1.0)
            feats = []
            for i in idx:
                g = clip_by_rect(geoms[i], *q)
                if z < 15: g = g.simplify(tol, preserve_topology=True)
                if g.is_empty or g.area < tol * tol * 2: continue
                feats.append({'geometry': g, 'properties': props[i]})
            if not feats: continue
            data = mvt.encode([{'name': 'buildings', 'features': feats}], default_options={'quantize_bounds': b, 'extents': 4096})
            os.makedirs(f'{OUT}/{z}/{x}', exist_ok=True)
            open(f'{OUT}/{z}/{x}/{y}.pbf', 'wb').write(data)
            files += 1; total += len(data)
print(f'buildings: {len(geoms)} -> {files} tiles, {total/1e6:.2f} MB')

GROUPS = [('learn', r'learning|college|universit|school|education|librar|academ|institut|training|coaching'),
          ('health', r'hospital|clinic|diagnost|pharmac|doctor|dentist|medical|health|laborator|ayurved'),
          ('food', r'restaurant|cafe|coffee|food|bakery|sweet|dhaba|juice|bar\b|eatery|snack'),
          ('worship', r'worship|temple|mosque|church|mandir|religio|gurudwara|shrine'),
          ('money', r'bank|financ|atm|credit|insurance'),
          ('stay', r'hotel|lodg|hostel|guest|resort|accommodation'),
          ('gov', r'government|police|post_office|court|municipal|fire_station|public_service|office'),
          ('shop', r'store|shop|market|mall|dealer|retail|supermarket|boutique|showroom|service|repair|gas_station|fuel')]
pl = json.load(open('places.geojson'))
out = []
for f in pl['features']:
    p = f['properties']
    if (p.get('confidence') or 0) < 0.5 or not p.get('names'): continue
    cat = p.get('basic_category') or ''
    g = next((k for k, rx in GROUPS if re.search(rx, cat)), 'other')
    lon, lat = f['geometry']['coordinates'][:2]
    out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 6), round(lat, 6)]},
                'properties': {'n': re.sub(r'\s+', ' ', p['names']).strip()[:64], 'g': g, 'r': round(p['confidence'], 2)}})
json.dump({'type': 'FeatureCollection', 'features': out}, open(f'{OUT}/places.json', 'w'), separators=(',', ':'))
import collections
print('places:', len(out), dict(collections.Counter(o['properties']['g'] for o in out)), f'{os.path.getsize(f"{OUT}/places.json")/1e3:.0f} KB')
