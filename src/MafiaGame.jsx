import { useCallback, useEffect, useRef, useState } from "react";
import CommunityHub from "./online/CommunityHub.jsx";
import CityCoreHub from "./online/CityCoreHub.jsx";
import GuidedTutorial from "./tutorial/GuidedTutorial.jsx";
import CasinoHub from "./casino/CasinoHub.jsx";
import EconomyHub from "./economy/EconomyHub.jsx";
import AdviserPanel from "./adviser/AdviserPanel.jsx";
import GameIcon from "./ui/GameIcon.jsx";
import SafetyHub from "./safety/SafetyHub.jsx";
import SeasonHub from "./season/SeasonHub.jsx";
import TakeoverHub from "./takeover/TakeoverHub.jsx";
import CivicServicesHub from "./civic/CivicServicesHub.jsx";
import HomeBoard from "./ui/HomeBoard.jsx";
import DailyLifeHub from "./ui/DailyLifeHub.jsx";
import Dialog from "./ui/Dialog.jsx";
import { GROUPS, pageGroup, pageLabel, validPage } from "./ui/navigation.js";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./online/supabase.js";

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

const CITY_DIRECTORY = [
  { area: "WEST SIDE", items: [
    ["civic", "Civic Contracts", "CITY SERVICES", "Public works, the Community Fund and district standing.", "missions"],
    ["hustles", "Civic Work", "NO ENERGY REQUIRED", "Open shifts that keep the city moving.", "hustles"],
    ["hospital", "St. Mercy Hospital", "HEALTH", "Recover safely and review admissions.", "hospital"],
    ["jail", "Blackwood County", "SAFETY", "Review sentences and current status.", "jail"],
  ]},
  { area: "FINANCIAL", items: [
    ["bank", "Federal Trust", "PROTECTED ACCOUNT", "Move city cash into a protected account; no interest is paid.", "bank"],
    ["economy", "Market Desk", "TRANSPARENT MARKETS", "Review the existing market desk without adding a second city wallet.", "economy"],
    ["arcade", "Rossi's Arcade", "ARCADE DOLLARS", "Blackjack, slots and roulette use a separate play-earned wallet.", "arcade"],
  ]},
  { area: "NORTHSIDE", items: [
    ["shop", "Security & Tools", "EQUIPMENT", "Buy lawful tools, armour, medicine and supplies.", "shop"],
    ["catalogue", "Blackwood Collection", "ITEM ARCHIVE", "Inspect every item, stat and verified acquisition path.", "catalogue"],
    ["gym", "Athletic Club", "TRAINING", "Build physical stats with server-controlled energy.", "gym"],
    ["work", "Employment Office", "EDUCATION & WORK", "Choose a profession and complete transparent shifts.", "work"],
  ]},
  { area: "EASTSIDE", items: [
    ["market", "Blackwood Exchange", "PLAYER COMMERCE", "Trade owned items through secured player escrow.", "market"],
    ["property", "Estate Agents", "RESIDENTIAL", "Purchase a home and improve your living record.", "property"],
    ["family", "Community Center", "COMMUNITY", "Open family, player and social services.", "family"],
    ["social", "Contact Book", "RELATIONS", "Manage friends, targets and blocked players.", "family"],
  ]},
  { area: "CITY CENTER", items: [
    ["daily", "Daily Life", "CITY ROUTINE", "Check in, complete objectives and review your journal.", "daily"],
    ["dispatch", "Chronicle Archives", "PUBLIC RECORD", "Track lifetime milestones and city history.", "dispatch"],
    ["awards", "City Hall", "ACHIEVEMENTS", "Review permanent distinctions earned through play.", "awards"],
    ["forums", "Community Forum", "PUBLIC DISCUSSION", "Share help, trade and civic updates.", "forums"],
  ]},
  { area: "HARBOR", items: [
    ["operations", "Field Office", "DISTRICT OPERATIONS", "Complete multi-stage work that moves district control.", "operations"],
    ["mail", "Messaging Inc.", "PRIVATE MAIL", "Send messages to real authenticated players.", "family"],
    ["inventory", "Personal Effects", "STORAGE", "Open the canonical equipment and inventory record.", "inventory"],
  ]},
];
const MOBILE_NAV = GROUPS;

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

function City({ go }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState("area");
  const areas = ["all", ...CITY_DIRECTORY.map(group => group.area)];
  const entries = CITY_DIRECTORY.flatMap(group => group.items.map(([id, name, kicker, desc, icon]) => ({ id, name, kicker, desc, icon, area: group.area })))
    .filter(entry => area === "all" || entry.area === area)
    .filter(entry => !query.trim() || `${entry.name} ${entry.kicker} ${entry.desc} ${entry.area}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "type" ? a.kicker.localeCompare(b.kicker) || a.name.localeCompare(b.name) : CITY_DIRECTORY.findIndex(group => group.area === a.area) - CITY_DIRECTORY.findIndex(group => group.area === b.area) || a.name.localeCompare(b.name));
  const grouped = areas.filter(value => value !== "all").map(value => ({ area: value, entries: entries.filter(entry => entry.area === value) })).filter(group => group.entries.length);
  return <><PageHead eyebrow="BLACKWOOD DIRECTORY" title="The City" text="One canonical door for every service. Search the district, then enter the system you need." /><section className="bw-city-directory district-map">
    <header className="bw-city-directory-tools"><label><span>FIND A DESTINATION</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search city services" aria-label="Search city services" /></label><label><span>AREA</span><select value={area} onChange={event => setArea(event.target.value)} aria-label="Filter by area">{areas.map(value => <option value={value} key={value}>{value === "all" ? "All districts" : value}</option>)}</select></label><label><span>SORT</span><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort destinations"><option value="area">Area</option><option value="type">Type</option><option value="name">Name</option></select></label></header>
    <div className="bw-city-directory-summary"><b>{entries.length}</b><span>canonical destinations</span><em>Existing systems are linked once; no duplicate city versions.</em></div>
    {grouped.length ? grouped.map(group => <section className="bw-city-district" key={group.area}><header><h2>{group.area}</h2><span>{group.entries.length} service{group.entries.length === 1 ? "" : "s"}</span></header><div className="bw-city-entry-grid">{group.entries.map(entry => <button className="bw-city-entry" onClick={() => go(entry.id)} key={`${entry.area}-${entry.id}-${entry.name}`}><i><GameIcon name={entry.icon}/></i><span><small>{entry.kicker}</small><b>{entry.name}</b><em>{entry.desc}</em></span><strong>→</strong></button>)}</div></section>) : <div className="bw-city-empty"><b>No destination matches that search.</b><button onClick={() => { setQuery(""); setArea("all"); }}>Clear filters</button></div>}
    <footer className="bw-city-directory-footer"><span><i className="open"/> Open for business</span><span><i className="record"/> Server-recorded</span><b>Tap a destination to enter</b></footer>
  </section></>;
}

export default function MafiaGame({ initialPlayer = null, character = null, user = null, onPlayerChange = null, onSignOut = null, onDeleteAccount = null }) {
  const [p, setP] = useState(() => ({...INITIAL, ...(initialPlayer || loadGame())}));
  const [ledgerCredits, setLedgerCredits] = useState(null);
  const [page, setPage] = useState("home"), [menu, setMenu] = useState(null), [accountOpen, setAccountOpen] = useState(false), [adviserOpen, setAdviserOpen] = useState(false);
  const trail = useRef([]), scrolls = useRef({}), pageRef = useRef(page), heading = useRef(null);
  const activeGroup = pageGroup(page);
  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); onPlayerChange?.(p); }, [p, onPlayerChange]);
  const syncWallet = useCallback(cash => setP(x => ({ ...x, cash })), []);
  const syncLedger = useCallback(value => setLedgerCredits(Number(value || 0)), []);
  useEffect(() => {
    let alive = true;
    if (!user || !supabase) { setLedgerCredits(null); return () => { alive = false; }; }
    supabase.rpc("bw_casino_snapshot").then(({ data, error }) => {
      if (alive && !error && data?.balance != null) syncLedger(data.balance);
    });
    return () => { alive = false; };
  }, [user?.id, syncLedger]);
  const syncCore = useCallback(core => core && setP(x => ({ ...x, level: core.level, xp: core.xp, cash: core.cash, bank: core.bank, energy: core.energy, maxEnergy: core.max_energy, nerve: core.nerve, maxNerve: core.max_nerve, health: core.health, maxHealth: core.max_health, happy: core.happy, maxHappy: core.max_happy, strength: Number(core.strength), defense: Number(core.defense), speed: Number(core.speed), dexterity: Number(core.dexterity), crimeSkill: core.crime_skill, respect: core.respect, merits: core.merits, status: core.status, jobPoints: core.job_points, tutorialStep: core.tutorial_step ?? x.tutorialStep, tutorialDone: core.tutorial_done ?? x.tutorialDone })), []);
  const navigate = useCallback(next => {
    if (!validPage(next)) return;
    const current = pageRef.current;
    if (next !== current) {
      scrolls.current[current] = window.scrollY;
      trail.current.push(current);
      window.history.pushState({ blackwoodPage: next }, "");
      pageRef.current = next; setPage(next);
    }
    setMenu(null); setAccountOpen(false); setAdviserOpen(false);
  }, []);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, blackwoodPage:"home" }, "");
    const pop = event => {
      const next = validPage(event.state?.blackwoodPage) ? event.state.blackwoodPage : "home";
      scrolls.current[pageRef.current] = window.scrollY;
      trail.current.pop(); pageRef.current = next; setPage(next);
      setMenu(null); setAccountOpen(false); setAdviserOpen(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { window.scrollTo({top:scrolls.current[page] || 0,behavior:"instant"}); heading.current?.focus({preventScroll:true}); });
    return () => cancelAnimationFrame(frame);
  }, [page]);
  useEffect(() => {
    const dismiss = () => { if(adviserOpen) setAdviserOpen(false); else if(menu) setMenu(null); else if(accountOpen) setAccountOpen(false); else if(trail.current.length) window.history.back(); else App.minimizeApp(); };
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener("backButton", dismiss);
    return () => { listener.then(handle => handle.remove()); };
  }, [adviserOpen, menu, accountOpen]);
  const serverPages = ["crimes", "hustles", "operations", "combat", "gym", "work", "missions", "factions", "catalogue", "shop", "market", "bank", "hospital", "jail", "property", "social", "mail", "forums", "awards", "inventory"];
  const content = serverPages.includes(page) ? <CityCoreHub initialTab={page === "factions" ? "missions" : page} progressionTab={page === "factions" ? "factions" : "story"} user={user} onState={syncCore} /> : {
    home: <HomeBoard p={p} go={navigate} onState={syncCore} skyline={<Skyline/>}/>,
    daily: <DailyLifeHub onState={syncCore} onNavigate={navigate}/>,
    dispatch: <SeasonHub onNavigate={navigate}/>,
    takeover: <TakeoverHub onNavigate={navigate}/>, city:<City go={navigate}/>, civic:<CivicServicesHub onState={syncCore} onNavigate={navigate}/>,
    family:<CommunityHub user={user} initialTab="families"/>, chat:<CommunityHub user={user} initialTab="chat"/>,
    players:<CommunityHub user={user} initialTab="players"/>, rankings:<CommunityHub user={user} initialTab="rankings"/>,
    economy:<EconomyHub onLedgerChange={syncLedger}/>, arcade:<CasinoHub onLedgerChange={syncLedger} onCashChange={syncWallet}/>,
    safety:<SafetyHub onDeleteAccount={onDeleteAccount}/>
  }[page];
  const initials = (character?.codename || p.name).split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
  return <div className="game-shell living-city after-dark">
    <a className="bw-skip" href="#game-content">Skip to game content</a>
    <header className="topbar">
      <button className="brand" onClick={()=>navigate("home")} aria-label="Moretti Home"><i>M</i><span><b>MORETTI</b><small>BLACKWOOD CITY</small></span></button>
      <button className="bw-adviser-trigger" onClick={()=>{setMenu(null);setAccountOpen(false);setAdviserOpen(true)}} aria-haspopup="dialog" aria-expanded={adviserOpen}><span aria-hidden="true">✦</span> Ask Adviser</button>
      <div className="wallet-strip" aria-label="City and Arcade balances">
        <button className="cash" onClick={()=>navigate("bank")} aria-label={"Open bank, "+money(p.cash)+" on hand"}><small>ON HAND</small><b>$<AnimatedNumber value={p.cash}/></b></button>
        <button className="ledger-balance" onClick={()=>navigate("arcade")} aria-label={ledgerCredits == null ? "Open Arcade, Arcade Dollars loading" : "Open Arcade, "+money(ledgerCredits)+" Arcade Dollars"}><small>ARCADE DOLLARS</small><b>{ledgerCredits == null ? "—" : <><span>$</span><AnimatedNumber value={ledgerCredits}/></>}</b></button>
      </div>
      <button className="avatar" onClick={()=>{setMenu(null);setAdviserOpen(false);setAccountOpen(true)}} aria-label="Account menu" aria-haspopup="dialog">{initials}</button>
      <div className="resources" data-tutorial="resources"><Resource label="Energy" value={p.energy} max={p.maxEnergy} tone="energy" icon="⚡"/><Resource label="Nerve" value={p.nerve} max={p.maxNerve} tone="nerve" icon="♦"/><Resource label="Health" value={p.health} max={p.maxHealth} tone="health" icon="+"/><Resource label="Happy" value={p.happy} max={p.maxHappy} tone="happy" icon="♥"/></div>
    </header>
    <aside className="sidebar"><div className="bw-profile"><span>{initials}</span><div><b>{p.name}</b><small>{p.title} · Level {p.level}</small></div></div><nav aria-label="Game sections">{GROUPS.map(group=><section key={group.id}><button className={activeGroup.id===group.id?"active":""} onClick={()=>group.id==="home"?navigate("home"):setMenu(group.id)}><GameIcon name={group.icon}/>{group.label}<span>›</span></button>{activeGroup.id===group.id&&<div className="bw-subnav">{group.pages.map(([id,label])=><button data-page={id} aria-current={page===id?"page":undefined} onClick={()=>navigate(id)} key={id}>{label}</button>)}</div>}</section>)}</nav><button className="bw-sidebar-help" onClick={()=>navigate("safety")}>Help & Safety</button></aside>
    <main id="game-content"><div className="bw-location" ref={heading} tabIndex={-1}>{page!=="home"&&<button aria-label="Go back" onClick={()=>trail.current.length?window.history.back():navigate("home")}>←</button>}<span>{activeGroup.label}<i>/</i><b>{pageLabel(page)}</b></span></div><div className="page-motion" key={page}>{content}</div></main>
    <nav className="mobile-dock" aria-label="Primary navigation">{MOBILE_NAV.map(group=><button className={activeGroup.id===group.id?"active":""} aria-current={activeGroup.id===group.id?"page":undefined} aria-label={group.label} onClick={()=>group.id==="home"?navigate("home"):setMenu(group.id)} key={group.id}><i><GameIcon name={group.icon}/></i><span>{group.label}</span></button>)}</nav>
    {menu&&<Dialog label={GROUPS.find(group=>group.id===menu)?.label || "Navigation"} onClose={()=>setMenu(null)} className="bw-navigation"><header className="bw-dialog-head"><div><span className="bw-eyebrow">EXPLORE BLACKWOOD</span><h2>{GROUPS.find(group=>group.id===menu)?.label}</h2></div><button className="bw-close" aria-label="Close navigation" onClick={()=>setMenu(null)}>×</button></header><div className="bw-destination-list">{GROUPS.find(group=>group.id===menu)?.pages.map(([id,label])=><button key={id} data-page={id} aria-current={page===id?"page":undefined} onClick={()=>navigate(id)}><GameIcon name={id==="factions"?"family":id}/><span>{label}</span><b>→</b></button>)}</div></Dialog>}
    {accountOpen&&<Dialog label="Account" onClose={()=>setAccountOpen(false)} className="bw-account"><header className="bw-dialog-head"><h2>Your account</h2><button className="bw-close" aria-label="Close account" onClick={()=>setAccountOpen(false)}>×</button></header><p>{character?.codename || p.name}</p><p>{user?.email}</p><button className="bw-secondary" onClick={()=>navigate("safety")}>Help & Safety</button><button className="bw-secondary" onClick={onSignOut}>Sign out</button></Dialog>}
    {!menu&&!accountOpen&&!adviserOpen&&<GuidedTutorial step={p.tutorialStep} done={p.tutorialDone} onNavigate={navigate} onState={syncCore}/>}
    <AdviserPanel open={adviserOpen} onClose={()=>setAdviserOpen(false)} page={page} onNavigate={navigate}/>
  </div>;
}
