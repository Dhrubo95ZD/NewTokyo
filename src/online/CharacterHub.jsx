import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import GameIcon from "../ui/GameIcon.jsx";

const SLOTS = [
  ["primary", "Primary", "Long guns and heavy weapons"],
  ["secondary", "Secondary", "Sidearms and compact pieces"],
  ["melee", "Melee", "Close-range weapons"],
  ["armor", "Body", "Coats and protective wear"],
  ["helmet", "Head", "Hats and head protection"],
  ["boots", "Feet", "Shoes and boots"],
  ["gloves", "Hands", "Gloves and knuckles"],
  ["accessory", "Accessory", "Rings and watches"],
];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const FRAME_FALLBACK = [
  { id: "starter", name: "Blackwood seal", rarity: "common", accent: "#a9792a", unlocked: true, requirement: "Available" },
  { id: "rookie", name: "First commission", rarity: "uncommon", accent: "#4d966f", unlocked: false, requirement: "Reach level 5" },
  { id: "collector", name: "Collector's brass", rarity: "rare", accent: "#3f82b0", unlocked: false, requirement: "Earn 250 respect" },
  { id: "district", name: "District authority", rarity: "epic", accent: "#8259a8", unlocked: false, requirement: "Reach level 15" },
  { id: "legend", name: "Legacy crest", rarity: "legendary", accent: "#bd8421", unlocked: false, requirement: "Reach level 30" },
];
const LAYOUTS = [
  ["ledger", "Ledger", "A clean dossier with one hero item."],
  ["gallery", "Gallery", "Three equal slots for a collection wall."],
  ["vault", "Vault", "A framed display for your rarest finds."],
];
const BACKGROUNDS = [
  ["ivory", "Ivory paper"],
  ["sand", "Warm sand"],
  ["sage", "Quiet sage"],
];
const PORTRAITS = [
  ["monogram", "Monogram", "Your initials"],
  ["seal", "City seal", "Abstract emblem"],
  ["crown", "Crown mark", "Earned symbol"],
];

const money = value => `$${Number(value || 0).toLocaleString()}`;
const itemId = item => item?.item_id || item?.itemId || item?.id;
const iconFor = kind => kind === "weapon" ? "combat" : kind === "armor" ? "property" : kind === "accessory" ? "awards" : kind === "medical" ? "hospital" : "happy";
const initials = name => String(name || "Associate").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const portraitMark = (portraitKey, name) => portraitKey === "seal" ? "✦" : portraitKey === "crown" ? "♛" : initials(name);
const statRows = item => [["ATK", item?.attack], ["DEF", item?.defense], ["SPD", item?.speed], ["DEX", item?.dexterity]].filter(([, value]) => Number(value) > 0);

function ItemArt({ item, large = false }) {
  return <span className={`character-item-art ${large ? "large" : ""} ${item?.rarity || "common"}`} aria-hidden="true"><GameIcon name={iconFor(item?.kind)} /><i /></span>;
}

function RarityBadge({ rarity = "common" }) {
  return <span className={`character-rarity ${rarity}`}><i aria-hidden="true">◆</i>{rarity}</span>;
}

export function CharacterCard({ card, compact = false }) {
  if (!card) return null;
  const frame = card.frame || { id: card.frameId || "starter", name: "Blackwood seal", rarity: "common", accent: "#a9792a" };
  const displayName = card.displayName || card.name || "Associate";
  return <article className={`character-card-preview ${compact ? "compact" : ""} layout-${card.layoutId || "ledger"} background-${card.backgroundKey || "ivory"}`} style={{ "--character-frame": frame.accent || "#a9792a" }}>
    <div className="character-card-top"><span className="character-card-seal" aria-label={`${frame.name} frame`}><b>{portraitMark(card.portraitKey, displayName)}</b></span><div><small>BLACKWOOD CITY · PUBLIC DOSSIER</small><h3>{displayName}</h3><p>{card.title || "Associate"} · Level {card.level || 1}</p></div><RarityBadge rarity={frame.rarity || "common"} /></div>
    <div className="character-card-rule" />
    <div className="character-card-meta"><span><small>RESPECT</small><b>{Number(card.respect || 0).toLocaleString()}</b></span><span><small>FRAME</small><b>{frame.name}</b></span><span><small>STYLE</small><b>{LAYOUTS.find(([id]) => id === card.layoutId)?.[1] || "Ledger"}</b></span></div>
    {!compact && <div className="character-card-featured">{(card.featuredItems || []).length ? card.featuredItems.map(item => <div className="character-card-item" key={item.id || item.item_id}><ItemArt item={item} /><span><small>{item.rarity || "common"}</small><b>{item.name}</b></span></div>) : <p>Choose up to three owned items to put on display.</p>}</div>}
    <footer><span>{frame.name}</span><em>Public card · updated from your saved collection</em></footer>
  </article>;
}

function StatLine({ item }) {
  const rows = statRows(item);
  return <div className="character-stat-line">{rows.length ? rows.map(([label, value]) => <span key={label}><small>{label}</small><b>+{value}</b></span>) : <span><small>POWER</small><b>{item?.power || 0}</b></span>}</div>;
}

function Empty({ title, text }) {
  return <div className="character-empty"><i>◇</i><b>{title}</b><p>{text}</p></div>;
}

export default function CharacterHub({ inventory = [], loadout = {}, player = {}, level = 1, busy = false, onAction, initialTab = "equipment" }) {
  const [tab, setTab] = useState(initialTab === "catalogue" ? "inventory" : initialTab);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("rarity");
  const [selectedId, setSelectedId] = useState(null);
  const [favourites, setFavourites] = useState(() => new Set());
  const [snapshot, setSnapshot] = useState(null);
  const [showcase, setShowcase] = useState({ frameId: "starter", layoutId: "ledger", backgroundKey: "ivory", portraitKey: "monogram", featuredItemIds: [] });
  const [saving, setSaving] = useState(false);
  const [showcaseError, setShowcaseError] = useState("");
  const [notice, setNotice] = useState("");

  const items = useMemo(() => (inventory || []).map(item => ({ ...item, item_id: itemId(item), quantity: Number(item.quantity || 0), rarity: item.rarity || "common" })).filter(item => item.item_id), [inventory]);
  const equipped = useMemo(() => Object.fromEntries((loadout?.equipment || []).map(item => [item.slot, item])), [loadout]);
  const ownedIds = useMemo(() => new Set(items.map(item => item.item_id)), [items]);
  const frames = snapshot?.frames?.length ? snapshot.frames : FRAME_FALLBACK;
  const currentFrame = frames.find(frame => frame.id === showcase.frameId) || frames[0];
  const featuredItems = useMemo(() => showcase.featuredItemIds.map(id => items.find(item => item.item_id === id)).filter(Boolean), [items, showcase.featuredItemIds]);
  const visible = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const result = items.filter(item => (filter === "all" || item.kind === filter || item.rarity === filter || item.slot === filter) && (!lower || `${item.name} ${item.kind} ${item.slot}`.toLowerCase().includes(lower)));
    return result.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "quantity" ? b.quantity - a.quantity : RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || a.name.localeCompare(b.name));
  }, [items, query, filter, sort]);
  const selected = items.find(item => item.item_id === selectedId) || visible[0] || items[0];
  const power = Object.values(loadout?.bonuses || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const card = { ...(snapshot?.card || {}), ...showcase, displayName: snapshot?.card?.displayName || player.name || "Associate", title: snapshot?.card?.title || player.title || "Associate", level: snapshot?.card?.level || level, respect: snapshot?.card?.respect || player.respect || 0, frame: currentFrame, featuredItems };

  useEffect(() => {
    let active = true;
    supabase.rpc("bw_character_collection_snapshot").then(({ data, error }) => {
      if (!active) return;
      if (error) { setShowcaseError("Showcase is still being prepared. Your local card can be previewed now."); return; }
      setSnapshot(data || null);
      if (data?.card) setShowcase(current => ({ ...current, ...data.card, featuredItemIds: (data.card.featuredItemIds || data.card.featured_item_ids || []).filter(id => ownedIds.has(id)) }));
    });
    return () => { active = false; };
  }, [ownedIds]);

  useEffect(() => {
    if (showcase.featuredItemIds.some(id => !ownedIds.has(id))) setShowcase(current => ({ ...current, featuredItemIds: current.featuredItemIds.filter(id => ownedIds.has(id)) }));
  }, [ownedIds, showcase.featuredItemIds]);

  const toggleFavourite = id => setFavourites(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleFeatured = id => setShowcase(current => ({ ...current, featuredItemIds: current.featuredItemIds.includes(id) ? current.featuredItemIds.filter(value => value !== id) : current.featuredItemIds.length >= 3 ? current.featuredItemIds : [...current.featuredItemIds, id] }));
  const saveShowcase = async () => {
    if (saving) return;
    setSaving(true); setShowcaseError(""); setNotice("");
    const { data, error } = await supabase.rpc("bw_save_character_showcase", { p_portrait_key: showcase.portraitKey, p_frame_id: showcase.frameId, p_layout_id: showcase.layoutId, p_background_key: showcase.backgroundKey, p_featured_item_ids: showcase.featuredItemIds });
    if (error) setShowcaseError(error.message || "Could not save your public card.");
    else { setSnapshot(data || snapshot); setNotice("Public card saved. Other players will see this version."); }
    setSaving(false);
  };

  return <div className="character-hub" data-tutorial="equipment">
    <header className="character-hero"><div className="character-identity"><span className="character-monogram">{initials(player.name || snapshot?.card?.displayName)}</span><div><small>PERSONAL DOSSIER</small><h2>{player.name || snapshot?.card?.displayName || "Your character"}</h2><p>{player.title || snapshot?.card?.title || "Associate"} · Level {level}</p></div></div><div className="character-power"><small>LOADOUT POWER</small><b>{power}</b><span>{items.length} item types · {Object.keys(equipped).length}/8 slots filled</span></div></header>
    <nav className="character-tabs" aria-label="Character sections">{[["equipment", "Equipment", "◆"], ["inventory", "Inventory", "▦"], ["showcase", "Show off", "✦"]].map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><i>{icon}</i><span>{label}</span>{id === "showcase" && <small>Public card</small>}</button>)}</nav>
    {notice && <div className="character-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
    {showcaseError && tab === "showcase" && <div className="character-alert" role="alert">{showcaseError}</div>}

    {tab === "equipment" && <div className="character-equipment-layout">
      <section className="character-panel character-loadout"><header><div><small>ACTIVE BUILD</small><h3>Equipment board</h3><p>Slots are server-authoritative. Tap a slot to inspect its bonus.</p></div><span className="character-build-score"><b>+{power}</b><small>total bonus</small></span></header><div className="character-slot-grid">{SLOTS.map(([slot, label, help]) => { const item = equipped[slot]; const active = selected?.item_id === item?.item_id; return <button className={`character-slot ${item ? `filled ${item.rarity}` : "empty"} ${active ? "selected" : ""}`} key={slot} onClick={() => item && setSelectedId(item.item_id)}><span className="character-slot-icon"><ItemArt item={item || { rarity: "common", kind: "armor" }} /></span><span><small>{label}</small><b>{item?.name || "Open slot"}</b><em>{item ? <RarityBadge rarity={item.rarity} /> : help}</em></span>{item && <i className="character-slot-check">✓</i>}</button>; })}</div></section>
      <aside className="character-panel character-inspector">{selected ? <><header><div><small>SELECTED RECORD</small><h3>{selected.name}</h3><RarityBadge rarity={selected.rarity} /></div><button className="character-star" aria-label={favourites.has(selected.item_id) ? "Remove favourite" : "Favourite item"} onClick={() => toggleFavourite(selected.item_id)}>{favourites.has(selected.item_id) ? "★" : "☆"}</button></header><div className="character-inspector-art"><ItemArt item={selected} large /></div><p>{selected.description || "A documented Blackwood item."}</p><StatLine item={selected} /><div className="character-inspector-meta"><span><small>SLOT</small><b>{selected.slot || selected.kind}</b></span><span><small>REQUIRED</small><b>Level {selected.level_required || 1}</b></span><span><small>OWNED</small><b>{selected.quantity}</b></span></div><div className="character-inspector-actions">{selected.slot && <button className="bw-primary" disabled={busy || equipped[selected.slot]?.item_id === selected.item_id || level < (selected.level_required || 1)} onClick={() => onAction?.("bw_equip_item", { p_item_id: selected.item_id }, `${selected.name} equipped.`)}>{equipped[selected.slot]?.item_id === selected.item_id ? "Equipped" : level < (selected.level_required || 1) ? `Level ${selected.level_required} required` : "Equip item"}</button>}{selected.usable && <button className="bw-secondary" disabled={busy} onClick={() => onAction?.("bw_use_item", { p_item_id: selected.item_id }, `${selected.name} used.`)}>Use item</button>}</div></> : <Empty title="Choose a slot" text="Your item record and comparison will appear here." />}</aside>
    </div>}

    {tab === "inventory" && <section className="character-panel character-inventory"><header className="character-section-head"><div><small>PERSONAL EFFECTS</small><h3>Inventory, at a glance</h3><p>Search, sort and compare without losing your place.</p></div><div className="character-inventory-count"><b>{items.reduce((sum, item) => sum + item.quantity, 0)}</b><span>pieces · {items.length} types</span></div></header><div className="character-tools"><label><span>FIND AN ITEM</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or slot" aria-label="Search inventory" /></label><label><span>FILTER</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Everything</option><option value="weapon">Weapons</option><option value="armor">Armor</option><option value="accessory">Accessories</option><option value="medical">Medical</option><option value="booster">Boosters</option>{RARITIES.slice(1).map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)} rarity</option>)}</select></label><label><span>SORT</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="rarity">Rarity first</option><option value="name">Name</option><option value="quantity">Quantity</option></select></label></div>{visible.length ? <div className="character-inventory-grid">{visible.map(item => { const isEquipped = equipped[item.slot]?.item_id === item.item_id; return <article className={`character-item-card ${item.rarity} ${isEquipped ? "equipped" : ""}`} key={item.item_id}><button className="character-item-main" onClick={() => { setSelectedId(item.item_id); setTab("equipment"); }}><ItemArt item={item} /><span><small>{item.kind} · {item.quantity} owned</small><b>{item.name}</b><em>{item.slot ? `Slot · ${item.slot}` : "Consumable"}</em></span><RarityBadge rarity={item.rarity} /></button><p>{item.description}</p><StatLine item={item} /><footer><button className="character-favourite-button" onClick={() => toggleFavourite(item.item_id)} aria-label={favourites.has(item.item_id) ? `Unfavourite ${item.name}` : `Favourite ${item.name}`}>{favourites.has(item.item_id) ? "★" : "☆"}</button>{item.slot && <button className="bw-secondary" disabled={busy || isEquipped || level < (item.level_required || 1)} onClick={() => onAction?.("bw_equip_item", { p_item_id: item.item_id }, `${item.name} equipped.`)}>{isEquipped ? "Equipped" : level < (item.level_required || 1) ? `Level ${item.level_required}` : "Equip"}</button>}{item.usable && <button className="bw-secondary" disabled={busy} onClick={() => onAction?.("bw_use_item", { p_item_id: item.item_id }, `${item.name} used.`)}>Use</button>}</footer></article>; })}</div> : <Empty title="Nothing matches" text="Try a different search or clear the filter." />}</section>}

    {tab === "showcase" && <div className="character-showcase-layout"><section className="character-panel character-showcase-editor"><header><div><small>PUBLIC IDENTITY</small><h3>Design your character card</h3><p>Show your best finds without exposing private account details.</p></div><span className="character-save-state">{saving ? "Saving…" : "Saved by the city server"}</span></header><label className="character-choice-label"><span>PORTRAIT MARK</span><div className="character-portrait-options">{PORTRAITS.map(([id, name, text]) => <button key={id} className={showcase.portraitKey === id ? "selected" : ""} onClick={() => setShowcase(current => ({ ...current, portraitKey: id }))}><i>{portraitMark(id, player.name || snapshot?.card?.displayName)}</i><span><b>{name}</b><small>{text}</small></span></button>)}</div></label><label className="character-choice-label"><span>FRAME</span><div className="character-frame-options">{frames.map(frame => <button key={frame.id} className={`character-frame-option ${frame.rarity} ${showcase.frameId === frame.id ? "selected" : ""} ${frame.unlocked === false ? "locked" : ""}`} disabled={frame.unlocked === false} onClick={() => setShowcase(current => ({ ...current, frameId: frame.id }))}><i style={{ "--frame-accent": frame.accent }}>{frame.unlocked === false ? "▧" : "✦"}</i><span><b>{frame.name}</b><small><RarityBadge rarity={frame.rarity} /></small></span><em>{frame.unlocked === false ? frame.requirement : "Unlocked"}</em></button>)}</div></label><label className="character-choice-label"><span>LAYOUT</span><div className="character-layout-options">{LAYOUTS.map(([id, name, text]) => <button key={id} className={showcase.layoutId === id ? "selected" : ""} onClick={() => setShowcase(current => ({ ...current, layoutId: id }))}><b>{name}</b><small>{text}</small></button>)}</div></label><label className="character-choice-label"><span>PAPER</span><div className="character-background-options">{BACKGROUNDS.map(([id, name]) => <button key={id} className={`background-choice ${id} ${showcase.backgroundKey === id ? "selected" : ""}`} onClick={() => setShowcase(current => ({ ...current, backgroundKey: id }))}>{name}</button>)}</div></label><label className="character-choice-label"><span>FEATURED LOOT · {showcase.featuredItemIds.length}/3</span><div className="character-featured-picker">{items.filter(item => item.slot).slice(0, 24).map(item => <button key={item.item_id} className={showcase.featuredItemIds.includes(item.item_id) ? "selected" : ""} onClick={() => toggleFeatured(item.item_id)}><ItemArt item={item} /><span><b>{item.name}</b><small>{item.rarity}</small></span></button>)}</div></label><button className="bw-primary character-save" disabled={saving} onClick={saveShowcase}>{saving ? "Saving card…" : "Save public card"}<b>→</b></button></section><aside className="character-showcase-preview"><div className="character-preview-label"><span>LIVE PREVIEW</span><small>What other players see</small></div><CharacterCard card={card} /><p className="character-showcase-note">Frames unlock through level, respect and real city achievements. Item ownership is checked on save.</p></aside></div>}
  </div>;
}
