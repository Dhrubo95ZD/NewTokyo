export const MASTERY_BRANCHES = Object.freeze([
  { id:"vanguard", name:"Vanguard", icon:"盾", color:"#e45f68", detail:"Front-line power and survival." },
  { id:"pathfinder", name:"Pathfinder", icon:"迅", color:"#267ce8", detail:"Movement, precision and critical timing." },
  { id:"engineer", name:"Engineer", icon:"機", color:"#0b9e8c", detail:"Recovery, rewards and tactical systems." },
]);

export const MASTERY_NODES = Object.freeze([
  { id:"power-core", branch:"vanguard", name:"Power Core", icon:"力", max:3, detail:"+3 Strength per rank.", bonus:{str:3} },
  { id:"guard-weave", branch:"vanguard", name:"Guard Weave", icon:"守", max:3, requires:["power-core",1], detail:"+3 Defense per rank.", bonus:{def:3} },
  { id:"impact-line", branch:"vanguard", name:"Impact Line", icon:"撃", max:3, requires:["power-core",2], detail:"+2% critical chance per rank.", bonus:{crit:2} },
  { id:"second-wind", branch:"vanguard", name:"Second Wind", icon:"復", max:1, requires:["guard-weave",3], detail:"+35 maximum HP.", bonus:{hp:35} },
  { id:"quickstep", branch:"pathfinder", name:"Quickstep", icon:"走", max:3, detail:"+3 Speed per rank.", bonus:{spd:3} },
  { id:"precision", branch:"pathfinder", name:"Precision", icon:"準", max:3, requires:["quickstep",1], detail:"+3 Technique per rank.", bonus:{dex:3} },
  { id:"evasive-line", branch:"pathfinder", name:"Evasive Line", icon:"避", max:2, requires:["quickstep",2], detail:"+2 Speed and +2 Defense per rank.", bonus:{spd:2,def:2} },
  { id:"momentum", branch:"pathfinder", name:"Momentum", icon:"閃", max:1, requires:["precision",3], detail:"+8% critical chance.", bonus:{crit:8} },
  { id:"field-kit", branch:"engineer", name:"Field Kit", icon:"修", max:3, detail:"+10 maximum HP per rank.", bonus:{hp:10} },
  { id:"salvage-scan", branch:"engineer", name:"Salvage Scan", icon:"資", max:3, requires:["field-kit",1], detail:"+4% loot quality per rank.", bonus:{loot:4} },
  { id:"combat-data", branch:"engineer", name:"Combat Data", icon:"録", max:3, requires:["field-kit",2], detail:"+4% XP and +1 Technique per rank.", bonus:{xp:4,dex:1} },
  { id:"overclock", branch:"engineer", name:"Safe Overclock", icon:"電", max:1, requires:["combat-data",3], detail:"+6 Strength and +4 Speed.", bonus:{str:6,spd:4} },
]);

export const masteryPointsForLevel=(level=1)=>Math.max(1,Math.floor(Math.max(1,Number(level)||1)/2)+1);
export const normalizeMastery=(value={})=>({version:1,ranks:Object.fromEntries(MASTERY_NODES.map((node)=>[node.id,Math.max(0,Math.min(node.max,Number(value?.ranks?.[node.id])||0))]))});
export const masterySpent=(value)=>Object.values(normalizeMastery(value).ranks).reduce((sum,rank)=>sum+rank,0);
export function canUpgradeMastery(value,nodeId,level){const state=normalizeMastery(value);const node=MASTERY_NODES.find((entry)=>entry.id===nodeId);if(!node||state.ranks[node.id]>=node.max)return false;if(masterySpent(state)>=masteryPointsForLevel(level))return false;if(node.requires&&state.ranks[node.requires[0]]<node.requires[1])return false;return true}
export function upgradeMastery(value,nodeId,level){if(!canUpgradeMastery(value,nodeId,level))return normalizeMastery(value);const state=normalizeMastery(value);return {...state,ranks:{...state.ranks,[nodeId]:state.ranks[nodeId]+1}}}
export function masteryBonuses(value){const state=normalizeMastery(value);return MASTERY_NODES.reduce((totals,node)=>{const rank=state.ranks[node.id];for(const [key,amount] of Object.entries(node.bonus))totals[key]=(totals[key]||0)+amount*rank;return totals},{str:0,def:0,spd:0,dex:0,hp:0,crit:0,loot:0,xp:0})}
