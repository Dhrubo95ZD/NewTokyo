# Moretti: Blackwood City

A responsive crime-city RPG built with React, Vite, Capacitor and Supabase. The game is centered on a clear daily loop inspired by persistent browser RPGs: spend regenerating energy and nerve, grow combat stats, commit progressively harder crimes, hold a legitimate job, build family respect and manage cash.

## Current game

- Overview dashboard with resources, rank, goals and activity
- Five-tier crime ladder with chance, skill, rewards, XP and jail consequences
- Four-stat gym with happiness-scaled training gains
- Employment and career progression
- Family orders, member roster and respect
- Inventory and consumables
- City directory and persistent local save
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

## Trading backend

The game itself saves locally. The Exchange remains account-owned and server-authoritative. Apply the retained Supabase schema and exchange migrations in this order:

1. `supabase/schema.sql`
2. `supabase/20260825_neo_exchange.sql`
3. `supabase/20260826_neo_exchange_simulator.sql`
4. `supabase/20260902_arcade_exchange_overhaul.sql`

Google authentication must be enabled in Supabase. Web and Android OAuth callbacks are both supported. Market quotes, orders, leverage, protection, liquidation and wallet settlement remain authoritative database operations.

## Android

```bash
npm run android:apk
```

The package identifier is intentionally unchanged for upgrade compatibility. The display name is **Moretti: Blackwood City**.
