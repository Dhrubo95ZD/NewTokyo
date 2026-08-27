import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [runner, creator, firstRun, hub, combat, reactive, endless, depths, onlineHub] = await Promise.all([
  read("src/game/AndroidRunner.jsx"),
  read("src/online/CharacterCreator.jsx"),
  read("src/game/CharacterCreation.jsx"),
  read("src/online/ProgressionHub.jsx"),
  read("src/NeoTokyoUnderworld.jsx"),
  read("src/game/ReactiveCombat.jsx"),
  read("src/game/EndlessCircuit.jsx"),
  read("src/game/NeonDepths.jsx"),
  read("src/online/OnlineHub.jsx"),
]);

const studio = await stat(new URL("../public/assets/characters/android-v1/android-studio-atlas-v1.webp", import.meta.url));
const actions = await stat(new URL("../public/assets/characters/android-v1/android-combat-atlas-v1.webp", import.meta.url));

assert.match(runner, /ANDROID_MODELS\s*=\s*\[/, "shared Android model catalogue is missing");
assert.equal((runner.match(/name:"/g) || []).length, 8, "identity studio must expose eight Android models");
for (const action of ["idle", "run", "slash", "shoot"])
  assert.ok(runner.includes(`${action}:`), `combat atlas mapping missing ${action}`);

for (const source of [creator, firstRun]) {
  assert.ok(source.includes("AndroidRunnerModel"), "character creation must use the shared Android renderer");
  assert.ok(!source.includes("Skin tone"), "human skin customization must stay removed");
  assert.ok(!source.includes("Hair system"), "human hair customization must stay removed");
}

assert.ok(hub.includes("AndroidRunnerModel"), "equipment cockpit must use the saved Android identity");
assert.ok(!hub.includes("runner-equipment-v3.webp"), "static legacy equipment character must stay removed");
assert.ok(combat.includes("androidSpriteFrame"), "manual fight must render the Android action atlas");
assert.ok(reactive.includes("AndroidRunnerSprite"), "campaign fights must use the Android action atlas");
assert.ok(endless.includes("AndroidRunnerSprite"), "endless battles must use the Android action atlas");
assert.ok(depths.includes("androidSpriteFrame"), "Neon Depths must use the Android action atlas");
assert.ok(onlineHub.includes("runnerProfile: characterProfile"), "saved customization must reach the fight runtime");
assert.ok(studio.size > 100_000, "customization atlas is missing or unexpectedly tiny");
assert.ok(actions.size > 250_000, "combat animation atlas is missing or unexpectedly tiny");

console.log("Android identity smoke tests passed");
