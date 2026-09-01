import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";
import "./combat-hub.css";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const clock = value => value ? new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";
const id = () => crypto.randomUUID();
const tabs = [["targets","Targets"],["contracts","Contracts"],["bounties","Bounties"],["relics","Rare Items"],["history","History"]];

function Alert({ type, children, close }) { return <div className={`combat-alert ${type}`}>{children}<button onClick={close}>×</button></div>; }
function Empty({ title, text }) { return <div className="combat-empty"><GameIcon name="combat" size={30}/><b>{title}</b><p>{text}</p></div>; }
function Rarity({ value }) { return <span className={`combat-rarity ${value}`}>{value}</span>; }

export default function CombatHub({ onState }) {
  const [data,setData] = useState(null), [tab,setTab] = useState("targets"), [mode,setMode] = useState("leave"), [busy,setBusy] = useState(false);
  const [error,setError] = useState(""), [notice,setNotice] = useState(""), [result,setResult] = useState(null), [query,setQuery] = useState("");
  const [bountyTarget,setBountyTarget] = useState(""), [bountyAmount,setBountyAmount] = useState(5000), [cooldown,setCooldown] = useState(0);

  const accept = useCallback(value => {
    const next = value?.combat || value;
    if (next?.player) { setData(next); onState?.(next.player); }
    if (value?.event) setResult(value.event);
  },[onState]);
  const load = useCallback(async () => {
    const response = await supabase.rpc("bw_combat_snapshot");
    if (response.error) setError(response.error.message); else { setError(""); accept(response.data); }
  },[accept]);
  useEffect(() => { load(); },[load]);
  useEffect(() => { if (!cooldown) return; const timer=setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000); return ()=>clearInterval(timer); },[cooldown]);

  const run = async (rpc,params,message) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const response=await supabase.rpc(rpc,params);
    if (response.error) setError(response.error.message); else { accept(response.data); setNotice(message); }
    setBusy(false);
  };
  const opponents = useMemo(() => (data?.opponents || []).filter(player => player.name.toLowerCase().includes(query.toLowerCase())),[data,query]);
  const activeMine = (data?.myBounties || []).filter(item=>item.status==="active");

  if (!data) return <div className="combat-loading">{error || "Opening the Blackwood combat ledger…"}</div>;
  const player=data.player, relic=data.relic || {};
  return <div className="combat-hub">
    {error && <Alert type="bad" close={()=>setError("")}>{error}</Alert>}
    {notice && <Alert type="good" close={()=>setNotice("")}>{notice}</Alert>}
    <section className="combat-command">
      <div><small>SERVER-AUTHORITATIVE COMBAT</small><h2>The Blackwood Fight Office</h2><p>Real opponents, protected outcomes and rewards calculated by the city—not the phone.</p></div>
      <dl><div><dt>Energy</dt><dd>{player.energy}/{player.max_energy}</dd></div><div><dt>Record</dt><dd>{player.fights_won}–{player.fights_lost}</dd></div><div><dt>Respect</dt><dd>{Number(player.respect).toLocaleString()}</dd></div></dl>
    </section>
    <nav className="combat-tabs">{tabs.map(([key,label])=><button className={tab===key?"active":""} onClick={()=>setTab(key)} key={key}><GameIcon name={key==="relics"?"inventory":key==="targets"?"combat":key==="history"?"awards":key} size={16}/>{label}</button>)}</nav>

    {result && <section className={`combat-result ${result.won===false?"loss":"win"}`}>
      <header><i>{result.won===false?"×":"✓"}</i><div><small>LATEST RESULT</small><h3>{result.won===false?"Fight lost":result.dropName?`Rare find: ${result.dropName}`:"Business settled"}</h3></div><button onClick={()=>setResult(null)}>×</button></header>
      {result.log && <div className="combat-rounds">{result.log.map(row=><p key={row.round}><b>{row.round}</b><span>{row.text}</span><em>{row.attacker} / {row.defender}</em></p>)}</div>}
      <footer>{Number(result.cash)>0&&<span>Mugged <b>{money(result.cash)}</b></span>}{Number(result.bounty)>0&&<span>Bounty <b>{money(result.bounty)}</b></span>}{result.dropName&&<span>Recovered <b>{result.dropName}</b></span>}{Number(result.intel)>0&&<span>Intel <b>+{result.intel}</b></span>}{result.multiplier&&<span>Reward rate <b>{Math.round(Number(result.multiplier)*100)}%</b></span>}</footer>
    </section>}

    {tab==="targets" && <section className="combat-targets">
      <header><div><small>REAL PLAYER DIRECTORY</small><b>{opponents.length} available records</b></div><label>Outcome<select value={mode} onChange={event=>setMode(event.target.value)}><option value="leave">Leave defeated</option><option value="mug">Mug carried cash</option><option value="hospitalize">Hospitalize</option></select></label><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search player"/><button onClick={load}>Refresh</button></header>
      {opponents.length===0?<Empty title="No real targets yet" text="Targets appear only after another authenticated player creates a character."/>:<div className="target-grid">{opponents.map(target=>{
        const locked=busy||player.energy<25||player.status!=="okay"||target.status!=="okay"||target.newProtected||target.attacksThisHour>=3;
        const rate=Math.max(10,100-target.repeatWins*25);
        return <article key={target.id} className={locked?"locked":""}>
          <header><i>{target.name.split(/\s+/).map(x=>x[0]).join("").slice(0,2)}</i><div><b>{target.name}</b><small>Level {target.level} · {Number(target.respect).toLocaleString()} respect</small></div><span className={`target-status ${target.status}`}>{target.newProtected?"protected":target.status}</span></header>
          <dl><div><dt>Bounty</dt><dd>{money(target.bounty)}</dd></div><div><dt>Reward rate</dt><dd>{rate}%</dd></div><div><dt>Hourly attacks</dt><dd>{target.attacksThisHour}/3</dd></div></dl>
          <p>{target.newProtected?"New-player protection is active.":target.status!=="okay"?`Unavailable until ${clock(target.statusUntil)}.`:target.attacksThisHour>=3?"Target protection is active. Choose somebody else.":target.repeatWins?"Repeated wins reduce rewards, but never below 10%.":"First meaningful win has full rewards and a rare-drop chance."}</p>
          <button disabled={locked} onClick={()=>run("bw_combat_attack",{p_target:target.id,p_outcome:mode,p_request_id:id()},`Fight against ${target.name} resolved.`)}>Attack · 25 energy</button>
        </article>})}</div>}
    </section>}

    {tab==="contracts" && <section className="combat-contracts"><header><div><small>DAILY ORDERS · RESET 00:00 UTC</small><h3>Contract desk</h3></div><p>Every completed order also advances the guaranteed rare-item meter.</p></header><div>{data.contracts.map(contract=>{const complete=contract.progress>=contract.target;return <article className={contract.claimedAt?"claimed":""} key={contract.kind}><i><GameIcon name="missions" size={22}/></i><div><small>{contract.kind}</small><b>{contract.title}</b><p>{contract.description}</p><figure><span style={{width:`${Math.min(100,contract.progress/contract.target*100)}%`}}/></figure><em>{contract.progress}/{contract.target}</em></div><aside><b>{money(contract.cash)}</b><small>{contract.xp} XP · +{contract.intel} intel</small><button disabled={busy||!complete||contract.claimedAt} onClick={()=>run("bw_claim_combat_contract",{p_kind:contract.kind},`${contract.title} claimed.`)}>{contract.claimedAt?"Claimed":complete?"Claim reward":"In progress"}</button></aside></article>})}</div></section>}

    {tab==="bounties" && <section className="combat-bounties"><form onSubmit={event=>{event.preventDefault();run("bw_place_bounty",{p_target:bountyTarget,p_amount:bountyAmount,p_request_id:id()},"Bounty placed in city escrow.")}}><div><small>ESCROWED PLAYER BOUNTY</small><h3>Put a price on a name</h3><p>The money leaves your wallet now and is paid only to a real player who defeats the target.</p></div><label>Target<select value={bountyTarget} onChange={event=>setBountyTarget(event.target.value)} required><option value="">Choose player</option>{data.opponents.map(target=><option key={target.id} value={target.id}>{target.name}</option>)}</select></label><label>Amount<input type="number" min="1000" step="1000" value={bountyAmount} onChange={event=>setBountyAmount(Math.max(1000,Number(event.target.value)))}/></label><button disabled={busy||!bountyTarget||bountyAmount>player.cash}>Place bounty</button></form><div className="bounty-list"><header><b>Open city bounties</b><span>{data.bounties.length} active</span></header>{data.bounties.length===0?<Empty title="No open bounties" text="The bounty board contains only escrow funded by real players."/>:data.bounties.map(bounty=><article key={bounty.id}><i><GameIcon name="targets" size={20}/></i><div><small>TARGET</small><b>{bounty.targetName}</b><em>Placed by {bounty.placerName} · expires {clock(bounty.expiresAt)}</em></div><strong>{money(bounty.amount)}</strong></article>)}</div>{activeMine.length>0&&<div className="my-bounties"><h3>Your open bounties</h3>{activeMine.map(bounty=><article key={bounty.id}><span><b>{bounty.targetName}</b><small>{money(bounty.amount)} in escrow</small></span><button disabled={busy} onClick={()=>run("bw_cancel_bounty",{p_bounty:bounty.id},"Bounty cancelled and refunded.")}>Cancel & refund</button></article>)}</div>}</section>}

    {tab==="relics" && <section className="relic-hunt"><header><div><small>NO ENERGY REQUIRED</small><h3>Underworld cache network</h3><p>Search contacts for intel. Every search advances the meter; 100 intel guarantees a drop.</p></div><div className="intel-ring" style={{"--intel":`${relic.intel||0}%`}}><span><b>{relic.intel||0}</b><small>/ 100</small></span></div><button disabled={busy||cooldown>0||player.status!=="okay"} onClick={()=>{setCooldown(10);run("bw_search_relic_cache",{p_request_id:id()},"Underworld intel recovered.")}}>{cooldown?`Search again in ${cooldown}s`:"Search cache network"}</button></header><div className="relic-stats"><span><small>Searches</small><b>{Number(relic.searches||0).toLocaleString()}</b></span><span><small>Relics found</small><b>{relic.found||0}</b></span><span><small>Today</small><b>{relic.todaySearches||0}</b></span><span><small>Efficiency floor</small><b>25%</b></span></div><aside><b>Fair grind rules</b><p>The first 30 daily searches are full efficiency. Continued searching gradually reaches a 25% floor, but every valid search always awards at least one intel. Rare items can be equipped or sold to other players.</p></aside><div className="relic-catalog">{data.relicCatalog.map(item=><article className={item.rarity} key={item.id}><header><GameIcon name={item.slot==="armor"?"property":"combat"} size={20}/><Rarity value={item.rarity}/></header><b>{item.name}</b><small>{item.slot} · level {item.level}</small><dl><span>ATK {item.attack}</span><span>DEF {item.defense}</span><span>SPD {item.speed}</span><span>DEX {item.dexterity}</span></dl>{item.owned>0&&<em>{item.owned} owned</em>}</article>)}</div></section>}

    {tab==="history" && <section className="combat-history"><header><b>Your fight ledger</b><span>Last 30 days</span></header>{data.recent.length===0?<Empty title="No fights recorded" text="Your server-verified combat history will appear here."/>:data.recent.map(entry=><article key={entry.id}><i className={entry.won?"won":"lost"}>{entry.won?"W":"L"}</i><div><b>{entry.attackerName} → {entry.defenderName}</b><small>{entry.outcome} · {clock(entry.createdAt)} · {Math.round(Number(entry.multiplier)*100)}% rewards</small></div><span>{Number(entry.cash)>0&&<b>+{money(entry.cash)}</b>}{Number(entry.bounty)>0&&<em>Bounty {money(entry.bounty)}</em>}{entry.dropName&&<strong>{entry.dropName}</strong>}</span></article>)}</section>}
  </div>;
}
