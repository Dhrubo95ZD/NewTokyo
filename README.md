# Moretti: Blackwood City

A persistent online crime RPG built with React, Vite, Capacitor and Supabase for Android. Authenticated player state is owned by database RPCs: the client requests an action, while Supabase validates costs, rolls outcomes and records the result.

## Current game

- Google login, character creation and authoritative cloud state
- Twelve-tier crime ladder with skill progression, server rolls and persistent jail consequences
- Server-authoritative real-player combat with daily contracts, escrowed bounties, attack protection, anti-farming rewards and persistent fight logs
- Persistent hospital/jail registers, attack records, friends, enemies, targets and blocks
- Four-stat gym with server-controlled energy and happiness-scaled gains
- Six five-rank professions with interviews, work stats, timed shifts, specials, resignation and faction influence
- Four-chapter campaign with twelve chained missions, claimable rewards and permanent city standing
- Four world factions with repeatable no-energy assignments, reputation tiers and diminishing-return grind guardrails
- Combat mastery, awards and authoritative Hall of Fame data
- Shared Exchange wallet, protected bank balance, shops and server inventory
- Eight server-owned equipment slots with combat bonuses, a visual searchable Item Catalogue and transparent acquisition odds
- Twelve drop-only rare, epic and legendary relics with lucky first-win drops plus a guaranteed no-energy Intel grind
- Seven-step guided tutorial persisted to each player account
- Purchasable properties with happiness and vault progression
- World chat, private mail, forums, player directory and real families
- Family headquarters with applications, officer permissions, private/war chat, activity records, shared vault and armory
- Real-member organized crimes, attack chains, ranked family wars and twelve income-producing territories
- Rossi's Arcade: blackjack, slots and roulette using separate play-earned Arcade Dollars; no city-cash or real-money purchase path, with one-way redemption of verified net wins into ordinary in-game cash
- Prime FX Ledger Credit accounts with 1:500/1:1000 leverage, lot-based orders, SL/TP, margin controls, live candlestick charts, Forex, XAU/USD and XAG/USD
- Free account-aware Consigliere with direct links to recommended activities
- Living City visual system with an animated skyline, illustrated district map, rarity effects, page transitions and a five-action safe-area mobile dock
- Blackwood Dispatch milestone board with server-backed next actions, district goals, faction targets and a mobile-first route guide
- Blackwood Takeover citywide faction season with pledge-locked, trigger-recorded contributions, district control, personal reward tiers and a server-backed finale countdown
- City Services directory with civic contracts, public project funding and district contributions that feed the active Takeover season

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
13. `supabase/20260910_blackwood_market_grind.sql`
14. `supabase/20260911_combat_contracts_relics.sql`
15. `supabase/20260912_item_catalogue_release_cleanup.sql`
16. `supabase/20260913_ledger_credits.sql`
17. `supabase/20260914_play_release_safety.sql`
18. `supabase/20260915_core_rpg_progression.sql`
19. `supabase/20260916_district_operations_arcade_catalogue.sql`
20. `supabase/20260917_daily_life.sql`
21. `supabase/20260918_character_collection.sql`
22. `supabase/20260919_blackwood_takeover.sql`
23. `supabase/20260920_city_services.sql`
24. `supabase/20260921_progression_guardrails_arcade_games.sql`

The city-core migration installs the connected world, RLS policies, real families and authoritative ranking adapter. Later migrations add the catalogue, tutorial, Arcade, Forex economy, careers and Families 2.0. The reset script is separate because it must run only once.

Arcade Dollars are isolated from ordinary city cash. The Arcade keeps its play-earned ledger balance non-purchasable and displays it as `# Moretti: Blackwood City

A persistent online crime RPG built with React, Vite, Capacitor and Supabase for Android. Authenticated player state is owned by database RPCs: the client requests an action, while Supabase validates costs, rolls outcomes and records the result.

## Current game

- Google login, character creation and authoritative cloud state
- Twelve-tier crime ladder with skill progression, server rolls and persistent jail consequences
- Server-authoritative real-player combat with daily contracts, escrowed bounties, attack protection, anti-farming rewards and persistent fight logs
- Persistent hospital/jail registers, attack records, friends, enemies, targets and blocks
- Four-stat gym with server-controlled energy and happiness-scaled gains
- Six five-rank professions with interviews, work stats, timed shifts, specials, resignation and faction influence
- Four-chapter campaign with twelve chained missions, claimable rewards and permanent city standing
- Four world factions with repeatable no-energy assignments, reputation tiers and diminishing-return grind guardrails
- Combat mastery, awards and authoritative Hall of Fame data
- Shared Exchange wallet, protected bank balance, shops and server inventory
- Eight server-owned equipment slots with combat bonuses, a visual searchable Item Catalogue and transparent acquisition odds
- Twelve drop-only rare, epic and legendary relics with lucky first-win drops plus a guaranteed no-energy Intel grind
- Seven-step guided tutorial persisted to each player account
- Purchasable properties with happiness and vault progression
- World chat, private mail, forums, player directory and real families
- Family headquarters with applications, officer permissions, private/war chat, activity records, shared vault and armory
- Real-member organized crimes, attack chains, ranked family wars and twelve income-producing territories
- Rossi's Arcade: blackjack, slots and roulette using separate play-earned Arcade Dollars; no city-cash or real-money purchase path, with one-way redemption of verified net wins into ordinary in-game cash
- Prime FX Ledger Credit accounts with 1:500/1:1000 leverage, lot-based orders, SL/TP, margin controls, live candlestick charts, Forex, XAU/USD and XAG/USD
- Free account-aware Consigliere with direct links to recommended activities
- Living City visual system with an animated skyline, illustrated district map, rarity effects, page transitions and a five-action safe-area mobile dock
- Blackwood Dispatch milestone board with server-backed next actions, district goals, faction targets and a mobile-first route guide
- Blackwood Takeover citywide faction season with pledge-locked, trigger-recorded contributions, district control, personal reward tiers and a server-backed finale countdown
- City Services directory with civic contracts, public project funding and district contributions that feed the active Takeover season

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
13. `supabase/20260910_blackwood_market_grind.sql`
14. `supabase/20260911_combat_contracts_relics.sql`
15. `supabase/20260912_item_catalogue_release_cleanup.sql`
16. `supabase/20260913_ledger_credits.sql`
17. `supabase/20260914_play_release_safety.sql`
18. `supabase/20260915_core_rpg_progression.sql`
19. `supabase/20260916_district_operations_arcade_catalogue.sql`
20. `supabase/20260917_daily_life.sql`
21. `supabase/20260918_character_collection.sql`
22. `supabase/20260919_blackwood_takeover.sql`
23. `supabase/20260920_city_services.sql`
24. `supabase/20260921_progression_guardrails_arcade_games.sql`

The city-core migration installs the connected world, RLS policies, real families and authoritative ranking adapter. Later migrations add the catalogue, tutorial, Arcade, Forex economy, careers and Families 2.0. The reset script is separate because it must run only once.

; verified net Arcade wins may be redeemed one-way into ordinary in-game cash at 100 Arcade Dollars = $50 city cash. The existing Market Desk remains play-only and is not connected to monetisation; there is no ordinary-cash or real-money to Arcade Dollar conversion, and no real-money withdrawal.

See [`docs/GOOGLE_PLAY_RELEASE_CHECKLIST.md`](docs/GOOGLE_PLAY_RELEASE_CHECKLIST.md) before moving from tester APKs to a Play Store production release.

Google authentication must be enabled in Supabase. Web and Android OAuth callbacks are both supported. Never put a service-role key in the app or in a `VITE_` environment variable.

## Android

```bash
npm run android:apk
```

The package identifier is intentionally unchanged for upgrade compatibility. The display name is **Moretti: Blackwood City**.
