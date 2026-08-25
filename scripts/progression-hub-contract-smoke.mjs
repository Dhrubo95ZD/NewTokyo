import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = (await readFile(new URL("../supabase/20260827_progression_hub.sql", import.meta.url), "utf8")).toLowerCase();
for (const fragment of [
  "dungeon_catalog", "player_dungeon_progress", "dungeon_parties", "dungeon_party_members",
  "calculate_player_combat_power", "manage_my_armory", "equipped items are protected",
  "start_afk_dungeon", "claim_afk_dungeon", "queue_coop_dungeon", "claim_coop_dungeon",
  "co-op requires 75 percent", "level_required", "recommended_cp", "prism-core",
  "for update", "auth.uid()", "revoke insert,update,delete", "supabase_realtime",
]) assert.ok(sql.includes(fragment), `progression migration missing: ${fragment}`);
console.log("Progression Hub server contract smoke tests passed");
