import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DISTRICTS,
  META_UPGRADES,
  PERKS,
  abandonRun,
  buyUpgrade,
  choosePerk,
  finishRun,
  getIntent,
  metaStats,
  newGame,
  normalizeGame,
  resolveTurn,
  startRun,
  upgradeCost,
  useReboot,
} from "./core/gameEngine.js";
import "./new-tokyo.css";

const SAVE_KEY = "neotokyo-overhaul-v1";

function loadGame() {
  try { return normalizeGame(JSON.parse(localStorage.getItem(SAVE_KEY) || "null")); }
  catch { return newGame(); }
}

const pct = (value, max) => `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;

function Meter({ label, value, max, tone = "cyan" }) {
  return <div className={`meter ${tone}`}><span><b>{label}</b><i>{Math.ceil(value)} / {max}</i></span><div><em style={{ width: pct(value, max) }} /></div></div>;
}

function City({ game, onStart, onResume }) {
  return <section className="city-screen">
    <article className="hero-card">
      <div className="hero-copy"><small>NIGHT 01 // THE GRID IS HUNGRY</small><h1>Pick a target.<br /><span>Break the loop.</span></h1><p>A fast tactical run through Neo-Tokyo. Read enemy intent, build focus, and survive three escalating fights.</p>
        {game.run ? <button className="primary" onClick={onResume}>Resume active run <span>→</span></button> : <a href="#districts" className="primary">Choose a district <span>↓</span></a>}
      </div>
      <div className="hero-runner" role="img" aria-label="Neon runner"><img src="/assets/characters/runner-equipment-v3.webp" alt="" /></div>
      <div className="hero-stats"><span><b>{game.reputation}</b> reputation</span><span><b>{game.victories}</b> clears</span><span><b>{game.streak}</b> streak</span></div>
    </article>
    <header className="section-head" id="districts"><div><small>CONTRACT BOARD</small><h2>Where are we hitting?</h2></div><p>Every run takes about five minutes.</p></header>
    <div className="district-grid">
      {DISTRICTS.map((district) => {
        const locked = district.danger > Math.max(1, game.bestDistrict + 1);
        return <button key={district.id} className="district-card" style={{ "--district": district.color }} disabled={locked || Boolean(game.run)} onClick={() => onStart(district.id)}>
          <img src={district.image} alt="" /><span className="district-shade" />
          <span className="district-number">{district.number}</span><span className="district-copy"><small>{locked ? `REQUIRES DISTRICT ${district.number === "03" ? "02" : "01"} CLEAR` : `DANGER ${"◆".repeat(district.danger)}`}</small><b>{district.name}</b><em>{district.tagline}</em><strong>{locked ? "LOCKED" : game.run ? "RUN ACTIVE" : `${district.reward}+ CR`}</strong></span>
        </button>;
      })}
    </div>
  </section>;
}

function Combat({ game, onAction, onPerk, onReboot, onExit, onRetreat }) {
  const run = game.run;
  if (!run) return <section className="empty-state"><span>零</span><h2>No active contract</h2><p>Choose a district from the city map.</p><button className="primary" onClick={onExit}>Open contract board</button></section>;
  const district = DISTRICTS.find((entry) => entry.id === run.districtId);
  const intent = run.status === "combat" ? getIntent(run) : null;
  const canAct = run.status === "combat";
  return <section className="combat-screen" style={{ "--district": district.color }}>
    <header className="combat-head"><button className="text-button" onClick={onRetreat}>← Retreat</button><div><small>{district.name}</small><b>Encounter {Math.min(run.encounter + 1, district.enemies.length)} / {district.enemies.length}</b></div><span>{run.enemy?.boss ? "BOSS" : `TURN ${run.turn}`}</span></header>
    <div className="arena" style={{ backgroundImage: `linear-gradient(180deg,rgba(3,6,15,.08),rgba(3,6,15,.92)),url(${district.image})` }}>
      <div className="scanlines" />
      <article className="fighter player"><img src="/assets/characters/runner-equipment-v3.webp" alt="Your runner" /><span>RUNNER</span></article>
      <div className="versus"><i>VS</i>{intent && <div className={`intent ${intent.type}`}><small>NEXT MOVE</small><b>{intent.name}</b><span>{intent.detail}</span></div>}</div>
      <article className="fighter enemy"><img src={run.enemy.image} alt={run.enemy.name} /><span>{run.enemy.title}</span></article>
    </div>
    <div className="combat-panel">
      <div className="combatant-stats"><div><small>YOU</small><b>Runner</b><Meter label="Integrity" value={run.hp} max={run.maxHp} tone="pink" /></div><div className="enemy-stats"><small>{run.enemy.boss ? "DISTRICT BOSS" : "HOSTILE"}</small><b>{run.enemy.name}</b><Meter label="Integrity" value={run.enemy.hp} max={run.enemy.maxHp} /></div></div>
      <div className="focus-row"><span>FOCUS</span><div>{[1, 2, 3, 4, 5].map((dot) => <i key={dot} className={run.focus >= dot ? "on" : ""} />)}</div><em>Combo ×{run.combo}</em></div>
      <p className="battle-message" aria-live="polite">{run.message}</p>
      {canAct && <div className="action-grid">
        <button onClick={() => onAction("strike")}><kbd>1</kbd><span><b>Quick cut</b><small>Damage · +1 focus</small></span><strong>刃</strong></button>
        <button onClick={() => onAction("guard")}><kbd>2</kbd><span><b>Deflect</b><small>Block · +1 focus</small></span><strong>盾</strong></button>
        <button disabled={run.focus < 2} onClick={() => onAction("burst")}><kbd>3</kbd><span><b>Arc burst</b><small>Heavy · costs 2</small></span><strong>雷</strong></button>
        <button className="overdrive" disabled={run.focus < 5} onClick={() => onAction("overdrive")}><kbd>4</kbd><span><b>Overdrive</b><small>Devastate · repair</small></span><strong>極</strong></button>
      </div>}
      {run.status === "reward" && <div className="reward-panel"><header><small>FIELD UPGRADE</small><h2>Choose one. Keep moving.</h2></header><div>{PERKS.map((perk) => <button key={perk.id} onClick={() => onPerk(perk.id)}><i>{perk.icon}</i><span><b>{perk.name}</b><small>{perk.detail}</small></span></button>)}</div></div>}
      {run.status === "reboot" && <div className="result-panel danger"><small>SYSTEM FAILURE</small><h2>Emergency reboot available</h2><p>Once per run: return with 55% integrity and 3 focus.</p><button className="primary" onClick={onReboot}>Reboot now</button></div>}
      {run.status === "defeat" && <div className="result-panel danger"><small>RUN ENDED</small><h2>The city wins this round.</h2><p>Retreat, install permanent upgrades, and hit it again.</p><button className="primary" onClick={onRetreat}>Return to city</button></div>}
      {run.status === "complete" && <div className="result-panel complete"><small>DISTRICT CLEARED</small><h2>{run.payout} credits secured</h2><p>Your reputation is spreading. A harder district is now within reach.</p><button className="primary" onClick={onExit}>Bank payout</button></div>}
    </div>
  </section>;
}

function Workshop({ game, onBuy }) {
  const stats = metaStats(game);
  return <section className="workshop-screen"><header className="workshop-hero"><small>SAFEHOUSE // PERMANENT UPGRADES</small><h1>Build a runner<br />the city fears.</h1><p>Credits survive failed runs. Every upgrade has a clear combat effect—no loot clutter, no mystery math.</p></header>
    <div className="stat-ribbon"><span><small>BASE DAMAGE</small><b>{stats.power}</b></span><span><small>RESISTANCE</small><b>{stats.armor}</b></span><span><small>MAX INTEGRITY</small><b>{stats.maxHp}</b></span></div>
    <div className="upgrade-list">{META_UPGRADES.map((upgrade) => { const level = game.upgrades[upgrade.id]; const cost = upgradeCost(level); const capped = level >= 8; return <article key={upgrade.id}><i>{upgrade.icon}</i><div><small>LEVEL {level} / 8</small><h3>{upgrade.name}</h3><p>{upgrade.detail}</p><div className="level-pips">{Array.from({ length: 8 }, (_, index) => <span key={index} className={index < level ? "on" : ""} />)}</div></div><button disabled={capped || game.credits < cost || Boolean(game.run)} onClick={() => onBuy(upgrade.id)}>{capped ? "MAX" : `${cost} CR`}</button></article>; })}</div>
    {game.run && <p className="workshop-lock">Finish or abandon the active run before installing permanent upgrades.</p>}
  </section>;
}

export default function NewTokyoGame() {
  const [game, setGame] = useState(loadGame);
  const [screen, setScreen] = useState(game.run ? "combat" : "city");
  const [flash, setFlash] = useState(0);
  const stats = useMemo(() => metaStats(game), [game]);

  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }, [game]);
  const act = useCallback((action) => { setGame((current) => resolveTurn(current, action)); setFlash((value) => value + 1); }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (screen !== "combat" || event.repeat) return;
      const action = { "1": "strike", "2": "guard", "3": "burst", "4": "overdrive" }[event.key];
      if (action) act(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, screen]);

  const retreat = () => { if (confirm("Abandon this run? Cleared encounters still pay a few credits.")) { setGame(abandonRun); setScreen("city"); } };
  const bank = () => { setGame(finishRun); setScreen("city"); };
  return <div className={`new-tokyo ${flash % 2 ? "impact-a" : "impact-b"}`}>
    <header className="topbar"><button className="wordmark" onClick={() => setScreen("city")}><i>新</i><span><b>NEW TOKYO</b><small>UNDERWORLD</small></span></button><div className="wallet"><span><small>CREDITS</small><b>{game.credits.toLocaleString()}</b></span><span><small>REP</small><b>{game.reputation}</b></span></div></header>
    <main>
      {screen === "city" && <City game={game} onStart={(id) => { setGame((current) => startRun(current, id)); setScreen("combat"); }} onResume={() => setScreen("combat")} />}
      {screen === "combat" && <Combat game={game} onAction={act} onPerk={(id) => setGame((current) => choosePerk(current, id))} onReboot={() => setGame(useReboot)} onExit={bank} onRetreat={retreat} />}
      {screen === "workshop" && <Workshop game={game} stats={stats} onBuy={(id) => setGame((current) => buyUpgrade(current, id))} />}
    </main>
    <nav className="dock" aria-label="Game sections"><button className={screen === "city" ? "on" : ""} onClick={() => setScreen("city")}><i>都</i><span>City</span></button><button className={screen === "combat" ? "on" : ""} onClick={() => setScreen("combat")}><i>斬</i><span>{game.run ? "Active run" : "Run"}</span>{game.run && <em />}</button><button className={screen === "workshop" ? "on" : ""} onClick={() => setScreen("workshop")}><i>工</i><span>Workshop</span></button></nav>
  </div>;
}

