import fs from "node:fs";

const sql=fs.readFileSync("supabase/20260926_connected_city_loop.sql","utf8");
const home=fs.readFileSync("src/ui/HomeBoard.jsx","utf8");
const progression=fs.readFileSync("src/progression/ProgressionHub.jsx","utf8");
const economy=fs.readFileSync("src/economy/EconomyHub.jsx","utf8");
const game=fs.readFileSync("src/MafiaGame.jsx","utf8");
const need=(text,value,label)=>{if(!text.includes(value))throw new Error(`${label}: missing ${value}`)};

for(const type of ["operations","boss_wins","upgrade_rank","takeover_points"])need(sql,`when '${type}'`,"campaign metric");
for(const id of ["rise-1","rise-2","rise-3","power-1","power-2","power-3"])need(sql,`('${id}'`,"campaign objective");
need(sql,"source in('operation','faction','civic','boss')","Takeover boss source without breaking civic contributions");
need(sql,"bw_takeover_boss_contribution","Takeover boss trigger");
need(sql,"if remaining=0 then delete","zero-quantity dismantle fix");
need(sql,"for update of v","serialized upgrades");
if((sql.match(/create or replace function public\.bw_upgrade_rise_item/g)||[]).length!==1)throw new Error("upgrade override must have one canonical definition");
need(sql,"function public.bw_currency_snapshot","unified currency snapshot");
need(sql,"'available',wallet.balance","shared available balance");
need(sql,"'tradingDeposited',coalesce(deposited,0)","trading allocation");
need(home,"bw_connected_progression_snapshot","Home campaign route");
need(progression,"Go to objective","objective routing");
need(economy,"same play-earned Arcade Dollars","Prime FX currency identity");
if(/LC · LEDGER CREDITS|LC TRADING ACCOUNT|Opening LC deposit/.test(economy))throw new Error("Prime FX still presents a disconnected LC wallet");
need(game,"bw_currency_snapshot","top wallet snapshot");
console.log("Connected City Loop contracts passed.");
