import fs from "node:fs";
const sql=fs.readFileSync(new URL("../supabase/20260828_gridhold_pvp.sql",import.meta.url),"utf8");
for(const contract of [
  "create_coop_room","join_coop_room","list_coop_rooms","room_code","dungeon_party_members",
  "player_gridholds","gridhold_building_catalog","gridhold_rank_rewards","gridhold_battles",
  "get_my_gridhold_state","claim_gridhold_income","move_gridhold_building","upgrade_gridhold_building",
  "construct_gridhold_building","find_gridhold_opponents","attack_gridhold","security definer","auth.uid()",
]) if(!sql.includes(contract)) throw new Error(`Gridhold server contract missing: ${contract}`);
for(const forbidden of ["casino","betting","alcohol","shrine","deity","idol","sorcery"])
  if(sql.toLowerCase().includes(forbidden)) throw new Error(`Disallowed theme in Gridhold migration: ${forbidden}`);
console.log("Gridhold and co-op room server contract smoke tests passed");
