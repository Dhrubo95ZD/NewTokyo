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
- Rossi's Casino: server-settled blackjack, slots and single-zero European roulette
- Economy: six continuously simulated Forex pairs, trader ranks and earned Federal Trust job offers
- Free account-aware Consigliere with direct links to recommended activities

## 20260904 setup

Apply `supabase/20260904_casino_economy_careers.sql` and deploy `supabase/functions/blackwood-adviser`. The adviser uses the player's live Supabase progress and the built-in game guide; it requires no external AI account, API key, or usage payment.

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

The city-core migration installs the connected world, RLS policies, real families and authoritative ranking adapter. Later migrations add the catalog, tutorial, casino, Forex economy and careers. The reset script is separate because it must run only once.

Google authentication must be enabled in Supabase. Web and Android OAuth callbacks are both supported. Never put a service-role key in the app or in a `VITE_` environment variable.

## Android

```bash
npm run android:apk
```

The package identifier is intentionally unchanged for upgrade compatibility. The display name is **Moretti: Blackwood City**.
