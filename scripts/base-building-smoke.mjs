import assert from "node:assert/strict";
import {
  ATTACK_TACTICS, BASE_GRID_SIZE, BUILDING_CATALOG, PVP_RANKS, STARTER_BASE_LAYOUT,
  baseDefensePower, baseProgressionObjectives, buildingUpgradeCost, canPlaceBuilding, rankForTrophies,
} from "../src/online/baseBuildingRules.js";

assert.equal(BASE_GRID_SIZE, 8);
assert.ok(BUILDING_CATALOG.length >= 9);
assert.equal(ATTACK_TACTICS.length, 4);
assert.equal(PVP_RANKS.at(-1).id, "prism-commander");
assert.equal(rankForTrophies(0).id, "ward-scout");
assert.equal(rankForTrophies(550).id, "district-vanguard");
assert.equal(rankForTrophies(2400).id, "prism-commander");
assert.equal(canPlaceBuilding(STARTER_BASE_LAYOUT, { id: "new", kind: "pulse-turret" }, 0, 0), true);
assert.equal(canPlaceBuilding(STARTER_BASE_LAYOUT, { id: "new", kind: "pulse-turret" }, 3, 3), false);
assert.equal(canPlaceBuilding(STARTER_BASE_LAYOUT, { id: "new", kind: "runner-bay" }, BASE_GRID_SIZE - 1, 0), false);
assert.ok(baseDefensePower(STARTER_BASE_LAYOUT) > 500);
assert.ok(buildingUpgradeCost(STARTER_BASE_LAYOUT[0]).alloy > 0);
assert.equal(baseProgressionObjectives({ layout: STARTER_BASE_LAYOUT, trophies: 0, wins: 0 }).length, 5);
console.log("Gridhold base-building rules smoke tests passed");
