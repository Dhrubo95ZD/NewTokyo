# Blackwood After Dark — first review candidate

## Implemented

- Five grouped destinations: Home, Play, Character, City and Family. All existing game systems remain reachable.
- Always-labelled Ask Adviser in the fixed header; no hidden floating icon. Suggested prompts, session conversation, failure/retry, focus trap, Escape, responsive dialog and Android-back dismissal.
- Server-backed Home recommendations, operation priority, campaign claim links, real activity timestamps and partial-load recovery. Removed invented family orders and activity dates.
- Charcoal/slate surfaces, ivory body text, brass primary actions, readable type, safe-area spacing, touch press feedback, page/sheet transitions and reduced motion.
- Crimes: explicit costs, estimated chance/risk, readable locked reasons, Ready now filter, synchronous double-tap guard and actual server success/failure results.
- Location directory cards and faction deep links. Dispatch now explicitly uses lifetime milestones, not fictitious seasons; its progress matches its targets.
- Browser-back navigation and per-page scroll restoration. Page-owned forms/filters currently reset when changing screens; broader persisted workspace state is not part of this first candidate.

## Validation

Run existing contracts with `npm test`; run decision tests with `node scripts/after-dark-contract.mjs`.

Install Playwright in a disposable environment and run `node scripts/after-dark-browser.mjs`. The `Blackwood UI review` workflow runs this on pull requests and uploads 320px/390px/1440px screenshots. It uses a deterministic local fixture and never calls real player services. The fixture is not an entry in the production bundle.

The local production web build passes. Existing bundle-size warning remains. Local browser executable was unavailable and its download failed; rendered checks must pass in CI and screenshots must be reviewed before merging.

## Release boundaries

This is the Home + Adviser + Crimes benchmark and shared shell, not a claim that every legacy screen is redesigned. No database migration, economy change, package name change, signing change, or Play upload is included. Version code 14 is deliberately untouched; do not upload this candidate to Play under that already-used code.

## Follow-up after visual approval

1. Consolidate legacy stylesheet layers and bundle the chosen fonts (the existing external font import still has local serif/sans fallbacks).
2. Apply purpose-built layouts to equipment/catalogue, jobs, combat, operations and progression; profile real Android interactions.
3. Persist useful tab/filter/form context and add unsaved-form protection.
4. Check keyboard resize on physical Android, tutorial obstruction, screen-reader flows, contrast and large-text settings.
5. Build APK/AAB from the validated candidate with an unused version code when preparing a Play update.
