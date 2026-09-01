# Moretti: Blackwood City

A persistent online crime RPG built with React, Vite, Capacitor and Supabase for Android. Authenticated player state is owned by database RPCs: the client requests an action, while Supabase validates costs, rolls outcomes and records the result.

## Current game

- Google login, character creation and authoritative cloud state
- Twelve-tier crime ladder with skill progression, server rolls and persistent jail consequences
- Real-player combat with leave, mug and hospitalize outcomes plus 24-hour new-player protection
- Persistent hospital/jail registers, attack records, friends, enemies, targets and blocks
- Four-stat gym with server-controlled energy and happiness-scaled gains
- Six professions with three-question interviews, position ladders, work stats, timed shifts and specials
- Missions, claimable rewards, awards and authoritative Hall of Fame data
- Shared Exchange wallet, protected bank balance, shops and server inventory
- Eight server-owned equipment slots with combat bonuses and a 200-piece mafia equipment catalog
- Seven-step guided tutorial persisted to each player account
- Purchasable properties with happiness and vault progression
- World chat, private mail, forums, player directory and real families
- Family headquarters with applications, officer permissions, private/war chat, activity records, shared vault and armory
- Real-member organized crimes, attack chains, ranked family wars and twelve income-producing territories
- Rossi's Casino: server-settled blackjack, slots and single-zero European roulette
- Prime FX brokerage accounts with 1:500/1:1000 leverage, lot-based orders, SL/TP, margin controls, live candlestick charts, Forex, XAU/USD and XAG/USD
- Free account-aware Consigliere with direct links to recommended activities

## Live market setup

Apply `supabase/20260904_casino_economy_careers.sql` and deploy `supabase/functions/blackwood-adviser`. The adviser uses the player's live Supabase progress and the built-in game guide; it requires no external AI account, API key, or usage payment.

After the other migrations, apply `supabase/20260906_live_brokerage.sql`. Create a Twelve Data key, save it as the Supabase Edge Function secret `TWELVE_DATA_API_KEY`, then deploy `supabase/functions/market-feed`. The key stays on the server and is never included in the APK. The free provider tier is appropriate for development or a small closed test; confirm market-data display and redistribution rights before a public production launch.

If `20260906_live_brokerage.sql` was installed before the micro-lot margin fix, run `supabase/20260907_broker_margin_hotfix.sql` once. It is safe to run again.

For the one-time new-game wipe, manually run `supabase/RESET_FOR_NEW_GAME.sql` after every migration. It is deliberately separate and never runs during a build.
- Responsive desktop and mobile layouts

## Local development

```bash
npm install
npm run dev
```

Run the focused regression suite and production build:

```bash
npm test
npm run build
```

## Supabase backend

Apply the migrations once to the existing Supabase project, in this order:

1. `supabase/schema.sql`
2. `supabase/20260825_neo_exchange.sql`
3. `supabase/20260826_neo_exchange_simulator.sql`
4. `supabase/20260902_arcade_exchange_overhaul.sql`
5. `supabase/20260901_blackwood_city_core.sql`
6. `supabase/20260903_inventory_equipment_tutorial.sql`
7. `supabase/20260904_casino_economy_careers.sql`
8. `supabase/20260905_families_wars.sql`
9. `supabase/20260906_live_brokerage.sql`
10. `supabase/20260907_broker_margin_hotfix.sql`
11. `supabase/20260908_world_chat_hotfix.sql`
12. `supabase/20260909_live_floating_pnl.sql`

The city-core migration installs the connected world, RLS policies, real families and authoritative ranking adapter. Later migrations add the catalog, tutorial, casino, Forex economy, careers and Families 2.0. The reset script is separate because it must run only once.

Google authentication must be enabled in Supabase. Web and Android OAuth callbacks are both supported. Never put a service-role key in the app or in a `VITE_` environment variable.

## Android

```bash
npm run android:apk
```

The package identifier is intentionally unchanged for upgrade compatibility. The display name is **Moretti: Blackwood City**.
