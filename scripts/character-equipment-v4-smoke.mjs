import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const ui = await readFile(new URL("../src/online/ProgressionHub.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/online/inventory.css", import.meta.url), "utf8");
const creation = await readFile(new URL("../src/game/CharacterCreation.jsx", import.meta.url), "utf8");
const art = await stat(new URL("../public/assets/characters/runner-equipment-v2.webp", import.meta.url));

for (const contract of [
  "character-v4", "loadout-cockpit", "runner-model-v4", "slot-orbit",
  "equipBestSlot", "base", "gear", "EQUIPMENT BONUSES", "Set Protocols",
]) assert.ok(ui.includes(contract), `character equipment contract missing: ${contract}`);

for (const slot of ["weapon", "helmet", "armor", "boots"])
  assert.ok(styles.includes(`.orbit-${slot}`), `responsive slot position missing: ${slot}`);

assert.ok(styles.includes("min-height:48px"), "equipment actions must retain Android-sized tap targets");
assert.ok(styles.includes("@media(max-width:700px)"), "mobile equipment layout contract missing");
assert.ok(!ui.includes("wearable-layer wearable-"), "legacy pasted-on-character item layers must stay removed");
assert.ok(creation.includes("Clean loadout"), "new runners must still begin without pre-equipped gear");
assert.ok(art.size > 20_000, "runner equipment art is missing or unexpectedly tiny");

console.log("Character equipment v4 smoke tests passed");
