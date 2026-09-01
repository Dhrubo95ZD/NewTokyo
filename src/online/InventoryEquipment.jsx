import { useMemo, useState } from "react";
import GameIcon from "../ui/GameIcon.jsx";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const SLOTS = [
  ["primary", "Primary", "Long guns and heavy weapons"], ["secondary", "Secondary", "Sidearms"],
  ["melee", "Melee", "Close-range weapons"], ["armor", "Body", "Coats and protective wear"],
  ["helmet", "Head", "Hats and head protection"], ["boots", "Feet", "Shoes and boots"],
  ["gloves", "Hands", "Gloves and knuckles"], ["accessory", "Accessory", "Rings and watches"],
];
const icon = kind => kind === "weapon" ? "combat" : kind === "armor" ? "property" : kind === "accessory" ? "awards" : "hospital";

function Stats({ item }) {
  const stats = [["ATK", item.attack], ["DEF", item.defense], ["SPD", item.speed], ["DEX", item.dexterity]].filter(([, value]) => Number(value) > 0);
  return <div className="item-stats">{stats.length ? stats.map(([name, value]) => <span key={name}><small>{name}</small><b>+{value}</b></span>) : <span><small>POWER</small><b>{item.power || 0}</b></span>}</div>;
}

export function InventoryEquipment({ inventory, loadout, level, busy, onAction }) {
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState("");
  const equipped = useMemo(() => Object.fromEntries((loadout?.equipment || []).map(item => [item.slot, item])), [loadout]);
  const visible = inventory.filter(item => (filter === "all" || item.kind === filter) && item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="equipment-page" data-tutorial="equipment">
    <section className="loadout-panel">
      <header><div><small>CURRENT LOADOUT</small><h2>Equipment slots</h2></div><div className="loadout-totals">{[["ATK",loadout?.bonuses?.attack],["DEF",loadout?.bonuses?.defense],["SPD",loadout?.bonuses?.speed],["DEX",loadout?.bonuses?.dexterity]].map(([key,value]) => <span key={key}><small>{key}</small><b>+{value || 0}</b></span>)}</div></header>
      <div className="loadout-body"><div className="body-silhouette"><i className="head"/><i className="torso"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/></div>{SLOTS.map(([slot, label, help]) => { const item = equipped[slot]; return <article data-slot={slot} className={item ? `filled ${item.rarity}` : ""} key={slot}><span><GameIcon name={item ? icon(item.kind) : "inventory"}/></span><div><small>{label}</small><b>{item?.name || "Empty slot"}</b><p>{item ? `${item.rarity} · level ${item.level_required}` : help}</p></div>{item && <button disabled={busy} onClick={() => onAction("bw_unequip_slot", { p_slot: slot }, `${item.name} unequipped.`)}>×</button>}</article>; })}</div>
    </section>
    <section className="inventory-panel">
      <header><div><small>PERSONAL EFFECTS</small><h2>Your inventory</h2><p>{inventory.reduce((sum, item) => sum + item.quantity, 0)} items across {inventory.length} types</p></div><div className="inventory-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search inventory" aria-label="Search inventory"/><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All types</option><option value="weapon">Weapons</option><option value="armor">Armor</option><option value="accessory">Accessories</option><option value="medical">Medical</option><option value="booster">Boosters</option></select></div></header>
      {visible.length === 0 ? <div className="inventory-empty"><b>No matching items</b><p>Buy equipment and supplies from City Shops.</p></div> : <div className="item-card-grid">{visible.map(item => { const isEquipped = equipped[item.slot]?.item_id === item.item_id; return <article className={item.rarity || "common"} key={item.item_id}><div className="item-card-head"><i><GameIcon name={icon(item.kind)}/></i><span><small>{item.kind} · {item.quantity} owned</small><b>{item.name}</b></span><em>{item.rarity || "common"}</em></div><p>{item.description}</p><Stats item={item}/><footer>{item.slot && <button className={isEquipped ? "equipped" : ""} disabled={busy || isEquipped || level < item.level_required} onClick={() => onAction("bw_equip_item", { p_item_id: item.item_id }, `${item.name} equipped.`)}>{isEquipped ? "Equipped" : level < item.level_required ? `Level ${item.level_required}` : `Equip · ${item.slot}`}</button>}{item.usable && <button disabled={busy} onClick={() => onAction("bw_use_item", { p_item_id: item.item_id }, `${item.name} used.`)}>Use item</button>}</footer></article>; })}</div>}
    </section>
  </div>;
}

export function ItemShop({ items, cash, level, busy, onBuy }) {
  const [query, setQuery] = useState(""), [slot, setSlot] = useState("all"), [page, setPage] = useState(1);
  const pageSize = 24;
  const stock = useMemo(() => items.filter(item => !item.drop_only), [items]);
  const filtered = useMemo(() => stock.filter(item => (slot === "all" || item.slot === slot || item.kind === slot) && item.name.toLowerCase().includes(query.toLowerCase())), [stock, query, slot]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const current = Math.min(page, pages); const shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const change = setter => event => { setter(event.target.value); setPage(1); };
  return <div className="catalog-page"><header className="catalog-tools"><div><small>BLACKWOOD EQUIPMENT CATALOG</small><h2>{stock.length} purchasable items</h2><p>Rare relics are excluded: they must be found through play or bought from another player.</p></div><div><input value={query} onChange={change(setQuery)} placeholder="Search 200+ items" aria-label="Search shop"/><select value={slot} onChange={change(setSlot)}><option value="all">Every category</option>{SLOTS.map(([id,label]) => <option value={id} key={id}>{label}</option>)}<option value="medical">Medical</option><option value="booster">Boosters</option></select></div></header><div className="catalog-count">Showing {shown.length} of {filtered.length} items · Page {current} of {pages}</div><div className="item-card-grid shop-grid">{shown.map(item => <article className={item.rarity || "common"} key={item.id}><div className="item-card-head"><i><GameIcon name={icon(item.kind)}/></i><span><small>{item.slot || item.kind} · level {item.level_required || 1}</small><b>{item.name}</b></span><em>{item.rarity || "common"}</em></div><p>{item.description}</p><Stats item={item}/><footer><strong>{money(item.price)}</strong><button disabled={busy || cash < item.price} onClick={() => onBuy(item)}>{cash < item.price ? "Insufficient cash" : level < (item.level_required || 1) ? "Buy for later" : "Purchase"}</button></footer></article>)}</div><nav className="catalog-pages"><button disabled={current <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>{current} / {pages}</span><button disabled={current >= pages} onClick={() => setPage(value => value + 1)}>Next</button></nav></div>;
}
