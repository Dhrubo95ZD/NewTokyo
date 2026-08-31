# Moretti: Blackwood City

A persistent online crime RPG built with React, Vite, Capacitor and Supabase for Android. Authenticated player state is owned by database RPCs: the client requests an action, while Supabase validates costs, rolls outcomes and records the result.

## Current game

- Google login, character creation and authoritative cloud state
- Twelve-tier crime ladder with skill progression, server rolls and persistent jail consequences
- Real-player combat with leave, mug and hospitalize outcomes plus 24-hour new-player protection
- Persistent hospital/jail registers, attack records, friends, enemies, targets and blocks
- Four-stat gym with server-controlled energy and happiness-scaled gains
- Five careers with timed shifts, pay and job points
- Missions, claimable rewards, awards and authoritative Hall of Fame data
- Shared Exchange wallet, protected bank balance, shops, server inventory and consumables
- Purchasable properties with happiness and vault progression
- World chat, private mail, forums, player directory and real families
- Rossi's Arcade: street cricket, reaction and memory games
- The Exchange: the existing authenticated, server-settled gold trading simulator
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

The final migration installs the connected city core, RLS policies, real families and authoritative ranking adapter. Existing cloud saves are imported the first time each player opens the upgraded game. It is idempotent and can be reapplied safely.

Google authentication must be enabled in Supabase. Web and Android OAuth callbacks are both supported. Never put a service-role key in the app or in a `VITE_` environment variable.

## Android

```bash
npm run android:apk
```

The package identifier is intentionally unchanged for upgrade compatibility. The display name is **Moretti: Blackwood City**.
