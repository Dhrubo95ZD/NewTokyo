import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const main = await readFile(new URL("src/NeoTokyoUnderworld.jsx", root), "utf8");
const online = await readFile(new URL("src/online/OnlineHub.jsx", root), "utf8");
const hub = await readFile(new URL("src/online/ProgressionHub.jsx", root), "utf8");

assert.match(main, /\["fights", "Battle", "斬"\]/, "main navigation names the destination Battle");
assert.match(main, /id === "fights" && onOpenBattle/, "Battle routes to the consolidated hub");
assert.match(online, /setProgressionTab\("journey"\)/, "Battle opens the battle surface");
assert.match(online, /setProgressionTab\("character"\)/, "Loadout opens character management");
for (const feature of ["ALL QUESTS + DUNGEONS", "AFK AUTO-BATTLE", "2–3 RUNNER CO-OP", "FULL-SCREEN ACTIVE PLAY"]) assert.ok(hub.includes(feature), `${feature} is under Battle`);
assert.match(hub, /Technique Loadout/);
assert.match(hub, /techniques=\{equippedTechniques\}/);
console.log("battle navigation contract smoke test passed");
