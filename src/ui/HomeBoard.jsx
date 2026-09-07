import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../online/supabase.js';
import GameIcon from './GameIcon.jsx';

const cash = value => `$${Number(value || 0).toLocaleString()}`;
export function nextMove(core, operations, progression) {
  const status = core?.player?.status;
  if (status && status !== 'okay') return { page: status === 'jail' ? 'jail' : 'hospital', title: status === 'jail' ? 'Check your release' : 'Recover and regroup', text: 'Your current status limits some activities. Check your city record.', action: 'View status' };
  if (operations?.active) return { page: 'operations', title: operations.active.operationName, text: `${operations.active.districtName} · ${operations.active.stageTitle}`, action: 'Continue operation' };
  const mission = progression?.missions?.find(item => item.unlocked && !item.claimedAt);
  if (mission) return { page: 'missions', title: mission.title, text: `${mission.objective} · ${mission.progress}/${mission.target}`, action: mission.progress >= mission.target ? 'Review & claim reward' : 'Continue campaign' };
  return { page: 'hustles', title: 'Make your next move', text: 'Street Work offers repeatable work without an energy cost.', action: 'Explore Street Work' };
}

export default function HomeBoard({ p, go, onState, skyline }) {
  const [record, setRecord] = useState(null), [issue, setIssue] = useState(''), [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let alive = true;
    setBusy(true); setIssue('');
    Promise.allSettled([supabase.rpc('bw_get_state'), supabase.rpc('bw_operations_snapshot'), supabase.rpc('bw_progression_snapshot')]).then(results => {
      if (!alive) return;
      const values = results.map(result => result.status === 'fulfilled' && !result.value.error ? result.value.data : null);
      setRecord({ core: values[0], operations: values[1], progression: values[2] });
      if (values[0]?.player) onState(values[0].player);
      if (values.some(value => !value)) setIssue('Some records could not be refreshed. Your saved progress is safe.');
      setBusy(false);
    });
    return () => { alive = false; };
  }, [revision, onState]);
  const move = nextMove(record?.core, record?.operations, record?.progression);
  const recent = record?.core?.recent || [];
  return <div className="bw-home">
    <section className="bw-welcome">{skyline}<div><span className="bw-eyebrow">YOUR STORY. YOUR CITY.</span><h1>Welcome back,<br/><em>{p.name}.</em></h1><p>Build a name Blackwood remembers.</p></div><span className="bw-level">LEVEL <b>{p.level}</b></span></section>
    <section className="bw-next" aria-busy={busy}><div className="bw-next-heading"><span className="bw-eyebrow">YOUR NEXT MOVE</span><button className="bw-text-button" disabled={busy} onClick={refresh} aria-label="Refresh Home records">{busy ? 'Syncing…' : 'Refresh ↻'}</button></div><h2>{busy ? 'Opening your city record…' : move.title}</h2><p>{busy ? 'Checking your campaign and active operations.' : move.text}</p><button className="bw-primary" disabled={busy} onClick={() => go(move.page)}>{busy ? 'Checking progress…' : move.action}<span aria-hidden="true">→</span></button>{issue && <p className="bw-warning" role="status">{issue} Use Refresh to try again.</p>}</section>
    <section className="bw-shortcuts" aria-label="Quick activities">{[['crimes','Crimes',`${p.nerve} nerve`],['hustles','Street Work','No energy cost'],['inventory','Equipment','Prepare your loadout'],['work','Jobs','Build your career']].map(([id,label,detail]) => <button key={id} onClick={() => go(id)}><GameIcon name={id}/><b>{label}</b><small>{detail}</small><span aria-hidden="true">↗</span></button>)}</section>
    <div className="bw-home-lower"><section className="bw-ledger"><header><span className="bw-eyebrow">YOUR STANDING</span><button className="bw-text-button" onClick={() => go('dispatch')}>Open progress board →</button></header><dl>{[['On hand',cash(p.cash)],['Protected bank',cash(p.bank)],['Respect',p.respect],['Merits',p.merits]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="bw-secondary" onClick={() => go('factions')}>Build faction reputation →</button></section>
    <section className="bw-ledger"><header><span className="bw-eyebrow">RECENT ACTIVITY</span></header>{!record?.core ? <p>{busy ? 'Loading your activity…' : 'Reconnect to see your recent activity.'}</p> : !recent.length ? <p>Your story starts here. Completed actions will appear in this ledger.</p> : <ol className="bw-activity">{recent.slice(0,4).map(item => <li key={item.id}><span aria-hidden="true">◇</span><div><b>{item.summary}</b>{item.created_at && <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}</time>}</div></li>)}</ol>}</section></div>
  </div>;
}
