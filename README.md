# Neo-Tokyo Underworld — Android

Android-first React/Capacitor game with Google-only accounts, account-owned cloud progress, live chat/rankings, reactive combat, character equipment and the Neo Exchange server-run market simulator.

## Local web test

```bash
npm install
npm run dev
```

## Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Run `supabase/20260824_district_one_progression.sql`.
3. Run `supabase/20260825_neo_exchange.sql`.
4. Run `supabase/20260826_neo_exchange_simulator.sql`.
5. Run `supabase/20260827_progression_hub.sql` to enable Combat Power, equipment recycling, AFK dungeons and co-op expeditions.
6. Run `supabase/20260828_gridhold_pvp.sql` to enable co-op rooms and server-authoritative Gridhold base PvP.
7. Copy `.env.example` to `.env` and add the project URL and public publishable/anon key.
8. Enable Google in Supabase Auth and configure the Google OAuth client and redirect URL.

## Gridhold PvP

Gridhold is an original asynchronous sci-fi base mode. Players collect Alloy and Energy Cells, place and upgrade structures on an 8×8 base, scout real player layouts, select an entry tactic and earn rating. The server owns resources, legal placement, battle outcomes, trophies and rewards. Rank milestones unlock neutral titles and futuristic base decorations.

Co-op supports Quick Match, public room browsing and shareable room codes. A room starts when its combined runner power satisfies the dungeon requirement.

The app requires a verified Google session. Progress, inventory, wallet, chat and rankings are account-owned; a different Google account receives a different character.

## Neo Exchange simulator

The default market source is an explicitly labelled XAU/USD simulation. A private Postgres state machine produces server-owned ticks through Supabase Cron, including session intensity, trend/range/volatile regimes, spread changes and fictional market events. Clients only render the feed; order fills, liquidation, protection orders and wallet settlement remain authoritative database operations.

No external market-data account, secret key or separate server is required. Trading locks automatically if the scheduled engine stops producing fresh ticks.

## Future licensed live feed

Simulation and settlement are separated by `ingest_exchange_tick`. To switch later without rewriting the app:

1. Use a Twelve Data commercial plan/licence that permits external client display.
2. Deploy one always-on instance of `services/market-gateway`.
3. Add `TWELVE_DATA_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only to that server's secret environment.
4. Close all open Exchange positions and run `select public.set_exchange_source('live');` as the database owner/service role.
5. Check the gateway `/health` endpoint before release.

Never put a provider key or Supabase secret/service-role key in the APK, repository, Vite variables or client code. Run `select public.set_exchange_source('simulated');` to return to the built-in source after closing positions.

## Tests and build

```bash
npm test
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For Play Store release, build a signed Android App Bundle and complete the relevant Play Console declarations.

## Build without Android Studio

Open **GitHub → Actions → Build Android APK → Run workflow**, then download the `neo-tokyo-underworld-apk` artifact from the successful run.
