import { useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";

const money=value=>`$${Number(value||0).toLocaleString()}`;
const present=activity=>activity.id==="backroom_cards"?{...activity,name:"Backroom Ledger Courier",description:"Carry sealed ledgers and settle private invoices. Higher heat, better pay."}:activity.id==="information"?{...activity,description:"Trade rumors between shopkeepers, drivers and doormen. Slowest heat build."}:activity;

export default function HustleHub({onState}) {
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[event,setEvent]=useState(null),[cooldown,setCooldown]=useState(0);
  const load=async()=>{const{data:value,error:problem}=await supabase.rpc("bw_hustle_snapshot");if(problem)setError(problem.message);else{setData(value);setError("")}};
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer)},[cooldown]);
  const run=async(activity)=>{if(busy||cooldown)return;setBusy(true);setError("");setEvent(null);const{data:value,error:problem}=await supabase.rpc("bw_do_hustle",{p_hustle:activity.id,p_request_id:crypto.randomUUID()});if(problem)setError(problem.message);else{setData(value.hustle);setEvent({...value.event,name:activity.name});setCooldown(3);if(value.state?.player)onState?.(value.state.player)}setBusy(false)};
  if(!data)return <div className="hustle-loading">Checking street contacts…</div>;
  const profile=data.profile||{};
  return <div className="hustle-hub">{error&&<div className="market-alert bad">{error}</div>}{event&&<div className="hustle-result"><i>✓</i><span><small>{event.name}</small><b>+{money(event.cash)} · +{event.xp} XP</b>{event.itemName&&<em>Found {event.itemName}</em>}</span></div>}
    <header className="hustle-status"><div><small>NO ENERGY REQUIRED</small><h2>Street Work</h2><p>Keep earning whenever energy and nerve are empty. Mastery always rises; heat only reduces efficiency.</p></div><div className="hustle-numbers"><span><small>MASTERY</small><b>{profile.mastery}</b></span><span><small>24H RUNS</small><b>{profile.dailyRuns}</b></span><span><small>LIFETIME TAKE</small><b>{money(profile.totalCash)}</b></span></div></header>
    <section className="heat-board"><div><span><small>CITY HEAT</small><b>{Number(profile.heat).toFixed(1)} / 100</b></span><em>Heat cools by 1 point each minute</em></div><figure><i style={{width:`${profile.heat}%`}}/></figure><footer><span>Current reward efficiency</span><b>{Math.round(profile.rewardMultiplier*100)}%</b><em>Never below 25%</em></footer></section>
    <div className="hustle-grid">{data.activities.map(raw=>{const activity=present(raw);return <article key={activity.id}><header><i><GameIcon name="hustles"/></i><span><small>{activity.district}</small><b>{activity.name}</b></span></header><p>{activity.description}</p><dl><div><dt>Base cash</dt><dd>{money(activity.cashMin)}–{money(activity.cashMax)}</dd></div><div><dt>Heat</dt><dd>+{activity.heatGain}</dd></div><div><dt>Loot chance</dt><dd>{activity.lootChance}%</dd></div></dl><button disabled={busy||cooldown>0} onClick={()=>run(activity)}>{busy?"Working contact…":cooldown?`Next contact · ${cooldown}s`:"Run hustle · 0 energy"}</button></article>})}</div>
    <section className="hustle-log"><header><b>Recent street work</b><span>{profile.totalRuns} lifetime runs · {profile.lootFound} items found</span></header>{data.recent.length===0?<p>No runs recorded yet. Choose any contact above.</p>:data.recent.map(run=><article key={run.id}><i className={run.hustle}/><span><b>{run.hustle.replaceAll("_"," ")}</b><small>{new Date(run.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</small></span><em>+{money(run.cash)} · +{run.xp} XP</em>{run.itemName&&<strong>{run.itemName}</strong>}</article>)}</section>
  </div>;
}
