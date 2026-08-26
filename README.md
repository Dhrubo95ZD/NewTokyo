# Neo-Tokyo Underworld — Android

## Battle command and active techniques

The bottom **Battle** tab is now the single home for story operations, quests, dungeons, manual combat, AFK auto-battle, and co-op rooms. **Loadout** opens character equipment directly, so combat activities and gear management no longer compete for the same entry point.

Manual battles include a cloud-saved three-slot Technique Loadout. Six level-gated techniques provide area damage, defense, mobility, recovery, crowd control, and a timed damage/attack-speed boost, each with an in-arena cooldown display.

Android-first React/Capacitor game with Google-only accounts, account-owned cloud progress, live chat/rankings, reactive combat, character equipment and the Neo Exchange server-run market simulator.

## Character equipment cockpit

The **Loadout** entry opens a single responsive character-equipment cockpit: a full-body runner preview, four dedicated gear slots, one-tap best upgrades per slot, whole-loadout Best Equip, base-versus-gear stat breakdowns, secondary combat effects, matching-set progress and equipment bonus totals. Item art is never pasted over the character model; each piece remains readable in its own rarity-lit slot.

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
6. Run `supabase/20260828_gridhold_pvp.sql` to enable co-op room creation, room codes, browsing and Quick Match. The historical filename is retained so existing installations do not need a replacement migration.
7. Run `supabase/20260829_raid_specializations.sql` to add specializations, four-slot raid rooms, phased raid actions and optional bot filling. Bot-assisted rooms receive exactly 50% equipment-drop chance and 50% material yield.
8. Run `supabase/20260830_neo_economy.sql` to add the Auction House, secure escrow, Life Skills, 80 crafting recipes, expanded side-grade sets and Megachip drops.
9. Copy `.env.example` to `.env` and add the project URL and public publishable/anon key.
10. Enable Google in Supabase Auth and configure the Google OAuth client and redirect URL.

Co-op supports Quick Match, public room browsing and shareable room codes. A room starts when its combined runner power satisfies the dungeon requirement.

## Linked Raid Operations

Battle contains a dedicated four-runner raid command with Vanguard, Striker and Technician specializations, three multi-phase operations, human matchmaking rooms, shareable codes and server-owned contribution/reward settlement. Players may fill empty squad slots with support bots and begin immediately. Any number of bots changes the equipment roll from 100% to 50% and halves material yield; both penalties are displayed throughout the raid and enforced inside `claim_raid_rewards` rather than trusted to the client.

## Combat Mastery

Mastery is a dedicated main-navigation progression screen with Vanguard, Pathfinder and Engineer branches. Players gain a point every two levels and invest in permanent combat, survival, loot and XP upgrades. The selected ranks are stored in the player's Google-account cloud save and apply directly to Combat Power and manual combat.

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
