import assert from "node:assert/strict";
import { MASTERY_BRANCHES, MASTERY_NODES, canUpgradeMastery, masteryBonuses, masteryPointsForLevel, masterySpent, normalizeMastery, upgradeMastery } from "../src/online/masteryRules.js";

assert.equal(MASTERY_BRANCHES.length, 3);
assert.ok(MASTERY_NODES.length >= 12);
assert.equal(masteryPointsForLevel(1), 1);
assert.equal(masteryPointsForLevel(10), 6);
let state = normalizeMastery();
assert.equal(masterySpent(state), 0);
assert.equal(canUpgradeMastery(state, "guard-weave", 10), false);
state = upgradeMastery(state, "power-core", 10);
assert.equal(state.ranks["power-core"], 1);
assert.equal(masteryBonuses(state).str, 3);
assert.equal(canUpgradeMastery(state, "guard-weave", 10), true);
state = upgradeMastery(state, "guard-weave", 10);
assert.equal(masteryBonuses(state).def, 3);
console.log("Mastery rules smoke passed");
