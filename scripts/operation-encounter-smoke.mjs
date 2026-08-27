import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { operationEncounterProfile } from "../src/game/operationEncounterRules.js";

const profiles = [1,5,10,20,30,40,50,60,70,80,90,99].map((level) => operationEncounterProfile({ level }));
assert.ok(profiles.some((entry) => entry.mode === "melee"), "operation rotation includes arena combat");
assert.ok(profiles.some((entry) => entry.mode === "shooter"), "operation rotation includes shooting");
assert.ok(profiles.some((entry) => entry.mode === "puzzle"), "operation rotation includes circuit puzzles");
assert.equal(new Set(profiles.map((entry) => entry.family)).size, 12, "every dungeon uses a distinct enemy family");

const root = new URL("../", import.meta.url);
const encounter = await readFile(new URL("src/game/OperationEncounter.jsx", root), "utf8");
const hub = await readFile(new URL("src/online/ProgressionHub.jsx", root), "utf8");
const css = await readFile(new URL("src/game/operation-encounter.css", root), "utf8");
for (const contract of ["ShooterEncounter", "PuzzleEncounter", "Retry operation", "Return to Battle", "encounter-result"]) assert.ok(encounter.includes(contract), `encounter lifecycle missing ${contract}`);
assert.match(hub, /if \(running\) return <OperationEncounter/, "manual combat leaves the progression card for a dedicated scene");
assert.match(hub, /setEncounterResult\("defeat"\)/, "defeat resolves to an explicit result state");
assert.match(css, /position:fixed;z-index:12000;inset:0/, "operation scene owns the full viewport");
console.log("operation encounter smoke test passed");
