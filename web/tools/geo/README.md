# Map detail data (buildings + named places)

TAG ships every building outline and named place for its play areas, built from **Overture Maps** open data
(buildings: OpenStreetMap + Google Open Buildings + Microsoft, ODbL; places: CDLA-Permissive-2.0). No keys or accounts.
Output lives in `web/public/geo/<area>/`: building vector tiles `{z}/{x}/{y}.pbf` (z12–16) and `places.json`.
Areas are listed in `web/src/lib/cityLayers.ts` (`AREAS`); the box is also set at the top of `plan_rg.py`, `read_rg.py` and `make_tiles.py`.

Only the slices of Overture's files that cover the box are downloaded (HTTP range requests), about 15 MB for Bagalkot.

1. Find the file covering the box: `https://stac.overturemaps.org/catalog.json` → latest release →
   `buildings/building/collection.json` (or `places/place/...`). `extent.spatial.bbox[i]` is the box of item `i-1`;
   the item's `assets.aws.href` and `file:size` give the parquet URL and size.
2. Fetch the footer: last 8 bytes = footer length (int32 LE) + `PAR1`; then the footer bytes just before them.
3. `python3 plan_rg.py footer.bin <size> <footer_offset> sparse.parquet` → lists the row groups and byte ranges to fetch.
4. Download those byte ranges (`curl -r start-end URL -o part.bin`).
5. `python3 read_rg.py sparse.parquet buildings.geojson "part1.bin:offset1,part2.bin:offset2" <rg1>,<rg2> names,height,num_floors,class,subtype`
   (for places: `... places.geojson ... names,basic_category,confidence`).
6. `python3 make_tiles.py ../../public/geo/<area>` (needs `pip install pyarrow shapely mapbox-vector-tile`).
