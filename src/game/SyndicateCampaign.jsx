import { useMemo } from "react";
import "./syndicate-campaign.css";

export const SYNDICATE_CAMPAIGN_DEFAULT = Object.freeze({ version: 1, chapter: 0, route: "unwritten", cashEarned: 0, recruits: [], choices: [], completed: false });

const CHAPTERS = [
  { code: "01", title: "Nothing in Your Pockets", place: "Ward 09 // Underpass", text: "You wake beneath the mag-rail with a dead comm, a borrowed jacket and exactly one name that still answers: your own. The old families own the streets above. Simi finds a half-burned ledger in the rain—small courier jobs, dangerous clients, no protection. You can stay invisible, or make the ward remember you tonight.", choices: [
    { id: "c1-scout", label: "Run the ledger quietly", detail: "Map every delivery and learn who controls the crossings.", cash: 180, route: "finesse", recruit: "Rin Amasawa", recruitRole: "Courier", result: "Rin notices your clean routes and offers to run messages for your new family." },
    { id: "c1-claim", label: "Take the street corner", detail: "Stand your ground and collect protection money from the local crews.", cash: 260, route: "force", recruit: "Jiro Kanda", recruitRole: "Enforcer", result: "Jiro respects the nerve. He joins before sunrise, asking only for a fair share." },
  ] },
  { code: "02", title: "Borrowed Wheels", place: "East Market // Flood Lane", text: "A syndicate courier leaves a black electric coupe idling beside a shuttered noodle shop. Your family has no transport, no garage and no future if you keep walking. The choice is not whether to take a car; it is what kind of boss you become while doing it.", choices: [
    { id: "c2-steal", label: "Steal the syndicate car", detail: "Cut the tracker, move fast and accept the heat.", cash: 620, route: "force", recruit: "Kaito Mori", recruitRole: "Wheelman", result: "Kaito sees the escape on a stolen street feed and joins the only crew bold enough to survive it." },
    { id: "c2-deal", label: "Trade for the keys", detail: "Find the driver, offer protection and turn a theft into a debt.", cash: 420, route: "finesse", recruit: "Kaito Mori", recruitRole: "Wheelman", result: "The driver keeps his dignity and becomes your first loyal wheelman." },
  ] },
  { code: "03", title: "The Rain Bank", place: "Shinjuku // Civic Reserve", text: "Your ledger points to a reserve bank moving emergency yen before dawn. One route leads through an unmanned service vault. Another passes the public counter, where frightened workers are waiting for the same money you need. The family will be judged by what you take—and what you leave untouched.", choices: [
    { id: "c3-vault", label: "Loot the service vault", detail: "Take the reserve cash and disappear before the alarm grid wakes.", cash: 1450, route: "force", recruit: "Mika Hoshino", recruitRole: "Safecracker", result: "Mika joins after you split the haul transparently and keep civilians out of the crossfire." },
    { id: "c3-divert", label: "Divert the transfer", detail: "Redirect the shipment, leave the bank open and take a smaller cut.", cash: 980, route: "finesse", recruit: "Mika Hoshino", recruitRole: "Safecracker", result: "Mika admires the elegant move and brings three quiet specialists with her." },
    { id: "c3-protect", label: "Protect the workers", detail: "Expose the corrupt transfer and earn trust instead of a fortune.", cash: 360, route: "mercy", recruit: "Hana Mochizuki", recruitRole: "Medic", result: "Hana joins because your family protects people who cannot protect themselves." },
  ] },
  { code: "04", title: "A Name at the Table", place: "Neon Canal // Backroom", text: "Three independent operators arrive at the same table: a broker who knows every price, a medic who knows every wound, and a former investigator who knows every lie. You only have enough leverage to recruit one without splitting the family before it has a roof.", choices: [
    { id: "c4-broker", label: "Recruit the broker", detail: "Build influence through information and controlled deals.", cash: 760, route: "finesse", recruit: "Yumi Hoshino", recruitRole: "Broker", result: "Yumi turns your scattered jobs into a network with names, schedules and leverage." },
    { id: "c4-medic", label: "Recruit the medic", detail: "Make the family safe enough that people choose to stay.", cash: 520, route: "mercy", recruit: "Ayame Tachibana", recruitRole: "Investigator", result: "Ayame brings evidence, warnings and a strict rule: no innocent targets." },
    { id: "c4-investigator", label: "Recruit the investigator", detail: "Know the law's next move before it happens.", cash: 690, route: "force", recruit: "Ayame Tachibana", recruitRole: "Investigator", result: "Ayame joins to dismantle the families that once owned her badge." },
  ] },
  { code: "05", title: "The Price of Silence", place: "Ward 09 // Family Safehouse", text: "Your growing crew is no longer invisible. A rival offers a clean deal: pay them every week and keep your people. Refuse, and they will test the safehouse before midnight. This is the first decision that cannot be solved by money alone.", choices: [
    { id: "c5-pay", label: "Buy one month of peace", detail: "Spend now, grow carefully and learn the rival's structure.", cash: -420, route: "finesse", recruit: null, result: "The rival accepts the payment. Your family uses the month to prepare a quiet counterstrike." },
    { id: "c5-break", label: "Break their collection route", detail: "Hit the supply chain and make the tax impossible to collect.", cash: 920, route: "force", recruit: null, result: "Their collectors vanish from Ward 09. Everyone hears your name before they see your face." },
    { id: "c5-share", label: "Offer shared protection", detail: "Turn a rival crew into partners without surrendering your name.", cash: 610, route: "mercy", recruit: "Nami Okada", recruitRole: "Quartermaster", result: "Nami joins to manage the shared stores and becomes the family's steady hand." },
  ] },
  { code: "06", title: "The Family Line", place: "Old Tokyo // Signal Shrine", text: "The old families call a council. They expect you to arrive as a desperate runner asking permission. Instead, you arrive with a crew, a ledger and a choice: become feared, become trusted, or become impossible to remove from the city's future.", choices: [
    { id: "c6-crown", label: "Claim the vacant seat", detail: "Name your family publicly and accept every challenge that follows.", cash: 1800, route: "force", recruit: "Sora Vale", recruitRole: "Strategist", result: "The vacant seat becomes yours. Rivals stop calling you a runner." },
    { id: "c6-accord", label: "Write a new accord", detail: "Make the council dependent on your routes and fair terms.", cash: 1320, route: "finesse", recruit: "Sora Vale", recruitRole: "Strategist", result: "Sora drafts the accord. Your family becomes the city's most useful power." },
    { id: "c6-ward", label: "Stand for the ward", detail: "Reject the council's rules and protect the people below it.", cash: 900, route: "mercy", recruit: "Sora Vale", recruitRole: "Strategist", result: "Sora joins after seeing a boss choose responsibility over an easy crown." },
  ] },
  { code: "07", title: "The Night the Rails Stopped", place: "Mag-Rail Control // Ward 09", text: "A coordinated shutdown traps half the district in darkness. The council blames you. Your people know the truth: someone is testing whether your family can protect more than its own money. Every recruit has a role now, and every choice leaves a permanent mark on the city.", choices: [
    { id: "c7-control", label: "Take the control room", detail: "Restore the rails and seize the network's access keys.", cash: 2400, route: "force", recruit: null, result: "The rails restart under your signal. Your family now controls movement through the ward." },
    { id: "c7-expose", label: "Expose the saboteur", detail: "Release the evidence and let the city see who caused the blackout.", cash: 2050, route: "finesse", recruit: null, result: "The saboteur's name reaches every screen. Your influence grows without a public war." },
    { id: "c7-rescue", label: "Rescue the stranded", detail: "Spend the night getting civilians home before chasing the culprit.", cash: 1280, route: "mercy", recruit: null, result: "The ward remembers every person your family brought home safely." },
  ] },
  { code: "08", title: "Mafia Boss", place: "Neo-Tokyo // Family Floor", text: "You started with empty pockets beneath the mag-rail. Now operators wait for your decisions, rivals calculate your patience, and the city has learned the difference between a thief and a boss. There is no final throne—only the first floor of a much larger family story. Future chapters will open from the route you built here.", choices: [
    { id: "c8-boss", label: "Take the family oath", detail: "Bind the crew together and accept the title of Mafia Boss.", cash: 4200, route: "boss", recruit: null, result: "The family stands behind you. MAFIA BOSS is added to your story record; the next season begins with a city that knows your name." },
  ] },
];

export function normalizeSyndicateCampaign(value) {
  const incoming = value && value.version === 1 ? value : {};
  return { ...SYNDICATE_CAMPAIGN_DEFAULT, ...incoming, chapter: Math.max(0, Math.min(CHAPTERS.length, Number(incoming.chapter) || 0)), recruits: [...new Set(incoming.recruits || [])], choices: [...new Set(incoming.choices || [])] };
}

export function chooseSyndicateChapter(value, choice) {
  const state = normalizeSyndicateCampaign(value);
  const chapter = CHAPTERS[state.chapter];
  if (!chapter || state.choices.includes(choice.id)) return { state, choice, changed: false };
  const next = { ...state, chapter: state.chapter + 1, route: choice.route === "boss" ? "boss" : choice.route, cashEarned: state.cashEarned + choice.cash, choices: [...state.choices, choice.id], recruits: choice.recruit ? [...state.recruits, choice.recruit] : state.recruits, completed: state.chapter + 1 >= CHAPTERS.length };
  return { state: next, choice, changed: true };
}

export default function SyndicateCampaign({ value, onChange, onEarn, onExit }) {
  const campaign = useMemo(() => normalizeSyndicateCampaign(value), [value]);
  const chapter = CHAPTERS[campaign.chapter];
  const choose = (choice) => {
    const result = chooseSyndicateChapter(campaign, choice);
    if (!result.changed) return;
    onChange?.(result.state);
    onEarn?.(choice.cash, choice.result);
  };
  return <main className="syndicate-campaign">
    <header className="syndicate-topbar"><div><small>SOLO STORY // FAMILY RISE</small><h1>{campaign.completed ? "The Family Remembers" : "From Nothing to Mafia Boss"}</h1></div><div className="syndicate-status"><b>{campaign.chapter}/{CHAPTERS.length}</b><small>CHAPTERS</small></div>{onExit && <button onClick={onExit} aria-label="Close story">×</button>}</header>
    <div className="syndicate-progress" aria-label="Story progress"><i style={{ width: `${(campaign.chapter / CHAPTERS.length) * 100}%` }} /></div>
    {campaign.completed ? <section className="syndicate-card syndicate-finale"><small>CAMPAIGN ARC COMPLETE</small><h2>MAFIA BOSS</h2><p>{CHAPTERS.at(-1).text}</p><div className="syndicate-stats"><span><b>¥{campaign.cashEarned.toLocaleString()}</b><small>story earnings</small></span><span><b>{campaign.recruits.length}</b><small>family recruits</small></span><span><b>{campaign.route.toUpperCase()}</b><small>final route</small></span></div><p className="syndicate-future">Next chapter slot: <b>THE CITY COLLECTS</b> — future story content will continue from your choices.</p>{onExit && <button className="syndicate-primary" onClick={onExit}>Return to city</button>}</section> : <section className="syndicate-card"><div className="syndicate-kicker">CHAPTER {chapter.code} · {chapter.place}</div><h2>{chapter.title}</h2><p className="syndicate-story">{chapter.text}</p><div className="syndicate-choice-grid">{chapter.choices.map((choice) => <button key={choice.id} className="syndicate-choice" onClick={() => choose(choice)}><span><b>{choice.label}</b><small>{choice.detail}</small></span><em>{choice.cash >= 0 ? `+¥${choice.cash.toLocaleString()}` : `-¥${Math.abs(choice.cash).toLocaleString()}`}</em></button>)}</div><p className="syndicate-note">Your choice changes the route, family roster and money earned. The campaign remains one continuous story, with future chapters carrying this record forward.</p></section>}
  </main>;
}
