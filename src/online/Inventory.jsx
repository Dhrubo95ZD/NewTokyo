import { useMemo, useState } from "react";
import { RunnerPortrait } from "./CharacterCreator.jsx";
import "./inventory.css";

export const RARITIES = {
  common: { label: "Common", color: "#9aa5b8", weight: 42 },
  uncommon: { label: "Uncommon", color: "#45d483", weight: 27 },
  rare: { label: "Rare", color: "#4fa8ff", weight: 17 },
  epic: { label: "Epic", color: "#b769ff", weight: 9 },
  legendary: { label: "Legendary", color: "#ffad32", weight: 4 },
  mythic: { label: "Mythic", color: "#5df7ff", weight: 1 },
};

const makeItems = (slot, names, stats) => names.map((name, index) => ({
  id: `${slot}-${index}`, slot, name, image: `/assets/loot/${slot}-${index}.webp`,
  rarity: ["common", "uncommon", "rare", "epic", "legendary", "mythic"][index],
  lore: [
    "Built in the alleys. Reliable when nothing else is.", "Corporate surplus with the serials burned away.",
    "A specialist piece traded only on encrypted markets.", "Forged for an Oni clan executioner.",
    "Ryujin relic. Heat signatures resemble a living dragon.", "Prototype hardware that should not exist.",
  ][index],
  stats: stats[index],
}));

export const LOOT = [
  ...makeItems("weapon", ["Rust Viper", "Arc Saber", "Oni Cleaver", "Widow Thread", "Ryujin Ascendant", "Seraph Techbow"], [
    { attack: 5 }, { attack: 9, tech: 2 }, { attack: 15, defense: 2 }, { attack: 19, speed: 5 }, { attack: 29, defense: 4 }, { attack: 34, speed: 7, tech: 8 },
  ]),
  ...makeItems("armor", ["Alley Jacket", "Aegis Rig", "Nightweave Coat", "Oni Warplate", "Ryujin Cuirass", "Ghost Protocol Mantle"], [
    { defense: 4 }, { defense: 9 }, { defense: 11, speed: 3 }, { defense: 18, attack: 3 }, { defense: 27, attack: 5 }, { defense: 25, speed: 7, tech: 9 },
  ]),
  ...makeItems("helmet", ["Dustbreather", "Sentinel Helm", "Void Cowl", "Oni Kabuto", "Ryujin Crown", "Ghostlink Visor"], [
    { defense: 2 }, { defense: 5, tech: 1 }, { defense: 6, speed: 3 }, { defense: 10, attack: 3 }, { defense: 15, attack: 4 }, { defense: 13, speed: 5, tech: 10 },
  ]),
  ...makeItems("boots", ["Street Stompers", "Mag-Lock Boots", "Shade Tabi", "Oni Greaves", "Ryujin Talons", "Zero-G Runners"], [
    { speed: 3 }, { speed: 6, defense: 1 }, { speed: 10 }, { speed: 11, defense: 5 }, { speed: 17, attack: 4 }, { speed: 22, tech: 7 },
  ]),
];

export const starterInventory = () => ({
  owned: ["weapon-0", "armor-0", "helmet-0", "boots-0"],
  equipped: { weapon: "weapon-0", armor: "armor-0", helmet: "helmet-0", boots: "boots-0" },
  upgrades: {}, lastCache: 0,
});

export const normalizeInventory = (value) => {
  const starter = starterInventory();
  return {
    ...starter, ...(value || {}),
    owned: [...new Set([...(starter.owned), ...((value?.owned) || [])])],
    equipped: { ...starter.equipped, ...(value?.equipped || {}) },
    upgrades: { ...(value?.upgrades || {}) },
  };
};

const byId = (id) => LOOT.find((item) => item.id === id);
const scaledStats = (item, rank = 0) => Object.fromEntries(Object.entries(item?.stats || {}).map(([key, value]) => [key, Math.round(value * (1 + rank * .12))]));

function ItemArt({ item, rank = 0, small = false }) {
  if (!item) return <span className="empty-art">＋</span>;
  const rarity = RARITIES[item.rarity];
  return <div className={`item-art rarity-${item.rarity} ${small ? "small" : ""}`} style={{ "--rarity": rarity.color }}><img src={item.image} alt={item.name}/>{rank > 0 && <b>+{rank}</b>}<i /></div>;
}

export default function Inventory({ profile, value, onChange, onClose }) {
  const inventory = normalizeInventory(value);
  const [filter, setFilter] = useState("all");
  const [showLocked, setShowLocked] = useState(false);
  const [selectedId, setSelectedId] = useState(inventory.equipped.weapon);
  const [drop, setDrop] = useState(null);
  const selected = byId(selectedId);
  const owned = new Set(inventory.owned);
  const equipment = Object.fromEntries(Object.entries(inventory.equipped).map(([slot, id]) => [slot, byId(id)]));
  const totals = useMemo(() => Object.values(inventory.equipped).reduce((sum, id) => {
    const item = byId(id); const stats = scaledStats(item, inventory.upgrades[id] || 0);
    for (const [key, amount] of Object.entries(stats)) sum[key] = (sum[key] || 0) + amount;
    return sum;
  }, {}), [value]);
  const items = LOOT.filter((item) => (filter === "all" || item.slot === filter) && (showLocked || owned.has(item.id)));

  const equip = (item) => {
    if (!owned.has(item.id)) return;
    onChange({ ...inventory, equipped: { ...inventory.equipped, [item.slot]: item.id } });
  };
  const openCache = () => {
    if (Date.now() - inventory.lastCache < 4 * 60 * 60 * 1000) return;
    const roll = Math.random() * 100; let cursor = 0; let rarity = "common";
    for (const [key, data] of Object.entries(RARITIES)) { cursor += data.weight; if (roll <= cursor) { rarity = key; break; } }
    const pool = LOOT.filter((item) => item.rarity === rarity);
    const item = pool[Math.floor(Math.random() * pool.length)];
    const duplicate = owned.has(item.id);
    const next = { ...inventory, lastCache: Date.now() };
    if (duplicate) next.upgrades = { ...inventory.upgrades, [item.id]: Math.min(10, (inventory.upgrades[item.id] || 0) + 1) };
    else next.owned = [...inventory.owned, item.id];
    onChange(next); setSelectedId(item.id); setDrop({ item, duplicate });
  };
  const cacheReady = Date.now() - inventory.lastCache >= 4 * 60 * 60 * 1000;

  return <main className="inventory-screen">
    <header className="inventory-header"><div><small>NEO GRID // ARMORY</small><h1>Runner Loadout</h1></div><div className="power-score"><span>GEAR SCORE</span><b>{Object.values(totals).reduce((a,b) => a+b, 0)}</b></div><button onClick={onClose}>Close</button></header>
    <section className="inventory-layout">
      <aside className="equipment-panel"><h2>Equipped</h2>{["helmet","weapon","armor","boots"].map((slot) => { const item = equipment[slot]; return <button key={slot} className={`equip-slot rarity-${item?.rarity || "common"}`} style={{ "--rarity": RARITIES[item?.rarity || "common"].color }} onClick={() => { setFilter(slot); setSelectedId(item?.id); }}><ItemArt item={item} rank={inventory.upgrades[item?.id] || 0} small/><span><small>{slot}</small><b>{item?.name || "Empty"}</b></span></button>;})}<div className="total-stats">{["attack","defense","speed","tech"].map((stat) => <div key={stat}><span>{stat}</span><b>{totals[stat] || 0}</b></div>)}</div></aside>
      <div className="loadout-stage"><div className="rarity-beam" style={{ "--beam": RARITIES[equipment.weapon?.rarity || "common"].color }}/><RunnerPortrait profile={profile}/>{["weapon","helmet","armor","boots"].map((slot) => <div key={slot} className={`equipped-showcase ${slot}`}><ItemArt item={equipment[slot]}/><span>{equipment[slot]?.name}</span></div>)}<div className="stage-caption"><b>{profile.codename}</b><span>{[equipment.helmet,equipment.armor,equipment.boots].filter(Boolean).map(i=>RARITIES[i.rarity].label).sort().pop()} LOADOUT</span></div></div>
      <section className="inventory-panel"><div className="inventory-toolbar"><div>{["all","weapon","armor","helmet","boots"].map((slot) => <button key={slot} className={filter === slot ? "active" : ""} onClick={() => setFilter(slot)}>{slot}</button>)}</div><label><input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)}/>Loot codex</label></div><div className="item-grid">{items.map((item) => <button key={item.id} className={`item-card rarity-${item.rarity} ${selectedId === item.id ? "selected" : ""} ${owned.has(item.id) ? "" : "locked"}`} style={{ "--rarity": RARITIES[item.rarity].color }} onClick={() => setSelectedId(item.id)} onDoubleClick={() => equip(item)}><ItemArt item={item} rank={inventory.upgrades[item.id] || 0}/><span><b>{item.name}</b><small>{RARITIES[item.rarity].label}</small></span></button>)}</div><div className="item-detail">{selected && <><ItemArt item={selected} rank={inventory.upgrades[selected.id] || 0}/><div><small style={{color:RARITIES[selected.rarity].color}}>{RARITIES[selected.rarity].label} {selected.slot}</small><h3>{selected.name}</h3><p>{selected.lore}</p><div className="stat-row">{Object.entries(scaledStats(selected, inventory.upgrades[selected.id] || 0)).map(([key,val]) => <span key={key}>{key} <b>+{val}</b></span>)}</div></div>{owned.has(selected.id) ? <button className="equip-action" onClick={() => equip(selected)}>{inventory.equipped[selected.slot] === selected.id ? "Equipped" : "Equip"}</button> : <b className="locked-label">UNDISCOVERED</b>}</>}</div><button className={`cache-button ${cacheReady ? "ready" : ""}`} onClick={openCache} disabled={!cacheReady}><span>◇</span><div><b>{cacheReady ? "Open Street Cache" : "Cache decrypting"}</b><small>{cacheReady ? "Weighted drop · duplicates upgrade gear" : "Returns in under 4 hours"}</small></div></button></section>
    </section>
    {drop && <div className="loot-reveal" onClick={() => setDrop(null)}><div className={`reveal-card rarity-${drop.item.rarity}`} style={{ "--rarity": RARITIES[drop.item.rarity].color }}><small>{drop.duplicate ? "GEAR UPGRADED" : "NEW LOOT"}</small><ItemArt item={drop.item} rank={inventory.upgrades[drop.item.id] || 0}/><h2>{drop.item.name}</h2><b>{RARITIES[drop.item.rarity].label}</b><p>Tap anywhere to continue</p></div></div>}
  </main>;
}
