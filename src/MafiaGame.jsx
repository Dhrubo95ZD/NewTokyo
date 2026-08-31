import { useCallback, useEffect, useState } from "react";
import { CricketGameV2, NeonReflex, CircuitMemory } from "./arcade/ArcadeGames.jsx";
import TradingTerminal from "./trading/TradingTerminal.jsx";
import CommunityHub from "./online/CommunityHub.jsx";
import CityCoreHub from "./online/CityCoreHub.jsx";
import GuidedTutorial from "./tutorial/GuidedTutorial.jsx";

const SAVE_KEY = "blackwood-city-save-v1";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const money = (v) => `$${Math.floor(v).toLocaleString()}`;
const xpNeed = (level) => 100 + level * 65;

export const INITIAL = {
  name: "New Associate", title: "Associate", level: 1, xp: 0, cash: 2500, bank: 0,
  energy: 100, nerve: 20, health: 500, happy: 250, maxEnergy: 100, maxNerve: 20, maxHealth: 500, maxHappy: 250,
  strength: 10, defense: 10, speed: 10, dexterity: 10, crimeSkill: 1, respect: 0, merits: 0, tutorialStep: 0, tutorialDone: false,
  job: "Dock Hand", jobPoints: 0, jailUntil: 0, inventory: ["Brass Knuckles", "Tailored Vest", "First Aid Kit", "Bottle of Bourbon"],
  log: [
    { text: "Your Blackwood City record was opened.", tone: "good" },
    { text: "New player protection lasts for 24 hours.", tone: "warn" },
    { text: "Complete crimes and missions to build your name.", tone: "plain" },
  ],
};

const NAV = [["home", "Overview", "◆"], ["crimes", "Crimes", "♠"], ["combat", "Attack", "†"], ["gym", "Gym", "▲"], ["work", "Jobs", "▣"], ["missions", "Missions", "✓"], ["city", "City", "●"], ["shop", "Shops", "▦"], ["bank", "Bank", "$"], ["hospital", "Hospital", "+"], ["jail", "Jail", "▥"], ["property", "Properties", "⌂"], ["family", "Family", "♛"], ["chat", "World Chat", "◉"], ["players", "Players", "◎"], ["social", "Contacts", "◇"], ["mail", "Messages", "✉"], ["forums", "Forums", "◌"], ["rankings", "Rankings", "★"], ["awards", "Awards", "✦"], ["inventory", "Inventory", "▤"], ["arcade", "Arcade", "♣"]];
const PLACES = [
  ["market", "The Exchange", "TRADING FLOOR", "Trade the gold market through the family's private desk.", "$"],
  ["arcade", "Rossi's Arcade", "GAMES & WAGERS", "Cricket, reflex and memory games behind the old pool hall.", "♣"],
  ["hospital", "St. Mercy Hospital", "MEDICAL", "Recover health and see who has been admitted.", "+"],
  ["bank", "Federal Trust", "FINANCE", "Keep clean money safe and review your holdings.", "▥"],
  ["dealer", "Southside Arms", "EQUIPMENT", "Weapons, armor and supplies. Cash only.", "†"],
  ["estate", "Moretti Estate", "PROPERTY", "Your home raises happiness and protects your holdings.", "⌂"],
];

function loadGame() { try { return { ...INITIAL, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") }; } catch { return INITIAL; } }
function Resource({ label, value, max, tone, icon }) { return <div className={`resource ${tone}`}><div><span><i>{icon}</i>{label}</span><b>{Math.floor(value)} <em>/ {max}</em></b></div><figure><i style={{ width: `${clamp(value / max * 100, 0, 100)}%` }} /></figure></div>; }
function Panel({ title, eyebrow, action, children, className = "" }) { return <section className={`panel ${className}`}><header><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>{action}</header>{children}</section>; }
function PageHead({ eyebrow, title, text, children }) { return <div className="page-head"><div><small>{eyebrow}</small><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</div>; }

function Overview({ p, go }) {
  const goals = [["Earn $75,000 in cash", p.cash, 75000], ["Raise crime skill to 20", p.crimeSkill, 20], ["Train any stat above 125", Math.max(p.strength, p.defense, p.speed, p.dexterity), 125]];
  return <><PageHead eyebrow="BLACKWOOD CITY" title={<>Good evening, <em>{p.name}.</em></>} text="The city remembers who shows up. Make today count."><button className="primary" onClick={() => go("crimes")}>Find work <b>→</b></button></PageHead>
    <div className="overview-grid"><Panel title="City business" eyebrow="WHAT NEEDS ATTENTION"><button className="feature-order" onClick={() => go("family")}><i>M</i><span><small>NEW FAMILY ORDER</small><b>The Harbor Collection</b><em>Don Salvatore wants the docks secured before midnight.</em></span><strong>›</strong></button><div className="quick-grid">{[["crimes", "♠", "Crimes", `${p.nerve} nerve ready`], ["gym", "▲", "Train", `${p.energy} energy ready`], ["work", "▣", "Work", "Shift available"], ["city", "●", "City", "12 locations open"]].map(x => <button key={x[0]} onClick={() => go(x[0])}><i>{x[1]}</i><span><b>{x[2]}</b><small>{x[3]}</small></span><em>›</em></button>)}</div></Panel>
      <Panel title="Your standing" eyebrow="LIVE PROFILE" className="standing"><button className="rank" onClick={() => go("rankings")}><span><b>VIEW</b><small>CITY RANKINGS</small></span></button><dl>{[["Family respect", p.respect], ["Net worth", money(p.cash + p.bank)], ["Player level", p.level], ["Merit points", p.merits]].map(x => <div key={x[0]}><dt>{x[0]}</dt><dd>{x[1]}</dd></div>)}</dl></Panel></div>
    <div className="lower-grid"><Panel title="Long game" eyebrow="CURRENT GOALS"><div className="goals">{goals.map(([label, value, max]) => <div key={label}><span><b>{label}</b><em>{Math.min(value, max).toFixed(0)} / {max}</em></span><figure><i style={{ width: `${clamp(value / max * 100, 0, 100)}%` }} /></figure></div>)}</div></Panel><Panel title="Word on the street" eyebrow="RECENT ACTIVITY"><div className="feed">{p.log.slice(0, 3).map((x, i) => <div className={x.tone} key={i}><i /><p>{x.text}<small>{i ? `${i} hour${i > 1 ? "s" : ""} ago` : "8 minutes ago"}</small></p></div>)}</div></Panel></div></>;
}

function City({ go, market }) { return <><PageHead eyebrow="BLACKWOOD DIRECTORY" title="The City" text="Every block has an opportunity, if you know which door to knock on." /><div className="city-grid">{PLACES.map(([id, name, kicker, desc, icon]) => <button key={id} onClick={() => id === "market" ? market() : id === "arcade" ? go("arcade") : go({ hospital: "hospital", bank: "bank", dealer: "shop", estate: "property" }[id] || "city")}><i>{icon}</i><span><small>{kicker}</small><b>{name}</b><em>{desc}</em></span><strong>›</strong></button>)}</div></>; }

function Arcade({ p, finish }) {
  const [game, setGame] = useState(null); const [bet, setBet] = useState(250); const done = result => { finish(result.reward ?? Math.floor(bet * (result.mult || 0))); setGame(null); };
  if (game) return <><PageHead eyebrow="ROSSI'S BACK ROOM" title={game === "cricket" ? "Street Cricket" : game === "reflex" ? "Quick Hands" : "The Memory Table"}><button className="secondary" onClick={() => setGame(null)}>Leave table</button></PageHead><div className="arcade-stage">{game === "cricket" ? <CricketGameV2 bet={bet} onEnd={done} /> : game === "reflex" ? <NeonReflex onFinish={done} /> : <CircuitMemory onFinish={done} />}</div></>;
  return <><PageHead eyebrow="GAMES OF SKILL & CHANCE" title="Rossi's Arcade" text="Upstairs is for families. The serious games are behind the green door." /><div className="bet"><span><small>YOUR STAKE</small><b>{money(bet)}</b></span><input type="range" min="50" max={Math.min(2500, p.cash)} step="50" value={bet} onChange={e => setBet(Number(e.target.value))} /><em>Wallet: {money(p.cash)}</em></div><div className="arcade-menu">{[["cricket", "Street Cricket", "Twelve balls. Three wickets. Read the pitch and swing."], ["reflex", "Quick Hands", "Twenty signals. The window gets shorter every round."], ["memory", "The Memory Table", "Watch the sequence. Repeat it clean. Eight rounds to win."]].map(([id, name, desc], i) => <button key={id} onClick={() => setGame(id)}><i>0{i + 1}</i><span><small>ROSSI'S HOUSE GAME</small><b>{name}</b><p>{desc}</p><em>Sit down →</em></span></button>)}</div></>;
}

export default function MafiaGame({ initialPlayer = null, character = null, user = null, onPlayerChange = null, onSignOut = null }) {
  const [p, setP] = useState(() => initialPlayer || loadGame()), [page, setPage] = useState("home"), [notice, setNotice] = useState(null), [market, setMarket] = useState(false), [menu, setMenu] = useState(false), [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); onPlayerChange?.(p); }, [p, onPlayerChange]);
  const flash = (text, tone = "good") => { setNotice({ text, tone }); setTimeout(() => setNotice(null), 3200); };
  const finish = reward => setP(x => { flash(reward ? `The house pays you ${money(reward)}.` : "The house keeps the stake.", reward ? "good" : "bad"); return { ...x, cash: x.cash + reward }; });
  const syncWallet = useCallback(cash => setP(x => ({ ...x, cash })), []);
  const syncCore = useCallback(core => core && setP(x => ({ ...x, level: core.level, xp: core.xp, cash: core.cash, bank: core.bank, energy: core.energy, maxEnergy: core.max_energy, nerve: core.nerve, maxNerve: core.max_nerve, health: core.health, maxHealth: core.max_health, happy: core.happy, maxHappy: core.max_happy, strength: Number(core.strength), defense: Number(core.defense), speed: Number(core.speed), dexterity: Number(core.dexterity), crimeSkill: core.crime_skill, respect: core.respect, merits: core.merits, jobPoints: core.job_points, tutorialStep: core.tutorial_step ?? x.tutorialStep, tutorialDone: core.tutorial_done ?? x.tutorialDone })), []);
  const serverPages = ["crimes", "combat", "gym", "work", "missions", "shop", "bank", "hospital", "jail", "property", "social", "mail", "forums", "awards", "inventory"];
  const content = serverPages.includes(page) ? <CityCoreHub initialTab={page} user={user} onState={syncCore} /> : { home: <Overview p={p} go={setPage} />, city: <City go={setPage} market={() => setMarket(true)} />, family: <CommunityHub user={user} initialTab="families" />, chat: <CommunityHub user={user} initialTab="chat" />, players: <CommunityHub user={user} initialTab="players" />, rankings: <CommunityHub user={user} initialTab="rankings" />, arcade: <Arcade p={p} finish={finish} /> }[page];
  const initials = (character?.codename || p.name).split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
  return <div className="game-shell"><header className="topbar"><button className="hamb" onClick={() => setMenu(!menu)} aria-label="Open navigation">☰</button><button className="brand" onClick={() => setPage("home")}><i>M</i><span><b>MORETTI</b><small>BLACKWOOD CITY</small></span></button><div className="resources" data-tutorial="resources"><Resource label="Energy" value={p.energy} max={p.maxEnergy} tone="energy" icon="⚡" /><Resource label="Nerve" value={p.nerve} max={p.maxNerve} tone="nerve" icon="♦" /><Resource label="Health" value={p.health} max={p.maxHealth} tone="health" icon="+" /><Resource label="Happy" value={p.happy} max={p.maxHappy} tone="happy" icon="♥" /></div><button className="cash"><small>ON HAND</small><b>{money(p.cash)}</b></button><button className="avatar" onClick={() => setAccountOpen(!accountOpen)} aria-label="Account menu">{initials}</button>{accountOpen && <div className="account-menu"><small>SIGNED IN</small><b>{character?.codename || p.name}</b><em>{user?.email}</em><button onClick={onSignOut}>Sign out</button></div>}</header>
    <aside className={`sidebar ${menu ? "open" : ""}`}><div className="profile"><i>VM<span>{p.level}</span></i><div><b>{p.name}</b><small>{p.title}</small><figure><i style={{ width: `${p.xp / xpNeed(p.level) * 100}%` }} /></figure><em>{p.xp} / {xpNeed(p.level)} XP</em></div></div><nav>{NAV.map(([id, label, icon]) => <button data-page={id} className={page === id ? "active" : ""} key={id} onClick={() => { setPage(id); setMenu(false); }}><i>{icon}</i>{label}</button>)}</nav><button className="market-link" onClick={() => setMarket(true)}><i>$</i><span><b>The Exchange</b><small>Trading floor open</small></span><em>›</em></button><blockquote>“Keep your friends close. Keep your ledger closer.”<small>— Don Salvatore</small></blockquote></aside>
    <main>{content}</main>{notice && <div className={`toast ${notice.tone}`}><i>{notice.tone === "bad" ? "!" : "✓"}</i>{notice.text}</div>}<GuidedTutorial step={p.tutorialStep} done={p.tutorialDone} onNavigate={next => { setPage(next); setMenu(false); }} onState={syncCore}/><TradingTerminal open={market} balance={p.cash} onClose={() => setMarket(false)} onWalletChange={syncWallet} /></div>;
}
