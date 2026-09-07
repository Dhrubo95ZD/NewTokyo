import { useState } from 'react';

const cash = value => `$${Number(value || 0).toLocaleString()}`;
export function crimeAvailability(crime, player) {
  if (player.status !== 'okay') return player.status === 'jail' ? 'Unavailable while jailed' : 'Unavailable while recovering';
  if (player.crime_skill < crime.skill_required) return `Requires crime skill ${crime.skill_required}`;
  if (player.nerve < crime.nerve_cost) return `Requires ${crime.nerve_cost} nerve`;
  return '';
}
export default function CrimeBoard({ data, busy, pendingCrime, result, onAttempt }) {
  const [filter, setFilter] = useState('all');
  const player = data.player;
  const crimes = data.crimes.filter(crime => filter === 'all' || !crimeAvailability(crime, player));
  return <div className="bw-crimes">
    <header className="bw-crime-summary"><div><span className="bw-eyebrow">YOUR EDGE</span><b>{player.nerve}<small> / {player.max_nerve} nerve</small></b></div><div><span className="bw-eyebrow">CRIME SKILL</span><b>{player.crime_skill}</b></div><p>Choose your risk. Build your record.<br/>Results and rewards are decided by the server.</p></header>
    <div className="bw-crime-toolbar"><div role="group" aria-label="Filter crimes">{[['all','All crimes'],['ready','Ready now']].map(([id,label]) => <button aria-pressed={filter === id} key={id} onClick={() => setFilter(id)}>{label}</button>)}</div><small>{crimes.length} opportunities</small></div>
    {!crimes.length && <div className="bw-empty"><h2>No crimes ready yet</h2><p>Check your nerve and current status, or use Play → Street Work for no-energy work.</p><button className="bw-secondary" onClick={() => setFilter('all')}>See all requirements</button></div>}
    <div className="bw-crime-list">{crimes.map(crime => {
      const reason = crimeAvailability(crime, player), pending = busy && pendingCrime === crime.id;
      const chance = Math.round(Math.min(96, Math.max(8, crime.base_chance + (player.crime_skill - crime.skill_required) * .7)));
      const risk = chance >= 80 ? 'Lower risk' : chance >= 55 ? 'Moderate risk' : 'High risk';
      const outcome = result?.crimeId === crime.id ? result : null;
      return <article className={`bw-crime-card ${reason ? 'is-locked' : ''}`} key={crime.id} aria-busy={pending}>
        <header><span className="bw-crime-number">{String(crime.sort_order).padStart(2,'0')}</span><div><span className="bw-eyebrow">{crime.category}</span><h2>{crime.name}</h2></div><span className={`bw-risk ${chance >= 80 ? 'low' : chance >= 55 ? 'medium' : 'high'}`}>{risk}</span></header>
        <p>{crime.description}</p><dl><div><dt>Possible take</dt><dd>{cash(crime.reward_min)}–{cash(crime.reward_max)}</dd></div><div><dt>Success estimate</dt><dd>{chance}%</dd></div><div><dt>Cost per attempt</dt><dd>{crime.nerve_cost} nerve</dd></div></dl>
        <footer><small id={`requirement-${crime.id}`}>{reason || 'Failure can lead to jail. Nerve is spent on every attempt.'}</small><button className="bw-primary" aria-describedby={`requirement-${crime.id}`} disabled={busy || !!reason} onClick={() => onAttempt(crime)}>{pending ? <><span className="bw-spinner"/> Attempting…</> : reason ? 'Not ready' : <>Attempt crime <span aria-hidden="true">→</span></>}</button></footer>
        {outcome && <div key={outcome.sequence} className={`bw-crime-result ${outcome.success ? 'success' : 'failure'}`} role="status"><b>{outcome.success ? `Success · +${cash(outcome.cash)}` : outcome.jailed ? 'Failed · Sent to jail' : 'Attempt failed'}</b><span>{outcome.success ? 'Your reward and progress have been recorded.' : 'No cash earned. Your city record has been updated.'}</span></div>}
      </article>;
    })}</div>
  </div>;
}
