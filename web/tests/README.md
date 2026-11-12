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
Screenshots land in `tests/shots/` and `tests/audit/` (ignored by git).
