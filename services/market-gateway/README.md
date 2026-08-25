# Neo Exchange optional live-market adapter

The game ships with a free server-run simulation. This optional adapter preserves
the future path to licensed XAU/USD: one server-side WebSocket receives provider
ticks and sends them through the same guarded ingestion/settlement boundary. The
API key and Supabase secret/service-role key must never be included in Android.

## Required setup

1. Apply both Neo Exchange migrations, including `20260826_neo_exchange_simulator.sql`.
2. Create a commercial Twelve Data account that permits external display.
3. Copy `.env.example` to the host's secret/environment settings.
4. Install dependencies with `npm install` in this directory and run `npm start`.
5. Close all open positions and run `select public.set_exchange_source('live');`.
6. Keep one production instance online. `/health` returns HTTP 503 whenever the
   latest provider tick is more than eight seconds old.

The Android client reads source metadata with quotes/candles and changes its label
from SIM to LIVE automatically. It locks live orders after 2.5 seconds without a
source tick. Switch back with `select public.set_exchange_source('simulated');`
after closing positions; no client rebuild is required.
