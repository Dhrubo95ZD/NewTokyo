# Owner-only Google Play release actions

The repository now contains the app-side release work. Complete these account-owner actions before production:

## Supabase

1. Run migrations through `supabase/20260914_play_release_safety.sql` in filename order.
2. Deploy `delete-account` with JWT verification **enabled**. The included `supabase/config.toml` enforces this.
3. Add `https://dhrubo95zd.github.io/NewTokyo/delete-account.html` to Auth → URL Configuration → Redirect URLs.
4. Promote the first moderator after replacing the email below:
   `insert into public.bw_moderators(user_id,role) select id,'admin' from auth.users where email='YOUR_ADMIN_EMAIL' on conflict(user_id) do update set role='admin';`
5. Confirm RLS is enabled and never expose the service-role key in GitHub or the Android app.

## GitHub

The existing Supabase secrets also configure the public deletion page. Add four production signing secrets:

- `MORETTI_KEYSTORE_BASE64`
- `MORETTI_KEYSTORE_PASSWORD`
- `MORETTI_KEY_ALIAS`
- `MORETTI_KEY_PASSWORD`

Keep the upload keystore offline and backed up. GitHub Actions will produce a debug APK and, when all signing secrets exist, a signed release AAB.

Enable GitHub Pages with “GitHub Actions” as source if the Pages workflow cannot enable it automatically. Verify the three public URLs load.

## Play Console

1. Create the app with package `com.neotokyo.underworld` and enable Play App Signing.
2. Upload the signed AAB to Internal testing first.
3. Paste the listing text and release notes from `play/listing` and `play/release-notes`.
4. Add a 512×512 icon, 1024×500 feature graphic, and real phone screenshots without debug overlays or personal data.
5. Complete App access, Data Safety, Content rating, Ads (No), Target audience (18+), News app (No), and the simulated-gambling declarations.
6. Set privacy URL to `https://dhrubo95zd.github.io/NewTokyo/privacy.html` and deletion URL to `https://dhrubo95zd.github.io/NewTokyo/delete-account.html`.
7. Enter a monitored support email and website in Store settings.
8. Run a closed test with multiple real devices, review Android vitals, resolve crashes/ANRs, then stage production rollout rather than releasing to 100% immediately.
