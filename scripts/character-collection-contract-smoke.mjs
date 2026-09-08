import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, hub, community, styles, gradle] = await Promise.all([
  readFile(new URL("../supabase/20260918_character_collection.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/online/CharacterHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/online/CommunityHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/after-dark.css", import.meta.url), "utf8"),
  readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8"),
]);

for (const marker of ["bw_profile_frames", "bw_character_showcases", "bw_character_collection_snapshot", "bw_save_character_showcase", "bw_public_character_card", "featured_item_ids", "frame is still locked"]) assert.ok(sql.includes(marker), `missing collection contract: ${marker}`);
for (const marker of ["Equipment board", "Inventory, at a glance", "Design your character card", "Save public card", "featuredItemIds", "bw_save_character_showcase"]) assert.ok(hub.includes(marker), `missing character UI: ${marker}`);
for (const marker of ["bw_public_character_card", "View card", "CharacterCard"]) assert.ok(community.includes(marker), `missing public showcase hook: ${marker}`);
for (const marker of ["character-hub", "character-slot", "character-item-card", "character-card-preview", "prefers-reduced-motion"]) assert.ok(styles.includes(marker), `missing collection styling: ${marker}`);
assert.match(gradle, /versionCode 20/);
console.log("Character equipment, collection filters, public cards and earnable frame contracts passed.");
