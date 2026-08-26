import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raid = await readFile(new URL("../src/game/RaidCommand.jsx", import.meta.url), "utf8");
const hub = await readFile(new URL("../src/online/ProgressionHub.jsx", import.meta.url), "utf8");
const online = await readFile(new URL("../src/online/OnlineHub.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/game/raid-command.css", import.meta.url), "utf8");

for (const fragment of ["Choose Specialization", "Queue Players", "Deploy With Bots", "Fill Empty Slots With Bots", "50% raid loot", "Join Human Room", "BOSS INTEGRITY", "ROLE BONUS", "Claim Raid Rewards"])
  assert.ok(raid.includes(fragment), `raid UI contract missing: ${fragment}`);
assert.ok(hub.indexOf("<RaidCommand") > hub.indexOf('tab === "journey"'), "raid command must remain inside Battle");
for (const rpc of ["get_my_raid_state", "set_my_raid_specialization", "queue_raid", "join_raid_room", "fill_raid_with_bots", "advance_raid_phase", "claim_raid_rewards", "leave_raid_room"])
  assert.ok(online.includes(rpc), `raid RPC wiring missing: ${rpc}`);
assert.ok(css.includes("min-height:48px"), "raid UI must preserve Android-sized controls");
assert.ok(css.includes("@media(max-width:760px)"), "raid UI must include a mobile layout");
console.log("Raid UI contract smoke tests passed");
