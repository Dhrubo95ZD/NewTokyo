import { useEffect, useMemo, useRef, useState } from "react";
import { Brawl } from "../NeoTokyoUnderworld.jsx";
import { operationEncounterProfile } from "./operationEncounterRules.js";
import "./operation-encounter.css";

export { operationEncounterProfile };

function ShooterEncounter({ dungeon, profile, onEnd }) {
  const goal = Math.min(30, 10 + Math.ceil(Number(dungeon.level || 1) / 6));
  const [kills, setKills] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 9));
  const [armor, setArmor] = useState(1);
  const ended = useRef(false);

  const finish = (win) => {
    if (ended.current) return;
    ended.current = true;
    onEnd({ win });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setIntegrity((value) => {
        const next = Math.max(0, value - Math.min(18, 7 + dungeon.level / 16));
        if (next <= 0) queueMicrotask(() => finish(false));
        return next;
      });
      setTarget(Math.floor(Math.random() * 9));
      setArmor(dungeon.level >= 30 && Math.random() > .58 ? 2 : 1);
    }, Math.max(720, 1450 - dungeon.level * 5));
    return () => clearInterval(interval);
  }, [dungeon.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = (index) => {
    if (ended.current) return;
    if (index !== target) {
      setIntegrity((value) => Math.max(0, value - 4));
      return;
    }
    if (armor > 1) { setArmor(1); return; }
    const next = kills + 1;
    setKills(next);
    if (next >= goal) { finish(true); return; }
    setTarget(Math.floor(Math.random() * 9));
    setArmor(dungeon.level >= 30 && Math.random() > .62 ? 2 : 1);
  };

  return <div className="shooter-encounter" style={{ "--enemy": profile.color }}>
    <div className="encounter-meter"><span>SUIT INTEGRITY <b>{Math.round(integrity)}%</b></span><i><em style={{ width: `${integrity}%` }}/></i><span>HOSTILES <b>{kills}/{goal}</b></span></div>
    <div className="target-grid" aria-label="Hostile target field">{Array.from({ length: 9 }, (_, index) => <button key={index} className={target === index ? `hostile armor-${armor}` : "scan-cell"} onPointerDown={() => shoot(index)} aria-label={target === index ? `Fire at ${profile.family}` : "Empty scan sector"}>{target === index ? <><i>{profile.glyph}</i><b>{armor > 1 ? "ARMORED" : profile.family}</b><span>{armor > 1 ? "HIT TWICE" : "FIRE"}</span></> : <span>SCAN</span>}</button>)}</div>
    <p>Tap illuminated hostiles. Armored units require two hits; missed shots expose your position.</p>
  </div>;
}

function PuzzleEncounter({ dungeon, profile, onEnd }) {
  const size = dungeon.level >= 60 ? 6 : dungeon.level >= 20 ? 5 : 4;
  const roundsNeeded = dungeon.level >= 80 ? 5 : dungeon.level >= 30 ? 4 : 3;
  const buildSequence = () => Array.from({ length: size }, () => Math.floor(Math.random() * 6));
  const [sequence, setSequence] = useState(buildSequence);
  const [cursor, setCursor] = useState(0);
  const [round, setRound] = useState(1);
  const [integrity, setIntegrity] = useState(100);
  const [revealing, setRevealing] = useState(true);
  const ended = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => setRevealing(false), Math.max(1400, 2700 - dungeon.level * 8));
    return () => clearTimeout(timeout);
  }, [sequence, dungeon.level]);

  const finish = (win) => {
    if (ended.current) return;
    ended.current = true;
    onEnd({ win });
  };

  const choose = (node) => {
    if (revealing || ended.current) return;
    if (sequence[cursor] !== node) {
      const next = integrity - Math.min(34, 18 + dungeon.level / 10);
      setIntegrity(Math.max(0, next)); setCursor(0); setRevealing(true); setSequence(buildSequence());
      if (next <= 0) finish(false);
      return;
    }
    if (cursor + 1 < sequence.length) { setCursor(cursor + 1); return; }
    if (round >= roundsNeeded) { finish(true); return; }
    setRound(round + 1); setCursor(0); setRevealing(true); setSequence(buildSequence());
  };

  return <div className="puzzle-encounter" style={{ "--enemy": profile.color }}>
    <div className="encounter-meter"><span>FIREWALL <b>{Math.round(integrity)}%</b></span><i><em style={{ width: `${integrity}%` }}/></i><span>BREACH <b>{round}/{roundsNeeded}</b></span></div>
    <div className="sequence-readout"><small>{revealing ? "MEMORIZE SIGNAL" : "REPEAT SIGNAL"}</small><div>{sequence.map((node, index) => <i key={index} className={revealing || index < cursor ? "shown" : ""}>{revealing || index < cursor ? node + 1 : "•"}</i>)}</div></div>
    <div className="circuit-nodes">{Array.from({ length: 6 }, (_, node) => <button key={node} disabled={revealing} onClick={() => choose(node)}><i>{node + 1}</i><span>NODE</span></button>)}</div>
    <p>A wrong node resets the sequence and damages firewall integrity.</p>
  </div>;
}

export default function OperationEncounter({ dungeon, stats, techniques, profile: runnerProfile, runKey, result, busy, onEnd, onRetry, onExit }) {
  const baseProfile = useMemo(() => operationEncounterProfile(dungeon), [dungeon]);
  const profile = baseProfile.mode === "hybrid"
    ? { ...baseProfile, mode: ["melee", "shooter", "puzzle"][Math.abs(String(runKey || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 3] }
    : baseProfile;
  const enemy = { id: `operation-${dungeon.id}`, name: `${profile.family} · ${dungeon.boss}`, kanji: profile.glyph, lvl: dungeon.level, hp: Math.max(70, dungeon.cp / 8), atk: 12 + dungeon.level * .8, boss: dungeon.level >= 50 };

  return <main className="operation-encounter" style={{ "--enemy": profile.color }}>
    <header><button onClick={onExit} aria-label="Exit operation">‹</button><div><small>{profile.label} // LV {dungeon.level}</small><h1>{dungeon.name}</h1><p>{profile.family} · {profile.detail}</p></div><span><small>DIFFICULTY</small><b>{dungeon.cp.toLocaleString()} CP</b></span></header>
    <section className={`encounter-playfield mode-${profile.mode}`}>
      {profile.mode === "melee" && <Brawl key={runKey} techniques={techniques} stats={stats} enemy={enemy} profile={runnerProfile} onEnd={onEnd}/>}
      {profile.mode === "shooter" && <ShooterEncounter key={runKey} dungeon={dungeon} profile={profile} onEnd={onEnd}/>} 
      {profile.mode === "puzzle" && <PuzzleEncounter key={runKey} dungeon={dungeon} profile={profile} onEnd={onEnd}/>} 
    </section>
    <footer><span><i/>LIVE OPERATION</span><b>{profile.mode === "melee" ? "Move · attack · dash · techniques" : profile.mode === "shooter" ? "Acquire · fire · suppress" : "Observe · remember · breach"}</b></footer>
    {result && <div className={`encounter-result ${result}`} role="dialog" aria-modal="true"><small>{result === "victory" ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{result === "victory" ? "Extraction secured" : "Runner disabled"}</h2><p>{result === "victory" ? "Rewards are secured. Return to Battle to inspect the drop." : "The encounter is over—not frozen. Retry immediately or return to Battle and improve your build."}</p><div>{result === "defeat" && <button disabled={busy} onClick={onRetry}>{busy ? "Reconnecting…" : "Retry operation"}</button>}<button className="secondary" onClick={onExit}>Return to Battle</button></div></div>}
  </main>;
}
