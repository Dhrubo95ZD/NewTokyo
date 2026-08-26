import assert from "node:assert/strict";
import { RAID_OPERATIONS, RAID_SPECIALIZATIONS, botLootPolicy, normalizeRaidState, raidAccess } from "../src/game/raidRules.js";

assert.equal(RAID_SPECIALIZATIONS.length, 3, "three readable raid roles ship");
assert.deepEqual(RAID_SPECIALIZATIONS.map((entry) => entry.id), ["vanguard", "striker", "technician"]);
assert.equal(RAID_OPERATIONS.length, 3, "three raid tiers ship from level 20 to 99");
assert.equal(RAID_OPERATIONS.at(-1).level, 99);
assert.equal(botLootPolicy(0).modifier, 1, "human squads keep full raid loot");
assert.equal(botLootPolicy(1).modifier, .5, "one bot is enough to halve all raid loot");
assert.equal(botLootPolicy(3).modifier, .5, "bot penalty never becomes misleadingly smaller");
assert.equal(raidAccess(RAID_OPERATIONS[0], { level: 20 }, 450).unlocked, true);
assert.equal(raidAccess(RAID_OPERATIONS[0], { level: 19 }, 900).unlocked, false);
assert.equal(normalizeRaidState({ specialization: "striker" }).specialization, "striker");
assert.equal(normalizeRaidState({ specialization: "invalid" }).specialization, "vanguard");
console.log("Raid rules smoke tests passed");
