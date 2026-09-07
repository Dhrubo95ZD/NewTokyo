import { useCallback, useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";

const money = value => "$" + Number(value || 0).toLocaleString();
const percent = value => Math.max(0, Math.min(100, Number(value || 0)));
const FACTION_ICONS = { "moretti-circle": "family", "harbor-union": "operations", "federal-trust": "bank", "northside-aid": "hospital" };

function Meter({ value, tone = "" }) {
  return <figure className={"takeover-meter " + tone}><i style={{ width: percent(value) + "%" }} /></figure>;
}

function FactionCard({ faction, selected, disabled, onPledge }) {
  return <article className={"takeover-faction " + (selected ? "selected" : "")} style={{ "--faction-accent": faction.accent }}>
    <header><i><GameIcon name={FACTION_ICONS[faction.id] || "family"} size={20} /></i><div><small>{faction.district}</small><h3>{faction.name}</h3></div>{selected && <b className="takeover-badge">YOUR SIDE</b>}</header>
    <p>{faction.description}</p>
    <div className="takeover-faction-stats"><span><small>CONTROL SHARE</small><b>{Number(faction.share || 0).toFixed(1)}%</b></span><span><small>CONTRIBUTORS</small><b>{faction.members || 0}</b></span><span><small>POINTS</small><b>{Number(faction.points || 0).toLocaleString()}</b></span></div>
    <Meter value={faction.share} />
    {selected ? <span className="takeover-pledged-note">Your operations and faction assignments now move this ledger.</span> : <button className="takeover-pledge" disabled={disabled} onClick={() => onPledge(faction.id)}>Pledge to {faction.name}<span>→</span></button>}
  </article>;
}

function RewardCard({ reward, points, busy, onClaim }) {
  const ready = Number(points || 0) >= Number(reward.target || 0);
  return <article className={"takeover-reward " + (reward.claimed ? "claimed" : ready ? "ready" : "")}>
    <div><small>TIER {reward.tier}</small><h3>{reward.label}</h3><p>{money(reward.cash)} · {reward.xp} XP{reward.merits ? " · " + reward.merits + " merit" + (reward.merits === 1 ? "" : "s") : ""}</p></div>
    <strong>{Math.min(Number(points || 0), Number(reward.target || 0))}/{reward.target}</strong>
    <button disabled={busy || reward.claimed || !ready} onClick={() => onClaim(reward.tier)}>{reward.claimed ? "Claimed" : ready ? "Claim reward" : "In progress"}</button>
  </article>;
}

export default function TakeoverHub({ onNavigate }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: value, error: problem } = await supabase.rpc("bw_takeover_snapshot");
    if (problem) setError(problem.message || "Takeover is not installed yet.");
    else setData(value);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pledge = async id => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const { data: value, error: problem } = await supabase.rpc("bw_takeover_pledge", { p_faction_id: id });
    if (problem) setError(problem.message);
    else { setData(value); setNotice("Allegiance recorded. Future operations will move your faction ledger."); }
    setBusy(false);
  };

  const claim = async tier => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const { data: value, error: problem } = await supabase.rpc("bw_takeover_claim", { p_tier: tier });
    if (problem) setError(problem.message);
    else { setData(value.takeover || value); setNotice("Tier " + tier + " reward claimed."); }
    setBusy(false);
  };

  if (!data && !error) return <div className="takeover-page"><section className="takeover-empty"><GameIcon name="city" size={34} /><h2>Opening the city ledger</h2><p>Reading faction control and the current season record…</p></section></div>;
  if (error) return <div className="takeover-page"><section className="takeover-empty"><GameIcon name="history" size={34} /><h2>Takeover is offline</h2><p>{error}</p><button className="bw-secondary" onClick={load}>Retry connection</button></section></div>;
  if (data.status === "between-seasons") return <div className="takeover-page"><section className="takeover-empty"><small>BLACKWOOD TAKEOVER</small><h1>Between seasons</h1><p>The next citywide contest has not opened yet. Your existing character progress is safe.</p><button className="bw-secondary" onClick={() => onNavigate("dispatch")}>Open Dispatch</button></section></div>;

  const season = data.season || {};
  const pledged = data.pledge;
  const points = Number(data.personal?.points || 0);
  const factions = data.factions || [];
  const districts = data.districts || [];
  const leader = factions[0];
  return <div className="takeover-page">
    <header className="takeover-hero">
      <div><small>BLACKWOOD TAKEOVER · SEASON 01</small><h1>{season.name || "Blackwood Takeover"}</h1><p>{season.description}</p><div className="takeover-hero-actions"><button className="bw-primary" onClick={() => onNavigate("operations")}>Run an operation <span>→</span></button><button className="bw-secondary" onClick={() => onNavigate("factions")}>Work a faction</button></div></div>
      <div className="takeover-countdown"><small>THE CITY DECIDES IN</small><b>{season.daysLeft || 0}</b><span>days</span><em>Finale · {season.finaleName}</em></div>
    </header>
    {notice && <div className="takeover-alert good" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {error && <div className="takeover-alert bad" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
    <section className="takeover-brief">
      <div><small>YOUR RECORD</small><h2>{pledged ? "You are backing " + pledged.name : "Choose who owns the night"}</h2><p>{pledged ? "Successful district operations and faction assignments are counted automatically after you pledge." : "Pick a faction before you play. You can change your mind until your first contribution."}</p></div>
      <dl><div><dt>TAKEOVER POINTS</dt><dd>{points.toLocaleString()}</dd></div><div><dt>CITY RANK</dt><dd>#{data.personal?.rank || 1}</dd></div><div><dt>RUNS LOGGED</dt><dd>{data.personal?.runs || 0}</dd></div></dl>
    </section>
    <section className="takeover-section"><header><div><small>FACTION LEDGER</small><h2>Four ways to take the city</h2></div><span>{leader ? leader.name + " leads the ledger" : "No points recorded yet"}</span></header><div className="takeover-faction-grid">{factions.map(faction => <FactionCard key={faction.id} faction={faction} selected={faction.pledged} disabled={busy || Boolean(pledged && data.personal?.runs)} onPledge={pledge} />)}</div></section>
    <section className="takeover-section"><header><div><small>DISTRICT CONTROL</small><h2>Where the pressure is moving</h2></div><span>Control follows verified play</span></header><div className="takeover-district-grid">{districts.slice(0, 6).map(district => <article key={district.id} className="takeover-district" style={{ "--district-accent": district.accent }}><div><small>{district.zone}</small><h3>{district.name}</h3></div><strong>{district.controlFactionName || "Unclaimed"}</strong><Meter value={district.points ? Math.min(100, Number(district.points) / 2) : 0} /><span>{Number(district.points || 0).toLocaleString()} verified points</span></article>)}</div></section>
    <div className="takeover-bottom-grid">
      <section className="takeover-section takeover-routes"><header><div><small>CONTRIBUTE</small><h2>Play your route</h2></div><span>Every route feeds the same city record</span></header><div className="takeover-route-list"><button onClick={() => onNavigate("operations")}><i><GameIcon name="operations" /></i><span><b>District Operations</b><small>Multi-stage PvE clears move district control.</small></span><em>Open →</em></button><button onClick={() => onNavigate("factions")}><i><GameIcon name="family" /></i><span><b>Faction Assignments</b><small>Build reputation and add points to your side.</small></span><em>Open →</em></button><button onClick={() => onNavigate("combat")}><i><GameIcon name="combat" /></i><span><b>Player Combat</b><small>Personal wins will join the next contribution pass.</small></span><em>Coming next</em></button></div></section>
      <section className="takeover-section"><header><div><small>PERSONAL REWARDS</small><h2>Earn your city mark</h2></div><span>Claimed rewards stay yours</span></header><div className="takeover-rewards">{(data.rewards || []).map(reward => <RewardCard key={reward.tier} reward={reward} points={points} busy={busy} onClaim={claim} />)}</div></section>
    </div>
    <footer className="takeover-footnote">The city ledger is server-recorded. Points are credited only after a verified operation or faction assignment resolves.</footer>
  </div>;
}
