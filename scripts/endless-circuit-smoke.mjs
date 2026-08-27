import assert from "node:assert/strict";
import fs from "node:fs";
import { endlessStageRequirement, normalizeEndlessState, normalizeGroundDrops } from "../src/game/endlessRules.js";

assert.equal(endlessStageRequirement(1), 90);
assert.ok(endlessStageRequirement(50) > endlessStageRequirement(20));
assert.equal(normalizeEndlessState({ active:true, stage:8, highest_stage:11 }).highestStage, 11);
assert.equal(normalizeGroundDrops([{ id:"x", rarity:"epic" }])[0].rarity, "epic");
const ui = fs.readFileSync(new URL("../src/game/EndlessCircuit.jsx", import.meta.url), "utf8");
assert.match(ui, /setInterval\(resolve, 15000\)/);
assert.match(ui, /ground-loot/);
assert.match(ui, /Fail and the runner drops one stage/);
console.log("Endless Circuit rules and ground-loot presentation passed.");
