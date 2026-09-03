import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { InventoryEquipment, ItemShop } from "./InventoryEquipment.jsx";
import JobCenter from "../jobs/JobCenter.jsx";
import MarketHub from "../market/MarketHub.jsx";
import HustleHub from "../hustles/HustleHub.jsx";
import CombatHub from "../combat/CombatHub.jsx";
import ItemCatalogue from "../catalogue/ItemCatalogue.jsx";
import ProgressionHub from "../progression/ProgressionHub.jsx";
import DistrictOperations from "../operations/DistrictOperations.jsx";
import ReportButton from "../safety/ReportButton.jsx";
import "./city-core.css";
import "../market/market-grind.css";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const when = value => value ? new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";
const CORE_TABS = {
  crimes: ["CRIMINAL RECORD", "Crimes", "Every result is rolled and recorded by the city server."],
  hustles: ["OPEN ALL NIGHT", "Street Work", "No energy required. Grind cash, mastery and loot with transparent soft limits."],
  combat: ["THE STREETS", "Attack", "Choose a real player. Wins, losses and hospital time persist online."],
  gym: ["NORTHSIDE ATHLETIC CLUB", "Gym", "Build battle stats with server-controlled energy."],
  work: ["EMPLOYMENT OFFICE", "Jobs", "Take a position, earn job points and work timed shifts."],
  missions: ["THE MORETTI LEDGER", "Campaign & Progression", "Story chapters, faction assignments and permanent city standing."],
  operations: ["BLACKWOOD FIELD OFFICE", "District Operations", "No-energy, multi-stage PvE work with district heat, mastery and rare finds."],
  bank: ["FEDERAL TRUST", "Bank", "Move money between your wallet and protected account."],
  hospital: ["ST. MERCY", "Hospital", "Players recovering from fights and critical failures."],
  jail: ["BLACKWOOD COUNTY", "Jail", "Players currently serving crime sentences."],
  mail: ["MESSAGING INC.", "Messages", "Private mail between authenticated players."],
  forums: ["COMMUNITY CENTER", "Forums", "Persistent public discussions for the city."],
  social: ["CONTACT BOOK", "Contacts", "Friends, enemies, targets and blocked players."],
  awards: ["CITY HALL", "Awards", "Permanent distinctions earned through actual play."],
  property: ["ESTATE AGENTS", "Properties", "Purchase residences and increase maximum happiness."],
  shop: ["SOUTHSIDE ARMS", "City Shops", "Purchase server-owned weapons, armor, medicine and supplies."],
  market: ["PLAYER COMMERCE", "Blackwood Exchange", "Buy and sell real player inventory through secured city escrow."],
  inventory: ["PERSONAL EFFECTS", "Inventory", "Server-owned equipment, medicine and boosters."],
  catalogue: ["BLACKWOOD COLLECTION", "Item Catalogue", "Every known item, its visual record, stats and transparent acquisition odds."],
};

function Empty({ title, text }) { return <div className="core-empty"><i>◇</i><b>{title}</b><p>{text}</p></div>; }
function Meter({ value, max }) { return <figure className="core-meter"><i style={{ width: `${Math.min(100, Number(value || 0) / Math.max(1, Number(max || 1)) * 100)}%` }} /></figure>; }

export default function CityCoreHub({ initialTab, user, onState }) {
  const [data, setData] = useState(null), [loadout, setLoadout] = useState({ equipment: [], bonuses: {} }), [directory, setDirectory] = useState([]), [mail, setMail] = useState([]), [forums, setForums] = useState({ threads: [], posts: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [selectedThread, setSelectedThread] = useState(null);
  const [amount, setAmount] = useState(1000), [recipient, setRecipient] = useState(""), [subject, setSubject] = useState(""), [message, setMessage] = useState("");
  const [threadTitle, setThreadTitle] = useState(""), [threadBody, setThreadBody] = useState(""), [threadCategory, setThreadCategory] = useState("general"), [reply, setReply] = useState("");
  const heading = CORE_TABS[initialTab] || CORE_TABS.crimes;
  const player = data?.player;

  const acceptState = useCallback(next => { const value = next?.state || next; if (value?.authority) { setData(value); onState?.(value.player); } return value; }, [onState]);
  const load = useCallback(async () => { const [stateResult, loadoutResult] = await Promise.all([supabase.rpc("bw_get_state"), supabase.rpc("bw_get_loadout")]); if (stateResult.error) { setError(stateResult.error.message); return; } setError(""); acceptState(stateResult.data); if (!loadoutResult.error) setLoadout(loadoutResult.data || { equipment: [], bonuses: {} }); }, [acceptState]);
  const loadDirectory = useCallback(async () => { const { data: value, error: loadError } = await supabase.rpc("bw_directory"); if (loadError) setError(loadError.message); else setDirectory(value || []); }, []);
  const loadMail = useCallback(async () => { const { data: value, error: loadError } = await supabase.rpc("bw_get_mail"); if (loadError) setError(loadError.message); else setMail(value || []); }, []);
  const loadForums = useCallback(async thread => { const { data: value, error: loadError } = await supabase.rpc("bw_get_forums", { p_thread: thread || null }); if (loadError) setError(loadError.message); else setForums(value || { threads: [], posts: [] }); }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (["hospital", "jail", "social", "mail"].includes(initialTab)) loadDirectory(); if (initialTab === "mail") loadMail(); if (initialTab === "forums") loadForums(selectedThread); }, [initialTab, selectedThread, loadDirectory, loadMail, loadForums]);

  const act = async (rpc, params = {}, success = "City record updated.", loader) => { if (busy) return; setBusy(true); setError(""); setNotice(""); const { data: value, error: actionError } = await supabase.rpc(rpc, params); if (actionError) setError(actionError.message); else { acceptState(value); setNotice(success); if (loader) await loader(value); } setBusy(false); };
  const opponents = useMemo(() => directory.filter(item => item.id !== user.id), [directory, user.id]);
  const statusPlayers = directory.filter(item => item.status === initialTab);

  if (error && !data) return <><PageHeading heading={heading} /><section className="core-shell"><Empty title="Blackwood City Core is not installed" text={`Apply supabase/20260901_blackwood_city_core.sql to the existing Supabase project. ${error}`} /><button className="core-primary retry" onClick={load}>Retry connection</button></section></>;
  if (!data) return <><PageHeading heading={heading} /><section className="core-shell"><Empty title="Opening city records" text="Loading the authoritative player state from Supabase." /></section></>;

  return <><PageHeading heading={heading} status={player.status} />{error && <div className="core-alert bad">{error}<button onClick={() => setError("")}>×</button></div>}{notice && <div className="core-alert good">{notice}<button onClick={() => setNotice("")}>×</button></div>}<section className="core-shell">
    {initialTab === "crimes" && <div className="core-crimes"><header><span><small>AVAILABLE NERVE</small><b>{player.nerve}/{player.max_nerve}</b></span><div><small>CRIME SKILL</small><b>{player.crime_skill}</b></div></header>{data.crimes.map(crime => { const locked = player.crime_skill < crime.skill_required; const chance = Math.min(96, Math.max(8, crime.base_chance + (player.crime_skill - crime.skill_required) * .7)); return <article className={locked ? "locked" : ""} key={crime.id}><i>{String(crime.sort_order).padStart(2, "0")}</i><div><small>{crime.category}</small><b>{crime.name}</b><p>{crime.description}</p></div><span><small>SUCCESS</small><b>{Math.round(chance)}%</b><Meter value={chance} max={100} /></span><em><small>TAKE</small><b>{money(crime.reward_min)}–{money(crime.reward_max)}</b><small>{crime.nerve_cost} nerve</small></em><button disabled={busy || locked || player.nerve < crime.nerve_cost || player.status !== "okay"} onClick={() => act("bw_do_crime", { p_crime_id: crime.id }, `Attempted ${crime.name}.`)}>{locked ? `Skill ${crime.skill_required}` : "Do crime"}</button></article>; })}</div>}

    {initialTab === "combat" && <CombatHub onState={onState} />}

    {initialTab === "gym" && <div className="core-gym"><header><span><small>AVAILABLE ENERGY</small><b>{player.energy}/{player.max_energy}</b></span><p>Each repetition costs 5 energy. Gains scale with current happiness.</p></header><div>{[["strength","Strength","Damage dealt"],["defense","Defense","Damage resisted"],["speed","Speed","Hit probability"],["dexterity","Dexterity","Evasion probability"]].map(([id,name,desc]) => <article key={id}><small>{id.slice(0,3).toUpperCase()}</small><b>{name}</b><strong>{Number(player[id]).toFixed(2)}</strong><p>{desc}</p><button disabled={busy || player.energy < 5 || player.status !== "okay"} onClick={() => act("bw_train", { p_stat: id, p_reps: 1 }, `${name} training recorded.`)}>Train ×1</button></article>)}</div></div>}

    {initialTab === "work" && <JobCenter onState={onState} />}

    {initialTab === "missions" && <ProgressionHub onState={onState} />}
    {initialTab === "operations" && <DistrictOperations onState={onState} />}

    {initialTab === "bank" && <div className="core-bank"><div className="bank-balances"><article><small>ON HAND</small><b>{money(player.cash)}</b><p>Available for crimes, purchases and mugging.</p></article><article><small>PROTECTED ACCOUNT</small><b>{money(player.bank)}</b><p>Safe from player attacks.</p></article></div><div className="bank-transfer"><label>Transfer amount<input type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, Number(event.target.value)))} /></label><button disabled={busy || amount > player.cash} onClick={() => act("bw_bank_transfer", { p_direction: "deposit", p_amount: amount }, "Deposit completed.")}>Deposit</button><button disabled={busy || amount > player.bank} onClick={() => act("bw_bank_transfer", { p_direction: "withdraw", p_amount: amount }, "Withdrawal completed.")}>Withdraw</button></div></div>}

    {["hospital", "jail"].includes(initialTab) && <div className="status-list"><header><small>LIVE CITY REGISTER</small><b>{statusPlayers.length} player{statusPlayers.length === 1 ? "" : "s"} currently {initialTab === "jail" ? "jailed" : "hospitalized"}</b></header>{statusPlayers.length === 0 ? <Empty title={`The ${initialTab} is empty`} text="No authenticated players currently have this status." /> : statusPlayers.map(item => <article key={item.id}><Avatar name={item.name} /><div><b>{item.name}</b><small>Level {item.level}</small></div><span>Until {when(item.statusUntil)}</span></article>)}</div>}

    {initialTab === "social" && <div className="contacts"><header><small>REAL PLAYER DIRECTORY</small><b>Choose how each name appears in your records.</b></header>{opponents.length === 0 ? <Empty title="No contacts yet" text="Relations become available as real players join." /> : opponents.map(item => <article key={item.id}><Avatar name={item.name} /><div><b>{item.name}</b><small>Level {item.level} · {item.status}</small></div>{["friend","enemy","target","blocked"].map(kind => <button className={item.relation === kind ? "active" : ""} disabled={busy} onClick={() => act("bw_set_relation", { p_target: item.id, p_relation: item.relation === kind ? "none" : kind, p_note: "" }, `${item.name} contact updated.`, async value => setDirectory(value || []))} key={kind}>{kind}</button>)}</article>)}</div>}

    {initialTab === "mail" && <div className="mail-layout"><form onSubmit={event => { event.preventDefault(); act("bw_send_mail", { p_recipient: recipient, p_subject: subject, p_body: message }, "Message sent.", async value => { setMail(value || []); setSubject(""); setMessage(""); }); }}><small>NEW PRIVATE MESSAGE</small><select value={recipient} onChange={event => setRecipient(event.target.value)} required><option value="">Choose recipient</option>{opponents.filter(item => item.relation !== "blocked").map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><input value={subject} maxLength={80} onChange={event => setSubject(event.target.value)} placeholder="Subject" required /><textarea value={message} maxLength={2000} onChange={event => setMessage(event.target.value)} placeholder="Write a private message…" required /><button className="core-primary" disabled={busy}>Send message</button></form><div className="mail-list"><header><b>Mailbox</b><button onClick={loadMail}>Refresh</button></header>{mail.length === 0 ? <Empty title="Mailbox empty" text="Messages from real players will appear here." /> : mail.map(item => <article key={item.id}><small>{item.direction === "sent" ? `TO ${item.recipientName}` : `FROM ${item.senderName}`} · {when(item.createdAt)}</small><b>{item.subject}</b><p>{item.body}</p>{item.direction!=="sent"&&<ReportButton targetUser={item.senderId} contentType="mail" contentId={item.id}/>}</article>)}</div></div>}

    {initialTab === "forums" && <div className="forum-layout"><aside><form onSubmit={event => { event.preventDefault(); act("bw_create_thread", { p_title: threadTitle, p_category: threadCategory, p_body: threadBody }, "Thread published.", async value => { setForums(value); setSelectedThread(value?.threads?.[0]?.id || null); setThreadTitle(""); setThreadBody(""); }); }}><small>START A DISCUSSION</small><input value={threadTitle} maxLength={100} onChange={event => setThreadTitle(event.target.value)} placeholder="Thread title" required /><select value={threadCategory} onChange={event => setThreadCategory(event.target.value)}><option value="general">General</option><option value="trade">Trade</option><option value="factions">Families</option><option value="help">Help</option></select><textarea value={threadBody} maxLength={4000} onChange={event => setThreadBody(event.target.value)} placeholder="Opening post…" required /><button disabled={busy}>Publish</button></form><div>{forums.threads.map(thread => <button className={selectedThread === thread.id ? "active" : ""} onClick={() => setSelectedThread(thread.id)} key={thread.id}><small>{thread.category} · {thread.replies} posts</small><b>{thread.title}</b><em>{thread.author_name}</em></button>)}</div></aside><section><header><b>{forums.threads.find(thread => thread.id === selectedThread)?.title || "Choose a discussion"}</b></header>{!selectedThread ? <Empty title="City forums" text="Open a real player thread or start the first one." /> : <>{forums.posts.map(post => <article key={post.id}><Avatar name={post.authorName} /><div><span><b>{post.authorName}</b><small>{when(post.createdAt)}</small></span><p>{post.body}</p>{post.authorId!==user.id&&<ReportButton targetUser={post.authorId} contentType="forum" contentId={post.id}/>}</div></article>)}<form className="forum-reply" onSubmit={event => { event.preventDefault(); act("bw_reply_thread", { p_thread: selectedThread, p_body: reply }, "Reply posted.", async value => { setForums(value); setReply(""); }); }}><textarea value={reply} maxLength={4000} onChange={event => setReply(event.target.value)} placeholder="Reply…" required /><button disabled={busy}>Post reply</button></form></>}</section></div>}

    {initialTab === "awards" && <div className="award-grid">{data.awards.length === 0 ? <Empty title="No awards earned yet" text="Awards unlock from real crimes, fights, respect and wealth." /> : data.awards.map(award => <article key={award.id}><i>★</i><small>AWARDED {new Date(award.earnedAt).toLocaleDateString()}</small><b>{award.name}</b><p>{award.description}</p><span>+{award.merit_reward} merit</span></article>)}</div>}

    {initialTab === "property" && <div className="property-grid">{data.properties.map(property => <article className={property.active ? "active" : ""} key={property.id}><i>⌂</i><small>{property.active ? "CURRENT HOME" : property.owned ? "OWNED" : "FOR SALE"}</small><b>{property.name}</b><p>{property.description}</p><dl><div><dt>Price</dt><dd>{money(property.price)}</dd></div><div><dt>Happiness</dt><dd>{property.max_happy}</dd></div><div><dt>Vault</dt><dd>{money(property.vault_capacity)}</dd></div></dl><button disabled={busy || property.active || (!property.owned && player.cash < property.price)} onClick={() => act("bw_buy_property", { p_property_id: property.id }, property.owned ? `Moved into ${property.name}.` : `Purchased ${property.name}.`)}>{property.active ? "Living here" : property.owned ? "Move in" : "Purchase"}</button></article>)}</div>}

    {initialTab === "inventory" && <InventoryEquipment inventory={loadout.inventory || data.inventory} loadout={loadout} level={player.level} busy={busy} onAction={(rpc, params, success) => act(rpc, params, success, async value => { if (rpc === "bw_equip_item" || rpc === "bw_unequip_slot") setLoadout(value || { equipment: [], inventory: [], bonuses: {} }); else { const result = await supabase.rpc("bw_get_loadout"); if (!result.error) setLoadout(result.data); } })} />}
    {initialTab === "catalogue" && <ItemCatalogue />}
    {initialTab === "shop" && <ItemShop items={data.items} cash={player.cash} level={player.level} busy={busy} onBuy={item => act("bw_buy_item", { p_item_id: item.id, p_quantity: 1 }, `${item.name} purchased.`)} />}
    {initialTab === "market" && <MarketHub onState={onState} />}
    {initialTab === "hustles" && <HustleHub onState={onState} />}
  </section></>;
}

function PageHeading({ heading, status }) { return <div className="page-head core-title"><div><small>{heading[0]}</small><h1>{heading[1]}</h1><p>{heading[2]}</p></div>{status && <span className={`core-status ${status}`}><i />{status}</span>}</div>; }
function Avatar({ name }) { return <i className="core-avatar">{String(name || "?").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</i>; }
function Status({ player }) { return <span className={`player-status ${player.status}`}><i />{player.status}{player.status !== "okay" && <small>until {when(player.statusUntil)}</small>}</span>; }
