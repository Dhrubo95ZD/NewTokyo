# Neo-Tokyo Underworld — Android

Android-ready remake of the original React game. It includes offline autosave, touch-safe UI, canvas combat, and optional online cloud saves/chat/rankings.

## Web test

```bash
npm install
npm run dev
```

## Online mode

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Copy `.env.example` to `.env` and add the project URL and public anon key.
4. Rebuild. Without these values, the game automatically runs in solo mode.

The included shared-key backend is suitable for testing. Before a public launch, migrate account saves to authenticated user-owned rows and add moderation/rate limits for chat.

## Android APK

```bash
npm install
npx cap add android
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For Play Store release, open Android Studio with `npm run android:open`, change the package/application IDs if needed, and generate a signed Android App Bundle.

## Build without Android Studio

Upload this project to a GitHub repository, open **Actions → Build Android APK → Run workflow**, then download the `neo-tokyo-underworld-apk` artifact. The included workflow installs the Android build dependencies and compiles the APK automatically.
