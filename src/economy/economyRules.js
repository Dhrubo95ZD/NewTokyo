export const LIFE_SKILLS = Object.freeze([
  {id:"scavenging",name:"Scavenging",glyph:"回",color:"#e56b55",detail:"Recover alloy, mechanisms and intact components.",materials:["alloy","mechanism","nano-fiber"]},
  {id:"prospecting",name:"Prospecting",glyph:"晶",color:"#d5a72f",detail:"Survey city strata for ore, crystals and conductive metals.",materials:["ore","flux-crystal","conductive-metal"]},
  {id:"surveying",name:"Surveying",glyph:"測",color:"#5879ed",detail:"Map signal zones and recover patterns, data and circuit plans.",materials:["data-pattern","circuit-plan","signal-glass"]},
  {id:"synthesis",name:"Synthesis",glyph:"合",color:"#22a77d",detail:"Refine coolant, polymers and restorative compounds.",materials:["coolant","polymer","bio-gel"]},
]);

export const MATERIAL_LABELS=Object.freeze({alloy:"Recovered Alloy",mechanism:"Precision Mechanism","nano-fiber":"Nano Fiber",ore:"Prism Ore","flux-crystal":"Flux Crystal","conductive-metal":"Conductive Metal","data-pattern":"Data Pattern","circuit-plan":"Circuit Plan","signal-glass":"Signal Glass",coolant:"Quantum Coolant",polymer:"Smart Polymer","bio-gel":"Restorative Gel"});

const DISCIPLINES=[
  ["weaponsmithing","Weaponsmithing","foundry-breaker","weapon","alloy","ore"],
  ["armor-fabrication","Armor Fabrication","signal-bastion","armor","polymer","alloy"],
  ["circuit-engineering","Circuit Engineering","aurora-relay","helmet","circuit-plan","signal-glass"],
  ["field-synthesis","Field Synthesis","flux-weaver","boots","bio-gel","coolant"],
];
const grades=["green","blue","yellow","orange","prismatic"];
export const RECIPES=Object.freeze(DISCIPLINES.flatMap(([discipline,label,setId,_slot,primary,secondary])=>Array.from({length:20},(_,index)=>{
  const grade=grades[Math.min(4,Math.floor(index/4))];
  const level=1+index*5;
  return {id:`${discipline}-${index+1}`,discipline,label,name:`${label} Pattern ${String(index+1).padStart(2,"0")}`,level,seconds:20+index*4,itemId:`${setId}:${grade}:${["weapon","helmet","armor","boots"][index%4]}`,cost:{[primary]:2+index,[secondary]:1+Math.floor(index/2),"data-pattern":1+Math.floor(index/5)}};
})));

export const CHIP_DROP_TIERS=Object.freeze([
  {id:"standard",name:"Standard",odds:"1 / 50"},{id:"prototype",name:"Prototype",odds:"1 / 250"},
  {id:"relic",name:"Relic",odds:"1 / 2,000"},{id:"apex",name:"Apex",odds:"1 / 10,000"},
]);

export function normalizeEconomyState(value){
  return {authority:Boolean(value),materials:value?.materials||{},skills:value?.skills||{},jobs:value?.jobs||[],listings:value?.listings||[],myListings:value?.myListings||[],history:value?.history||[]};
}
export function canCraft(recipe,materials={}){return Object.entries(recipe.cost).every(([id,amount])=>Number(materials[id]||0)>=amount)}
export function formatRemaining(date,now=Date.now()){const ms=Math.max(0,new Date(date).getTime()-now);return ms<=0?"Ready":`${Math.ceil(ms/1000)}s`}
