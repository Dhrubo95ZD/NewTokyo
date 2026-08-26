import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = (await readFile(new URL("../supabase/20260829_raid_specializations.sql", import.meta.url), "utf8")).toLowerCase();
for (const fragment of [
  "raid_catalog", "player_raid_profiles", "raid_parties", "raid_party_members",
  "get_my_raid_state", "set_my_raid_specialization", "queue_raid", "join_raid_room", "fill_raid_with_bots",
  "advance_raid_phase", "claim_raid_rewards", "leave_raid_room", "security definer",
  "require_google_player", "for update", "auth.uid()", "supabase_realtime",
]) assert.ok(sql.includes(fragment), `raid migration missing: ${fragment}`);
assert.ok(sql.includes("party.bot_count=0 or random()<.5"), "server must enforce the exact 50% bot equipment roll");
assert.ok(sql.includes("floor(raid.shard_reward*.5)"), "server must halve bot-assisted material yield");
assert.ok(sql.includes("case when party.bot_count>0 then .5 else 1 end"), "server response must disclose the applied loot modifier");
assert.ok(sql.includes("greatest(0,4-humans)"), "bot fill must occupy only empty squad slots");
assert.ok(!sql.includes("real money"), "raid settlement must not introduce real-money rewards");
console.log("Raid server contract smoke tests passed");
