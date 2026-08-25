import assert from "node:assert/strict";
import {
  DUNGEONS, calculateCombatPower, chooseBestLoadout, dungeonAccess, itemCombatPower,
  progressionObjectives, saleValue, salvageValue,
} from "../src/online/progressionHubRules.js";

assert.equal(DUNGEONS[0].level, 1);
assert.equal(DUNGEONS.at(-1).level, 99);
assert.equal(DUNGEONS.at(-1).rarity, "Prismatic chase");
const items = [
  { id: "weak", slot: "weapon", rarity: "green", stats: { attack: 7 } },
  { id: "strong", slot: "weapon", rarity: "blue", stats: { attack: 12 } },
  { id: "armor", slot: "armor", rarity: "green", stats: { defense: 8 } },
];
assert.equal(chooseBestLoadout(items, { weak: 0, strong: 2 }).weapon.id, "strong");
assert.ok(itemCombatPower(items[1], 2) > itemCombatPower(items[0], 0));
assert.ok(calculateCombatPower({ level: 50, stats: { str: 80, def: 60, spd: 50, dex: 40 }, gear: { str: 80, def: 60, spd: 30, dex: 20 }, enhancementTotal: 20 }) > 5000);
assert.equal(dungeonAccess(DUNGEONS[3], { level: 20, cp: 899 }, "solo").unlocked, false);
assert.equal(dungeonAccess(DUNGEONS[3], { level: 20, cp: 675 }, "coop").unlocked, true);
assert.ok(salvageValue(items[1], 5) > salvageValue(items[1], 0));
assert.ok(saleValue(items[1], 0) > salvageValue(items[1], 0));
assert.equal(progressionObjectives({ campaignDone: true, inventory: { equipped: { weapon: "x", helmet: "x", armor: "x", boots: "x" }, enhancement: { x: 5 }, dungeon: { bestLevel: 50 } }, cp: 2500, player: { statPoints: 0 } }).every((quest) => quest.done), false);
console.log("Progression Hub rules smoke tests passed");
