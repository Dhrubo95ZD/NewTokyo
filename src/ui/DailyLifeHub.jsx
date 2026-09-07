import { useCallback, useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";

const cash = value => `$${Number(value || 0).toLocaleString()}`;
const dateLabel = value => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric" }) : "Today";

function RewardLine({ reward }) {
  const parts = [reward.cash ? cash(reward.cash) : null, reward.xp ? `${reward.xp} XP` : null, reward.energy ? `+${reward.energy} energy` : null, reward.nerve ? `+${reward.nerve} nerve` : null, reward.merits ? `+${reward.merits} merit` : null].filter(Boolean);
  return <small>{parts.join(" · ")}</small>;
}

function ProgressMeter({ value, max }) {
  return <div className="daily-meter" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax={max}><i style={{ width: `${Math.min(100, Math.max(0, Number(value || 0) / Math.max(1, Number(max || 1)) * 100))}%` }} /></div>;
}

export default function DailyLifeHub({ onState, onNavigate }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    const [dailyResult, progressionResult] = await Promise.all([supabase.rpc("bw_daily_life_snapshot"), supabase.rpc("bw_progression_snapshot")]);
    if (dailyResult.error) setError(dailyResult.error.message || "Daily Life is temporarily unavailable.");
    const daily = dailyResult.error ? null : dailyResult.data;
    const progression = progressionResult.error ? null : progressionResult.data;
    setData({ daily, progression });
    onState?.(daily?.player || progression?.player);
    setBusy(false);
  }, [onState]);

  useEffect(() => { load(); }, [load]);

  const act = async (rpc, params = {}, success = "City record updated.") => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const { data: value, error: problem } = await supabase.rpc(rpc, params);
    if (problem || value?.error) setError(problem?.message || value?.error || "The city record could not be updated.");
    else {
      if (value?.state?.player) onState?.(value.state.player);
      setNotice(success);
      await load();
    }
    setBusy(false);
  };

  const daily = data?.daily;
  const streak = daily?.streak || {};
  const rewardDays = daily?.rewards || [];
  const objectives = daily?.objectives || [];
  const missions = (data?.progression?.missions || []).filter(mission => mission.unlocked && !mission.claimedAt).slice(0, 3);
  if (busy && !data) return <section className="daily-life-board daily-loading" aria-busy="true"><span className="bw-eyebrow">DAILY LIFE</span><h1>Opening your city journal…</h1><p>Checking today’s rewards and objectives.</p></section>;
  if (!daily) return <section className="daily-life-board daily-empty"><span className="bw-eyebrow">DAILY LIFE</span><h1>Daily Life is being prepared.</h1><p>{error || "Return soon to collect your daily bonus and objectives."}</p><button className="bw-secondary" onClick={load}>Try again</button></section>;

  return <div className="daily-life-board">
    <header className="daily-hero">
      <div><span className="bw-eyebrow">DAILY LIFE · {dateLabel(daily.date)}</span><h1>Keep the city moving.</h1><p>Collect a reliable bonus, choose work that fits your session, and keep one story goal in view.</p></div>
      <div className="daily-streak"><b>{streak.current || 0}</b><span>day streak</span><small>{streak.best ? `Best ${streak.best}` : "Start today"}</small></div>
    </header>
    {error && <div className="daily-alert bad" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="daily-alert good" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

    <section className="daily-reward-card" aria-labelledby="daily-reward-title">
      <header><div><span className="bw-eyebrow">THE DAILY LEDGER</span><h2 id="daily-reward-title">Show up, build momentum.</h2><p>Claim once per UTC day. Missing a day pauses the chain and starts the next visit at day one.</p></div><button className="bw-primary" disabled={busy || daily.claimedToday} onClick={() => act("bw_claim_daily_reward", {}, "Daily bonus claimed and added to your record.")}>{daily.claimedToday ? "Claimed today" : "Claim today"}<span aria-hidden="true">→</span></button></header>
      <div className="daily-reward-track">{rewardDays.map(reward => <div className={`daily-reward-day ${reward.day === daily.currentDay ? "current" : ""} ${reward.day < daily.currentDay ? "past" : ""}`} key={reward.day}><b>DAY {reward.day}</b><strong>{reward.day === daily.currentDay && !daily.claimedToday ? "READY" : reward.day < daily.currentDay ? "DONE" : ""}</strong><RewardLine reward={reward}/></div>)}</div>
      <small className="daily-reset-note">Rewards reset at midnight UTC. Your streak and claims are recorded by the city server.</small>
    </section>

    <section className="daily-objectives" aria-labelledby="daily-objectives-title">
      <header><div><span className="bw-eyebrow">TODAY’S WORK</span><h2 id="daily-objectives-title">Choose your objectives</h2><p>Small goals designed for a short session. Progress is counted from completed server actions.</p></div><span className="daily-count">{objectives.filter(item => item.claimedAt).length}/{objectives.length} claimed</span></header>
      <div className="daily-objective-grid">{objectives.map(objective => { const ready = objective.progress >= objective.target; return <article className={`${objective.claimedAt ? "claimed" : ""} ${ready ? "ready" : ""}`} key={objective.id}><div className="daily-objective-copy"><span className="daily-objective-mark">{objective.claimedAt ? "✓" : "◇"}</span><div><small>{objective.metric.replaceAll("_", " ").toUpperCase()}</small><h3>{objective.title}</h3><p>{objective.description}</p></div></div><ProgressMeter value={objective.progress} max={objective.target}/><div className="daily-objective-footer"><span>{objective.progress}/{objective.target} · <RewardLine reward={objective}/></span><button className="bw-secondary" disabled={busy || objective.claimedAt || !ready} onClick={() => act("bw_claim_daily_objective", { p_objective_id: objective.id }, "Objective reward claimed.")}>{objective.claimedAt ? "Claimed" : ready ? "Claim reward" : "In progress"}</button></div></article>; })}</div>
    </section>

    <section className="daily-bottom-grid">
      <article className="daily-weekly-card"><header><div><span className="bw-eyebrow">WEEKLY LEDGER</span><h2>Make ten moves.</h2></div><strong>{daily.weekly.progress}/{daily.weekly.target}</strong></header><p>Complete any ten meaningful city actions this week. Crimes, work, training, operations, street work, market activity, and combat all count.</p><ProgressMeter value={daily.weekly.progress} max={daily.weekly.target}/><footer><RewardLine reward={daily.weekly}/><button className="bw-primary" disabled={busy || daily.weekly.claimedAt || daily.weekly.progress < daily.weekly.target} onClick={() => act("bw_claim_weekly_objective", {}, "Weekly reward claimed.")}>{daily.weekly.claimedAt ? "Claimed" : daily.weekly.progress >= daily.weekly.target ? "Claim weekly reward" : "Keep moving"}</button></footer></article>
      <article className="daily-journal-card"><header><div><span className="bw-eyebrow">MISSION JOURNAL</span><h2>Keep the long game visible.</h2></div><button className="bw-text-button" onClick={() => onNavigate?.("missions")}>Open campaign →</button></header>{missions.length ? <ol>{missions.map(mission => <li key={mission.id}><span>{String(mission.chapter).padStart(2, "0")}</span><div><b>{mission.title}</b><small>{mission.progress}/{mission.target} · {mission.objective}</small><ProgressMeter value={mission.progress} max={mission.target}/></div></li>)}</ol> : <p className="daily-journal-empty">Your campaign journal is clear. Open the campaign when the next chapter is ready.</p>}</article>
    </section>
  </div>;
}
