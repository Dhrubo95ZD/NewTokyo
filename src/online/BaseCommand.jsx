import { useMemo, useState } from "react";
import {
  ATTACK_TACTICS, BASE_GRID_SIZE, BUILDING_CATALOG, PVP_RANKS,
  baseDefensePower, baseProgressionObjectives, buildingDefinition,
  buildingUpgradeCost, canPlaceBuilding, rankForTrophies,
} from "./baseBuildingRules.js";
import "./base-command.css";

const resource = (value) => Number(value || 0).toLocaleString();

function BaseGrid({ layout = [], selectedId, placing, moving, onCell, onSelect, enemy = false }) {
  const cells = Array.from({ length: BASE_GRID_SIZE * BASE_GRID_SIZE });
  return <div className={`gridhold-map ${enemy ? "enemy" : ""}`}>
    <div className="gridhold-cells">{cells.map((_, index) => { const x=index%BASE_GRID_SIZE; const y=Math.floor(index/BASE_GRID_SIZE); return <button key={index} aria-label={`Grid ${x+1}, ${y+1}`} className={placing||moving?"placement-cell":""} onClick={()=>onCell?.(x,y)}/>; })}</div>
    {(layout || []).map((building) => { const def=buildingDefinition(building.kind); if(!def)return null; return <button key={building.id} className={`gridhold-building role-${def.role} ${selectedId===building.id?"selected":""}`} style={{gridColumn:`${Number(building.x)+1} / span ${def.w}`,gridRow:`${Number(building.y)+1} / span ${def.h}`}} onClick={(event)=>{event.stopPropagation();onSelect?.(building)}}><i>{def.icon}</i><b>{def.name}</b><span>LV {building.level}</span></button>; })}
    <div className="gridhold-road road-a"/><div className="gridhold-road road-b"/>
  </div>;
}

export default function BaseCommand({ value, busy, onRefresh, onClaimIncome, onMove, onUpgrade, onConstruct, onFindOpponents, onAttack }) {
  const [view,setView]=useState("base");
  const [selectedId,setSelectedId]=useState(null);
  const [placing,setPlacing]=useState(null);
  const [moving,setMoving]=useState(false);
  const [opponents,setOpponents]=useState([]);
  const [target,setTarget]=useState(null);
  const [tactic,setTactic]=useState(ATTACK_TACTICS[1].id);
  const [result,setResult]=useState(null);
  const [notice,setNotice]=useState("");
  const base=value?.base || value || {};
  const layout=base.layout || [];
  const selected=layout.find((entry)=>entry.id===selectedId);
  const trophies=Number(base.trophies ?? base.rating ?? 0);
  const rank=value?.rank || rankForTrophies(trophies);
  const nextRank=value?.nextRank || PVP_RANKS.find((entry)=>entry.min>trophies);
  const objectives=useMemo(()=>baseProgressionObjectives({...base,trophies}),[base,trophies]);
  const costs=selected?buildingUpgradeCost(selected):null;

  const act=async(work,success)=>{setNotice("");try{const data=await work();if(success)setNotice(success);return data}catch(error){setNotice(error.message||"Command failed");return null}};
  const chooseCell=async(x,y)=>{
    if(placing){const preview={id:"preview",kind:placing.kind};if(!canPlaceBuilding(layout,preview,x,y)){setNotice("That grid space is blocked");return;}const data=await act(()=>onConstruct(placing.kind,x,y),`${placing.name} constructed`);if(data){setPlacing(null);setSelectedId(null);}return;}
    if(moving&&selected){if(!canPlaceBuilding(layout,selected,x,y)){setNotice("That grid space is blocked");return;}const data=await act(()=>onMove(selected.id,x,y),"Structure relocated");if(data)setMoving(false);}
  };
  const scout=async()=>{const found=await act(onFindOpponents,"Rival Gridholds located");if(found){setOpponents(found);setTarget(found[0]||null);setView("attack");setResult(null);}};
  const launch=async()=>{if(!target)return;const report=await act(()=>onAttack(target.userId,tactic));if(report){setResult(report);setTarget(null);setOpponents([]);}};

  return <section className="base-command">
    <header className="base-command-head"><div><small>GRIDHOLD // ASYNCHRONOUS PVP</small><h2>{view==="base"?"District Base":view==="attack"?"Rival Scan":"Rank Path"}</h2></div><div className="base-rank" style={{"--rank":rank.color}}><i>◆</i><span><b>{rank.rankName||rank.name}</b>{trophies} rating</span></div></header>
    <nav className="base-nav">{[["base","Build"],["attack","Attack"],["ranks","Ranks"]].map(([id,label])=><button key={id} className={view===id?"active":""} onClick={()=>setView(id)}>{label}</button>)}</nav>
    {notice&&<button className="base-notice" onClick={()=>setNotice("")}>{notice}<b>×</b></button>}

    {view==="base"&&<>
      <div className="base-resource-bar"><span><small>ALLOY</small><b>⬡ {resource(base.alloy)}</b></span><span><small>ENERGY CELLS</small><b>◈ {resource(base.cells)}</b></span><span><small>DEFENSE</small><b>{resource(base.defensePower||baseDefensePower(layout))}</b></span><button disabled={busy||!onClaimIncome} onClick={()=>act(onClaimIncome,"Production collected")}>Collect</button></div>
      <div className="base-workspace"><div className="base-map-wrap"><BaseGrid layout={layout} selectedId={selectedId} placing={placing} moving={moving} onCell={chooseCell} onSelect={(building)=>{setSelectedId(building.id);setPlacing(null);setMoving(false)}}/><div className="map-legend"><span><i className="economy"/>Production</span><span><i className="defense"/>Defense</span><span><i className="support"/>Support</span></div></div>
      <aside className="base-context">{placing?<><small>CONSTRUCTION MODE</small><h3>{placing.name}</h3><p>{placing.detail}</p><b>Tap an open grid cell</b><button onClick={()=>setPlacing(null)}>Cancel</button></>:selected?<><small>{buildingDefinition(selected.kind)?.role.toUpperCase()}</small><h3>{buildingDefinition(selected.kind)?.name}</h3><p>{buildingDefinition(selected.kind)?.detail}</p><div className="building-stats"><span>Level <b>{selected.level}</b></span><span>Upgrade <b>⬡{resource(costs.alloy)} · ◈{resource(costs.cells)}</b></span></div><button disabled={busy} onClick={()=>act(()=>onUpgrade(selected.id),"Structure upgraded")}>Upgrade</button><button className={moving?"active":""} onClick={()=>setMoving((state)=>!state)}>{moving?"Tap destination":"Relocate"}</button></>:<><small>BASE COMMAND</small><h3>Shape your defense</h3><p>Tap a structure to upgrade or relocate it. Your layout changes how rival tactics perform.</p><button onClick={scout}>Scout rivals</button></>}</aside></div>
      <div className="build-catalog"><header><div><small>STRUCTURE BLUEPRINTS</small><h3>Build systems</h3></div><span>CORE LV {base.hqLevel||1}</span></header><div>{BUILDING_CATALOG.filter((entry)=>entry.role!=="hq").map((entry)=>{const count=layout.filter((building)=>building.kind===entry.kind).length;const locked=Number(base.hqLevel||1)<entry.unlock;return <button key={entry.kind} disabled={locked||count>=entry.max} onClick={()=>{setPlacing(entry);setSelectedId(null);setMoving(false)}}><i>{entry.icon}</i><span><b>{entry.name}</b><small>{locked?`Core ${entry.unlock} required`:`${count}/${entry.max} · ⬡${entry.baseAlloy} ◈${entry.baseCells}`}</small></span></button>})}</div></div>
    </>}

    {view==="attack"&&<div className="attack-command">{result?<div className="battle-result"><small>BATTLE REPORT</small><div className="star-row">{[1,2,3].map((star)=><i key={star} className={star<=result.stars?"won":""}>★</i>)}</div><h3>{result.stars?"Gridhold breached":"Defense held"}</h3><p>{result.stars?`Recovered ⬡${result.alloy} Alloy and ◈${result.cells} Cells.`:"Review the rival layout and choose a better tactical lane."}</p><b className={result.ratingDelta>=0?"positive":"negative"}>{result.ratingDelta>=0?"+":""}{result.ratingDelta} rating</b><button onClick={()=>{setResult(null);scout()}}>Find next rival</button></div>:target?<><div className="target-head"><button onClick={()=>setTarget(null)}>‹ Rivals</button><span><small>DEFENDER</small><b>{target.name}</b></span><span><small>RATING</small><b>{target.trophies}</b></span><span><small>DEFENSE</small><b>{resource(target.defensePower)}</b></span></div><div className="attack-layout"><BaseGrid layout={target.layout} enemy/><aside><small>ENTRY TACTIC</small>{ATTACK_TACTICS.map((entry)=><button key={entry.id} className={tactic===entry.id?"active":""} onClick={()=>setTactic(entry.id)}><i>{entry.icon}</i><span><b>{entry.name}</b><small>{entry.detail}</small></span></button>)}<div className="available-loot"><span>AVAILABLE <b>⬡{target.alloyAvailable} · ◈{target.cellsAvailable}</b></span></div><button className="launch-attack" disabled={busy} onClick={launch}>Launch attack</button></aside></div></>:<><div className="attack-brief"><div><small>RIVAL NETWORK</small><h3>Scout real player bases</h3><p>Read the layout, choose a tactical entry, then let your runner power and base upgrades decide the breach.</p></div><button disabled={busy||!onFindOpponents} onClick={scout}>Scan opponents</button></div>{opponents.length>0&&<div className="opponent-list">{opponents.map((opponent)=><button key={opponent.userId} onClick={()=>setTarget(opponent)}><span><b>{opponent.name}</b><small>Core {opponent.hqLevel} · {opponent.trophies} rating</small></span><em>{resource(opponent.defensePower)} DEF</em></button>)}</div>}</>}</div>}

    {view==="ranks"&&<div className="rank-command"><div className="rank-progress"><small>CURRENT RANK</small><h3 style={{color:rank.color}}>{rank.rankName||rank.name}</h3><b>{trophies} rating</b>{nextRank&&<><div><i style={{width:`${Math.min(100,Math.max(0,(trophies-(rank.minRating||rank.min))/(nextRank.min-trophies+(trophies-(rank.minRating||rank.min)))*100))}%`}}/></div><span>{nextRank.min-trophies} to {nextRank.name}</span></>}</div><div className="rank-ladder">{PVP_RANKS.map((entry)=><article key={entry.id} className={trophies>=entry.min?"unlocked":""} style={{"--rank":entry.color}}><i>◆</i><span><b>{entry.name}</b><small>{entry.min} rating</small></span><em>Title: {entry.title}<br/>Decor: {entry.decor}</em></article>)}</div><div className="base-objectives"><h3>Gridhold path</h3>{objectives.map((entry)=><span key={entry.id} className={entry.done?"done":""}><i>{entry.done?"✓":"○"}</i><b>{entry.title}</b><small>{entry.detail}</small></span>)}</div></div>}
  </section>;
}
