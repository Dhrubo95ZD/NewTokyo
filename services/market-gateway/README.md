# Neo Exchange market gateway

One server-side WebSocket connection receives licensed XAU/USD ticks and sends
them to the guarded `settle_exchange_tick` database function. The API key and
Supabase service-role key must never be included in the Android build.

## Required setup

1. Apply `supabase/20260825_neo_exchange.sql`.
2. Create a commercial Twelve Data account that permits external display.
3. Copy `.env.example` to the host's secret/environment settings.
4. Install dependencies with `npm install` in this directory and run `npm start`.
5. Keep one production instance online. `/health` returns HTTP 503 whenever the
   latest provider tick is more than eight seconds old.

The Android client reads quotes/candles through authenticated Supabase Realtime.
It locks order entry after 2.5 seconds without a source tick and never generates
fallback prices.
