import fs from "node:fs";

const ui = fs.readFileSync(new URL("../src/online/ProgressionHub.jsx", import.meta.url), "utf8");
const hub = fs.readFileSync(new URL("../src/online/OnlineHub.jsx", import.meta.url), "utf8");

for (const contract of [
  "Quick Best Equip", "Salvage Unequipped", "Sell Unequipped", "STAT ALLOCATION",
  "ALL QUESTS + DUNGEONS", "AFK GRIND", "2–3 RUNNER CO-OP", "Power-Link Expedition",
  "Equip + salvage old", "progressionObjectives", "dungeonAccess",
]) {
  if (!ui.includes(contract)) throw new Error(`Progression Hub UI contract missing: ${contract}`);
}

for (const rpc of [
  "manage_my_armory", "get_my_progression_state", "start_afk_dungeon",
  "claim_afk_dungeon", "queue_coop_dungeon", "leave_coop_dungeon", "claim_coop_dungeon",
]) {
  if (!hub.includes(rpc)) throw new Error(`Online Hub RPC wiring missing: ${rpc}`);
}

console.log("Progression Hub UI contract smoke tests passed");
