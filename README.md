# Moretti: Blackwood City

A persistent online crime RPG built with React, Vite, Capacitor and Supabase for Android. Authenticated player state is owned by database RPCs: the client requests an action while Supabase validates costs, rolls outcomes and records the result.

## Current game

- Google login, character creation and authoritative cloud state
- Crime ladder, real-player combat, missions, operations, careers, training and properties
- Four world factions, family headquarters, family wars, territories and the Blackwood Takeover season
- Equipment, inventory, rare relics, transparent acquisition odds and a public character-card collection
- World chat, private mail, forums, player directory, reporting, muting and blocking
- Rossi's Arcade: blackjack, slots and roulette using separate play-earned Arcade Dollars; verified net wins may redeem one-way into ordinary in-game cash
- Prime FX Ledger Credit accounts using virtual, play-earned credits; no cash value or real execution
- Free account-aware Consigliere, guided tutorial, Daily Life and Blackwood Dispatch
- Supporter Store with Google Play-verified direct character-card cosmetics and an optional Moretti Monthly membership; no paid cash, Arcade Dollars, stats, equipment, loot or power
- Responsive desktop and mobile layouts with an Android safe-area dock

## Local development

```bash
npm install
npm run dev
```

Run the regression suite and production build:

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
25. `supabase/20260922_progression_concurrency_hardening.sql`
26. `supabase/20260923_retire_arcade_skill_rooms.sql`
27. `supabase/20260924_blackwood_supporter_store.sql`

The reset script is deliberately separate and must only be run manually for a new game. Arcade Dollars remain isolated from ordinary city cash: verified net Arcade wins may be redeemed one-way at 100 Arcade Dollars = $50 city cash, while city cash and real money can never be converted into Arcade Dollars.

## Supporter Store launch checklist

The store is cosmetic-first. The app never hard-codes a price and never grants an entitlement from a client click. Google Play supplies the localised price, the `google-play-purchase` Edge Function verifies the purchase token with Google, and only then does the database write the entitlement.

Apply `supabase/20260924_blackwood_supporter_store.sql` after the character-collection migration. Deploy `supabase/functions/google-play-purchase` for app purchase/restore flows and `supabase/functions/google-play-rtdn` behind a Google Play Real-time Developer Notification (Pub/Sub) push subscription. Configure these Supabase Edge Function secrets:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: a least-privilege Google Play service-account JSON that can read and acknowledge purchases for this package
- `GOOGLE_PLAY_PACKAGE_NAME`: `com.neotokyo.underworld` (set it explicitly in production)
- `GOOGLE_PLAY_PUBSUB_TOKEN`: an optional shared bearer token for the Pub/Sub push endpoint (prefer Pub/Sub OIDC in production as well)

Create these Play Console products with the exact IDs in the migration:

| Play product ID | Type | Benefit | Suggested starting price* |
| --- | --- | --- | --- |
| `blackwood_patron_amber` | Non-consumable | Amber character-card frame | $1.99 |
| `blackwood_patron_midnight` | Non-consumable | Midnight character-card frame | $2.99 |
| `blackwood_night_paper` | Non-consumable | Night Ledger paper treatment | $1.99 |
| `blackwood_membership_monthly` | Subscription (`monthly` base plan) | 1 cosmetic Style Ticket/day, member badge, +1 showcase slot | $4.99/month |

\*Prices are a starting hypothesis, not an app promise. Use Play regional pricing and review retention, conversion and refund rates before changing them. Prices are intentionally not shipped in the APK.

Before release, test a license account through clean install, purchase, pending payment, restore, renewal, grace period, cancellation, refund and account deletion. Configure Real-time Developer Notifications so subscription changes and refunds are reconciled server-side. Never put the service-account key or a service-role key in the APK or a `VITE_` environment variable.

The store grants no city cash, cash packs, Ledger Credits, Arcade Dollars, weapons, stats, XP, energy, nerve, loot boxes or randomised rewards. Style Tickets can only redeem fixed-cost member cosmetics and cannot be exchanged for money or any gameplay currency.

## Live market setup

Deploy `supabase/functions/blackwood-adviser` for the built-in adviser. For live virtual market quotes, create a Twelve Data key, save it as `TWELVE_DATA_API_KEY` in the market-feed Edge Function and confirm the provider's display/redistribution rights before public release. The key stays on the server and is never included in the APK.

See [`docs/GOOGLE_PLAY_RELEASE_CHECKLIST.md`](docs/GOOGLE_PLAY_RELEASE_CHECKLIST.md) before moving from tester APKs to a Play Store production release.

## Android

```bash
npm run android:apk
```

The package identifier remains `com.neotokyo.underworld` for upgrade compatibility. The display name is **Moretti: Blackwood City**.
