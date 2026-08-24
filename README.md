# Neo-Tokyo Underworld — Android

Android-first React/Capacitor game with Google-only accounts, account-owned cloud progress, live chat/rankings, reactive combat, character equipment and the Neo Exchange live-market game.

## Local web test

```bash
npm install
npm run dev
```

## Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Run `supabase/20260824_district_one_progression.sql`.
3. Run `supabase/20260825_neo_exchange.sql`.
4. Copy `.env.example` to `.env` and add the project URL and public publishable/anon key.
5. Enable Google in Supabase Auth and configure the Google OAuth client and redirect URL.

The app requires a verified Google session. Progress, inventory, wallet, chat and rankings are account-owned; a different Google account receives a different character.

## Neo Exchange live feed

The exchange never invents or falls back to prices. Orders lock if the provider timestamp is more than 2.5 seconds old, and the gateway health check fails after eight seconds.

To activate live XAU/USD:

1. Use a Twelve Data commercial plan/licence that permits external client display.
2. Deploy one always-on instance of `services/market-gateway`.
3. Add `TWELVE_DATA_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only to that server's secret environment.
4. Check its `/health` endpoint before release.

Never put the Twelve Data key or Supabase service-role key in the APK, repository, Vite variables or client code. Until the gateway is configured and healthy, the exchange intentionally displays **FEED OFFLINE** and blocks every order.

## Tests and build

```bash
npm test
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For Play Store release, build a signed Android App Bundle and complete the relevant Play Console declarations.

## Build without Android Studio

Open **GitHub → Actions → Build Android APK → Run workflow**, then download the `neo-tokyo-underworld-apk` artifact from the successful run.
