import fs from "node:fs";
import assert from "node:assert/strict";

const sql=fs.readFileSync("supabase/20260911_combat_contracts_relics.sql","utf8");
const ui=fs.readFileSync("src/combat/CombatHub.jsx","utf8");
const css=fs.readFileSync("src/combat/combat-hub.css","utf8");
const core=fs.readFileSync("src/online/CityCoreHub.jsx","utf8");
const shop=fs.readFileSync("src/online/InventoryEquipment.jsx","utf8");

for (const marker of [
  "bw_combat_contracts","bw_bounties","bw_relic_progress","bw_relic_searches",
  "bw_combat_snapshot","bw_combat_attack","bw_search_relic_cache","bw_place_bounty",
  "bw_cancel_bounty","bw_claim_combat_contract","request_id","reward_multiplier",
  "target protection","drop_only","bw_award_relic"
]) assert.ok(sql.includes(marker),`missing combat contract: ${marker}`);

assert.equal((sql.match(/'relic-[^']+'/g)||[]).filter((value,index,array)=>array.indexOf(value)===index).length,12,"expected twelve distinct relic ids");
assert.ok(sql.includes("greatest(.25"),"relic efficiency must retain a 25% floor");
assert.ok(sql.includes("greatest(1,floor(raw_intel*efficiency)"),"every cache search must award progress");
assert.ok(sql.includes("recent>=3"),"hourly same-target protection missing");
assert.ok(sql.includes("repeats=0"),"rare combat drops must exclude repeat farming");
assert.ok(sql.includes("if i.drop_only then raise exception"),"city shop server guard missing");
assert.ok(!/service_role|SUPABASE_SERVICE_ROLE/i.test(sql),"client-accessible migration must not require a service role secret");

for (const marker of ["Real Player Directory","Underworld cache network","100 intel guarantees a drop","Open city bounties","Daily Orders","bw_combat_attack","bw_search_relic_cache"])
  assert.ok(ui.toLowerCase().includes(marker.toLowerCase()),`missing combat UI: ${marker}`);
assert.ok(core.includes("<CombatHub"),"CombatHub is not routed into CityCoreHub");
assert.ok(shop.includes("!item.drop_only"),"drop-only relics must be hidden from city stock");
assert.ok(css.includes("@media(max-width:480px)"),"mobile combat layout missing");
assert.ok(css.includes("prefers-reduced-motion"),"reduced-motion handling missing");

console.log("Combat, contracts, bounties and guaranteed rare-item grind contracts passed");
