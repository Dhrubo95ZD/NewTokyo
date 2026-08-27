import { useState } from "react";
import { CRISIS_TRACKS, crisisPrepReady, crisisProgress, normalizeCrewState } from "./crewRules.js";
import "./crew-command.css";

export default function CrewCommand({ state, busy, onCreate, onJoin, onLeave, onContribute, onStrike, onClaim, onRefresh }) {
  const data = normalizeCrewState(state);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [color, setColor] = useState("#48dfff");
  const [notice, setNotice] = useState("");
  const run = async (work, success) => {
    if (busy) return;
    setNotice("");
    try { await work(); setNotice(success); }
    catch (error) { setNotice(error.message || "Crew command failed"); }
  };

  if (!data.authority) return <section className="crew-command crew-setup"><i>隊</i><h2>Runner Crews require setup</h2><p>Apply the Runner Crews SQL migration in Supabase, then reopen Social.</p></section>;

  if (!data.crew) return <section className="crew-command crew-discovery">
    <header><div><small>RUNNER NETWORK // CREWS</small><h2>Build a response crew</h2><p>Coordinate weekly crises, raid preparation and shared progression with up to 24 runners.</p></div><button onClick={onRefresh}>↻</button></header>
    {notice && <button className="crew-notice" onClick={() => setNotice("")}>{notice}</button>}
    <div className="crew-create">
      <div><small>FOUND A CREW</small><h3>New command identity</h3></div>
      <label>Name<input value={name} maxLength={24} placeholder="Neon Couriers" onChange={(e) => setName(e.target.value)} /></label>
      <label>Tag<input value={tag} maxLength={5} placeholder="NCR" onChange={(e) => setTag(e.target.value.toUpperCase())} /></label>
      <label>Signal<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <button disabled={busy || name.trim().length < 3 || tag.trim().length < 2} onClick={() => run(() => onCreate(name.trim(), tag.trim(), color), "Crew created")}>Create Crew</button>
    </div>
    <div className="crew-browser"><header><div><small>PUBLIC FREQUENCIES</small><h3>Join an active crew</h3></div><span>{data.publicCrews.length} available</span></header>{data.publicCrews.length ? data.publicCrews.map((crew) => <article key={crew.id} style={{ "--crew": crew.color }}><i>{crew.tag}</i><div><b>{crew.name}</b><small>LV {crew.level} · {crew.memberCount}/24 runners</small></div><button disabled={busy} onClick={() => run(() => onJoin(crew.id), `Joined ${crew.name}`)}>Join</button></article>) : <p>No public Crews are broadcasting yet. Found the first one.</p>}</div>
  </section>;

  const crew = data.crew;
  const crisis = data.crisis;
  const prepReady = crisisPrepReady(crisis);
  const progress = crisisProgress(crisis);
  return <section className="crew-command crew-active" style={{ "--crew": crew.color }}>
    <header className="crew-banner"><i>{crew.tag}</i><div><small>RUNNER CREW // {crew.role}</small><h2>{crew.name}</h2><p>Level {crew.level} · {crew.memberCount}/24 runners · {Number(crew.xp || 0).toLocaleString()} Crew XP</p></div><button disabled={busy} onClick={() => run(onLeave, "Crew left")}>Leave</button></header>
    {notice && <button className="crew-notice" onClick={() => setNotice("")}>{notice}</button>}
    {crisis && <div className={`crisis-core ${crisis.cleared ? "cleared" : ""}`}>
      <header><div><small>WEEKLY CITY CRISIS // {crisis.cycle}</small><h3>{crisis.name}</h3><p>{crisis.detail}</p></div><span><small>ENDS</small><b>{new Date(crisis.endsAt).toLocaleDateString()}</b></span></header>
      <div className="crisis-tracks">{CRISIS_TRACKS.map((track) => { const value = Number(crisis.prep?.[track.id] || 0); const pct = Math.min(100, Math.round(value / crisis.threshold * 100)); return <article key={track.id} style={{ "--track": track.color }}><i>{track.glyph}</i><div><small>{track.name}</small><b>{value}/{crisis.threshold}</b><span>{track.detail}</span><em><u style={{ width: `${pct}%` }} /></em></div><button disabled={busy || crisis.cleared || Number(crisis.myActions || 0) >= 12} onClick={() => run(() => onContribute(track.id), `${track.name} advanced`)}>Deploy</button></article>; })}</div>
      <div className={`crisis-boss ${prepReady ? "unlocked" : "locked"}`}><div className="boss-sigil"><i>災</i><span /></div><div><small>{prepReady ? "FINAL RESPONSE OPEN" : "PREPARATION REQUIRED"}</small><h3>Wardbreaker Command Unit</h3><p>{prepReady ? "Strike the exposed core. Damage scales with your Combat Power." : "Complete all three preparation tracks to expose the command unit."}</p><em><u style={{ width: `${Math.max(0, 100 - progress)}%` }} /></em><b>{Math.max(0, crisis.bossHp).toLocaleString()} / {crisis.bossMax.toLocaleString()} integrity</b></div><button disabled={busy || !prepReady || crisis.cleared || Number(crisis.myStrikes || 0) >= 6} onClick={() => run(onStrike, "Crew strike registered")}>{crisis.cleared ? "Crisis Cleared" : "Strike Core"}</button></div>
      <footer><span>Your contribution <b>{Number(crisis.myContribution || 0).toLocaleString()}</b></span><span>Weekly actions <b>{crisis.myActions || 0}/12</b></span><span>Core strikes <b>{crisis.myStrikes || 0}/6</b></span>{crisis.cleared && <button disabled={busy || crisis.rewardClaimed || Number(crisis.myContribution || 0) < 100} onClick={() => run(onClaim, "Weekly Crisis rewards claimed")}>{crisis.rewardClaimed ? "Reward Claimed" : "Claim Crisis Reward"}</button>}</footer>
    </div>}
    <div className="crew-lower"><section><header><small>CREW ROSTER</small><b>{crew.members.length}</b></header>{crew.members.map((member) => <article key={member.userId}><i>{member.name.slice(0, 1).toUpperCase()}</i><div><b>{member.name}</b><small>{member.role} · {Number(member.combatPower || 0).toLocaleString()} CP</small></div><strong>{Number(member.contribution || 0).toLocaleString()}</strong></article>)}</section><section><header><small>CITY RANKINGS</small><b>WEEKLY</b></header>{data.rankings.map((entry, index) => <article key={entry.crewId}><i>{index + 1}</i><div><b>[{entry.tag}] {entry.name}</b><small>{entry.cleared ? "Crisis cleared" : `${entry.progress}% suppressed`}</small></div><strong>{Number(entry.score || 0).toLocaleString()}</strong></article>)}</section></div>
  </section>;
}
