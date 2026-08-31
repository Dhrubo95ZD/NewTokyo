import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, hub, game, account] = await Promise.all([
  readFile(new URL("../supabase/20260901_blackwood_city_core.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/online/CityCoreHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaAccount.jsx", import.meta.url), "utf8"),
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

console.log("Blackwood server-authoritative city contracts passed");
