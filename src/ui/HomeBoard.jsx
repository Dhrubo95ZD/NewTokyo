import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../online/supabase.js';
import GameIcon from './GameIcon.jsx';

const cash = value => `$${Number(value || 0).toLocaleString()}`;
const districtStops = [
  ['operations', 'OLD QUARTER', 'Field Office', 'Run a multi-stage operation', 'operations'],
  ['hustles', 'THE NARROWS', 'Street Work', 'Work the late shift without energy', 'hustles'],
  ['market', 'OLD MARKET', 'Blackwood Exchange', 'Trade, list, and hunt for a deal', 'market'],
  ['inventory', 'SOUTHSIDE', 'Your loadout', 'Check what is ready for the night', 'inventory'],
];
export function nextMove(core, operations, progression, daily) {
  const status = core?.player?.status;
  if (status && status !== 'okay') return { page: status === 'jail' ? 'jail' : 'hospital', title: status === 'jail' ? 'Check your release' : 'Recover and regroup', text: 'Your current status limits some activities. Check your city record.', action: 'View status' };
  if (daily?.claimedToday === false) return { page: 'daily', title: 'Your daily bonus is ready', text: `${daily.streak?.current || 0} day streak · claim the next city reward`, action: 'Claim daily bonus' };
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
    Promise.allSettled([supabase.rpc('bw_get_state'), supabase.rpc('bw_operations_snapshot'), supabase.rpc('bw_progression_snapshot'), supabase.rpc('bw_daily_life_snapshot')]).then(results => {
      if (!alive) return;
      const values = results.map(result => result.status === 'fulfilled' && !result.value.error ? result.value.data : null);
      setRecord({ core: values[0], operations: values[1], progression: values[2], daily: values[3] });
      if (values[0]?.player) onState(values[0].player);
      if (values.slice(0, 3).some(value => !value)) setIssue('Some records could not be refreshed. Your saved progress is safe.');
      setBusy(false);
    });
    return () => { alive = false; };
  }, [revision, onState]);
  const move = nextMove(record?.core, record?.operations, record?.progression, record?.daily);
  const recent = record?.core?.recent || [];
  const active = record?.operations?.active;
  const claimable = record?.progression?.missions?.find(item => item.unlocked && !item.claimedAt && item.progress >= item.target);
  const status = record?.core?.player?.status;
  return <div className="bw-home">
    <section className="bw-welcome">{skyline}<div><span className="bw-eyebrow">YOUR STORY. YOUR CITY.</span><h1>Welcome back,<br/><em>{p.name}.</em></h1><p>Build a name Blackwood remembers.</p></div><span className="bw-level">LEVEL <b>{p.level}</b></span></section>
    <section className="bw-next" aria-busy={busy}><div className="bw-next-heading"><span className="bw-eyebrow">YOUR NEXT MOVE</span><button className="bw-text-button" disabled={busy} onClick={refresh} aria-label="Refresh Home records">{busy ? 'Syncing…' : 'Refresh ↻'}</button></div><h2>{busy ? 'Opening your city record…' : move.title}</h2><p>{busy ? 'Checking your campaign and active operations.' : move.text}</p><button className="bw-primary" disabled={busy} onClick={() => go(move.page)}>{busy ? 'Checking progress…' : move.action}<span aria-hidden="true">→</span></button>{issue && <p className="bw-warning" role="status">{issue} Use Refresh to try again.</p>}</section>
    <section className="bw-supporter-entry" aria-label="Real-money Supporter Store">
      <span className="bw-supporter-entry-mark"><GameIcon name="store" size={27}/></span>
      <div className="bw-supporter-entry-copy"><span className="bw-eyebrow">CASH SHOP · GOOGLE PLAY</span><h2>Supporter Store</h2><p>Optional character-card cosmetics and Moretti Monthly. No paid power, city cash, loot or Arcade Dollars.</p><small>Prices are shown by Google Play · receipts are verified by the city server</small></div>
      <button className="bw-primary" onClick={() => go('store')}>Open cash shop <span aria-hidden="true">→</span></button>
    </section>
    {record && <section className="bw-priority-grid" aria-label="Priority records">
      {record.daily?.claimedToday === false && <button className="bw-priority-card reward" onClick={() => go('daily')}><span className="bw-eyebrow">DAILY BONUS READY</span><b>Keep your streak alive</b><small>{record.daily.streak?.current || 0} day streak · today’s reward is waiting</small><em>Open Daily Life →</em></button>}
      {active && <button className="bw-priority-card active" onClick={() => go('operations')}><span className="bw-eyebrow">ACTIVE OPERATION</span><b>{active.operationName}</b><small>{active.districtName} · {active.stageTitle}</small><em>Continue dossier →</em></button>}
      {claimable && <button className="bw-priority-card reward" onClick={() => go('missions')}><span className="bw-eyebrow">REWARD READY</span><b>{claimable.title}</b><small>{claimable.cash ? `${cash(claimable.cash)} · ` : ''}{claimable.xp || 0} XP ready to claim</small><em>Claim chapter reward →</em></button>}
      {!active && !claimable && status && status !== 'okay' && <button className="bw-priority-card caution" onClick={() => go(status === 'jail' ? 'jail' : 'hospital')}><span className="bw-eyebrow">CITY STATUS</span><b>{status === 'jail' ? 'You are in custody' : 'You are recovering'}</b><small>Some activities are temporarily unavailable.</small><em>Review status →</em></button>}
    </section>}
    <section className="bw-scene-strip" aria-label="District board">
      <header><div><span className="bw-eyebrow">BLACKWOOD AFTER DARK</span><h2>Choose your ground</h2></div><span className="bw-scene-status"><i aria-hidden="true"/> NIGHT SHIFT · OPEN</span></header>
      <div className="bw-scene-grid">{districtStops.map(([id, district, title, detail, icon], index) => <button key={id} onClick={() => go(id)} style={{'--scene-delay': `${index * 45}ms`}}><span className="bw-scene-mark"><GameIcon name={icon}/></span><span className="bw-scene-copy"><small>{district}</small><b>{title}</b><em>{detail}</em></span><strong aria-hidden="true">↗</strong></button>)}</div>
    </section>
    <header className="bw-shortcut-header"><span className="bw-eyebrow">QUICK ACTIONS</span><button className="bw-text-button" onClick={() => go('city')}>View city →</button></header>
    <section className="bw-shortcuts" aria-label="Quick activities">{[['crimes','Crimes',`${p.nerve} nerve`],['hustles','Street Work','No energy cost'],['inventory','Equipment','Prepare your loadout'],['work','Jobs','Build your career']].map(([id,label,detail]) => <button key={id} onClick={() => go(id)}><GameIcon name={id}/><b>{label}</b><small>{detail}</small><span aria-hidden="true">↗</span></button>)}</section>
    <div className="bw-home-lower"><section className="bw-ledger"><header><span className="bw-eyebrow">YOUR STANDING</span><button className="bw-text-button" onClick={() => go('dispatch')}>Open progress board →</button></header><dl>{[['On hand',cash(p.cash)],['Protected bank',cash(p.bank)],['Respect',p.respect],['Merits',p.merits]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="bw-secondary" onClick={() => go('factions')}>Build faction reputation →</button></section>
    <section className="bw-ledger"><header><span className="bw-eyebrow">RECENT ACTIVITY</span></header>{!record?.core ? <p>{busy ? 'Loading your activity…' : 'Reconnect to see your recent activity.'}</p> : !recent.length ? <p>Your story starts here. Completed actions will appear in this ledger.</p> : <ol className="bw-activity">{recent.slice(0,4).map(item => <li key={item.id}><span aria-hidden="true">◇</span><div><b>{item.summary}</b>{item.created_at && <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}</time>}</div></li>)}</ol>}</section></div>
    {record?.daily && <section className="bw-daily-preview" aria-label="Daily Life preview"><header><div><span className="bw-eyebrow">DAILY LIFE</span><h2>{record.daily.claimedToday ? `Day ${record.daily.streak?.current || 0} is logged.` : 'Your daily bonus is waiting.'}</h2><p>{record.daily.claimedToday ? `${record.daily.objectives?.filter(item => item.claimedAt).length || 0}/${record.daily.objectives?.length || 0} objectives claimed today.` : 'Claim your reward, then choose a few objectives for this session.'}</p></div><button className="bw-primary" onClick={() => go('daily')}>{record.daily.claimedToday ? 'Open Daily Life' : 'Claim daily bonus'}<span aria-hidden="true">→</span></button></header></section>}
  </div>;
}
