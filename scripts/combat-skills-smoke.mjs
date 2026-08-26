import assert from "node:assert/strict";
import { COMBAT_SKILLS, equipCombatSkill, normalizeCombatSkills, unlockedCombatSkills } from "../src/game/combatSkills.js";

assert.equal(COMBAT_SKILLS.length, 6, "six techniques ship in the first combat loadout");
assert.deepEqual(normalizeCombatSkills(null, 1).equipped, ["arc-slash"], "new runners receive one usable starter technique");
assert.equal(unlockedCombatSkills(5).length, 3, "level gates unlock techniques progressively");
assert.throws(() => equipCombatSkill(null, "overdrive", 0, 5), /level 18/i, "locked techniques cannot be equipped");
const loadout = equipCombatSkill({ equipped: ["arc-slash", "pulse-guard"] }, "vector-rush", 2, 5);
assert.deepEqual(loadout.equipped, ["arc-slash", "pulse-guard", "vector-rush"]);
const moved = equipCombatSkill(loadout, "arc-slash", 2, 5);
assert.equal(new Set(moved.equipped).size, moved.equipped.length, "a technique cannot occupy two slots");
console.log("combat skill rules smoke test passed");
