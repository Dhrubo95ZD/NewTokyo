# Moretti: Google Play release checklist

Updated 1 September 2026. This is a project checklist, not legal advice.

## Implemented in the current update

- Android target and compile SDK moved to API 36 (Android 16); GitHub Actions installs the matching SDK.
- Item Catalogue shows every server item, procedural item artwork, stats, ownership, equipment state, sources and disclosed drop odds.
- Casino and Forex use isolated, play-earned **Ledger Credits (LC)**. LC has no purchase or dollar-conversion RPC, no cash value and no cash-out.
- Dollar cash is no longer changed by a casino result or brokerage transfer.
- Crime, combat, missions, street work and relic searches grant small LC rewards, so LC remains earnable without purchases or an energy-only wall.
- Alcohol, intoxicant, nightclub and private-card-runner display text has been replaced. Stable database IDs remain unchanged to protect player inventories.
- Casino and Forex screens state that they are virtual systems with no real-money execution or withdrawal.
- Reduced-motion handling, mobile layouts and server-authoritative outcomes remain enabled.

## Blocking before production submission

- [ ] Build an in-app **Delete account** flow and host a public account-deletion request URL. Deletion must remove the Supabase Auth user and associated game data.
- [ ] Publish a public privacy policy on a stable HTTPS URL and link it both in Play Console and inside the app.
- [ ] Complete Play Console Data Safety from the real Supabase, Google OAuth, crash-reporting and market-provider data flows.
- [ ] Complete the content-rating questionnaire honestly, including simulated casino games, crime, weapons and player interaction. Do not enroll this title in Designed for Families.
- [ ] Add report/mute tools for world chat, forums, mail, family chat and player profiles, plus a moderation queue and published community rules.
- [ ] Provide Google review with a reusable test account or documented Google sign-in access that reaches all gated areas.
- [ ] Create a signed Android App Bundle (`.aab`) with Play App Signing. Keep the Actions debug APK for testers only.
- [ ] Configure a permanent support email and support/privacy URLs in the store listing.

## Quality gate for a closed test

- [ ] Run the complete automated suite and build on every main-branch push.
- [ ] Test clean install, upgrade, offline recovery, expired login, slow network and interrupted actions on low-, mid- and high-end phones.
- [ ] Use Play pre-launch reports and Android vitals; fix crashes, ANRs, stuck loading states and clipped text before production.
- [ ] Test S25-style camera cut-outs, gesture navigation, font scaling at 200%, landscape rejection/handling and smallest supported screen.
- [ ] Verify all casino, trading, market and combat actions are idempotent under double taps and retries.
- [ ] Load-test world chat, rankings, item catalogue, family wars and market listings with realistic data volume.
- [ ] Add an in-game Help & Safety screen covering LC, virtual trading, simulated casino play, drop odds, moderation and support.
- [ ] Run a 50–100 player closed beta for at least two economy cycles; measure day-one retention, tutorial completion, early churn, LC inflation and exploit reports.

## Store presentation

- [ ] Use an original icon, feature graphic and screenshots showing the City, Item Catalogue, combat, families, LC casino and LC Forex.
- [ ] Avoid implying real brokerage access, real-money winnings or cash prizes in the title, screenshots and description.
- [ ] State clearly: “All casino and trading activity uses play-earned Ledger Credits with no cash value.”
- [ ] Add concise release notes and increment `versionCode` for every upload.

## Recommended next production update

**Safety, moderation and account control** should come before more game breadth: account deletion, report/mute, moderation tools, Help & Safety, privacy links, crash reporting and an internal diagnostics screen. After that, add collection rewards—cosmetic badges, display cases and set bonuses that do not require casino play—to make the catalogue a lasting progression system.
