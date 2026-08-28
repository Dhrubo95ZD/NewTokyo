# New Tokyo: Underworld

A focused, mobile-first cyberpunk roguelite built with React and Capacitor.

The default experience is intentionally small and replayable: choose a district, read each enemy's telegraphed move, build Focus with quick cuts and deflects, spend it on stronger techniques, take one field upgrade between fights, and defeat the district boss. A complete run takes roughly five minutes.

## What changed

- No account wall—the game starts immediately and saves locally.
- Three clear destinations: City, Active Run, and Workshop.
- One combat model with four useful actions instead of overlapping battle modes.
- Telegraphs make defense and offense deliberate rather than random.
- One emergency reboot per run softens experimental play.
- Permanent upgrades use a single currency and show exact effects.
- Desktop keys `1`–`4`, touch controls, responsive layouts, safe-area support, and reduced-motion support.
- Existing art is reused in a cohesive neon-noir presentation without remote font or image dependencies.

The earlier online, economy, social, and long-form RPG modules remain in `src/` and `supabase/` as an archive, but they are no longer imported by the playable entry point.

## Run locally

```bash
npm install
npm run dev
```

## Test and build

```bash
npm test
npm run build
```

The core test covers combat damage, Focus costs, emergency reboot behavior, field upgrades, and permanent progression.

## Android

```bash
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. You can also run the **Build Android APK** workflow in GitHub Actions and download the `neo-tokyo-underworld-apk` artifact.
