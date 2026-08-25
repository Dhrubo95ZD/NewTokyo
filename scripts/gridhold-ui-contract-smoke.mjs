import fs from "node:fs";
const read=(path)=>fs.readFileSync(new URL(path,import.meta.url),"utf8");
const base=read("../src/online/BaseCommand.jsx");
const hub=read("../src/online/ProgressionHub.jsx");
const online=read("../src/online/OnlineHub.jsx");
const css=read("../src/online/base-command.css");
for(const contract of ["BaseGrid","Build","Attack","Ranks","Collect","Scout rivals","Launch attack","Gridhold path","ATTACK_TACTICS","onConstruct","onMove","onUpgrade"])
  if(!base.includes(contract)) throw new Error(`Base command UI missing: ${contract}`);
for(const contract of ["Quick Match","Create Room","Browse Rooms","ROOM CODE","CoopRoomBrowser","onListCoopRooms","onJoinCoopRoom"])
  if(!hub.includes(contract)) throw new Error(`Co-op room UI missing: ${contract}`);
for(const contract of ["get_my_gridhold_state","claim_gridhold_income","move_gridhold_building","construct_gridhold_building","find_gridhold_opponents","attack_gridhold","create_coop_room","join_coop_room","list_coop_rooms"])
  if(!online.includes(contract)) throw new Error(`Online wiring missing: ${contract}`);
for(const contract of ["gridhold-map","gridhold-building","@media(max-width:720px)","prefers-reduced-motion"])
  if(!css.includes(contract)) throw new Error(`Gridhold responsive style missing: ${contract}`);
for(const forbidden of ["casino","betting","alcohol","shrine","deity","idol","sorcery"]){
  const joined=`${base}\n${hub}`.toLowerCase();
  if(joined.includes(forbidden)) throw new Error(`Disallowed theme in Gridhold UI: ${forbidden}`);
}
console.log("Gridhold and co-op room UI contract smoke tests passed");
