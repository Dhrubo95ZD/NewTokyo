import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8");
const sql=read("../supabase/20260830_neo_economy.sql"),hub=read("../src/economy/EconomyHub.jsx"),online=read("../src/online/OnlineHub.jsx"),game=read("../src/NeoTokyoUnderworld.jsx");
for(const token of ["create_auction_listing","buy_auction_listing","cancel_auction_listing","craft_economy_recipe","start_life_skill_job","claim_life_skill_job","for update","require_google_player","one_working_life_job","chip_roll<.01"])if(!sql.includes(token))throw new Error(`Missing secure economy contract: ${token}`);
for(const token of ["Auction House","Fabrication Bay","Life Skills","List Unequipped Gear"])if(!hub.includes(token))throw new Error(`Missing economy UI: ${token}`);
for(const token of ["EconomyHub","runEconomyAction","auction_listings"])if(!online.includes(token))throw new Error(`Missing online economy integration: ${token}`);
if(!game.includes('["economy", "Economy", "環"]'))throw new Error("Economy is not a top-level destination");
console.log("Neo Economy contract smoke passed");
