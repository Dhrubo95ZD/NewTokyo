import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, equipmentMigration, hub, inventory, game, account, theme, tutorial, android35] = await Promise.all([
  readFile(new URL("../supabase/20260901_blackwood_city_core.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260903_inventory_equipment_tutorial.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/online/CityCoreHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/online/InventoryEquipment.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaAccount.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/bright-theme.css", import.meta.url), "utf8"),
  readFile(new URL("../src/tutorial/GuidedTutorial.jsx", import.meta.url), "utf8"),
  readFile(new URL("../android/app/src/main/res/values-v35/styles.xml", import.meta.url), "utf8"),
]);

for (const table of ["bw_player_states", "bw_crimes", "bw_inventory", "bw_attack_logs", "bw_relations", "bw_mail", "bw_forum_threads", "bw_missions", "bw_player_awards", "bw_properties", "runner_crews"])
  assert.ok(migration.includes(`public.${table}`), `missing authoritative table ${table}`);
for (const rpc of ["bw_create_character", "bw_get_state", "bw_do_crime", "bw_train", "bw_work", "bw_bank_transfer", "bw_attack", "bw_set_relation", "bw_send_mail", "bw_create_thread", "bw_claim_mission", "bw_buy_property", "bw_buy_item", "bw_use_item"])
  assert.ok(migration.includes(`function public.${rpc}`), `missing authoritative RPC ${rpc}`);
for (const page of ["crimes", "combat", "gym", "work", "missions", "shop", "bank", "hospital", "jail", "property", "social", "mail", "forums", "awards", "inventory"])
  assert.ok(game.includes(`"${page}"`) && hub.includes(page), `missing connected city page ${page}`);
assert.ok(!hub.includes("Math.random"), "online gameplay results must never be rolled by the client");
assert.ok(migration.includes("security definer") && migration.includes("revoke insert,update,delete"), "server ownership controls missing");
assert.ok(migration.includes("new player protection is active"), "combat protection missing");
assert.ok(account.includes('rpc("bw_get_state")'), "account boot must load authoritative state");
assert.ok(account.includes('rpc("bw_create_character"'), "character creation must be server-authoritative");
for (const rpc of ["bw_get_loadout", "bw_equip_item", "bw_unequip_slot", "bw_advance_tutorial", "bw_equipment_power"])
  assert.ok(equipmentMigration.includes(`function public.${rpc}`), `missing equipment/tutorial RPC ${rpc}`);
for (const slot of ["primary", "secondary", "melee", "armor", "helmet", "boots", "gloves", "accessory"])
  assert.ok(equipmentMigration.includes(`'${slot}'`) && inventory.includes(`"${slot}"`), `missing equipment slot ${slot}`);
assert.ok(equipmentMigration.includes("cross join archetypes") && equipmentMigration.includes("Twenty collections across ten archetypes"), "200-item deterministic catalog missing");
assert.ok(equipmentMigration.includes("public.bw_equipment_power(uid)"), "equipment bonuses must affect authoritative combat");
assert.ok(tutorial.includes("bw_advance_tutorial") && game.includes("GuidedTutorial"), "persistent guided tutorial missing");
assert.ok(theme.includes("@media(max-width:360px)") && theme.includes("grid-template-columns:repeat(4,minmax(0,1fr))"), "narrow-phone resource overlap fix missing");
assert.ok(theme.includes("--paper:#fffdf8") && theme.includes("--brown:#754729"), "ivory, black and brown theme missing");
assert.ok(theme.includes('grid-template-areas:"number info action" "number chance action" ". take action"'), "crime mobile grid areas missing");
assert.ok(theme.includes("safe-area-inset-top") && theme.includes("var(--safe-top)"), "display cutout safe-area handling missing");
assert.ok(android35.includes("windowOptOutEdgeToEdgeEnforcement") && android35.includes("statusBarColor"), "Android 15 edge-to-edge protection missing");

console.log("Blackwood server-authoritative city contracts passed");
