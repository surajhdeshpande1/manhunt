# Drop downloaded slices into the sparse stand-in at their offsets, read only those row groups, keep features in the box.
import sys, json, pyarrow.parquet as pq, pyarrow.compute as pc, shapely
from shapely import wkb
sparse, out = sys.argv[1], sys.argv[2]
parts = [(int(a.split(':')[1]), a.split(':')[0]) for a in sys.argv[3].split(',')]  # path:offset,...
rgs = [int(x) for x in sys.argv[4].split(',')]
keep = sys.argv[5].split(',')  # property columns to keep
BOX = (75.62, 16.14, 75.74, 16.22)
with open(sparse, 'r+b') as f:
    for off, path in parts:
        f.seek(off); f.write(open(path, 'rb').read())
t = pq.ParquetFile(sparse).read_row_groups(rgs)
b = t.column('bbox').combine_chunks()
m = pc.and_(pc.and_(pc.less_equal(b.field('xmin'), BOX[2]), pc.greater_equal(b.field('xmax'), BOX[0])),
            pc.and_(pc.less_equal(b.field('ymin'), BOX[3]), pc.greater_equal(b.field('ymax'), BOX[1])))
t = t.filter(m)
feats = []
geoms = t.column('geometry').to_pylist()
props = {k: t.column(k).to_pylist() for k in keep if k in t.column_names}
for i, g in enumerate(geoms):
    p = {}
    for k, v in props.items():
        v = v[i]
        if v is None: continue
        if k == 'names': v = (v or {}).get('primary')
        if k == 'categories': v = (v or {}).get('primary')
        if v not in (None, ''): p[k] = v
    feats.append({'type': 'Feature', 'geometry': shapely.geometry.mapping(wkb.loads(g)), 'properties': p})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'))
print(len(feats), 'features ->', out, 'of', t.num_rows, 'rows; columns:', ','.join(c for c in t.column_names[:20]))
