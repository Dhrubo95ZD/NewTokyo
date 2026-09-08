# Blackwood After Dark — core UI rebuild, Daily Life and Supporter Store

## Implemented

- Five grouped destinations: Home, Play, Character, City and Family. All existing game systems remain reachable.
- Always-labelled Ask Adviser in the fixed header; no hidden floating icon. Suggested prompts, session conversation, failure/retry, focus trap, Escape, responsive dialog and Android-back dismissal.
- Server-backed Home recommendations, operation priority, campaign claim links, real activity timestamps and partial-load recovery. Removed invented family orders and activity dates.
- Light ivory dossier surfaces, dark ink, restrained brass actions, readable type, safe-area spacing, touch press feedback, page/sheet transitions and reduced motion.
- Crimes: explicit costs, estimated chance/risk, readable locked reasons, Ready now filter, synchronous double-tap guard and actual server success/failure results.
- Location directory cards and faction deep links. Dispatch now explicitly uses lifetime milestones, not fictitious seasons; its progress matches its targets.
- Browser-back navigation and per-page scroll restoration. Page-owned forms/filters currently reset when changing screens; broader persisted workspace state is not part of this first candidate.
- Core journey pass across progression, operations, combat, catalogue, equipment, jobs, street work and market. These surfaces now share the same charcoal/slate/brass hierarchy while keeping rarity, risk, heat and outcome colours meaningful.
- Home now surfaces server-backed priority records for active operations, claimable rewards and restrictions instead of making players search the navigation.
- Daily Life adds a server-authoritative seven-day check-in bonus, three rotating daily objectives, a ten-action weekly objective, and a compact mission journal with direct campaign links. Claims are idempotent by server date and rewards cannot be duplicated by repeated taps.
- Character & Collection adds a light, game-like equipment board, readable rarity labels, searchable inventory sorting, quick compare/equip actions, and a public character card. Players can select earnable frames, card layouts, paper treatments and up to three owned showcase items; the server validates every saved choice. The player directory now opens public cards without exposing private inventory.
- Supporter Store adds a server-backed Google Play catalog, receipt verification boundary, cosmetic-only direct products, Moretti Monthly daily Style Tickets, restore/manage controls and a fourth public showcase slot. Prices come from Play's localised product details; no client click grants value.

## Validation

Run existing contracts with `npm test`; run Daily Life coverage with `node scripts/daily-life-contract-smoke.mjs`; run decision tests with `node scripts/after-dark-contract.mjs`.

Install Playwright in a disposable environment and run `node scripts/after-dark-browser.mjs`. The `Blackwood UI review` workflow runs this on pull requests and uploads 320px/390px/1440px screenshots. It uses a deterministic local fixture and never calls real player services. The fixture is not an entry in the production bundle.

The local production web build passes. Existing bundle-size warning remains. Local browser executable was unavailable and its download failed; rendered checks must pass in CI and screenshots must be reviewed before merging.

## Release boundaries

The current branch is an incremental game build. It keeps the existing database contracts, economy, package name and signing setup while extending the UI consistently across the core journeys. The Android candidate is version 0.20.0 (version code 20) with the Daily Life, Character & Collection and Supporter Store migrations included.

## Follow-up after visual approval

1. Consolidate legacy stylesheet layers and bundle the chosen fonts (the existing external font import still has local serif/sans fallbacks).
2. Persist useful tab/filter/form context and add unsaved-form protection.
3. Check keyboard resize on physical Android, tutorial obstruction, screen-reader flows, contrast and large-text settings.
4. Continue polishing supporting community, account and safety screens against the same component tokens.
6. Apply `supabase/20260917_daily_life.sql`, `supabase/20260918_character_collection.sql` and `supabase/20260924_blackwood_supporter_store.sql` to the connected project, deploy the Google Play verifier with its secrets, build and install each candidate on Android, then use the AAB for the next Play testing update when ready.
