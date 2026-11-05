# TAG — live manhunt

A real-world game of chase for college campuses. Runners hide and clear tasks; hunters track them on a live map and tag them by scanning the runner's QR code. Admins draw the play area, set the rules and run the match.

Live: https://tag-manhunt-suru8.vercel.app

## What's here

| Folder | What it is |
|---|---|
| `web/` | The app: a Vite + React + TypeScript installable web app (PWA). Map by MapLibre + OpenFreeMap; animation by Framer Motion; all music and sound effects are synthesised in the browser (`src/lib/sound.ts`). |
| `web/src/screens/Landing.tsx` | The 10-second opening film, "Surrounded". Earlier films are kept alongside it (`LandingCaught`, `LandingLine`, `LandingPins`). |
| `supabase/migrations/` | The database: tables, row-level security and the game engine as SQL functions, in the order they were applied. |
| `supabase/functions/` | Server functions: `signup`, `password-reset` (email codes via Brevo), `owner-reset`, `voice-token` (hunter voice via LiveKit). |

## Run it locally

```bash
cd web
npm install
npm run dev
```

`web/.env` holds the Supabase project URL and its publishable (public) key.

## Secrets

No secret keys are stored in this repo. The server functions read `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `BREVO_SENDER`, `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from the Supabase project's function secrets.

## Developer DEMO section

- The first screen has a small **Developer** button. It asks for a NAME and PASSWORD, which the owner sets in **Profile → Developer access**. The server stores only a bcrypt hash (`dev_access`), rate-limits wrong tries and hands out 30-day developer sessions (`dev_login`, `dev_check`).
- After login the app reloads into DEMO mode (`web/src/demo/`). Every server call is answered by `sim.ts`, an in-browser copy of the game server with bot players. Your own GPS stays real. No real data is read or written.
- The gold **DEMO** tab on the left edge opens the controls: quick matches as runner/hunter/admin around your location, bot count and speed, and event triggers. "Exit demo" (or Sign out) returns to the real app.
