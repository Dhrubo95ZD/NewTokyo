import fs from "node:fs";

const sql=fs.readFileSync("supabase/20260925_rise_to_power.sql","utf8");
const ui=fs.readFileSync("src/operations/DistrictOperations.jsx","utf8");
const css=fs.readFileSync("src/operations/district-operations.css","utf8");
const inventory=fs.readFileSync("src/online/InventoryEquipment.jsx","utf8");
const requireText=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`)};

for(const rpc of ["bw_rise_snapshot","bw_challenge_district_boss","bw_dismantle_item","bw_craft_rise_item","bw_upgrade_rise_item"]) {
  requireText(sql,`function public.${rpc}`,"server RPC");
  if (rpc === "bw_challenge_district_boss") requireText(`${ui} bw_challenge_district_boss_plan`,`bw_challenge_district_boss_plan`,"operations UI");
  else requireText(ui,`\"${rpc}\"`,"operations UI");
}
requireText(sql,"unique(user_id,request_id)","idempotency");
requireText(sql,"not enough unequipped copies","equipped-copy protection");
requireText(sql,"mod(r.wins+1,5)=0","target-loot pity");
requireText(sql,"coalesce(u.rank,0)*.06","authoritative upgrade power");
requireText(sql,"workshop_parts>=r.parts_cost","atomic crafting spend");
requireText(sql,"workshop_parts>=cost","atomic upgrade spend");
if(/public\.(?:arcade_wallet|player_wallets)/i.test(sql))throw new Error("Rise progression must not consume arcade or cash balances");
requireText(`${ui} Target relic chance is 20%`,"Target relic chance is 20%","disclosed odds");
requireText(ui,"Equipped copies are always protected","dismantle warning");
requireText(inventory,"effectiveAttack ?? item.attack","effective inventory stats");
requireText(css,"@media(max-width:620px)","mobile layout");
console.log("Rise to Power contract smoke passed.");
