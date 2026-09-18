import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [sql, operations, catalogue, character, casino, home, art, readme, packageJson, gradle] = await Promise.all([
  read("supabase/20260927_make_your_mark_v1.sql"),
  read("src/operations/DistrictOperations.jsx"),
  read("src/catalogue/ItemCatalogue.jsx"),
  read("src/online/CharacterHub.jsx"),
  read("src/casino/CasinoHub.jsx"),
  read("src/ui/HomeBoard.jsx"),
  read("src/catalogue/item-art-assets.js"),
  read("README.md"),
  read("package.json"),
  read("android/app/build.gradle"),
]);

for (const marker of [
  "bw_operation_stage_options",
  "scenario_id",
  "bw_collection_targets",
  "bw_set_collection_target",
  "bw_challenge_district_boss_plan",
  "firstClear",
  "unique_boss_wins",
  "city_contribution",
  "bw_daily_objective_ids",
  "objective is not assigned today",
  "arcade_net_profit",
  "net_result",
  "bw_loadout_presets",
  "bw_set_item_flags",
  "unlock this item before dismantling it",
]) assert.ok(sql.includes(marker), `missing Make Your Mark server contract: ${marker}`);

assert.ok(!sql.includes("case when p_choice=a.approach then 9"), "old repeated-opening bonus survived");
assert.ok(!sql.includes("from public.bw_civic_contracts where user_id=p_uid"), "city contribution still reads user data from the contract template");
for (const marker of ["stageOptions", "scenarioClue", "bw_challenge_district_boss_plan", "Pin target", "three-stage encounter"]) assert.ok(operations.includes(marker), `missing operations UI contract: ${marker}`);
for (const marker of ["bw_collection_target_snapshot", "bw_set_collection_target", "Pin collection target", "PINNED COLLECTION TARGET"]) assert.ok(catalogue.includes(marker), `missing target catalogue contract: ${marker}`);
for (const marker of ["bw_loadout_presets_snapshot", "bw_save_loadout_preset", "bw_apply_loadout_preset", "bw_set_item_flags", "Saved loadout presets", "CURRENT SLOT"]) assert.ok(character.includes(marker), `missing loadout UI contract: ${marker}`);
for (const marker of ["bw_blackjack_action_v1", "p_request_id:crypto.randomUUID()", "netArcadeProfit", "Lifetime P/L"]) assert.ok(casino.includes(marker), `missing Arcade accounting UI contract: ${marker}`);
for (const marker of ["bw_collection_target_snapshot", "PINNED COLLECTION TARGET", "Chase "]) assert.ok(home.includes(marker), `missing Home target route contract: ${marker}`);
for (const marker of ["ITEM_ART_BY_ID", "relic-harbor-iron", "ITEM_ART_MANIFEST"]) assert.ok(art.includes(marker), `missing explicit item art contract: ${marker}`);
assert.match(readme, /20260927_make_your_mark_v1\.sql/);
assert.match(packageJson, /"test:v1"/);
assert.match(gradle, /versionCode 25/);

console.log("Make Your Mark V1 server, UI, accounting, art, release and progression contracts passed.");
