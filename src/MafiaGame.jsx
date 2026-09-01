import { useCallback, useEffect, useRef, useState } from "react";
import CommunityHub from "./online/CommunityHub.jsx";
import CityCoreHub from "./online/CityCoreHub.jsx";
import GuidedTutorial from "./tutorial/GuidedTutorial.jsx";
import CasinoHub from "./casino/CasinoHub.jsx";
import EconomyHub from "./economy/EconomyHub.jsx";
import AdviserPanel from "./adviser/AdviserPanel.jsx";
import GameIcon from "./ui/GameIcon.jsx";
import SafetyHub from "./safety/SafetyHub.jsx";

const SAVE_KEY = "blackwood-city-save-v1";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const money = (v) => `$${Math.floor(v).toLocaleString()}`;
const xpNeed = (level) => 100 + level * 65;

export const INITIAL = {
  name: "New Associate", title: "Associate", level: 1, xp: 0, cash: 2500, bank: 0,
  energy: 100, nerve: 20, health: 500, happy: 250, maxEnergy: 100, maxNerve: 20, maxHealth: 500, maxHappy: 250,
  strength: 10, defense: 10, speed: 10, dexterity: 10, crimeSkill: 1, respect: 0, merits: 0, tutorialStep: 0, tutorialDone: false,
  job: "Dock Hand", jobPoints: 0, jailUntil: 0, inventory: ["Brass Knuckles", "Tailored Vest", "First Aid Kit", "Blackwood Malt Tonic"],
  log: [
    { text: "Your Blackwood City record was opened.", tone: "good" },
    { text: "New player protection lasts for 24 hours.", tone: "warn" },
    { text: "Complete crimes and missions to build your name.", tone: "plain" },
  ],
};

const NAV = [["home", "Overview"], ["crimes", "Crimes"], ["hustles", "Street Work"], ["combat", "Attack"], ["gym", "Gym"], ["work", "Jobs"], ["missions", "Missions"], ["economy", "Economy"], ["arcade", "Casino"], ["city", "City"], ["catalogue", "Item Catalogue"], ["shop", "Shops"], ["market", "Player Market"], ["bank", "Bank"], ["hospital", "Hospital"], ["jail", "Jail"], ["property", "Properties"], ["family", "Family"], ["chat", "World Chat"], ["players", "Players"], ["social", "Contacts"], ["mail", "Messages"], ["forums", "Forums"], ["rankings", "Rankings"], ["awards", "Awards"], ["inventory", "Inventory"], ["safety", "Help & Safety"]];
const PLACES = [
  ["economy", "Federal Trust FX", "TRADING FLOOR", "Live markets and banking careers.", "economy", "Financial Ward", 65, 18],
  ["arcade", "Rossi's Casino", "GAMES & WAGERS", "Blackjack, slots and European roulette.", "arcade", "Velvet Row", 79, 43],
  ["hustles", "Street Work", "OPEN ALL NIGHT", "No-energy work, mastery and hidden caches.", "hustles", "The Narrows", 44, 53],
  ["market", "Blackwood Exchange", "PLAYER MARKET", "Equipment listed by real players.", "market", "Old Market", 56, 72],
  ["catalogue", "The Collection", "ITEM ARCHIVE", "Every item, stat and verified drop chance.", "catalogue", "Museum Row", 68, 67],
  ["hospital", "St. Mercy Hospital", "MEDICAL", "Recover and review city admissions.", "hospital", "Northside", 30, 20],
  ["bank", "Federal Trust", "FINANCE", "Protect cash and manage holdings.", "bank", "Financial Ward", 48, 27],
  ["shop", "Southside Arms", "EQUIPMENT", "Weapons, armour and supplies.", "shop", "Southside", 25, 70],
  ["property", "Moretti Estate", "PROPERTY", "Residences, happiness and vaults.", "property", "The Heights", 18, 42],
];
const MOBILE_NAV = [["home","Home"],["city","City"],["combat","Combat"],["market","Market"]];

function loadGame() { try { return { ...INITIAL, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") }; } catch { return INITIAL; } }
function AnimatedNumber({ value, format = value => Math.floor(value).toLocaleString() }) {
  const previous = useRef(Number(value || 0));
  const [shown,setShown] = useState(previous.current);
  useEffect(()=>{
    const next=Number(value||0), start=previous.current; previous.current=next;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(next); return; }
    const began=performance.now(), duration=420; let frame;
    const tick=now=>{const progress=Math.min(1,(now-began)/duration);const eased=1-Math.pow(1-progress,3);setShown(start+(next-start)*eased);if(progress<1)frame=requestAnimationFrame(tick)};
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  },[value]);
  return format(shown);
}
function Resource({ label, value, max, tone, icon }) { return <div className={`resource ${tone}`}><div><span><i>{icon}</i>{label}</span><b><AnimatedNumber value={value}/> <em>/ {max}</em></b></div><figure><i style={{ width: `${clamp(value / max * 100, 0, 100)}%` }} /></figure></div>; }
function Panel({ title, eyebrow, action, children, className = "" }) { return <section className={`panel ${className}`}><header><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>{action}</header>{children}</section>; }
function PageHead({ eyebrow, title, text, children }) { return <div className="page-head"><div><small>{eyebrow}</small><h1>{title}</h1>{text && <p>{text}</p>}<i className="deco-rule"/></div>{children}</div>; }

function Skyline() { return <svg className="blackwood-skyline" viewBox="0 0 900 250" role="img" aria-label="Blackwood City skyline"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17120f"/><stop offset="1" stopColor="#5b3928"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3"/></filter></defs><rect width="900" height="250" fill="url(#sky)"/><circle cx="735" cy="54" r="29" fill="#e8cda5" opacity=".88"/><circle cx="735" cy="54" r="42" fill="#e8cda5" opacity=".12" filter="url(#glow)"/><path d="M0 217V168h54v-34h51v54h36v-92h61v43h32v-72h70v126h46v-58h58v30h37V91h72v102h47v-44h55v67h45V112h64v40h46v64h64v34H0z" fill="#100e0c"/><path d="M468 91V50h10V28h8v22h10v41" fill="#100e0c"/><g fill="#d59b5d" opacity=".58">{[[67,151],[84,151],[159,116],[181,116],[256,86],[279,86],[367,151],[391,151],[467,111],[490,111],[532,119],[550,119],[673,134],[697,134],[795,146],[815,146]].map(([x,y])=><rect key={x} x={x} y={y} width="7" height="11"/>)}</g><path d="M0 220h900" stroke="#d2a06e" strokeWidth="2" opacity=".45"/></svg>; }

function Overview({ p, go }) {
  const goals = [["Earn $75,000 in cash", p.cash, 75000], ["Raise crime skill to 20", p.crimeSkill, 20], ["Train any stat above 125", Math.max(p.strength, p.defense, p.speed, p.dexterity), 125]];
  return <><section className="living-hero"><Skyline/><div className="living-hero-copy"><small>BLACKWOOD CITY · LIVE</small><h1>Good evening, <em>{p.name}.</em></h1><p>The city remembers who shows up. Make today count.</p><button className="primary" onClick={() => go("hustles")}>Keep earning <b>→</b></button></div><div className="city-weather"><i/><span><small>CITY STATUS</small><b>Business is moving</b></span></div></section>
    <div className="overview-grid"><Panel title="City business" eyebrow="WHAT NEEDS ATTENTION"><button className="feature-order" onClick={() => go("family")}><i>M</i><span><small>NEW FAMILY ORDER</small><b>The Harbor Collection</b><em>Don Salvatore wants the docks secured before midnight.</em></span><strong>›</strong></button><div className="quick-grid">{[["hustles", "↻", "Street Work", "No energy required"], ["crimes", "♠", "Crimes", `${p.nerve} nerve ready`], ["gym", "▲", "Train", `${p.energy} energy ready`], ["market", "◇", "Market", "Real player listings"]].map(x => <button key={x[0]} onClick={() => go(x[0])}><i>{x[1]}</i><span><b>{x[2]}</b><small>{x[3]}</small></span><em>›</em></button>)}</div></Panel>
      <Panel title="Your standing" eyebrow="LIVE PROFILE" className="standing"><button className="rank" onClick={() => go("rankings")}><span><b>VIEW</b><small>CITY RANKINGS</small></span></button><dl>{[["Family respect", p.respect], ["Net worth", money(p.cash + p.bank)], ["Player level", p.level], ["Merit points", p.merits]].map(x => <div key={x[0]}><dt>{x[0]}</dt><dd>{x[1]}</dd></div>)}</dl></Panel></div>
    <div className="lower-grid"><Panel title="Long game" eyebrow="CURRENT GOALS"><div className="goals">{goals.map(([label, value, max]) => <div key={label}><span><b>{label}</b><em>{Math.min(value, max).toFixed(0)} / {max}</em></span><figure><i style={{ width: `${clamp(value / max * 100, 0, 100)}%` }} /></figure></div>)}</div></Panel><Panel title="Word on the street" eyebrow="RECENT ACTIVITY"><div className="feed">{p.log.slice(0, 3).map((x, i) => <div className={x.tone} key={i}><i /><p>{x.text}<small>{i ? `${i} hour${i > 1 ? "s" : ""} ago` : "8 minutes ago"}</small></p></div>)}</div></Panel></div></>;
}

function City({ go }) { return <><PageHead eyebrow="BLACKWOOD DIRECTORY" title="The City" text="Every block has an opportunity, if you know which door to knock on." /><section className="district-map"><div className="district-map-art"><svg viewBox="0 0 100 90" preserveAspectRatio="none" aria-hidden="true"><path d="M-5 33C18 23 28 38 48 29S73 8 106 18M-4 63C19 50 32 65 51 55s34-4 55 9M37-5c-2 24 8 37 4 54S29 72 34 96M74-5C63 18 75 34 70 49S59 72 66 96"/><path className="water" d="M0 78c19-8 37 1 55-5s29-14 45-9v26H0z"/></svg><span className="map-label north">NORTHSIDE</span><span className="map-label south">SOUTHSIDE</span><span className="map-label harbor">HARBOR</span>{PLACES.map(([id,name,kicker,desc,icon,district,x,y],index)=><button style={{left:`${x}%`,top:`${y}%`,"--delay":`${index*45}ms`}} onClick={()=>go(id)} key={id}><i><GameIcon name={icon}/></i><span><small>{district} · {kicker}</small><b>{name}</b><em>{desc}</em></span></button>)}</div><footer><span><i className="open"/>Open for business</span><span><i className="live"/>Online system</span><b>Tap a location to enter</b></footer></section></>; }

export default function MafiaGame({ initialPlayer = null, character = null, user = null, onPlayerChange = null, onSignOut = null, onDeleteAccount = null }) {
  const [p, setP] = useState(() => initialPlayer || loadGame()), [page, setPage] = useState("home"), [notice, setNotice] = useState(null), [menu, setMenu] = useState(false), [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); onPlayerChange?.(p); }, [p, onPlayerChange]);
  const flash = (text, tone = "good") => { setNotice({ text, tone }); setTimeout(() => setNotice(null), 3200); };
  const syncWallet = useCallback(cash => setP(x => ({ ...x, cash })), []);
  const syncCore = useCallback(core => core && setP(x => ({ ...x, level: core.level, xp: core.xp, cash: core.cash, bank: core.bank, energy: core.energy, maxEnergy: core.max_energy, nerve: core.nerve, maxNerve: core.max_nerve, health: core.health, maxHealth: core.max_health, happy: core.happy, maxHappy: core.max_happy, strength: Number(core.strength), defense: Number(core.defense), speed: Number(core.speed), dexterity: Number(core.dexterity), crimeSkill: core.crime_skill, respect: core.respect, merits: core.merits, jobPoints: core.job_points, tutorialStep: core.tutorial_step ?? x.tutorialStep, tutorialDone: core.tutorial_done ?? x.tutorialDone })), []);
  const serverPages = ["crimes", "hustles", "combat", "gym", "work", "missions", "catalogue", "shop", "market", "bank", "hospital", "jail", "property", "social", "mail", "forums", "awards", "inventory"];
  const content = serverPages.includes(page) ? <CityCoreHub initialTab={page} user={user} onState={syncCore} /> : { home: <Overview p={p} go={setPage} />, city: <City go={setPage} />, family: <CommunityHub user={user} initialTab="families" />, chat: <CommunityHub user={user} initialTab="chat" />, players: <CommunityHub user={user} initialTab="players" />, rankings: <CommunityHub user={user} initialTab="rankings" />, economy: <EconomyHub onWalletChange={syncWallet}/>, arcade: <CasinoHub onWalletChange={syncWallet}/>, safety: <SafetyHub onDeleteAccount={onDeleteAccount}/> }[page];
  const initials = (character?.codename || p.name).split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
  const navigate=next=>{setPage(next);setMenu(false);setAccountOpen(false);window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})};
  return <div className="game-shell living-city"><header className="topbar"><button className="hamb" onClick={() => setMenu(!menu)} aria-label="Open navigation"><GameIcon name="city"/></button><button className="brand" onClick={() => navigate("home")}><i>M</i><span><b>MORETTI</b><small>BLACKWOOD CITY</small></span></button><div className="resources" data-tutorial="resources"><Resource label="Energy" value={p.energy} max={p.maxEnergy} tone="energy" icon="⚡" /><Resource label="Nerve" value={p.nerve} max={p.maxNerve} tone="nerve" icon="♦" /><Resource label="Health" value={p.health} max={p.maxHealth} tone="health" icon="+" /><Resource label="Happy" value={p.happy} max={p.maxHappy} tone="happy" icon="♥" /></div><button className="cash"><small>ON HAND</small><b>$<AnimatedNumber value={p.cash}/></b></button><button className="avatar" onClick={() => setAccountOpen(!accountOpen)} aria-label="Account menu">{initials}</button>{accountOpen && <div className="account-menu"><small>SIGNED IN</small><b>{character?.codename || p.name}</b><em>{user?.email}</em><button onClick={()=>navigate("safety")}>Help & Safety</button><button onClick={onSignOut}>Sign out</button></div>}</header>
    {menu&&<button className="nav-scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}<aside className={`sidebar ${menu ? "open" : ""}`}><div className="profile"><i>VM<span>{p.level}</span></i><div><b>{p.name}</b><small>{p.title}</small><figure><i style={{ width: `${p.xp / xpNeed(p.level) * 100}%` }} /></figure><em>{p.xp} / {xpNeed(p.level)} XP</em></div></div><nav>{NAV.map(([id, label]) => <button data-page={id} className={page === id ? "active" : ""} key={id} onClick={() => navigate(id)}><i><GameIcon name={id}/></i>{label}</button>)}</nav><button className="market-link" onClick={() => navigate("economy")}><i><GameIcon name="economy"/></i><span><b>Federal Trust FX</b><small>Live markets open</small></span><em>›</em></button><blockquote>“Keep your friends close. Keep your ledger closer.”<small>— Don Salvatore</small></blockquote></aside>
    <main><div className="page-motion" key={page}>{content}</div></main><nav className="mobile-dock" aria-label="Primary navigation">{MOBILE_NAV.map(([id,label])=><button className={page===id?"active":""} onClick={()=>navigate(id)} key={id}><i><GameIcon name={id}/></i><span>{label}</span></button>)}<button className={menu?"active":""} onClick={()=>setMenu(value=>!value)}><i className="more-dots"><b/><b/><b/></i><span>More</span></button></nav>{notice && <div className={`toast ${notice.tone}`}><i>{notice.tone === "bad" ? "!" : "✓"}</i>{notice.text}</div>}<GuidedTutorial step={p.tutorialStep} done={p.tutorialDone} onNavigate={navigate} onState={syncCore}/><AdviserPanel onNavigate={navigate} /></div>;
}
