import { useEffect, useMemo, useState } from "react";
import { Brawl } from "../NeoTokyoUnderworld.jsx";
import DistrictCampaign from "../game/DistrictCampaign.jsx";
import { RunnerPortrait } from "./CharacterCreator.jsx";
import {
  LOOT, RARITIES, RARITY_ORDER, SETS, SLOT_ORDER, ItemArt,
  getArmoryBonuses, normalizeInventory,
} from "./Inventory.jsx";
import {
  DUNGEONS, calculateCombatPower, chooseBestLoadout, dungeonAccess,
  itemCombatPower, progressionObjectives, salvageValue, saleValue,
} from "./progressionHubRules.js";
import "./inventory.css";

export { getArmoryBonuses, normalizeInventory };

const byId = (id) => LOOT.find((item) => item.id === id);
const STAT_LABELS = { str: "Strength", def: "Defense", spd: "Speed", dex: "Technique" };
const formatTime = (date) => date ? new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export default function ProgressionHub({
  profile, player = {}, value, onChange, onPlayerChange, onClose,
  onStartRun, onCompleteRun, onEnhanceItem, progressionState, onManageArmory,
  onStartAfk, onClaimAfk, onQueueCoop, onLeaveCoop, onClaimCoop, onRefreshProgression,
  campaignValue, onCampaignChange, onStartCampaign, onCampaignCheckpoint,
  onClaimCampaign, onCalibrateCampaign, onCampaignComplete,
}) {
  const inventory = normalizeInventory(value);
  const [tab, setTab] = useState("journey");
  const [selectedId, setSelectedId] = useState(inventory.owned[0] || null);
  const [slotFilter, setSlotFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [selectedDungeonId, setSelectedDungeonId] = useState("street-drain");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [runToken, setRunToken] = useState(null);
  const [drop, setDrop] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const ownedItems = useMemo(() => inventory.owned.map(byId).filter(Boolean), [inventory.owned]);
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned]);
  const equipment = useMemo(() => Object.fromEntries(SLOT_ORDER.map((slot) => [slot, byId(inventory.equipped[slot])])), [inventory.equipped]);
  const unequippedIds = useMemo(() => inventory.owned.filter((id) => !Object.values(inventory.equipped).includes(id)), [inventory]);
  const gearCp = useMemo(() => Object.values(inventory.equipped).reduce((sum, id) => sum + itemCombatPower(byId(id), inventory.enhancement[id] || 0), 0), [inventory]);
  const localCp = calculateCombatPower({ level: player.level, stats: player.stats }) + gearCp;
  const combatPower = Number(progressionState?.combatPower) || localCp;
  const campaignDone = Boolean(campaignValue?.complete || campaignValue?.serverState === "reward_claimed");
  const questInventory = { ...inventory, dungeon: { bestLevel: progressionState?.bestLevel || inventory.dungeon?.bestLevel || 0 } };
  const objectives = progressionObjectives({ campaignDone, inventory: questInventory, cp: combatPower, player });
  const nextObjective = objectives.find((objective) => !objective.done) || objectives[objectives.length - 1];
  const selected = byId(selectedId);
  const selectedDungeon = DUNGEONS.find((dungeon) => dungeon.id === selectedDungeonId) || DUNGEONS[0];
  const filtered = ownedItems.filter((item) => (slotFilter === "all" || item.slot === slotFilter) && (rarityFilter === "all" || item.rarity === rarityFilter));
  const totals = getArmoryBonuses(inventory, profile);
  const equippedCount = Object.values(inventory.equipped).filter(Boolean).length;
  const best = chooseBestLoadout(ownedItems, inventory.enhancement);
  const canImprove = SLOT_ORDER.some((slot) => best[slot]?.id && best[slot].id !== inventory.equipped[slot]);
  const afk = progressionState?.afk;
  const party = progressionState?.party;
  const afkReady = afk && Date.now() - new Date(afk.startedAt).getTime() >= 600000;
  const coopReady = party?.state === "active" && party?.completes_at && new Date(party.completes_at).getTime() <= Date.now();

  const act = async (work, success) => {
    if (busy) return null;
    setBusy(true); setNotice("");
    try { const result = await work(); if (success) setNotice(typeof success === "function" ? success(result) : success); return result; }
    catch (error) { setNotice(error.message || "Action could not be completed"); return null; }
    finally { setBusy(false); }
  };

  const saveLoadout = async (equipped, itemIds = [], mode = "equip") => {
    if (onManageArmory) {
      const result = await onManageArmory(equipped, itemIds, mode);
      if (result?.state) onChange(result.state);
      return result;
    }
    const next = normalizeInventory({ ...inventory, equipped });
    onChange(next);
    return { state: next };
  };

  const equip = (item, recycleOld = false) => act(async () => {
    const oldId = inventory.equipped[item.slot];
    const equipped = { ...inventory.equipped, [item.slot]: item.id };
    return saveLoadout(equipped, recycleOld && oldId && oldId !== item.id ? [oldId] : [], recycleOld ? "salvage" : "equip");
  }, recycleOld ? "Upgrade equipped · replaced item converted to shards" : `${item.name} equipped`);

  const equipBest = () => act(async () => {
    const equipped = { ...inventory.equipped };
    SLOT_ORDER.forEach((slot) => { if (best[slot]?.id) equipped[slot] = best[slot].id; });
    return saveLoadout(equipped);
  }, "Highest-CP gear equipped in every slot");

  const bulkAction = (mode) => {
    if (!unequippedIds.length) { setNotice("No unequipped gear to process"); return; }
    if (confirmAction !== mode) { setConfirmAction(mode); setNotice(`Tap ${mode === "salvage" ? "Salvage" : "Sell"} again to confirm ${unequippedIds.length} items`); return; }
    setConfirmAction(null);
    act(() => saveLoadout(inventory.equipped, unequippedIds, mode), mode === "salvage" ? "Unequipped gear converted into Nano Shards" : "Unequipped gear sold for yen");
  };

  const allocateStat = (key) => act(async () => {
    if (!onPlayerChange || Number(player.statPoints || 0) < 1) throw new Error("No stat points available");
    const next = { ...player, statPoints: Number(player.statPoints || 0) - 1, stats: { ...(player.stats || {}), [key]: Number(player.stats?.[key] || 0) + 1 } };
    await onPlayerChange(next);
    await onRefreshProgression?.();
  }, `+1 ${STAT_LABELS[key]}`);

  const enhance = () => act(async () => {
    if (!selected || !onEnhanceItem) throw new Error("Select an owned item first");
    const result = await onEnhanceItem(selected.id);
    if (result?.state) onChange(normalizeInventory(result.state));
    await onRefreshProgression?.();
    return result;
  }, (result) => result?.success ? `Enhancement successful · +${result.level}` : "Enhancement failed · item protected");

  const startRun = () => act(async () => {
    const result = await onStartRun?.();
    setRunToken(result?.token || null); setRunning(true);
  });

  const finishRun = ({ win }) => act(async () => {
    if (!win) { setRunning(false); throw new Error("Extraction failed · raise CP or improve your timing"); }
    const result = await onCompleteRun?.(runToken);
    if (result?.state) {
      const next = normalizeInventory(result.state); const item = byId(result.drop?.id);
      onChange(next); setSelectedId(item?.id || null); setDrop(item ? { item, duplicate: result.drop?.duplicate, shards: result.drop?.shards || 0 } : null);
    }
    setRunToken(null); setRunning(false); await onRefreshProgression?.();
  });

  const routeObjective = () => setTab(nextObjective.route === "enhance" ? "enhance" : nextObjective.route);
  const selectDungeon = (dungeon) => { setSelectedDungeonId(dungeon.id); document.querySelector(".dungeon-command")?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  return <main className="inventory-v2 progression-hub">
    <header className="v2-header progression-header">
      <div><small>NEO GRID // RUNNER COMMAND</small><h1>Progression Hub</h1></div>
      <div className="power-readout"><small>COMBAT POWER</small><b>{combatPower.toLocaleString()}</b><span>LV {Number(player.level || 1)}</span></div>
      <div className="v2-resources"><span>YEN <b>¥{Number(player.money || 0).toLocaleString()}</b></span><span>SHARDS <b>{inventory.shards}</b></span></div>
      <button onClick={onClose} aria-label="Close progression hub">×</button>
    </header>
    <nav className="v2-tabs progression-tabs">{[["journey","Journey"],["character","Character"],["vault","Inventory"],["enhance","Forge"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "character" && Number(player.statPoints || 0) > 0 && <i>{player.statPoints}</i>}{id === "vault" && <i>{inventory.owned.length}</i>}</button>)}</nav>
    {notice && <button className="hub-notice" onClick={() => setNotice("")}>{notice}<b>×</b></button>}

    {tab === "journey" && !campaignDone && <DistrictCampaign profile={profile} value={campaignValue} onChange={onCampaignChange} onBegin={onStartCampaign} onCheckpoint={onCampaignCheckpoint} onClaim={onClaimCampaign} onCalibrate={onCalibrateCampaign} onComplete={onCampaignComplete} onExit={() => setTab("character")}/>} 
    {tab === "journey" && campaignDone && <section className="journey-v3">
      <div className="next-step-card"><div><small>NEXT MEANINGFUL STEP</small><h2>{nextObjective.title}</h2><p>{nextObjective.detail}</p></div><button onClick={routeObjective}>{nextObjective.done ? "View progress" : "Go"}</button></div>
      <div className="journey-columns">
        <aside className="quest-rail"><header><small>PROGRESSION PATH</small><b>{objectives.filter((q) => q.done).length}/{objectives.length}</b></header>{objectives.map((quest) => <button key={quest.id} className={quest.done ? "done" : ""} onClick={() => setTab(quest.route === "enhance" ? "enhance" : quest.route)}><i>{quest.done ? "✓" : "○"}</i><span><b>{quest.title}</b><small>{quest.detail}</small></span></button>)}</aside>
        <div className="dungeon-directory"><header><div><small>ALL QUESTS + DUNGEONS</small><h2>City Operations</h2></div><span>Solo needs 100% CP · Co-op needs 75%</span></header><div className="dungeon-grid">{DUNGEONS.map((dungeon) => { const solo = dungeonAccess(dungeon,{level:player.level,cp:combatPower},"solo"); const coop = dungeonAccess(dungeon,{level:player.level,cp:combatPower},"coop"); const clears = Number(progressionState?.clears?.[dungeon.id] || 0); return <button key={dungeon.id} className={`${selectedDungeon.id === dungeon.id ? "selected" : ""} ${solo.unlocked ? "ready" : coop.unlocked ? "coop-only" : "locked"}`} onClick={() => selectDungeon(dungeon)}><div><small>LV {dungeon.level} · {dungeon.district}</small><b>{dungeon.name}</b><span>{dungeon.boss}</span></div><em>{dungeon.rarity}</em><footer><span>{dungeon.cp.toLocaleString()} CP</span><span>{clears} clears</span></footer></button>;})}</div></div>
      </div>
      <div className="dungeon-command">
        <header><div><small>SELECTED OPERATION · LV {selectedDungeon.level}</small><h2>{selectedDungeon.name}</h2><p>Target: {selectedDungeon.boss} · {selectedDungeon.rarity} loot</p></div><div className="cp-gate"><span>YOUR CP <b>{combatPower.toLocaleString()}</b></span><span>SOLO <b>{selectedDungeon.cp.toLocaleString()}</b></span><span>CO-OP <b>{Math.ceil(selectedDungeon.cp*.75).toLocaleString()}</b></span></div></header>
        <div className="operation-modes">
          <article><small>AFK GRIND</small><h3>Background Sweep</h3>{afk ? <><p>Running {DUNGEONS.find((d) => d.id === afk.dungeonId)?.name || afk.dungeonId} since {formatTime(afk.startedAt)}. Rewards stack for up to 8 hours.</p><button disabled={!afkReady || busy} onClick={() => act(onClaimAfk, "AFK rewards claimed")}>{afkReady ? "Claim loot" : "Ready after 10 minutes"}</button></> : <><p>Earn shards and one equipment roll while away. Higher levels improve rarity access.</p><button disabled={!dungeonAccess(selectedDungeon,{level:player.level,cp:combatPower},"solo").unlocked || busy || !onStartAfk} onClick={() => act(() => onStartAfk(selectedDungeon.id), `${selectedDungeon.name} AFK grind started`)}>Start AFK grind</button></>}</article>
          <article className="coop-card"><small>2–3 RUNNER CO-OP</small><h3>Power-Link Expedition</h3>{party ? <><p>{party.state === "waiting" ? "Waiting for enough combined party power." : party.state === "active" ? `Expedition completes at ${formatTime(party.completes_at)}.` : "Expedition complete."}</p><div className="party-roster">{(party.roster || []).map((member) => <span key={member.userId}><b>{member.name}</b>{Number(member.cp).toLocaleString()} CP</span>)}</div>{party.state === "waiting" ? <button onClick={() => act(onLeaveCoop,"Left co-op queue")}>Leave queue</button> : <button disabled={!coopReady || busy} onClick={() => act(onClaimCoop,"Co-op rewards claimed")}>{coopReady ? "Claim team loot" : "Expedition active"}</button>}</> : <><p>Enter below solo CP. The team’s combined power must meet the full requirement.</p><button disabled={!dungeonAccess(selectedDungeon,{level:player.level,cp:combatPower},"coop").unlocked || busy || !onQueueCoop} onClick={() => act(() => onQueueCoop(selectedDungeon.id),"Co-op queue joined")}>Find co-op team</button></>}</article>
          <article><small>ACTIVE PLAY</small><h3>Manual District Sweep</h3>{running ? <Brawl stats={{hp:110+(totals.def||0)*2,maxHp:110+(totals.def||0)*2,str:12+(totals.str||0),def:6+(totals.def||0),spd:8+(totals.spd||0),dex:8+(totals.dex||0),crit:2,wPow:0,aPow:0}} enemy={{id:"sentinel",name:selectedDungeon.boss,kanji:"守",lvl:selectedDungeon.level,hp:Math.max(70,selectedDungeon.cp/8),atk:12+selectedDungeon.level*.8}} onEnd={finishRun}/> : <><p>Skill-based combat gives an immediate equipment roll. Start with an accessible operation.</p><button disabled={!dungeonAccess(selectedDungeon,{level:player.level,cp:combatPower},"solo").unlocked || busy || !onStartRun} onClick={startRun}>Enter manually</button></>}</article>
        </div>
      </div>
    </section>}

    {tab === "character" && <section className="character-v3">
      <div className="character-panel"><div className="runner-stage"><RunnerPortrait profile={profile}/><span><b>{profile.codename}</b>LV {Number(player.level || 1)} · {combatPower.toLocaleString()} CP</span>{SLOT_ORDER.map((slot) => equipment[slot] && <div key={slot} className={`wearable-layer wearable-${slot}`}><ItemArt item={equipment[slot]} level={inventory.enhancement[equipment[slot].id] || 0}/></div>)}</div><div className="character-actions"><button disabled={!canImprove || busy} onClick={equipBest}>⚡ Quick Best Equip</button><button onClick={() => setTab("vault")}>Manage inventory</button></div></div>
      <div className="equipment-board"><header><h2>Equipment</h2><span>{equippedCount}/4 slots</span></header>{SLOT_ORDER.map((slot) => { const item=equipment[slot]; return <button key={slot} className={`equipment-tile ${item ? `tier-${item.rarity}` : "empty"}`} style={{"--tier":item?RARITIES[item.rarity].color:"#8aa0b4"}} onClick={() => { if(item)setSelectedId(item.id); setTab(item?"enhance":"vault"); }}><ItemArt item={item} level={inventory.enhancement[item?.id]||0} small/><span><small>{slot}</small><b>{item?.name||"Empty slot"}</b>{item&&<em>{itemCombatPower(item,inventory.enhancement[item.id]||0)} CP</em>}</span></button>;})}</div>
      <div className="stats-board"><header><div><small>STAT ALLOCATION</small><h2>Build Stats</h2></div><b>{Number(player.statPoints||0)} points</b></header><p>Every point permanently raises Combat Power. Choose the strengths your runner relies on.</p>{Object.entries(STAT_LABELS).map(([key,label]) => <div className="stat-row" key={key}><span><b>{label}</b><small>{key === "str" ? "Damage" : key === "def" ? "Survival" : key === "spd" ? "Movement" : "Skill effects"}</small></span><strong>{Number(player.stats?.[key]||0)}</strong><button disabled={!player.statPoints||busy} onClick={() => allocateStat(key)}>＋</button></div>)}<div className="derived-stats"><span>Gear attack <b>{totals.str||0}</b></span><span>Gear defense <b>{totals.def||0}</b></span><span>Gear speed <b>{totals.spd||0}</b></span><span>Gear tech <b>{totals.dex||0}</b></span></div></div>
    </section>}

    {tab === "vault" && <section className="vault-v3">
      <div className="inventory-toolbar"><div><b>{inventory.owned.length}/200 ITEMS</b><span>{unequippedIds.length} unequipped</span></div><button disabled={!canImprove||busy} onClick={equipBest}>⚡ Best Equip</button><button className={confirmAction==="salvage"?"confirm":""} disabled={!unequippedIds.length||busy} onClick={() => bulkAction("salvage")}>⚙ Salvage Unequipped</button><button className={confirmAction==="sell"?"confirm sell":"sell"} disabled={!unequippedIds.length||busy} onClick={() => bulkAction("sell")}>¥ Sell Unequipped</button></div>
      <div className="v2-filters"><div>{["all",...SLOT_ORDER].map((slot)=><button key={slot} className={slotFilter===slot?"active":""} onClick={()=>setSlotFilter(slot)}>{slot}</button>)}</div><div>{["all",...RARITY_ORDER].map((rarity)=><button key={rarity} className={rarityFilter===rarity?"active":""} onClick={()=>setRarityFilter(rarity)}>{rarity}</button>)}</div></div>
      {!ownedItems.length ? <div className="empty-vault"><h2>No equipment yet</h2><p>Open Journey and clear District One to earn your first item.</p><button onClick={()=>setTab("journey")}>Open Journey</button></div> : <div className="inventory-workspace"><div className="v2-grid">{filtered.map((item)=>{ const equipped=inventory.equipped[item.slot]===item.id; const power=itemCombatPower(item,inventory.enhancement[item.id]||0); return <button key={item.id} className={`v2-card tier-${item.rarity} ${selectedId===item.id?"selected":""} ${equipped?"equipped":""}`} style={{"--tier":RARITIES[item.rarity].color}} onClick={()=>setSelectedId(item.id)}><ItemArt item={item} level={inventory.enhancement[item.id]||0}/><b>{item.name}</b><span>{power} CP {equipped?"· EQUIPPED":""}</span></button>})}</div>{selected&&owned.has(selected.id)&&<ItemInspector item={selected} inventory={inventory} onEquip={()=>equip(selected)} onEquipRecycle={()=>equip(selected,true)} onEnhance={()=>setTab("enhance")} onSalvage={()=>act(()=>saveLoadout(inventory.equipped,[selected.id],"salvage"),"Item salvaged")} onSell={()=>act(()=>saveLoadout(inventory.equipped,[selected.id],"sell"),"Item sold")}/>}</div>}
    </section>}

    {tab === "enhance" && <section className="forge-v3">{!selected||!owned.has(selected.id)?<div className="forge-empty"><h2>Select equipment to enhance</h2><p>Enhancement raises item stats and Combat Power up to +20.</p><button onClick={()=>setTab("vault")}>Choose from inventory</button></div>:<><div className={`forge-art tier-${selected.rarity}`} style={{"--tier":RARITIES[selected.rarity].color}}><ItemArt item={selected} level={inventory.enhancement[selected.id]||0}/><div className="forge-rings"/></div><div className="forge-console"><small style={{color:RARITIES[selected.rarity].color}}>{RARITIES[selected.rarity].label} · {selected.setName}</small><h2>{selected.name}</h2><div className="enhance-level"><span>Enhancement</span><b>+{inventory.enhancement[selected.id]||0}</b><em>/ +20</em></div><div className="enhance-track">{Array.from({length:20},(_,i)=><i key={i} className={i<(inventory.enhancement[selected.id]||0)?"on":""}/>)}</div><p>Failures consume shards but never destroy or downgrade gear. Salvaging enhanced gear returns extra material.</p><button className="enhance-action" disabled={busy||(inventory.enhancement[selected.id]||0)>=20} onClick={enhance}>Enhance · {RARITIES[selected.rarity].enhance*((inventory.enhancement[selected.id]||0)+1)} shards</button></div><div className="forge-list">{ownedItems.map((item)=><button key={item.id} className={selected.id===item.id?"active":""} onClick={()=>setSelectedId(item.id)}><ItemArt item={item} level={inventory.enhancement[item.id]||0} small/><span>{item.name}</span></button>)}</div></>}</section>}

    {drop && <div className="v2-reveal"><div className={`v2-reveal-card tier-${drop.item.rarity}`} style={{"--tier":RARITIES[drop.item.rarity].color}}><small>{drop.duplicate?`DUPLICATE · +${drop.shards} SHARDS`:"NEW EQUIPMENT"}</small><ItemArt item={drop.item}/><h2>{drop.item.name}</h2>{!drop.duplicate&&<><button onClick={()=>{equip(drop.item);setDrop(null);setTab("character")}}>Equip upgrade</button>{inventory.equipped[drop.item.slot]&&<button onClick={()=>{equip(drop.item,true);setDrop(null);setTab("character")}}>Equip + salvage replaced</button>}</>}<button onClick={()=>{setDrop(null);setTab("vault")}}>Keep in inventory</button></div></div>}
  </main>;
}

function ItemInspector({ item, inventory, onEquip, onEquipRecycle, onEnhance, onSalvage, onSell }) {
  const level=inventory.enhancement[item.id]||0;
  const equipped=inventory.equipped[item.slot]===item.id;
  const current=byId(inventory.equipped[item.slot]);
  const power=itemCombatPower(item,level);
  const currentPower=itemCombatPower(current,inventory.enhancement[current?.id]||0);
  return <aside className="item-inspector"><ItemArt item={item} level={level}/><small style={{color:RARITIES[item.rarity].color}}>{RARITIES[item.rarity].label} · {item.slot}</small><h2>{item.name}</h2><span>{item.setName}</span><div className={`power-compare ${power>currentPower?"upgrade":""}`}><b>{power} CP</b><small>{equipped?"Currently equipped":`${power-currentPower>=0?"+":""}${power-currentPower} vs equipped`}</small></div><p>{item.lore}</p><div className="inspector-actions"><button disabled={equipped} onClick={onEquip}>{equipped?"Equipped":"Equip"}</button>{!equipped&&current&&<button onClick={onEquipRecycle}>Equip + salvage old</button>}<button onClick={onEnhance}>Enhance +{level}</button>{!equipped&&<><button className="danger" onClick={onSalvage}>Salvage · {salvageValue(item,level)} shards</button><button className="sell" onClick={onSell}>Sell · ¥{saleValue(item,level).toLocaleString()}</button></>}</div></aside>;
}
