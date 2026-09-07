import { useCallback, useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";
import "./season-hub.css";

const percent = (value, target) => Math.min(100, Math.round(Number(value || 0) / Math.max(1, Number(target || 1)) * 100));


function Meter({ value, target }) {
  return <figure className="dispatch-meter"><i style={{ width: `${percent(value, target)}%` }} /></figure>;
}

function ActionCard({ icon, eyebrow, title, text, action, onClick, tone = "copper" }) {
  return <article className={`dispatch-action ${tone}`}>
    <i className="dispatch-action-icon"><GameIcon name={icon} size={22} /></i>
    <div><small>{eyebrow}</small><h3>{title}</h3><p>{text}</p></div>
    <button onClick={onClick}>{action}<span>→</span></button>
  </article>;
}

function Objective({ icon, label, detail, value, target, onClick, complete = false }) {
  return <article className={`dispatch-objective ${complete ? "complete" : ""}`}>
    <i><GameIcon name={icon} size={18} /></i>
    <div><small>{complete ? "COMPLETE" : "LONG-TERM TARGET"}</small><b>{label}</b><span>{detail}</span><Meter value={value} target={target} /></div>
    <strong>{Math.min(Number(value || 0), Number(target || 0))}/{target}</strong>
    {!complete && onClick && <button aria-label={`Open ${label}`} onClick={onClick}>Open</button>}
  </article>;
}

export default function SeasonHub({ onNavigate }) {
  const [data, setData] = useState(null), [operations, setOperations] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [syncedAt, setSyncedAt] = useState(null);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
    const [progressionResult, operationsResult] = await Promise.all([supabase.rpc("bw_progression_snapshot"), supabase.rpc("bw_operations_snapshot")]);
    const problems = [progressionResult.error, operationsResult.error].filter(Boolean);
    if (problems.length) setError(problems.map(item => item.message).join(" "));
    if (!progressionResult.error) setData(progressionResult.data);
    if (!operationsResult.error) setOperations(operationsResult.data);
    if (!problems.length) setSyncedAt(new Date());
    } catch (problem) { setError(problem.message || "Could not refresh your record."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextMission = data?.missions?.find(item => item.unlocked && !item.claimedAt) || null;
  const districts = operations?.districts || [];
  const clears = districts.reduce((total, item) => total + Number(item.clears || 0), 0);
  const heat = districts.length ? Math.round(districts.reduce((total, item) => total + Number(item.heat || 0), 0) / districts.length) : 0;
  const assignments = (data?.factions || []).reduce((total, item) => total + Number(item.completed || 0), 0);
  const wins = Number(data?.combat?.wins || data?.player?.fights_won || 0);
  const level = Number(data?.player?.level || 1);
  const seasonScore = Math.min(100, Math.round((Math.min(clears, 6) / 6 * 35) + (Math.min(assignments, 8) / 8 * 25) + (Math.min(wins, 3) / 3 * 20) + (Math.min(level, 15) / 15 * 20)));
  const firstAction = operations?.active ? { icon: "operations", eyebrow: "ACTIVE DOSSIER", title: operations.active.operationName, text: `Your operation is waiting at ${operations.active.stageTitle}.`, action: "Continue operation", page: "operations", tone: "green" } : nextMission ? {
    icon: "missions", eyebrow: "RECOMMENDED NEXT", title: nextMission.title,
    text: `${nextMission.objective} ${nextMission.progress}/${nextMission.target} recorded.`, action: "Open campaign", page: "missions", tone: "copper",
  } : operations?.active ? {
    icon: "operations", eyebrow: "ACTIVE DOSSIER", title: operations.active.operationName,
    text: `Your ${operations.active.districtName} operation is waiting at ${operations.active.stageTitle}.`, action: "Continue operation", page: "operations", tone: "green",
  } : {
    icon: "operations", eyebrow: "RECOMMENDED NEXT", title: "Choose a district operation",
    text: "No energy is required. Clear a marked NPC crew and keep building your city record.", action: "Open operations", page: "operations", tone: "copper",
  };

  if (error) return <div className="dispatch-page"><section className="dispatch-empty"><GameIcon name="contracts" size={36} /><h2>Dispatch is offline</h2><p>{error}</p><button onClick={load}>Retry connection</button></section></div>;
  if (!data || !operations) return <div className="dispatch-page"><section className="dispatch-empty"><GameIcon name="contracts" size={36} /><h2>Opening the dispatch board</h2><p>Syncing your campaign, factions and district record…</p></section></div>;

  return <div className="dispatch-page">
    <header className="dispatch-hero">
      <div className="dispatch-hero-copy"><small>BLACKWOOD DISPATCH · YOUR LEDGER</small><h1>The long game</h1><p>Your campaign, factions and district progress. These are lifetime milestones, not a timed season.</p><div className="dispatch-hero-actions"><button className="dispatch-primary" onClick={() => onNavigate(firstAction.page)}>{firstAction.action}<span>→</span></button><button className="dispatch-secondary" onClick={() => onNavigate("missions")}>View campaign</button></div></div>
      <div className="dispatch-score"><div className="dispatch-ring" style={{ "--progress": `${seasonScore * 3.6}deg` }}><span><b>{seasonScore}%</b><small>MILESTONE<br />PROGRESS</small></span></div><button className="bw-text-button" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh record ↻"}</button><em>{syncedAt ? `Synced ${syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Live record"}</em></div>
    </header>
    {error && <div className="dispatch-alert"><GameIcon name="history" size={16} /><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    <section className="dispatch-next">
      <div className="dispatch-next-label"><i><GameIcon name={firstAction.icon} size={20} /></i><span><small>YOUR NEXT MOVE</small><b>Keep the record moving</b></span></div>
      <div className="dispatch-next-copy"><small>{firstAction.eyebrow}</small><h2>{firstAction.title}</h2><p>{firstAction.text}</p></div>
      <button className="dispatch-next-button" disabled={busy} onClick={() => onNavigate(firstAction.page)}>{busy ? "Syncing…" : firstAction.action}<span>→</span></button>
    </section>
    <div className="dispatch-layout">
      <main>
        <section className="dispatch-section"><header><div><small>PLAY YOUR WAY</small><h2>Three useful routes</h2></div><span>All progress is server recorded</span></header><div className="dispatch-actions"><ActionCard icon="missions" eyebrow="STORY" title="Continue the campaign" text={nextMission ? `${nextMission.progress}/${nextMission.target} toward ${nextMission.objective.toLowerCase()}.` : "Your current campaign chapters are complete."} action="Campaign" onClick={() => onNavigate("missions")} tone="copper" /><ActionCard icon="operations" eyebrow="NO ENERGY" title="Run a district operation" text={`${clears} clears recorded · average heat ${heat}/100.`} action="Operations" onClick={() => onNavigate("operations")} tone="green" /><ActionCard icon="family" eyebrow="BUILD TRUST" title="Work with a faction" text={`${assignments} assignments completed across your faction record.`} action="Factions" onClick={() => onNavigate("factions")} tone="blue" /></div></section>
        <section className="dispatch-section"><header><div><small>LONG-TERM TARGETS</small><h2>Small goals, visible progress</h2></div><span>Nothing expires your existing record</span></header><div className="dispatch-objectives"><Objective icon="operations" label="Clear six district operations" detail="Build mastery and discover marked rare items." value={clears} target={6} onClick={() => onNavigate("operations")} complete={clears >= 6} /><Objective icon="family" label="Complete eight faction assignments" detail="Earn reputation with any of Blackwood's four factions." value={assignments} target={8} onClick={() => onNavigate("factions")} complete={assignments >= 8} /><Objective icon="combat" label="Win three player fights" detail="Only authenticated, server-resolved fights count." value={wins} target={3} onClick={() => onNavigate("combat")} complete={wins >= 3} /><Objective icon="awards" label="Reach level fifteen" detail="Crimes, jobs, missions and operations all contribute." value={level} target={15} onClick={() => onNavigate("crimes")} complete={level >= 15} /></div></section>
      </main>
      <aside>
        <section className="dispatch-brief"><header><small>FIELD BRIEF</small><GameIcon name="adviser" size={18} /></header><h3>How to use Dispatch</h3><ol><li><b>Pick one route</b><span>Story for direction, operations for endless play, factions for standing.</span></li><li><b>Follow the button</b><span>Every card opens the exact city system that records the action.</span></li><li><b>Return when ready</b><span>Refresh Dispatch after a run to see your record move.</span></li></ol><button onClick={() => onNavigate("missions")}>Open campaign guide <span>→</span></button></section>
        <section className="dispatch-status"><header><small>LIVE CITY PULSE</small><b>Tonight in Blackwood</b></header><div><span><i className="pulse green" />District heat</span><strong>{heat}/100</strong></div><div><span><i className="pulse copper" />Operations today</span><strong>{operations.grind?.today || 0}</strong></div><div><span><i className="pulse blue" />Your standing</span><strong>{Number(data.rank?.score || 0).toLocaleString()}</strong></div><p>Heat cools over time. Keep playing whenever you want; soft efficiency guardrails protect the economy without stopping the session.</p></section>
      </aside>
    </div>
  </div>;
}
