# TAG tests

Browser checks run against a local build with a mocked backend (no real Supabase calls), so they're safe to run anytime.

## One-time setup (not a dependency of the app, so Vercel builds stay lean)
```
cd web
npm i --no-save playwright
npx playwright install chromium
```

## Task generators (fast, no browser)
Checks every one of the 20 tasks across all levels and twists is solvable (e.g. every maze reaches its exit, pipes start unsolved).
```
npx esbuild tests/generators.ts --bundle --platform=node --format=cjs --outfile=tests/.out/generators.cjs && node tests/.out/generators.cjs
```

## Solve all 20 tasks in the real UI
Needs the dev server: `npx vite --port 5173`. Then, for each level 1–5:
```
npx esbuild tests/e2e/tasks.ts --bundle --platform=node --format=cjs --external:playwright --outfile=tests/.out/tasks.cjs
LVL=3 node tests/.out/tasks.cjs        # ONLY=5 to run one task, DBG=1 for screenshots
```

## Click-through flows, phone sizes and screen audit
Needs a production preview: `npm run build && npx vite preview --port 4173`.
```
node tests/flows.cjs                    # every flow: auth, home, host, lobbies, match, scanner, result
node tests/devices.cjs all              # small Android to large iPhone, every scenario
MODE=night node tests/audit.cjs         # full-page screenshot of every screen into tests/audit/
python3 tests/sheet.py out.png 0.8 1350 tests/audit/home.png tests/audit/signin.png   # contact sheet
```
## Multiple maps (satellite sources and fallback)
Start a dev server with stand-in keys, then run the check:
```
VITE_ARCGIS_KEY=x VITE_MAPTILER_KEY=y npx vite --port 5174
node tests/maps.cjs
```

## Lighter ticks (server leaves out what the phone already has)
Same flows, with the mock answering like the live server: fingerprints in every reply, unchanged room details and member list left out.
```
DIFF=1 node tests/flows.cjs
```

## GPS accuracy (fast, no browser)
Simulated runners under realistic phone GPS error (drift, jitter, wild fixes, dropouts, phones with a broken speed sensor):
raw GPS vs the old smoother vs the tracking filter in `src/lib/geoFilter.ts`.
```
npx esbuild tests/geo/filter.test.ts --bundle --platform=node --outfile=tests/.out/filter.cjs && node tests/.out/filter.cjs
```

## Area packs (buildings and places anywhere on Earth)
Pipeline only, in Node, and the real thing in the browser against the production preview. Both read Overture's GeoParquet
from local stand-ins (a sparse copy holding the footer and the row groups around Bagalkot; `web/tools/geo/README.md` shows how to fetch them).
```
npx esbuild tests/geo/pack.test.ts --bundle --platform=node --format=esm --outfile=tests/.out/pack.mjs && node tests/.out/pack.mjs <buildings.parquet> <places.parquet>
node tests/geo/area.browser.cjs <buildings.parquet> <places.parquet>
```

## Puzzle accuracy
Every Next Number and Scramble round has exactly one right answer; every shape in the shape tasks is told apart from the others.
```
npx esbuild tests/puzzles/audit.ts --bundle --platform=node --outfile=tests/.out/audit.cjs && node tests/.out/audit.cjs
node tests/puzzles/glyphs.cjs
```

Screenshots land in `tests/shots/` and `tests/audit/` (ignored by git).
