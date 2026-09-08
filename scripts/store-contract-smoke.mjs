import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  migration: "../supabase/20260924_blackwood_supporter_store.sql",
  hub: "../src/store/StoreHub.jsx",
  css: "../src/store/store.css",
  game: "../src/MafiaGame.jsx",
  navigation: "../src/ui/navigation.js",
  character: "../src/online/CharacterHub.jsx",
  characterCss: "../src/ui/after-dark.css",
  safety: "../src/safety/SafetyHub.jsx",
  edge: "../supabase/functions/google-play-purchase/index.ts",
  rtdn: "../supabase/functions/google-play-rtdn/index.ts",
  plugin: "../android/app/src/main/java/com/neotokyo/underworld/PlayBillingPlugin.java",
  activity: "../android/app/src/main/java/com/neotokyo/underworld/MainActivity.java",
  gradle: "../android/app/build.gradle",
  readme: "../README.md",
};
const entries = Object.entries(files);
const contents = Object.fromEntries(await Promise.all(entries.map(async ([key, path]) => [key, await readFile(new URL(path, import.meta.url), "utf8")] )));

for (const marker of [
  "bw_store_products", "bw_store_purchase_intents", "bw_store_purchase_events", "bw_store_entitlements",
  "bw_store_claim_daily", "bw_store_redeem_style_ticket", "bw_store_apply_verified_purchase", "bw_store_revoke_purchase",
  "Google Play", "nativePurchaseRequired", "realMoneyArcadeConversion", "cashPacks", "randomizedProducts",
]) assert.ok(contents.migration.includes(marker), `missing store migration contract: ${marker}`);
for (const forbidden of ["'city_cash'", "'cash'", "'arcade_dollars'", "'ledger_credits'", "'stats'", "'power'", "'loot'"]) assert.ok(contents.migration.includes(forbidden), `benefit guard missing: ${forbidden}`);
assert.ok(!contents.migration.includes("else 'revoked'"), "purchase event check constraint cannot store revoked state");
assert.ok(contents.migration.includes("else 'cancelled'"), "revocation must use a constrained purchase state");
for (const marker of ["google-play-purchase", "bw_store_begin_purchase", "restorePurchases", "Claim daily ticket", "Style Tickets", "No paid Arcade Dollars", "Pending, refunded, cancelled or unverified"]) assert.ok(contents.hub.includes(marker), `missing store UI/bridge contract: ${marker}`);
assert.ok(!/bw_store_apply_verified_purchase/.test(contents.hub), "client must never call the trusted entitlement grant RPC");
for (const marker of ["store-page", "store-membership", "store-product-grid", "store-steps", "@media(max-width:560px)"]) assert.ok(contents.css.includes(marker), `missing store styling: ${marker}`);
for (const marker of ["Supporter Store", "store:<StoreHub", "StoreHub"] ) assert.ok(contents.game.includes(marker), `store route missing: ${marker}`);
assert.ok(contents.navigation.includes("['store','Supporter Store']"), "store navigation entry missing");
for (const marker of ["showcaseLimit", "BACKGROUND_ENTITLEMENT_PREFIX", "member-night", "Supporter Store", "fourth showcase slot"]) assert.ok(contents.character.includes(marker), `character entitlement hook missing: ${marker}`);
for (const marker of ["background-night", "background-member-night", "background-choice.locked"]) assert.ok(contents.characterCss.includes(marker), `character cosmetic styling missing: ${marker}`);
assert.ok(contents.safety.includes("Optional, cosmetic support"), "Help & Safety store disclosure missing");
for (const marker of ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "purchases/products", "subscriptionsv2", "bw_store_apply_verified_purchase", "acknowledge", "purchaseState"]) assert.ok(contents.edge.includes(marker), `server verifier contract missing: ${marker}`);
for (const marker of ["subscriptionNotification", "oneTimeProductNotification", "GOOGLE_PLAY_PUBSUB_TOKEN", "bw_store_apply_verified_purchase", "unlinked-purchase"]) assert.ok(contents.rtdn.includes(marker), `RTDN reconciliation contract missing: ${marker}`);
for (const marker of ["@CapacitorPlugin(name = \"PlayBilling\")", "getProducts", "restorePurchases", "purchaseUpdated", "launchBillingFlow"]) assert.ok(contents.plugin.includes(marker), `native Play bridge contract missing: ${marker}`);
assert.ok(contents.activity.includes("registerPlugin(PlayBillingPlugin.class)"), "native plugin is not registered");
assert.ok(contents.gradle.includes("com.android.billingclient:billing:9.1.0"), "Play Billing dependency missing");
assert.ok(contents.readme.includes("20260924_blackwood_supporter_store.sql"), "release migration is not documented");
console.log("Supporter Store catalog, entitlement, Google Play verification, membership and character-card contracts passed.");
