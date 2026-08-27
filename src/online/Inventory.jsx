import { useMemo, useState } from "react";
import { Brawl } from "../NeoTokyoUnderworld.jsx";
import DistrictCampaign from "../game/DistrictCampaign.jsx";
import { RunnerPortrait } from "./CharacterCreator.jsx";
import "./inventory.css";

export const GEAR_SLOTS = ["weapon", "helmet", "armor", "boots"];
export const SLOT_ORDER = [...GEAR_SLOTS, "megachip"];
export const RARITY_ORDER = ["green", "blue", "yellow", "orange", "prismatic"];
export const RARITIES = {
  green: { label: "Green", color: "#43df72", weight: 60, shard: 4, enhance: 2 },
  blue: { label: "Blue", color: "#438dff", weight: 28, shard: 10, enhance: 5 },
  yellow: { label: "Yellow", color: "#ffe052", weight: 9.5, shard: 25, enhance: 12 },
  orange: { label: "Orange", color: "#ff862d", weight: 2.4, shard: 80, enhance: 30 },
  prismatic: { label: "Prismatic", color: "#f66cff", weight: .1, shard: 300, enhance: 75 },
};

export const SETS = [
  { id: "street-ronin", name: "Street Ronin", atlas: "/assets/loot-v2/street-ronin.webp", pieces: ["Katana", "Drifter Cowl", "Rogue Jacket", "Road Boots"], two: "+8 Speed", four: "+6% Critical" },
  { id: "neon-sentinel", name: "Neon Sentinel", atlas: "/assets/loot-v2/neon-sentinel.webp", pieces: ["Pulse Longsword", "Aegis Helm", "Sentinel Plate", "Mag Boots"], two: "+10 Defense", four: "+30 Max HP" },
  { id: "void-reaver", name: "Void Reaver", atlas: "/assets/loot-v2/void-reaver.webp", pieces: ["Phase Scythe", "Abyss Cowl", "Reaver Harness", "Silent Tabi"], two: "+8 Attack", four: "+10% Critical" },
  { id: "crimson-oni", name: "Crimson Vanguard", atlas: "/assets/loot-v2/crimson-oni.webp", pieces: ["Vanguard Cleaver", "Crimson Kabuto", "Vanguard Warplate", "Vanguard Greaves"], two: "+12 Attack", four: "+18 Attack" },
  { id: "ghost-protocol", name: "Ghost Protocol", atlas: "/assets/loot-v2/ghost-protocol.webp", pieces: ["Data Blade", "Ghost Visor", "Protocol Mantle", "Zero-G Boots"], two: "+10 Tech", four: "+15 Speed" },
  { id: "chrome-wraith", name: "Chrome Mirage", atlas: "/assets/loot-v2/chrome-wraith.webp", pieces: ["Mirage Spear", "Chrome Visor", "Piston Cage", "Mercury Boots"], two: "+8 Defense", four: "+25 Max HP" },
  { id: "biohazard-lotus", name: "Biohazard Lotus", atlas: "/assets/loot-v2/biohazard-lotus.webp", pieces: ["Lotus Blade", "Bloom Mask", "Living Carapace", "Rootwalkers"], two: "+10 Tech", four: "+15 Tech" },
  { id: "solar-shogun", name: "Solar Shogun", atlas: "/assets/loot-v2/solar-shogun.webp", pieces: ["Sun Nodachi", "Solar Crown", "Shogun Radiance", "Jet Greaves"], two: "+10 Attack", four: "+15 Attack" },
  { id: "glacier-viper", name: "Glacier Viper", atlas: "/assets/loot-v2/glacier-viper.webp", pieces: ["Cryo Chainblade", "Viper Helm", "Frostscale Coat", "Ice Talons"], two: "+8 Defense", four: "+15 Defense" },
  { id: "storm-circuit", name: "Storm Circuit", atlas: "/assets/loot-v2/storm-circuit.webp", pieces: ["Rail Sword", "Racer Helm", "Circuit Armor", "Turbine Boots"], two: "+12 Speed", four: "+18 Speed" },
  { id: "kinetic-courier", name: "Kinetic Courier", atlas: "/assets/loot-v2/street-ronin.webp", pieces: ["Vector Edge", "Courier Lens", "Slipstream Coat", "Kinetic Treads"], two: "Dash Momentum", four: "Moving attacks build Overdrive" },
  { id: "signal-bastion", name: "Signal Bastion", atlas: "/assets/loot-v2/neon-sentinel.webp", pieces: ["Ward Cutter", "Signal Crown", "Bastion Shell", "Anchor Boots"], two: "Adaptive Barrier", four: "Guard shares a team shield" },
  { id: "foundry-breaker", name: "Foundry Breaker", atlas: "/assets/loot-v2/crimson-oni.webp", pieces: ["Impact Maul", "Forge Visor", "Breaker Plate", "Piston Greaves"], two: "Increased stagger", four: "Broken targets take bonus damage" },
  { id: "aurora-relay", name: "Aurora Relay", atlas: "/assets/loot-v2/ghost-protocol.webp", pieces: ["Relay Blade", "Aurora Scope", "Signal Mantle", "Pulse Steps"], two: "Skill recovery", four: "Technique use empowers allies" },
  { id: "flux-weaver", name: "Flux Weaver", atlas: "/assets/loot-v2/biohazard-lotus.webp", pieces: ["Flux Needle", "Weaver Mask", "Phase Weave", "Lattice Boots"], two: "Status duration", four: "Status combinations cause Flux Burst" },
  { id: "crown-circuit", name: "Crown Circuit", atlas: "/assets/loot-v2/storm-circuit.webp", pieces: ["Crown Saber", "Circuit Halo", "Crown Harness", "Royal Drives"], two: "Highest two attributes +8%", four: "Hybrid bonuses are 50% stronger" },
];
export const SET_TAGS = Object.freeze({
  "street-ronin":"tempo","neon-sentinel":"guard","void-reaver":"assault","crimson-oni":"assault","ghost-protocol":"tech",
  "chrome-wraith":"guard","biohazard-lotus":"sustain","solar-shogun":"assault","glacier-viper":"control","storm-circuit":"tempo",
  "kinetic-courier":"tempo","signal-bastion":"guard","foundry-breaker":"control","aurora-relay":"tech","flux-weaver":"sustain","crown-circuit":"hybrid",
});

const TIER_WORDS = ["Street", "Tuned", "Elite", "Apex", "Prismatic"];
const SLOT_BASE = { weapon: { attack: 7 }, helmet: { defense: 3, tech: 2 }, armor: { defense: 8 }, boots: { speed: 5, defense: 1 } };
const TIER_POWER = [1, 1.7, 2.8, 4.5, 7.5];

const SET_GEAR = SETS.flatMap((set, setIndex) => RARITY_ORDER.flatMap((rarity, rarityIndex) => GEAR_SLOTS.map((slot, slotIndex) => ({
  id: `${set.id}:${rarity}:${slot}`, setId: set.id, setName: set.name, slot, rarity,
  name: `${TIER_WORDS[rarityIndex]} ${set.pieces[slotIndex]}`, atlas: set.atlas,
  atlasX: slotIndex, atlasY: rarityIndex,
  lore: `${set.name} ${slot}. ${rarity === "prismatic" ? "An impossible spectrum moves beneath its surface." : `Calibrated ${RARITIES[rarity].label.toLowerCase()}-grade underworld gear.`}`,
  stats: Object.fromEntries(Object.entries(SLOT_BASE[slot]).map(([key, value]) => [key, Math.round(value * TIER_POWER[rarityIndex] * (1 + setIndex * .025))])),
}))));

export const CHIP_TIERS = [
  { id:"standard", name:"Standard", rarity:"blue", scale:1 },
  { id:"prototype", name:"Prototype", rarity:"yellow", scale:2 },
  { id:"relic", name:"Relic", rarity:"orange", scale:4 },
  { id:"apex", name:"Apex", rarity:"prismatic", scale:8 },
];
const CHIP_FAMILIES = [
  ["redline", "Redline Matrix", "crit", 8], ["abundance", "Abundance Kernel", "loot", 18],
  ["bastion", "Bastion Lattice", "defense", 10], ["velocity", "Velocity Loop", "speed", 9],
  ["overclock", "Overclock Node", "tech", 9], ["assault", "Assault Driver", "attack", 10],
  ["vital", "Vitality Grid", "hp", 24], ["insight", "Insight Engine", "xp", 14],
  ["null-clock", "Null Clock", "tech", 7], ["echo", "Echo Relay", "speed", 7],
  ["guardian", "Guardian Core", "defense", 8], ["prism", "Prism Router", "attack", 8],
];
export const MEGACHIPS = CHIP_FAMILIES.flatMap(([family,name,stat,base],familyIndex)=>CHIP_TIERS.map((tier,tierIndex)=>({
  id:`chip-${family}:${tier.id}:megachip`, family, slot:"megachip", rarity:tier.rarity, chipTier:tier.id,
  setId:null, setName:`${tier.name} Megachip`, name:`${tier.name} ${name}`, chipGlyph:["◇","⬡","✦","◆"][tierIndex],
  lore:tier.id==="apex"&&family==="redline"?"+200% Critical Rating. Critical overcap converts into critical damage.":tier.id==="apex"&&family==="abundance"?"+500% normal equipment find. This never modifies Megachip odds.":`${tier.name} circuit architecture tuned for ${stat}.`,
  stats:{[stat]:tier.id==="apex"&&family==="redline"?200:tier.id==="apex"&&family==="abundance"?500:Math.round(base*tier.scale*(1+familyIndex*.01))},
})));
export const LOOT = [...SET_GEAR, ...MEGACHIPS];

export const starterInventory = () => ({
  version: 2, owned: [], equipped: { weapon: null, helmet: null, armor: null, boots: null, megachip: null },
  enhancement: {}, shards: 0, runs: 0, prismPity: 0, history: [], tutorialStep: 0,
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

export function getArmoryBonuses(value, profile = {}) {
  const inventory = normalizeInventory(value);
  const totals = { attack: 0, defense: 0, speed: 0, tech: 0, hp: 0, crit: 0, loot: 0, xp: 0 };
  const setCounts = {};
  for (const id of Object.values(inventory.equipped)) {
    const item = byId(id);
    if (!item) continue;
    const stats = enhancedStats(item, inventory.enhancement[id] || 0);
    for (const [key, amount] of Object.entries(stats)) totals[key] = (totals[key] || 0) + amount;
    setCounts[item.setId] = (setCounts[item.setId] || 0) + 1;
  }
  for (const [setId, count] of Object.entries(setCounts)) {
    if (count < 2) continue;
    const setStats = {
      "street-ronin": [0, 0, 8, 0], "neon-sentinel": [0, 10, 0, 0], "void-reaver": [8, 0, 0, 0],
      "crimson-oni": [12, 0, 0, 0], "ghost-protocol": [0, 0, 0, 10], "chrome-wraith": [0, 8, 0, 0],
      "biohazard-lotus": [0, 0, 0, 10], "solar-shogun": [10, 0, 0, 0], "glacier-viper": [0, 8, 0, 0], "storm-circuit": [0, 0, 12, 0],
      "kinetic-courier":[0,0,12,0],"signal-bastion":[0,12,0,0],"foundry-breaker":[10,6,0,0],"aurora-relay":[0,0,4,12],"flux-weaver":[0,0,5,10],"crown-circuit":[6,6,6,6],
    }[setId] || [0, 0, 0, 0];
    totals.attack += setStats[0]; totals.defense += setStats[1]; totals.speed += setStats[2]; totals.tech += setStats[3];
    if (count >= 4) {
      if (setId === "street-ronin") totals.crit += 6;
      if (setId === "neon-sentinel") totals.hp += 30;
      if (setId === "void-reaver") totals.crit += 10;
      if (setId === "crimson-oni") totals.attack += 18;
      if (setId === "ghost-protocol") totals.speed += 15;
      if (setId === "chrome-wraith") totals.hp += 25;
      if (setId === "biohazard-lotus") totals.tech += 15;
      if (setId === "solar-shogun") totals.attack += 15;
      if (setId === "glacier-viper") totals.defense += 15;
      if (setId === "storm-circuit") totals.speed += 18;
      if (setId === "kinetic-courier") { totals.speed += 18; totals.crit += 8; }
      if (setId === "signal-bastion") { totals.defense += 20; totals.hp += 35; }
      if (setId === "foundry-breaker") totals.attack += 25;
      if (setId === "aurora-relay") { totals.tech += 20; totals.xp += 12; }
      if (setId === "flux-weaver") { totals.tech += 18; totals.crit += 6; }
      if (setId === "crown-circuit") { totals.attack += 10; totals.defense += 10; totals.speed += 10; totals.tech += 10; }
    }
  }
  const activeTags=[...new Set(Object.entries(setCounts).filter(([,count])=>count>=2).map(([setId])=>SET_TAGS[setId]).filter(Boolean))];
  const has=(a,b)=>activeTags.includes(a)&&activeTags.includes(b);
  if(has("assault","tempo")){totals.attack+=12;totals.speed+=12;}
  if(has("guard","tech")){totals.defense+=14;totals.tech+=10;totals.hp+=20;}
  if(has("control","assault")){totals.attack+=16;totals.crit+=6;}
  if(has("sustain","tempo")){totals.speed+=10;totals.hp+=28;}
  if(has("tech","control")){totals.tech+=18;totals.crit+=5;}
  const role = profile?.archetype || profile?.role || "ghost";
  if (role === "striker" || role === "samurai") { totals.attack = Math.round(totals.attack * 1.1); totals.hp += 15; }
  if (role === "guardian") { totals.defense = Math.round(totals.defense * 1.12); totals.hp += 24; }
  if (role === "technician" || role === "netrunner") { totals.tech = Math.round(totals.tech * 1.1); totals.xp += 8; }
  if (role === "ghost") { totals.speed = Math.round(totals.speed * 1.1); totals.crit += 5; }
  if (role === "fixer") totals.loot += 10;
  return {
    str: totals.attack, def: totals.defense, spd: totals.speed, dex: totals.tech,
    hp: totals.hp, crit: totals.crit, loot: totals.loot, xp: totals.xp,
    score: totals.attack + totals.defense + totals.speed + totals.tech,
  };
}

export function ItemArt({ item, level = 0, small = false, locked = false }) {
  if (!item) return <span className="v2-empty-art">＋</span>;
  const rarity = RARITIES[item.rarity];
  return <div className={`v2-item-art tier-${item.rarity} ${item.slot==="megachip"?"megachip-art":""} ${small ? "small" : ""} ${locked ? "locked" : ""}`} style={{ "--tier": rarity.color }}>
    {item.slot==="megachip"?<div className="megachip-core"><i/><b>{item.chipGlyph}</b><em/></div>:<div className="atlas-sprite" style={{ backgroundImage: `url(${item.atlas})`, backgroundSize: "400% 500%", backgroundPosition: `${item.atlasX * 100 / 3}% ${item.atlasY * 100 / 4}%` }}/>} 
    {level > 0 && <b>+{level}</b>}<i />
  </div>;
}

function StatBlocks({ totals }) {
  return <div className="v2-stats">{["attack", "defense", "speed", "tech"].map((stat) => <div key={stat}><span>{stat}</span><b>{totals[stat] || 0}</b></div>)}</div>;
}

export default function Inventory({ profile, value, onChange, onClose, onStartRun = null, onCompleteRun = null, onSaveLoadout = null, onEnhanceItem = null, campaignValue = null, onCampaignChange = null, onStartCampaign = null, onCampaignCheckpoint = null, onClaimCampaign = null, onCalibrateCampaign = null, onCampaignComplete = null }) {
  const inventory = normalizeInventory(value);
  const [tab, setTab] = useState(campaignValue?.complete ? "loadout" : "runs");
  const [slotFilter, setSlotFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(inventory.owned[0] || null);
  const [running, setRunning] = useState(false);
  const [drop, setDrop] = useState(null);
  const [forgeResult, setForgeResult] = useState("");
  const [runToken, setRunToken] = useState(null);
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
  const campaignDone = Boolean(campaignValue?.complete);

  const equip = async (item) => {
    if (!item || !owned.has(item.id)) return;
    const next = { ...inventory, equipped: { ...inventory.equipped, [item.slot]: item.id }, tutorialStep: (inventory.tutorialStep || 0) === 1 ? 2 : inventory.tutorialStep };
    try { onChange((await onSaveLoadout?.(next.equipped, next.tutorialStep)) || next); }
    catch (error) { setForgeResult(error.message || "Loadout sync failed"); }
  };
  const unequip = async (slot) => {
    const next = { ...inventory, equipped: { ...inventory.equipped, [slot]: null } };
    try { onChange((await onSaveLoadout?.(next.equipped, next.tutorialStep)) || next); }
    catch (error) { setForgeResult(error.message || "Loadout sync failed"); }
  };
  const rollRarity = () => {
    if (inventory.prismPity >= 999) return "prismatic";
    const roll = Math.random() * 100; let cursor = 0;
    for (const rarity of RARITY_ORDER) { cursor += RARITIES[rarity].weight; if (roll <= cursor) return rarity; }
    return "green";
  };
  const finishRun = async ({ win }) => {
    if (!win) { setRunning(false); setForgeResult("Extraction failed — upgrade your loadout and try again"); return; }
    if (onCompleteRun && runToken) {
      try {
        const result = await onCompleteRun(runToken);
        const next = normalizeInventory(result.state);
        const item = byId(result.drop?.id);
        onChange(next); setSelectedId(item?.id || null); setDrop(item ? { item, duplicate: result.drop.duplicate, shards: result.drop.shards || 0 } : null); setRunToken(null); setRunning(false);
      } catch (error) { setForgeResult(error.message || "Extraction sync failed"); setRunToken(null); setRunning(false); }
      return;
    }
    const firstRun = inventory.runs === 0;
    const rarity = firstRun ? "green" : rollRarity();
    const pool = LOOT.filter((item) => item.rarity === rarity && (!firstRun || item.slot === "weapon"));
    const item = pool[Math.floor(Math.random() * pool.length)];
    const duplicate = owned.has(item.id);
    const next = { ...inventory, runs: inventory.runs + 1, prismPity: rarity === "prismatic" ? 0 : inventory.prismPity + 1 };
    if (duplicate) next.shards = inventory.shards + RARITIES[rarity].shard;
    else next.owned = [...inventory.owned, item.id];
    if (firstRun) { next.shards = Math.max(next.shards || 0, 12); next.tutorialStep = 1; }
    next.history = [{ id: item.id, duplicate, at: Date.now() }, ...(inventory.history || [])].slice(0, 12);
    onChange(next); setSelectedId(item.id); setDrop({ item, duplicate, shards: duplicate ? RARITIES[rarity].shard : 0 }); setRunning(false);
  };
  const startRun = async () => {
    if (running) return;
    setForgeResult("");
    try {
      const result = await onStartRun?.();
      setRunToken(result?.token || null);
      setRunning(true);
    } catch (error) { setForgeResult(error.message || "Could not enter district"); setRunning(false); }
  };
  const enhance = async () => {
    if (!selected || !owned.has(selected.id)) return;
    if (onEnhanceItem) {
      try {
        const result = await onEnhanceItem(selected.id);
        onChange(normalizeInventory(result.state));
        setForgeResult(result.success ? `Enhancement successful: +${result.level}` : "Enhancement failed — level protected");
      } catch (error) { setForgeResult(error.message || "Enhancement failed"); }
      return;
    }
    const level = inventory.enhancement[selected.id] || 0;
    if (level >= 20) return;
    const cost = RARITIES[selected.rarity].enhance * (level + 1);
    if (inventory.shards < cost) { setForgeResult("Not enough Nano Shards"); return; }
    const chance = level < 5 ? 1 : level < 10 ? .82 : level < 15 ? .58 : level < 19 ? .32 : .16;
    const success = Math.random() <= chance;
    const next = { ...inventory, shards: inventory.shards - cost };
    if (success) {
      next.enhancement = { ...inventory.enhancement, [selected.id]: level + 1 };
      if ((inventory.tutorialStep || 0) === 2) next.tutorialStep = 3;
    }
    onChange(next); setForgeResult(success ? `Enhancement successful: +${level + 1}` : "Enhancement failed — level protected");
  };
  const calibrateCampaignWeapon = async (itemId) => {
    if (!onCalibrateCampaign) return { success: true, level: 1 };
    const result = await onCalibrateCampaign(itemId);
    if (result?.state) onChange(normalizeInventory(result.state));
    return result;
  };

  return <main className="inventory-v2">
    <header className="v2-header"><div><small>NEO GRID // ARMORY V2</small><h1>Runner Systems</h1></div><div className="v2-resources"><span>GEAR <b>{score}</b></span><span>SHARDS <b>{inventory.shards}</b></span></div><button onClick={onClose}>Close</button></header>
    <nav className="v2-tabs">{[["loadout","Loadout"],["vault","Vault"],["enhance","Enhancement"],["runs","District Runs"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "vault" && <i>{inventory.owned.length}</i>}</button>)}</nav>

    {tab === "loadout" && <section className="loadout-v2">
      <div className={`v2-paperdoll ${equipment.weapon ? `tier-${equipment.weapon.rarity}` : ""}`} style={{ "--tier": equipment.weapon ? RARITIES[equipment.weapon.rarity].color : "#62eaff" }}><div className="v2-beam"/><RunnerPortrait profile={profile}/><div className="equipped-layers" aria-label="Visible equipped gear">{SLOT_ORDER.map((slot) => equipment[slot] && <div key={slot} className={`wearable-layer wearable-${slot}`}><ItemArt item={equipment[slot]} level={inventory.enhancement[equipment[slot].id] || 0}/></div>)}</div><div className="v2-runner-name"><b>{profile.codename}</b><span>{score ? `GEAR SCORE ${score}` : "NO EQUIPMENT"}</span></div></div>
      <div className="v2-slots"><h2>Equipment</h2>{SLOT_ORDER.map((slot) => { const item = equipment[slot]; return <article key={slot} className={`v2-slot ${item ? `tier-${item.rarity}` : "empty"}`} style={{ "--tier": item ? RARITIES[item.rarity].color : "#36405a" }}><button onClick={() => item ? (setSelectedId(item.id), setTab("enhance")) : setTab("vault")}><ItemArt item={item} level={inventory.enhancement[item?.id] || 0} small/><div><small>{slot}</small><b>{item?.name || "Empty slot"}</b>{item && <span>{item.setName}</span>}</div></button>{item && <button className="unequip" onClick={() => unequip(slot)}>×</button>}</article>;})}<StatBlocks totals={totals}/></div>
      <aside className="v2-set-bonuses"><h2>Active sets</h2>{Object.keys(setCounts).length === 0 && <p>Equip matching pieces to activate 2-piece and 4-piece powers.</p>}{Object.entries(setCounts).map(([setId, count]) => { const set = SETS.find((s) => s.id === setId); return <div key={setId}><b>{set.name}</b><span>{count}/4 pieces</span><small className={count >= 2 ? "on" : ""}>2PC · {set.two}</small><small className={count >= 4 ? "on" : ""}>4PC · {set.four}</small></div>;})}</aside>
    </section>}

    {tab === "vault" && <section className="vault-v2"><div className="v2-filters"><div>{["all", ...SLOT_ORDER].map((slot) => <button key={slot} className={slotFilter === slot ? "active" : ""} onClick={() => setSlotFilter(slot)}>{slot}</button>)}</div><div>{["all", ...RARITY_ORDER].map((rarity) => <button key={rarity} className={rarityFilter === rarity ? "active" : ""} onClick={() => setRarityFilter(rarity)}>{rarity}</button>)}</div></div>{inventory.owned.length === 0 ? <div className="empty-vault"><span>◇</span><h2>Your vault is empty</h2><p>Equipment is earned from District Runs. Nothing is pre-equipped.</p><button onClick={() => setTab("runs")}>Start grinding</button></div> : <><div className="v2-grid">{filtered.map((item) => <button key={item.id} className={`v2-card tier-${item.rarity} ${selectedId === item.id ? "selected" : ""}`} style={{ "--tier": RARITIES[item.rarity].color }} onClick={() => setSelectedId(item.id)}><ItemArt item={item} level={inventory.enhancement[item.id] || 0}/><b>{item.name}</b><span>{item.setName}</span></button>)}</div>{selected && owned.has(selected.id) && <ItemDetail item={selected} level={inventory.enhancement[selected.id] || 0} equipped={inventory.equipped[selected.slot] === selected.id} onEquip={() => equip(selected)} onEnhance={() => setTab("enhance")}/>}</> }</section>}

    {tab === "enhance" && <section className="forge-v2">{!selected || !owned.has(selected.id) ? <div className="forge-empty"><h2>No item selected</h2><p>Earn an item in District Runs, then select it from the Vault.</p><button onClick={() => setTab(inventory.owned.length ? "vault" : "runs")}>{inventory.owned.length ? "Open vault" : "Start a run"}</button></div> : <><div className={`forge-art tier-${selected.rarity}`} style={{ "--tier": RARITIES[selected.rarity].color }}><ItemArt item={selected} level={inventory.enhancement[selected.id] || 0}/><div className="forge-rings"/></div><div className="forge-console"><small style={{ color: RARITIES[selected.rarity].color }}>{RARITIES[selected.rarity].label} · {selected.setName}</small><h2>{selected.name}</h2><div className="enhance-level"><span>Enhancement</span><b>+{inventory.enhancement[selected.id] || 0}</b><em>/ +20</em></div><div className="enhance-track">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < (inventory.enhancement[selected.id] || 0) ? "on" : ""}/>)}</div><StatBlocks totals={enhancedStats(selected, inventory.enhancement[selected.id] || 0)}/><p>Success falls at high levels. Failure consumes shards but never destroys or downgrades the item.</p>{(inventory.enhancement[selected.id] || 0) < 20 ? <button className="enhance-action" onClick={enhance}>Enhance · {RARITIES[selected.rarity].enhance * ((inventory.enhancement[selected.id] || 0) + 1)} shards</button> : <b className="maxed">MAXIMUM +20</b>}{forgeResult && <strong className={forgeResult.includes("successful") ? "success" : "fail"}>{forgeResult}</strong>}</div><div className="forge-list">{inventory.owned.map(byId).filter(Boolean).map((item) => <button key={item.id} className={selected.id === item.id ? "active" : ""} onClick={() => { setSelectedId(item.id); setForgeResult(""); }}><ItemArt item={item} level={inventory.enhancement[item.id] || 0} small/><span>{item.name}</span></button>)}</div></>}</section>}

    {tab === "runs" && !campaignDone && <DistrictCampaign profile={profile} value={campaignValue} onChange={onCampaignChange} onBegin={onStartCampaign} onCheckpoint={onCampaignCheckpoint} onClaim={onClaimCampaign} onCalibrate={calibrateCampaignWeapon} onComplete={onCampaignComplete} onExit={() => setTab("loadout")} />}
    {tab === "runs" && campaignDone && <section className="runs-v2"><div className="run-zone"><small>SHIBUYA UNDERCITY</small><h2>District Sweep</h2>{running ? <><p className="run-brief">Move with the left pad. Tap ATTACK and time DASH to survive three escalating waves.</p><Brawl profile={profile} stats={{ hp: 110 + (totals.defense || 0) * 2, maxHp: 110 + (totals.defense || 0) * 2, str: 12 + (totals.attack || 0), def: 6 + (totals.defense || 0), spd: 8 + (totals.speed || 0), dex: 8 + (totals.tech || 0), crit: 2, wPow: 0, aPow: 0 }} enemy={{ id: "punk", name: "Undercity Sweep", kanji: "掃", lvl: Math.max(1, Math.floor(score / 18) + 1), hp: 70 + score * 2, atk: 12 + score * .22 }} onEnd={finishRun}/></> : <><p>Fight through hostile blocks and extract one equipment drop. Prismatic gear has a 0.1% base chance with a guaranteed pity drop at 1,000 dry runs.</p><div className="drop-rates">{RARITY_ORDER.map((rarity) => <span key={rarity} style={{ "--tier": RARITIES[rarity].color }}><i/>{RARITIES[rarity].label}<b>{RARITIES[rarity].weight}%</b></span>)}</div><button className="run-action" onClick={startRun}>Enter District</button></>}<div className="run-stats"><span>RUNS <b>{inventory.runs}</b></span><span>PRISM PITY <b>{inventory.prismPity}/1000</b></span><span>VAULT <b>{inventory.owned.length}/200</b></span></div></div><aside className="run-history"><h3>Recent extractions</h3>{!(inventory.history || []).length && <p>No run data yet.</p>}{(inventory.history || []).map((entry, index) => { const item = byId(entry.id); return item && <div key={`${entry.at}-${index}`}><ItemArt item={item} small/><span><b>{item.name}</b><small>{entry.duplicate ? `Duplicate · +${RARITIES[item.rarity].shard} shards` : "New equipment"}</small></span></div>;})}</aside></section>}

    {drop && <div className="v2-reveal" onClick={() => { setDrop(null); setTab("vault"); }}><div className={`v2-reveal-card tier-${drop.item.rarity}`} style={{ "--tier": RARITIES[drop.item.rarity].color }}><small>{drop.duplicate ? `DUPLICATE · +${drop.shards} SHARDS` : "NEW EQUIPMENT"}</small><ItemArt item={drop.item}/><h2>{drop.item.name}</h2><b>{RARITIES[drop.item.rarity].label}</b><p>Tap to inspect and equip</p></div></div>}
  </main>;
}

function ItemDetail({ item, level, equipped, onEquip, onEnhance }) {
  return <div className="v2-detail"><ItemArt item={item} level={level}/><div><small style={{ color: RARITIES[item.rarity].color }}>{RARITIES[item.rarity].label} · {item.slot}</small><h3>{item.name}</h3><span>{item.setName}</span><p>{item.lore}</p><div>{Object.entries(enhancedStats(item, level)).map(([key, val]) => <i key={key}>{key} <b>+{val}</b></i>)}</div></div><footer><button onClick={onEquip}>{equipped ? "Equipped" : "Equip"}</button><button onClick={onEnhance}>Enhance +{level}</button></footer></div>;
}
