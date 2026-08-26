import { useEffect, useMemo, useState } from "react";
import { RAID_OPERATIONS, RAID_SPECIALIZATIONS, botLootPolicy, raidAccess, raidById, specializationById } from "./raidRules.js";
import "./raid-command.css";

const ACTIONS = [
  { id: "assault", glyph: "斬", name: "Assault", detail: "Strike the exposed core" },
  { id: "guard", glyph: "盾", name: "Guard", detail: "Absorb the counter-wave" },
  { id: "override", glyph: "機", name: "Override", detail: "Disrupt hostile systems" },
];

export default function RaidCommand({ player, combatPower, state, busy, onSpecialize, onQueue, onJoin, onFillBots, onAdvance, onClaim, onLeave, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(state?.party?.raidId || RAID_OPERATIONS[0].id);
  const [flash, setFlash] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const raidState = state || { specialization: "vanguard", clears: {}, party: null };
  const party = raidState.party;
  const raid = raidById(party?.raidId || selectedId);
  const spec = specializationById(raidState.specialization);
  const access = raidAccess(raid, player, combatPower);
  const lootPolicy = botLootPolicy(party?.botCount || 0);
  const bossPercent = party ? Math.max(0, Math.round(Number(party.bossHp || 0) / Math.max(1, Number(party.bossMaxHp || 1)) * 100)) : 100;
  const phase = party ? Math.max(1, Math.min(3, Number(party.phase || 1))) : 1;
  const phaseName = raid.phases[phase - 1];
  const roster = useMemo(() => party?.roster || [], [party?.roster]);

  useEffect(() => { if (party) setOpen(true); }, [party?.id]);
  useEffect(() => {
    if (!open || !party || !onRefresh || !["waiting", "active"].includes(party.state)) return undefined;
    const timer = setInterval(() => onRefresh().catch(() => undefined), 8000);
    return () => clearInterval(timer);
  }, [open, party?.id, party?.state, onRefresh]);

  const act = async (work, message) => {
    setFlash("");
    try { await work?.(); setFlash(message); }
    catch (error) { setFlash(error.message || "Raid command failed"); }
  };

  return <>
    <section className="raid-launch-card">
      <div className="raid-launch-mark"><i>連</i><span>{party ? party.state.toUpperCase() : "CO-OP RAID"}</span></div>
      <div><small>FOUR-RUNNER ENDGAME</small><h2>{party ? raid.name : "Linked Raid Operations"}</h2><p>{party ? `${roster.length}/4 squad slots · ${phaseName}` : "Build a specialization, form a room and fight a multi-phase city operation."}</p></div>
      <div className="raid-launch-reward"><small>{party?.botCount ? "BOT SQUAD" : "HUMAN SQUAD"}</small><b>{party ? lootPolicy.label : "UNIQUE RAID SETS"}</b></div>
      <button onClick={() => setOpen(true)}>{party ? "Open Raid" : "Enter Raid Command"}</button>
    </section>

    {open && <div className="raid-overlay" role="dialog" aria-modal="true" aria-label="Raid command">
      <main className="raid-command">
        <header><div><small>NEO GRID // LINKED OPERATIONS</small><h1>Raid Command</h1><p>Four-runner tactical battles with server-owned progress and rewards.</p></div><button onClick={() => setOpen(false)} aria-label="Close raid command">×</button></header>
        {flash && <button className="raid-flash" onClick={() => setFlash("")}>{flash}<b>×</b></button>}

        {!party && <>
          <section className="specialization-deck"><header><div><small>COMBAT IDENTITY</small><h2>Choose Specialization</h2></div><span>Change freely outside an active raid</span></header><div>{RAID_SPECIALIZATIONS.map((entry) => <button key={entry.id} className={raidState.specialization === entry.id ? "active" : ""} style={{"--spec":entry.color}} disabled={busy} onClick={() => act(() => onSpecialize(entry.id), `${entry.name} specialization equipped`)}><i>{entry.glyph}</i><span><b>{entry.name}</b><small>{entry.role}</small><em>{entry.bonus}</em></span>{raidState.specialization === entry.id && <strong>ACTIVE</strong>}</button>)}</div></section>
          <section className="raid-select"><header><div><small>AVAILABLE OPERATIONS</small><h2>Select Raid</h2></div><b>{combatPower.toLocaleString()} CP</b></header><div>{RAID_OPERATIONS.map((entry) => { const gate=raidAccess(entry,player,combatPower); return <button key={entry.id} className={`${selectedId===entry.id?"selected":""} ${gate.unlocked?"ready":"locked"}`} onClick={() => setSelectedId(entry.id)}><span><small>LV {entry.level} · {entry.district}</small><b>{entry.name}</b><em>{entry.boss}</em></span><strong>{entry.loot}</strong><footer><i>{entry.cp.toLocaleString()} TEAM CP</i><i>{Number(raidState.clears?.[entry.id]||0)} CLEARS</i></footer></button>; })}</div></section>
          <section className="raid-deploy"><div><small>SELECTED · {raid.district}</small><h2>{raid.name}</h2><p>{raid.boss} · recommended team power {raid.cp.toLocaleString()}</p><div className="raid-phase-preview">{raid.phases.map((name,index)=><span key={name}><i>{index+1}</i>{name}</span>)}</div></div><aside><span><small>YOUR ROLE</small><b style={{color:spec.color}}>{spec.name}</b></span><span><small>PERSONAL TARGET</small><b>{access.personalTarget.toLocaleString()} CP</b></span><span><small>RAID SET</small><b>{raid.set}</b></span></aside><footer><button disabled={busy||!access.unlocked||!onQueue} onClick={() => act(() => onQueue(raid.id, false), "Human matchmaking room created")}>Queue Players<small>100% raid loot</small></button><button className="bots" disabled={busy||!access.unlocked||!onQueue} onClick={() => act(() => onQueue(raid.id, true), "Bot squad deployed · all raid loot reduced to 50%")}>Deploy With Bots<small>Starts now · 50% raid loot</small></button><div className="raid-code-join"><input value={roomCode} maxLength={6} placeholder="ROOM CODE" aria-label="Human raid room code" onChange={(event)=>setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/><button disabled={busy||roomCode.length!==6||!onJoin} onClick={()=>act(()=>onJoin(roomCode),"Raid room joined")}>Join Human Room</button></div>{!access.unlocked&&<p>{access.missingLevel?`Requires level ${raid.level}`:`Need ${access.missingCp.toLocaleString()} more personal CP`}</p>}</footer></section>
        </>}

        {party && <section className={`active-raid state-${party.state}`}>
          <header><div><small>{raid.district} · PHASE {phase}/3</small><h2>{raid.name}</h2><p>{phaseName}</p></div><div className="raid-room-code"><small>ROOM CODE</small><b>{party.roomCode}</b></div><div className={`raid-live ${party.state}`}><i/>{party.state.toUpperCase()}</div></header>
          <div className="raid-battlefield"><div className="raid-boss"><div className="boss-core"><i/><b>{party.state === "victory" ? "✓" : "核"}</b></div><div className="boss-rings"><i/><i/><i/></div><span>{raid.boss}</span></div><div className="raid-boss-hp"><header><span>BOSS INTEGRITY</span><b>{Number(party.bossHp||0).toLocaleString()} / {Number(party.bossMaxHp||0).toLocaleString()}</b></header><i><em style={{width:`${bossPercent}%`}}/></i></div><div className="phase-track">{raid.phases.map((name,index)=><span className={index+1<phase?"done":index+1===phase?"active":""} key={name}><i>{index+1<phase?"✓":index+1}</i><b>{name}</b></span>)}</div></div>
          <div className="raid-roster">{roster.map((member,index)=><article key={member.userId||member.id||index} className={member.bot?"bot":"human"} style={{"--member":specializationById(member.specialization).color}}><i>{specializationById(member.specialization).glyph}</i><span><b>{member.name}</b><small>{member.bot?"BOT SUPPORT":`${Number(member.cp||0).toLocaleString()} CP`}</small></span><em>{Number(member.contribution||0).toLocaleString()}</em></article>)}</div>
          <div className={`raid-loot-policy ${party.botCount?"reduced":"full"}`}><i>{party.botCount?"½":"✓"}</i><span><b>{lootPolicy.label}</b><small>{lootPolicy.detail}</small></span></div>
          {party.state === "waiting" && <footer className="raid-waiting"><div><span className="queue-pulse"/><b>Room open for players</b><small>Share code {party.roomCode}. The raid begins automatically when four humans join.</small></div><button disabled={busy||!onFillBots} onClick={() => act(onFillBots, "Empty slots filled with bots · all raid loot is now 50%")}>Fill Empty Slots With Bots<small>Start immediately · 50% raid loot</small></button><button className="leave" disabled={busy} onClick={() => act(onLeave, "Raid room left")}>Leave room</button></footer>}
          {party.state === "active" && <div className="raid-actions"><header><span><small>YOUR SPECIALIZATION</small><b style={{color:spec.color}}>{spec.name}</b></span><p>Match your role action for a 30% contribution bonus. Every action advances the shared server battle.</p></header><div>{ACTIONS.map((action)=><button key={action.id} className={spec.action===action.id?"favored":""} disabled={busy} onClick={() => act(() => onAdvance(action.id), `${action.name} transmitted`)}><i>{action.glyph}</i><span><b>{action.name}</b><small>{action.detail}</small></span>{spec.action===action.id&&<em>ROLE BONUS</em>}</button>)}</div></div>}
          {party.state === "victory" && <footer className="raid-victory"><div><small>OPERATION COMPLETE</small><h2>{raid.boss} secured</h2><p>{party.botCount?"Bot-assisted clear: 50% equipment chance and 50% material yield.":"Full human clear: full materials and a guaranteed equipment roll."}</p></div><button disabled={busy||party.claimedAt} onClick={() => act(onClaim, "Raid rewards claimed")}>{party.claimedAt?"Rewards Claimed":"Claim Raid Rewards"}</button></footer>}
        </section>}
      </main>
    </div>}
  </>;
}
