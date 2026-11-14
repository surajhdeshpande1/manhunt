# Rebuild a sparse stand-in for a remote parquet file from its footer, then list the row groups that touch our box.
import struct, sys, json, pyarrow.parquet as pq
footer, size, off, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
BOX = (75.62, 16.14, 75.74, 16.22)  # lon/lat: Bagalkot, Navanagar, Vidyagiri (BEC)
data = open(footer, 'rb').read()
with open(out, 'wb') as f:
    f.truncate(size); f.write(b'PAR1')
    f.seek(off); f.write(data); f.write(struct.pack('<i', len(data))); f.write(b'PAR1')
md = pq.ParquetFile(out).metadata
cols = {md.row_group(0).column(i).path_in_schema: i for i in range(md.num_columns)}
need = []
for g in range(md.num_row_groups):
    rg = md.row_group(g)
    st = {k: rg.column(cols[f'bbox.{k}']).statistics for k in ('xmin', 'xmax', 'ymin', 'ymax')}
    if not all(s is not None and s.has_min_max for s in st.values()): continue
    if st['xmin'].min <= BOX[2] and st['xmax'].max >= BOX[0] and st['ymin'].min <= BOX[3] and st['ymax'].max >= BOX[1]:
        starts = [rg.column(i).dictionary_page_offset if rg.column(i).has_dictionary_page else rg.column(i).data_page_offset for i in range(rg.num_columns)]
        ends = [rg.column(i).data_page_offset + rg.column(i).total_compressed_size for i in range(rg.num_columns)]
        lo = min(starts); hi = max(rg.column(i).file_offset if False else (starts[i] + rg.column(i).total_compressed_size) for i in range(rg.num_columns))
        need.append({'rg': g, 'rows': rg.num_rows, 'start': lo, 'end': hi - 1})
print('row groups:', md.num_row_groups, 'rows:', md.num_rows, 'columns:', md.num_columns)
print('needed:', json.dumps(need))
print('bytes to fetch: %.1f MB' % (sum(n['end'] - n['start'] + 1 for n in need) / 1e6))
