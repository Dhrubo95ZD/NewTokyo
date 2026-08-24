import { useEffect, useMemo, useRef, useState } from "react";
import { RunnerPortrait } from "./CharacterCreator.jsx";
import "./inventory.css";

export const SLOT_ORDER = ["weapon", "helmet", "armor", "boots"];
export const RARITY_ORDER = ["green", "blue", "yellow", "orange", "prismatic"];
export const RARITIES = {
  green: { label: "Green", color: "#43df72", weight: 60, shard: 4, enhance: 2 },
  blue: { label: "Blue", color: "#438dff", weight: 28, shard: 10, enhance: 5 },
  yellow: { label: "Yellow", color: "#ffe052", weight: 9.5, shard: 25, enhance: 12 },
  orange: { label: "Orange", color: "#ff862d", weight: 2.4, shard: 80, enhance: 30 },
  prismatic: { label: "Prismatic", color: "#f66cff", weight: .1, shard: 300, enhance: 75 },
};

export const SETS = [
  { id: "street-ronin", name: "Street Ronin", atlas: "/assets/loot-v2/street-ronin.webp", pieces: ["Katana", "Drifter Cowl", "Rogue Jacket", "Road Boots"], two: "+8 Speed", four: "Counterstrike: 12%" },
  { id: "neon-sentinel", name: "Neon Sentinel", atlas: "/assets/loot-v2/neon-sentinel.webp", pieces: ["Pulse Longsword", "Aegis Helm", "Sentinel Plate", "Mag Boots"], two: "+10 Defense", four: "Barrier on low HP" },
  { id: "void-reaver", name: "Void Reaver", atlas: "/assets/loot-v2/void-reaver.webp", pieces: ["Phase Scythe", "Abyss Cowl", "Reaver Harness", "Silent Tabi"], two: "+8 Attack", four: "Void crits deal x2" },
  { id: "crimson-oni", name: "Crimson Oni", atlas: "/assets/loot-v2/crimson-oni.webp", pieces: ["Oni Cleaver", "Demon Kabuto", "Oni Warplate", "Demon Greaves"], two: "+12 Attack", four: "Berserk under 30% HP" },
  { id: "ghost-protocol", name: "Ghost Protocol", atlas: "/assets/loot-v2/ghost-protocol.webp", pieces: ["Data Blade", "Ghost Visor", "Protocol Mantle", "Zero-G Boots"], two: "+10 Tech", four: "First hit always evades" },
  { id: "chrome-wraith", name: "Chrome Wraith", atlas: "/assets/loot-v2/chrome-wraith.webp", pieces: ["Wraith Spear", "Chrome Skull", "Piston Cage", "Mercury Boots"], two: "+8 Defense", four: "Heal 4% on takedown" },
  { id: "biohazard-lotus", name: "Biohazard Lotus", atlas: "/assets/loot-v2/biohazard-lotus.webp", pieces: ["Lotus Blade", "Bloom Mask", "Living Carapace", "Rootwalkers"], two: "+10 Tech", four: "Toxin stacks on hit" },
  { id: "solar-shogun", name: "Solar Shogun", atlas: "/assets/loot-v2/solar-shogun.webp", pieces: ["Sun Nodachi", "Solar Crown", "Shogun Radiance", "Jet Greaves"], two: "+10 Attack", four: "Solar burst every 5 hits" },
  { id: "glacier-viper", name: "Glacier Viper", atlas: "/assets/loot-v2/glacier-viper.webp", pieces: ["Cryo Chainblade", "Viper Helm", "Frostscale Coat", "Ice Talons"], two: "+8 Defense", four: "18% chance to freeze" },
  { id: "storm-circuit", name: "Storm Circuit", atlas: "/assets/loot-v2/storm-circuit.webp", pieces: ["Rail Sword", "Racer Helm", "Circuit Armor", "Turbine Boots"], two: "+12 Speed", four: "Extra action on dodge" },
];

const TIER_WORDS = ["Street", "Tuned", "Elite", "Apex", "Prismatic"];
const SLOT_BASE = { weapon: { attack: 7 }, helmet: { defense: 3, tech: 2 }, armor: { defense: 8 }, boots: { speed: 5, defense: 1 } };
const TIER_POWER = [1, 1.7, 2.8, 4.5, 7.5];

export const LOOT = SETS.flatMap((set, setIndex) => RARITY_ORDER.flatMap((rarity, rarityIndex) => SLOT_ORDER.map((slot, slotIndex) => ({
  id: `${set.id}:${rarity}:${slot}`, setId: set.id, setName: set.name, slot, rarity,
  name: `${TIER_WORDS[rarityIndex]} ${set.pieces[slotIndex]}`, atlas: set.atlas,
  atlasX: slotIndex, atlasY: rarityIndex,
  lore: `${set.name} ${slot}. ${rarity === "prismatic" ? "An impossible spectrum moves beneath its surface." : `Calibrated ${RARITIES[rarity].label.toLowerCase()}-grade underworld gear.`}`,
  stats: Object.fromEntries(Object.entries(SLOT_BASE[slot]).map(([key, value]) => [key, Math.round(value * TIER_POWER[rarityIndex] * (1 + setIndex * .025))])),
}))));

export const starterInventory = () => ({
  version: 2, owned: [], equipped: { weapon: null, helmet: null, armor: null, boots: null },
  enhancement: {}, shards: 0, runs: 0, prismPity: 0, history: [],
});

export const normalizeInventory = (value) => {
  if (!value || value.version !== 2) return starterInventory();
  const validIds = new Set(LOOT.map((item) => item.id));
  return {
    ...starterInventory(), ...value,
    owned: [...new Set((value.owned || []).filter((id) => validIds.has(id)))],
    equipped: Object.fromEntries(SLOT_ORDER.map((slot) => [slot, validIds.has(value.equipped?.[slot]) ? value.equipped[slot] : null])),
    enhancement: Object.fromEntries(Object.entries(value.enhancement || {}).filter(([id]) => validIds.has(id)).map(([id, level]) => [id, Math.max(0, Math.min(20, Number(level) || 0))])),
  };
};

const byId = (id) => LOOT.find((item) => item.id === id);
const enhancedStats = (item, level = 0) => Object.fromEntries(Object.entries(item?.stats || {}).map(([key, value]) => [key, Math.round(value * (1 + level * .06))]));

export function ItemArt({ item, level = 0, small = false, locked = false }) {
  if (!item) return <span className="v2-empty-art">＋</span>;
  const rarity = RARITIES[item.rarity];
  return <div className={`v2-item-art tier-${item.rarity} ${small ? "small" : ""} ${locked ? "locked" : ""}`} style={{ "--tier": rarity.color }}>
    <div className="atlas-sprite" style={{ backgroundImage: `url(${item.atlas})`, backgroundSize: "400% 500%", backgroundPosition: `${item.atlasX * 100 / 3}% ${item.atlasY * 100 / 4}%` }}/>
    {level > 0 && <b>+{level}</b>}<i />
  </div>;
}

function StatBlocks({ totals }) {
  return <div className="v2-stats">{["attack", "defense", "speed", "tech"].map((stat) => <div key={stat}><span>{stat}</span><b>{totals[stat] || 0}</b></div>)}</div>;
}

export default function Inventory({ profile, value, onChange, onClose }) {
  const inventory = normalizeInventory(value);
  const [tab, setTab] = useState("loadout");
  const [slotFilter, setSlotFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(inventory.owned[0] || null);
  const [running, setRunning] = useState(false);
  const [drop, setDrop] = useState(null);
  const [forgeResult, setForgeResult] = useState("");
  const runTimer = useRef(null);
  useEffect(() => () => clearTimeout(runTimer.current), []);
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned]);
  const selected = byId(selectedId);
  const equipment = Object.fromEntries(SLOT_ORDER.map((slot) => [slot, byId(inventory.equipped[slot])]));
  const totals = useMemo(() => Object.values(inventory.equipped).reduce((sum, id) => {
    const item = byId(id); const stats = enhancedStats(item, inventory.enhancement[id] || 0);
    for (const [key, amount] of Object.entries(stats)) sum[key] = (sum[key] || 0) + amount;
    return sum;
  }, {}), [value]);
  const setCounts = SLOT_ORDER.reduce((counts, slot) => { const item = equipment[slot]; if (item) counts[item.setId] = (counts[item.setId] || 0) + 1; return counts; }, {});
  const filtered = LOOT.filter((item) => owned.has(item.id) && (slotFilter === "all" || item.slot === slotFilter) && (rarityFilter === "all" || item.rarity === rarityFilter));
  const score = Object.values(totals).reduce((a, b) => a + b, 0);

  const equip = (item) => {
    if (!item || !owned.has(item.id)) return;
    onChange({ ...inventory, equipped: { ...inventory.equipped, [item.slot]: item.id } });
  };
  const unequip = (slot) => onChange({ ...inventory, equipped: { ...inventory.equipped, [slot]: null } });
  const rollRarity = () => {
    if (inventory.prismPity >= 999) return "prismatic";
    const roll = Math.random() * 100; let cursor = 0;
    for (const rarity of RARITY_ORDER) { cursor += RARITIES[rarity].weight; if (roll <= cursor) return rarity; }
    return "green";
  };
  const finishRun = () => {
    const rarity = rollRarity();
    const pool = LOOT.filter((item) => item.rarity === rarity);
    const item = pool[Math.floor(Math.random() * pool.length)];
    const duplicate = owned.has(item.id);
    const next = { ...inventory, runs: inventory.runs + 1, prismPity: rarity === "prismatic" ? 0 : inventory.prismPity + 1 };
    if (duplicate) next.shards = inventory.shards + RARITIES[rarity].shard;
    else next.owned = [...inventory.owned, item.id];
    next.history = [{ id: item.id, duplicate, at: Date.now() }, ...(inventory.history || [])].slice(0, 12);
    onChange(next); setSelectedId(item.id); setDrop({ item, duplicate, shards: duplicate ? RARITIES[rarity].shard : 0 }); setRunning(false);
  };
  const startRun = () => {
    if (running) return;
    setRunning(true); setForgeResult("");
    clearTimeout(runTimer.current); runTimer.current = setTimeout(finishRun, 4200);
  };
  const enhance = () => {
    if (!selected || !owned.has(selected.id)) return;
    const level = inventory.enhancement[selected.id] || 0;
    if (level >= 20) return;
    const cost = RARITIES[selected.rarity].enhance * (level + 1);
    if (inventory.shards < cost) { setForgeResult("Not enough Nano Shards"); return; }
    const chance = level < 5 ? 1 : level < 10 ? .82 : level < 15 ? .58 : level < 19 ? .32 : .16;
    const success = Math.random() <= chance;
    const next = { ...inventory, shards: inventory.shards - cost };
    if (success) next.enhancement = { ...inventory.enhancement, [selected.id]: level + 1 };
    onChange(next); setForgeResult(success ? `Enhancement successful: +${level + 1}` : "Enhancement failed — level protected");
  };

  return <main className="inventory-v2">
    <header className="v2-header"><div><small>NEO GRID // ARMORY V2</small><h1>Runner Systems</h1></div><div className="v2-resources"><span>GEAR <b>{score}</b></span><span>SHARDS <b>{inventory.shards}</b></span></div><button onClick={onClose}>Close</button></header>
    <nav className="v2-tabs">{[["loadout","Loadout"],["vault","Vault"],["enhance","Enhancement"],["runs","District Runs"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "vault" && <i>{inventory.owned.length}</i>}</button>)}</nav>

    {tab === "loadout" && <section className="loadout-v2">
      <div className="v2-paperdoll"><div className="v2-beam"/><RunnerPortrait profile={profile}/><div className="v2-runner-name"><b>{profile.codename}</b><span>{score ? `GEAR SCORE ${score}` : "NO EQUIPMENT"}</span></div></div>
      <div className="v2-slots"><h2>Equipment</h2>{SLOT_ORDER.map((slot) => { const item = equipment[slot]; return <article key={slot} className={`v2-slot ${item ? `tier-${item.rarity}` : "empty"}`} style={{ "--tier": item ? RARITIES[item.rarity].color : "#36405a" }}><button onClick={() => item ? (setSelectedId(item.id), setTab("enhance")) : setTab("vault")}><ItemArt item={item} level={inventory.enhancement[item?.id] || 0} small/><div><small>{slot}</small><b>{item?.name || "Empty slot"}</b>{item && <span>{item.setName}</span>}</div></button>{item && <button className="unequip" onClick={() => unequip(slot)}>×</button>}</article>;})}<StatBlocks totals={totals}/></div>
      <aside className="v2-set-bonuses"><h2>Active sets</h2>{Object.keys(setCounts).length === 0 && <p>Equip matching pieces to activate 2-piece and 4-piece powers.</p>}{Object.entries(setCounts).map(([setId, count]) => { const set = SETS.find((s) => s.id === setId); return <div key={setId}><b>{set.name}</b><span>{count}/4 pieces</span><small className={count >= 2 ? "on" : ""}>2PC · {set.two}</small><small className={count >= 4 ? "on" : ""}>4PC · {set.four}</small></div>;})}</aside>
    </section>}

    {tab === "vault" && <section className="vault-v2"><div className="v2-filters"><div>{["all", ...SLOT_ORDER].map((slot) => <button key={slot} className={slotFilter === slot ? "active" : ""} onClick={() => setSlotFilter(slot)}>{slot}</button>)}</div><div>{["all", ...RARITY_ORDER].map((rarity) => <button key={rarity} className={rarityFilter === rarity ? "active" : ""} onClick={() => setRarityFilter(rarity)}>{rarity}</button>)}</div></div>{inventory.owned.length === 0 ? <div className="empty-vault"><span>◇</span><h2>Your vault is empty</h2><p>Equipment is earned from District Runs. Nothing is pre-equipped.</p><button onClick={() => setTab("runs")}>Start grinding</button></div> : <><div className="v2-grid">{filtered.map((item) => <button key={item.id} className={`v2-card tier-${item.rarity} ${selectedId === item.id ? "selected" : ""}`} style={{ "--tier": RARITIES[item.rarity].color }} onClick={() => setSelectedId(item.id)}><ItemArt item={item} level={inventory.enhancement[item.id] || 0}/><b>{item.name}</b><span>{item.setName}</span></button>)}</div>{selected && owned.has(selected.id) && <ItemDetail item={selected} level={inventory.enhancement[selected.id] || 0} equipped={inventory.equipped[selected.slot] === selected.id} onEquip={() => equip(selected)} onEnhance={() => setTab("enhance")}/>}</> }</section>}

    {tab === "enhance" && <section className="forge-v2">{!selected || !owned.has(selected.id) ? <div className="forge-empty"><h2>No item selected</h2><p>Earn an item in District Runs, then select it from the Vault.</p><button onClick={() => setTab(inventory.owned.length ? "vault" : "runs")}>{inventory.owned.length ? "Open vault" : "Start a run"}</button></div> : <><div className={`forge-art tier-${selected.rarity}`} style={{ "--tier": RARITIES[selected.rarity].color }}><ItemArt item={selected} level={inventory.enhancement[selected.id] || 0}/><div className="forge-rings"/></div><div className="forge-console"><small style={{ color: RARITIES[selected.rarity].color }}>{RARITIES[selected.rarity].label} · {selected.setName}</small><h2>{selected.name}</h2><div className="enhance-level"><span>Enhancement</span><b>+{inventory.enhancement[selected.id] || 0}</b><em>/ +20</em></div><div className="enhance-track">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < (inventory.enhancement[selected.id] || 0) ? "on" : ""}/>)}</div><StatBlocks totals={enhancedStats(selected, inventory.enhancement[selected.id] || 0)}/><p>Success falls at high levels. Failure consumes shards but never destroys or downgrades the item.</p>{(inventory.enhancement[selected.id] || 0) < 20 ? <button className="enhance-action" onClick={enhance}>Enhance · {RARITIES[selected.rarity].enhance * ((inventory.enhancement[selected.id] || 0) + 1)} shards</button> : <b className="maxed">MAXIMUM +20</b>}{forgeResult && <strong className={forgeResult.includes("successful") ? "success" : "fail"}>{forgeResult}</strong>}</div><div className="forge-list">{inventory.owned.map(byId).filter(Boolean).map((item) => <button key={item.id} className={selected.id === item.id ? "active" : ""} onClick={() => { setSelectedId(item.id); setForgeResult(""); }}><ItemArt item={item} level={inventory.enhancement[item.id] || 0} small/><span>{item.name}</span></button>)}</div></>}</section>}

    {tab === "runs" && <section className="runs-v2"><div className="run-zone"><small>SHIBUYA UNDERCITY</small><h2>District Sweep</h2><p>Fight through hostile blocks and extract one equipment drop. Prismatic gear has a 0.1% base chance with a guaranteed pity drop at 1,000 dry runs.</p><div className="drop-rates">{RARITY_ORDER.map((rarity) => <span key={rarity} style={{ "--tier": RARITIES[rarity].color }}><i/>{RARITIES[rarity].label}<b>{RARITIES[rarity].weight}%</b></span>)}</div><button className={`run-action ${running ? "running" : ""}`} onClick={startRun} disabled={running}>{running ? <><i/>Engagement in progress…</> : "Start District Run"}</button><div className="run-stats"><span>RUNS <b>{inventory.runs}</b></span><span>PRISM PITY <b>{inventory.prismPity}/1000</b></span><span>VAULT <b>{inventory.owned.length}/200</b></span></div></div><aside className="run-history"><h3>Recent extractions</h3>{!(inventory.history || []).length && <p>No run data yet.</p>}{(inventory.history || []).map((entry, index) => { const item = byId(entry.id); return item && <div key={`${entry.at}-${index}`}><ItemArt item={item} small/><span><b>{item.name}</b><small>{entry.duplicate ? `Duplicate · +${RARITIES[item.rarity].shard} shards` : "New equipment"}</small></span></div>;})}</aside></section>}

    {drop && <div className="v2-reveal" onClick={() => setDrop(null)}><div className={`v2-reveal-card tier-${drop.item.rarity}`} style={{ "--tier": RARITIES[drop.item.rarity].color }}><small>{drop.duplicate ? `DUPLICATE · +${drop.shards} SHARDS` : "NEW EQUIPMENT"}</small><ItemArt item={drop.item}/><h2>{drop.item.name}</h2><b>{RARITIES[drop.item.rarity].label}</b><p>Tap to continue</p></div></div>}
  </main>;
}

function ItemDetail({ item, level, equipped, onEquip, onEnhance }) {
  return <div className="v2-detail"><ItemArt item={item} level={level}/><div><small style={{ color: RARITIES[item.rarity].color }}>{RARITIES[item.rarity].label} · {item.slot}</small><h3>{item.name}</h3><span>{item.setName}</span><p>{item.lore}</p><div>{Object.entries(enhancedStats(item, level)).map(([key, val]) => <i key={key}>{key} <b>+{val}</b></i>)}</div></div><footer><button onClick={onEquip}>{equipped ? "Equipped" : "Equip"}</button><button onClick={onEnhance}>Enhance +{level}</button></footer></div>;
}
