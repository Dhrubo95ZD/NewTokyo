// Development-only deterministic fixture. Not referenced by the production entry.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MafiaGame, { INITIAL } from '../../src/MafiaGame.jsx';
import { supabase } from '../../src/online/supabase.js';
import '../../src/mafia.css';
import '../../src/bright-theme.css';
import '../../src/mobile-trading-fixes.css';
import '../../src/living-city.css';
import '../../src/ui/after-dark.css';

const player = { level:8, xp:120, cash:24500, bank:18000, energy:64, max_energy:100, nerve:18, max_nerve:24, health:450, max_health:500, happy:200, max_happy:250, strength:50, defense:45, speed:42, dexterity:46, crime_skill:15, respect:240, merits:4, job_points:10, tutorial_done:true, tutorial_step:7, status:'okay' };
const crimes = [
  { id:'street-score', sort_order:1, category:'Street', name:'The street score', description:'A small opportunity in the Old Quarter. Timing is everything.', skill_required:1, base_chance:78, nerve_cost:2, reward_min:120, reward_max:260 },
  { id:'harbor-job', sort_order:2, category:'Harbor', name:'Harbor collection', description:'A higher-stakes job with more to lose. Prepare before you commit.', skill_required:10, base_chance:58, nerve_cost:5, reward_min:500, reward_max:900 },
  { id:'vault', sort_order:3, category:'Specialist', name:'The sealed ledger', description:'A specialist opportunity. Build your skill to unlock this job.', skill_required:40, base_chance:42, nerve_cost:10, reward_min:2000, reward_max:3000 },
];
const state = () => ({ authority:true, player:{...player}, crimes, recent:[{id:1,summary:'Completed a district operation',created_at:'2026-09-07T10:00:00Z'}], inventory:[], items:[], awards:[], properties:[], missions:[] });
const progression = () => ({player:{...player}, missions:[{id:'arrival-1',chapter:1,sequence:1,title:'A name in the city',objective:'Complete five crimes',briefing:'Every reputation begins somewhere.',unlocked:true,claimedAt:null,progress:2,target:5,cash:1000,xp:40,respect:5}], factions:[], rank:{name:'Associate',score:150,nextScore:500,nextName:'Operator'}, grind:{today:0,fullEfficiencyRuns:10,minimumEfficiency:35}, combat:{wins:2,losses:1}, breakdown:{} });
window.__ui = { calls:[], offline:false, adviserError:false };
const delay = () => new Promise(resolve => setTimeout(resolve,300));
supabase.rpc = async (name,params) => {
  window.__ui.calls.push({name,params}); await delay();
  if (window.__ui.offline) return {data:null,error:{message:'Test connection unavailable'}};
  if(name==='bw_get_state') return {data:state()};
  if(name==='bw_get_loadout') return {data:{equipment:[],inventory:[],bonuses:{}}};
  if(name==='bw_operations_snapshot') return {data:{player:{...player},active:null,districts:[],grind:{today:0}}};
  if(name==='bw_progression_snapshot') return {data:progression()};
  if(name==='bw_do_crime') {
    const success = window.__ui.calls.filter(call=>call.name==='bw_do_crime').length === 1;
    player.nerve -= 2; if(success)player.cash+=180;
    return {data:{event:{success,cash:success?180:0,jailed:false},state:state()}};
  }
  return {data:[]};
};
supabase.functions.invoke = async () => { await delay(); return window.__ui.adviserError ? {error:{message:'Adviser unavailable'}} : {data:{answer:'Street Work uses no energy. Your campaign is another useful next step.',suggestions:[{page:'hustles',label:'Open Street Work',reason:'No energy required'}]}}; };
createRoot(document.getElementById('root')).render(<MafiaGame user={{id:'ui-test',email:'tester@example.invalid'}} initialPlayer={{...INITIAL,name:'The Night Courier',level:8,cash:24500,bank:18000,nerve:18,tutorialDone:true}}/>);
