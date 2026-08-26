import { useEffect, useMemo, useState } from "react";
import { Brawl } from "../NeoTokyoUnderworld.jsx";
import DistrictCampaign from "../game/DistrictCampaign.jsx";
import RaidCommand from "../game/RaidCommand.jsx";
import { RunnerPortrait } from "./CharacterCreator.jsx";
import {
  GEAR_SLOTS, LOOT, RARITIES, RARITY_ORDER, SETS, SLOT_ORDER, ItemArt,
  getArmoryBonuses, normalizeInventory,
} from "./Inventory.jsx";
import {
  DUNGEONS, afkBattleSnapshot, calculateCombatPower, chooseBestLoadout, dungeonAccess,
  itemCombatPower, progressionObjectives, salvageValue, saleValue,
} from "./progressionHubRules.js";
import { COMBAT_SKILLS, combatSkillById, equipCombatSkill, normalizeCombatSkills } from "../game/combatSkills.js";
import "./inventory.css";

export { getArmoryBonuses, normalizeInventory };

const byId = (id) => LOOT.find((item) => item.id === id);
const STAT_LABELS = { str: "Strength", def: "Defense", spd: "Speed", dex: "Technique" };
const formatTime = (date) => date ? new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export default function ProgressionHub({
  initialTab = "journey",
  profile, player = {}, value, masteryStats = {}, onChange, onPlayerChange, onClose,
  combatSkills, onCombatSkillsChange,
  onStartRun, onCompleteRun, onEnhanceItem, progressionState, onManageArmory,
  onStartAfk, onClaimAfk, onQueueCoop, onLeaveCoop, onClaimCoop, onRefreshProgression,
  onCreateCoopRoom, onJoinCoopRoom, onListCoopRooms,
  raidState, onSetRaidSpecialization, onQueueRaid, onJoinRaid, onFillRaidBots,
  onAdvanceRaid, onClaimRaid, onLeaveRaid, onRefreshRaid,
  campaignValue, onCampaignChange, onStartCampaign, onCampaignCheckpoint,
  onClaimCampaign, onCalibrateCampaign, onCampaignComplete,
}) {
  const inventory = normalizeInventory(value);
  const validTab = (next) => ["journey", "character", "vault", "enhance", "skills"].includes(next) ? next : "journey";
  const [tab, setTab] = useState(validTab(initialTab));
  const [selectedId, setSelectedId] = useState(null);
  const [slotFilter, setSlotFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [selectedDungeonId, setSelectedDungeonId] = useState("street-drain");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [runToken, setRunToken] = useState(null);
  const [drop, setDrop] = useState(null);
  const [afkBattleOpen, setAfkBattleOpen] = useState(false);
  const [coopBrowserOpen, setCoopBrowserOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => setTab(validTab(initialTab)), [initialTab]);

  useEffect(() => {
    const dismiss = (event) => {
      if (event.key !== "Escape") return;
      if (selectedId) setSelectedId(null);
      else if (afkBattleOpen) setAfkBattleOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [selectedId, afkBattleOpen]);

  const ownedItems = useMemo(() => inventory.owned.map(byId).filter(Boolean), [inventory.owned]);
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned]);
  const equipment = useMemo(() => Object.fromEntries(SLOT_ORDER.map((slot) => [slot, byId(inventory.equipped[slot])])), [inventory.equipped]);
  const unequippedIds = useMemo(() => inventory.owned.filter((id) => !Object.values(inventory.equipped).includes(id)), [inventory]);
  const gearCp = useMemo(() => Object.values(inventory.equipped).reduce((sum, id) => sum + itemCombatPower(byId(id), inventory.enhancement[id] || 0), 0), [inventory]);
  const masteryCp = Math.round(["str","def","spd","dex"].reduce((sum, key) => sum + Number(masteryStats[key] || 0), 0) * 14 + Number(masteryStats.hp || 0) * 2 + Number(masteryStats.crit || 0) * 5);
  const localCp = calculateCombatPower({ level: player.level, stats: player.stats }) + gearCp + masteryCp;
  const combatPower = Number(progressionState?.combatPower) || localCp;
  const skillLoadout = normalizeCombatSkills(combatSkills, player.level);
  const equippedTechniques = skillLoadout.equipped.map(combatSkillById).filter(Boolean);
  const campaignDone = Boolean(campaignValue?.complete || campaignValue?.serverState === "reward_claimed");
  const questInventory = { ...inventory, dungeon: { bestLevel: progressionState?.bestLevel || inventory.dungeon?.bestLevel || 0 } };
  const objectives = progressionObjectives({ campaignDone, inventory: questInventory, cp: combatPower, player });
  const nextObjective = objectives.find((objective) => !objective.done) || objectives[objectives.length - 1];
  const selected = byId(selectedId);
  const selectedDungeon = DUNGEONS.find((dungeon) => dungeon.id === selectedDungeonId) || DUNGEONS[0];
  const filtered = ownedItems.filter((item) => (slotFilter === "all" || item.slot === slotFilter) && (rarityFilter === "all" || item.rarity === rarityFilter));
  const totals = getArmoryBonuses(inventory, profile);
  const combatTotals = Object.fromEntries(["str","def","spd","dex","hp","crit","loot","xp"].map((key) => [key, Number(totals[key] || 0) + Number(masteryStats[key] || 0)]));
  const equippedCount = GEAR_SLOTS.filter((slot)=>inventory.equipped[slot]).length;
  const best = chooseBestLoadout(ownedItems, inventory.enhancement);
  const canImprove = SLOT_ORDER.some((slot) => best[slot]?.id && best[slot].id !== inventory.equipped[slot]);
  const setCounts = useMemo(() => Object.values(equipment).filter((item)=>item?.setId).reduce((counts, item) => ({ ...counts, [item.setId]: (counts[item.setId] || 0) + 1 }), {}), [equipment]);
  const activeSets = Object.entries(setCounts).map(([setId, count]) => ({ set: SETS.find((entry) => entry.id === setId), count })).filter((entry) => entry.set).sort((a,b) => b.count-a.count);
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

  const equipBestSlot = (slot) => act(async () => {
    const item = best[slot];
    if (!item) throw new Error(`No ${slot} owned yet`);
    if (inventory.equipped[slot] === item.id) throw new Error(`${item.name} is already your best ${slot}`);
    return saveLoadout({ ...inventory.equipped, [slot]: item.id });
  }, `Best ${slot} equipped`);

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

  const openAfkBattle = () => setAfkBattleOpen(true);
  const startAfkBattle = (dungeon) => act(async () => {
    if (!onStartAfk) throw new Error("AFK service is not ready");
    await onStartAfk(dungeon.id);
    setSelectedDungeonId(dungeon.id);
    setAfkBattleOpen(true);
  }, `${dungeon.name} auto-battle started`);
  const claimAfkReward = () => act(async () => {
    if (!onClaimAfk) throw new Error("AFK service is not ready");
    const result = await onClaimAfk();
    const item = byId(result?.drop?.id);
    if (item) { setSelectedId(null); setDrop({ item, duplicate: result.drop?.duplicate, shards: result.drop?.shards || 0 }); }
    setAfkBattleOpen(false);
    return result;
  }, "AFK rewards claimed");

  const routeObjective = () => setTab(nextObjective.route === "enhance" ? "enhance" : nextObjective.route);
  const selectDungeon = (dungeon) => { setSelectedDungeonId(dungeon.id); document.querySelector(".dungeon-command")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  const equipTechnique = (skillId, slot) => act(async () => {
    if (!onCombatSkillsChange) throw new Error("Technique save is not ready");
    return onCombatSkillsChange(equipCombatSkill(skillLoadout, skillId, slot, player.level));
  }, `${combatSkillById(skillId)?.name || "Technique"} equipped`);

  return <main className="inventory-v2 progression-hub">
    <header className="v2-header progression-header">
      <div><small>NEO GRID // RUNNER COMMAND</small><h1>Progression Hub</h1></div>
      <div className="power-readout"><small>COMBAT POWER</small><b>{combatPower.toLocaleString()}</b><span>LV {Number(player.level || 1)}</span></div>
      <div className="v2-resources"><span>YEN <b>¥{Number(player.money || 0).toLocaleString()}</b></span><span>SHARDS <b>{inventory.shards}</b></span></div>
      <button onClick={onClose} aria-label="Close progression hub">×</button>
    </header>
    <nav className="v2-tabs progression-tabs">{[["journey","Battle"],["character","Character"],["vault","Inventory"],["enhance","Forge"],["skills","Skills"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); if (id !== "enhance") setSelectedId(null); }}>{label}{id === "character" && Number(player.statPoints || 0) > 0 && <i>{player.statPoints}</i>}{id === "vault" && <i>{inventory.owned.length}</i>}</button>)}</nav>
    {notice && <button className="hub-notice" onClick={() => setNotice("")}>{notice}<b>×</b></button>}


    {tab === "skills" && <section className="combat-skills-v3">
      <header><div><small>ACTIVE COMBAT SYSTEM</small><h2>Technique Loadout</h2><p>Equip three techniques. They appear in the arena with live cooldowns and immediate effects.</p></div><button onClick={()=>setTab("journey")}>Enter Battle</button></header>
      <div className="skill-slots">{[0,1,2].map((slot)=>{const skill=combatSkillById(skillLoadout.equipped[slot]);return <div key={slot} className={skill?"filled":""} style={{"--skill":skill?.color||"#91a0b6"}}><small>SLOT {slot+1}</small><b>{skill?.glyph||"＋"}</b><span>{skill?.name||"Empty"}</span></div>})}</div>
      <div className="skill-catalog">{COMBAT_SKILLS.map((skill)=>{const unlocked=Number(player.level||1)>=skill.level;const equippedSlot=skillLoadout.equipped.indexOf(skill.id);return <article key={skill.id} className={`${unlocked?"unlocked":"locked"} ${equippedSlot>=0?"equipped":""}`} style={{"--skill":skill.color}}><i>{skill.glyph}</i><div><small>{unlocked?`READY · ${skill.cooldown}s COOLDOWN`:`UNLOCKS LV ${skill.level}`}</small><h3>{skill.name}</h3><p>{skill.effect}</p>{unlocked&&<footer>{[0,1,2].map((slot)=><button key={slot} disabled={busy||equippedSlot===slot} onClick={()=>equipTechnique(skill.id,slot)}>{equippedSlot===slot?`In slot ${slot+1}`:`Slot ${slot+1}`}</button>)}</footer>}</div></article>})}</div>
    </section>}

    {tab === "journey" && !campaignDone && <DistrictCampaign profile={profile} value={campaignValue} onChange={onCampaignChange} onBegin={onStartCampaign} onCheckpoint={onCampaignCheckpoint} onClaim={onClaimCampaign} onCalibrate={onCalibrateCampaign} onComplete={onCampaignComplete} onExit={() => setTab("character")}/>} 
    {tab === "journey" && campaignDone && <section className="journey-v3">
      <div className="next-step-card"><div><small>NEXT MEANINGFUL STEP</small><h2>{nextObjective.title}</h2><p>{nextObjective.detail}</p></div><button onClick={routeObjective}>{nextObjective.done ? "View progress" : "Go"}</button></div>
      <RaidCommand player={player} combatPower={combatPower} state={raidState} busy={busy} onSpecialize={onSetRaidSpecialization} onQueue={onQueueRaid} onJoin={onJoinRaid} onFillBots={onFillRaidBots} onAdvance={onAdvanceRaid} onClaim={onClaimRaid} onLeave={onLeaveRaid} onRefresh={onRefreshRaid}/>
      <div className="journey-columns">
        <aside className="quest-rail"><header><small>PROGRESSION PATH</small><b>{objectives.filter((q) => q.done).length}/{objectives.length}</b></header>{objectives.map((quest) => <button key={quest.id} className={quest.done ? "done" : ""} onClick={() => setTab(quest.route === "enhance" ? "enhance" : quest.route)}><i>{quest.done ? "✓" : "○"}</i><span><b>{quest.title}</b><small>{quest.detail}</small></span></button>)}</aside>
        <div className="dungeon-directory"><header><div><small>ALL QUESTS + DUNGEONS</small><h2>City Operations</h2></div><span>Solo needs 100% CP · Co-op needs 75%</span></header><div className="dungeon-grid">{DUNGEONS.map((dungeon) => { const solo = dungeonAccess(dungeon,{level:player.level,cp:combatPower},"solo"); const coop = dungeonAccess(dungeon,{level:player.level,cp:combatPower},"coop"); const clears = Number(progressionState?.clears?.[dungeon.id] || 0); return <button key={dungeon.id} className={`${selectedDungeon.id === dungeon.id ? "selected" : ""} ${solo.unlocked ? "ready" : coop.unlocked ? "coop-only" : "locked"}`} onClick={() => selectDungeon(dungeon)}><div><small>LV {dungeon.level} · {dungeon.district}</small><b>{dungeon.name}</b><span>{dungeon.boss}</span></div><em>{dungeon.rarity}</em><footer><span>{dungeon.cp.toLocaleString()} CP</span><span>{clears} clears</span></footer></button>;})}</div></div>
      </div>
      <div className="dungeon-command">
        <header><div><small>SELECTED OPERATION · LV {selectedDungeon.level}</small><h2>{selectedDungeon.name}</h2><p>Target: {selectedDungeon.boss} · {selectedDungeon.rarity} loot</p></div><div className="cp-gate"><span>YOUR CP <b>{combatPower.toLocaleString()}</b></span><span>SOLO <b>{selectedDungeon.cp.toLocaleString()}</b></span><span>CO-OP <b>{Math.ceil(selectedDungeon.cp*.75).toLocaleString()}</b></span></div></header>
        <div className="operation-modes">
          <article className="afk-mode-card"><small>AFK AUTO-BATTLE</small><h3>{afk ? "Horde battle active" : "Choose a grind zone"}</h3>{afk ? <><p>Your runner is visibly fighting waves in {DUNGEONS.find((d) => d.id === afk.dungeonId)?.name || afk.dungeonId}. Rewards stack for up to 8 hours.</p><button className="watch-battle" onClick={openAfkBattle}>Watch auto-battle</button></> : <><p>Select any unlocked dungeon, preview its horde and rewards, then watch your runner auto-fight.</p><button disabled={busy || !onStartAfk} onClick={openAfkBattle}>Choose location</button></>}</article>
          <article className="coop-card"><small>2–3 RUNNER CO-OP</small><h3>Power-Link Expedition</h3>{party ? <><p>{party.state === "waiting" ? "Room is open. Share its code or wait for Quick Match runners." : party.state === "active" ? `Expedition completes at ${formatTime(party.completes_at)}.` : "Expedition complete."}</p>{party.room_code&&<div className="coop-room-code"><small>ROOM CODE</small><b>{party.room_code}</b></div>}<div className="party-roster">{(party.roster || []).map((member) => <span key={member.userId}><b>{member.name}</b>{Number(member.cp).toLocaleString()} CP</span>)}</div>{party.state === "waiting" ? <><button onClick={()=>setCoopBrowserOpen(true)}>Open room lobby</button><button onClick={() => act(onLeaveCoop,"Left co-op room")}>Leave room</button></> : <button disabled={!coopReady || busy} onClick={() => act(onClaimCoop,"Co-op rewards claimed")}>{coopReady ? "Claim team loot" : "Expedition active"}</button>}</> : <><p>Quick Match fills a public room. Or create a room and share its code with friends.</p><div className="coop-actions"><button disabled={!dungeonAccess(selectedDungeon,{level:player.level,cp:combatPower},"coop").unlocked || busy || !onQueueCoop} onClick={() => act(() => onQueueCoop(selectedDungeon.id),"Quick Match started")}>Quick Match</button><button disabled={busy||!onCreateCoopRoom} onClick={()=>act(()=>onCreateCoopRoom(selectedDungeon.id,"public"),"Co-op room created")}>Create Room</button><button disabled={!onListCoopRooms} onClick={()=>setCoopBrowserOpen(true)}>Browse Rooms</button></div></>}</article>
          <article className="manual-mode-card"><small>ACTIVE PLAY</small><h3>Manual District Sweep</h3>{running ? <Brawl techniques={equippedTechniques} stats={{hp:110+(combatTotals.def||0)*2+(combatTotals.hp||0),maxHp:110+(combatTotals.def||0)*2+(combatTotals.hp||0),str:12+(combatTotals.str||0),def:6+(combatTotals.def||0),spd:8+(combatTotals.spd||0),dex:8+(combatTotals.dex||0),crit:2+(combatTotals.crit||0),wPow:0,aPow:0}} enemy={{id:"sentinel",name:selectedDungeon.boss,kanji:"守",lvl:selectedDungeon.level,hp:Math.max(70,selectedDungeon.cp/8),atk:12+selectedDungeon.level*.8}} onEnd={finishRun}/> : <><p>Skill-based combat gives an immediate equipment roll. Start with an accessible operation.</p><button disabled={!dungeonAccess(selectedDungeon,{level:player.level,cp:combatPower},"solo").unlocked || busy || !onStartRun} onClick={startRun}>Enter manually</button></>}</article>
        </div>
      </div>
    </section>}

    {tab === "character" && <section className="character-v4">
      <header className="loadout-command">
        <div><small>NEO GRID // LOADOUT DECK</small><h2>Character Equipment</h2><p>See your build, upgrades and set powers without leaving one screen.</p></div>
        <div className="loadout-power"><small>COMBAT POWER</small><b>{combatPower.toLocaleString()}</b><span>LV {Number(player.level || 1)} · {equippedCount}/4 GEAR · {inventory.equipped.megachip?"CHIP ONLINE":"NO CHIP"}</span></div>
        <button className="quick-equip-all" disabled={!canImprove || busy} onClick={equipBest}>⚡ {canImprove ? "Equip Best" : "Best Equipped"}</button>
        <button className="open-vault" onClick={() => setTab("vault")}>Inventory</button>
      </header>

      <div className="loadout-cockpit">
        <aside className="combat-stat-panel">
          <header><div><small>CHARACTER STATS</small><h3>Build Readout</h3></div><b>{Number(player.statPoints || 0)} pts</b></header>
          <div className="stat-power-row"><span>Combat Power<small>Level, attributes and equipment</small></span><b>{combatPower.toLocaleString()}</b></div>
          {Object.entries(STAT_LABELS).map(([key, label]) => {
            const gear = Number(combatTotals[key] || 0);
            const base = Number(player.stats?.[key] || 0);
            return <div className="cockpit-stat" key={key}>
              <span><b>{label}</b><small>{key === "str" ? "Weapon damage" : key === "def" ? "Armor and health" : key === "spd" ? "Movement and recovery" : "Technique power"}</small></span>
              <div><strong>{base + gear}</strong><em>{base} base <i>+{gear} gear</i></em></div>
              <button disabled={!player.statPoints || busy} onClick={() => allocateStat(key)} aria-label={`Add one ${label}`}>＋</button>
            </div>;
          })}
          <div className="secondary-stats"><span>Max HP <b>{110 + Number(combatTotals.def || 0) * 2 + Number(combatTotals.hp || 0)}</b></span><span>Critical <b>{Number(combatTotals.crit || 0)}%</b></span><span>Loot bonus <b>+{Number(combatTotals.loot || 0)}%</b></span><span>XP bonus <b>+{Number(combatTotals.xp || 0)}%</b></span></div>
        </aside>

        <section className="equipment-stage">
          <div className="stage-grid" aria-hidden="true"/><div className="stage-aura" aria-hidden="true"/>
          <figure className="runner-model-v4">
            <img src="/assets/characters/runner-equipment-v2.webp" alt={`${profile.codename || "Runner"} full equipment preview`}/>
            <figcaption><span><small>ACTIVE RUNNER</small><b>{profile.codename || "RUNNER"}</b></span><em>{profile.archetype || profile.role || "operative"}</em></figcaption>
          </figure>
          <div className="slot-orbit">
            {SLOT_ORDER.map((slot, index) => {
              const item = equipment[slot]; const upgrade = best[slot];
              const currentCp = item ? itemCombatPower(item, inventory.enhancement[item.id] || 0) : 0;
              const upgradeCp = upgrade ? itemCombatPower(upgrade, inventory.enhancement[upgrade.id] || 0) : 0;
              const isBest = Boolean(item && upgrade?.id === item.id);
              return <article key={slot} className={`orbit-slot orbit-${slot} ${item ? `tier-${item.rarity}` : "empty"}`} style={{"--tier": item ? RARITIES[item.rarity].color : "#8da3bb"}}>
                <button className="slot-main" onClick={() => { if (item) setSelectedId(item.id); setTab(item ? "enhance" : "vault"); }}>
                  <small>0{index + 1} · {slot}</small><ItemArt item={item} level={inventory.enhancement[item?.id] || 0} small/>
                  <span><b>{item?.name || `Empty ${slot}`}</b><em>{item ? `${currentCp} CP · ${RARITIES[item.rarity].label}` : "Find gear in Battle"}</em></span>
                </button>
                <button className="slot-quick" disabled={busy || !upgrade || isBest} onClick={() => equipBestSlot(slot)}>{isBest ? "✓ BEST" : upgrade ? `⚡ QUICK +${Math.max(0, upgradeCp - currentCp)} CP` : "NO GEAR"}</button>
              </article>;
            })}
          </div>
        </section>

        <aside className="bonus-panel">
          <header><small>EQUIPMENT BONUSES</small><h3>Loadout Effects</h3></header>
          <div className="gear-bonus-grid"><span>Attack <b>+{Number(totals.str || 0)}</b></span><span>Defense <b>+{Number(totals.def || 0)}</b></span><span>Speed <b>+{Number(totals.spd || 0)}</b></span><span>Tech <b>+{Number(totals.dex || 0)}</b></span></div>
          <div className="set-bonus-v4"><h4>Set Protocols</h4>{!activeSets.length && <p>Match two pieces from one equipment set to activate its first protocol.</p>}{activeSets.map(({set, count}) => <article key={set.id}><div><b>{set.name}</b><span>{count}/4 pieces</span></div><i style={{width:`${count * 25}%`}}/><small className={count >= 2 ? "active" : ""}>2 PIECES · {set.two}</small><small className={count >= 4 ? "active" : ""}>4 PIECES · {set.four}</small></article>)}</div>
          <div className="slot-legend-v4"><h4>Slot Roles</h4><span><b>Weapon</b>Primary damage</span><span><b>Helmet</b>Defense + tech</span><span><b>Armor</b>Core protection</span><span><b>Boots</b>Speed + mobility</span><span><b>Megachip</b>Build-changing circuit</span></div>
          <button onClick={() => setTab("vault")}>Manage all equipment</button>
        </aside>
      </div>
    </section>}

    {tab === "vault" && <section className="vault-v3">
      <div className="inventory-toolbar"><div><b>{inventory.owned.length}/200 ITEMS</b><span>{unequippedIds.length} unequipped</span></div><button disabled={!canImprove||busy} onClick={equipBest}>⚡ Best Equip</button><button className={confirmAction==="salvage"?"confirm":""} disabled={!unequippedIds.length||busy} onClick={() => bulkAction("salvage")}>⚙ Salvage Unequipped</button><button className={confirmAction==="sell"?"confirm sell":"sell"} disabled={!unequippedIds.length||busy} onClick={() => bulkAction("sell")}>¥ Sell Unequipped</button></div>
      <div className="v2-filters"><div>{["all",...SLOT_ORDER].map((slot)=><button key={slot} className={slotFilter===slot?"active":""} onClick={()=>setSlotFilter(slot)}>{slot}</button>)}</div><div>{["all",...RARITY_ORDER].map((rarity)=><button key={rarity} className={rarityFilter===rarity?"active":""} onClick={()=>setRarityFilter(rarity)}>{rarity}</button>)}</div></div>
      {!ownedItems.length ? <div className="empty-vault"><h2>No equipment yet</h2><p>Open Journey and clear District One to earn your first item.</p><button onClick={()=>setTab("journey")}>Open Journey</button></div> : <div className="inventory-workspace"><div className="v2-grid">{filtered.map((item)=>{ const equipped=inventory.equipped[item.slot]===item.id; const power=itemCombatPower(item,inventory.enhancement[item.id]||0); return <button key={item.id} className={`v2-card tier-${item.rarity} ${selectedId===item.id?"selected":""} ${equipped?"equipped":""}`} style={{"--tier":RARITIES[item.rarity].color}} onClick={()=>setSelectedId((current)=>current===item.id?null:item.id)}><ItemArt item={item} level={inventory.enhancement[item.id]||0}/><b>{item.name}</b><span>{power} CP {equipped?"· EQUIPPED":""}</span></button>})}</div>{selected&&owned.has(selected.id)&&<div className="item-inspector-layer" onPointerDown={(event)=>{if(event.target===event.currentTarget)setSelectedId(null)}}><ItemInspector item={selected} inventory={inventory} onClose={()=>setSelectedId(null)} onEquip={()=>equip(selected)} onEquipRecycle={()=>equip(selected,true)} onEnhance={()=>setTab("enhance")} onSalvage={()=>act(()=>saveLoadout(inventory.equipped,[selected.id],"salvage"),"Item salvaged")} onSell={()=>act(()=>saveLoadout(inventory.equipped,[selected.id],"sell"),"Item sold")}/></div>}</div>}
    </section>}

    {tab === "enhance" && <section className="forge-v3">{!selected||!owned.has(selected.id)?<div className="forge-empty"><h2>Select equipment to enhance</h2><p>Enhancement raises item stats and Combat Power up to +20.</p><button onClick={()=>setTab("vault")}>Choose from inventory</button></div>:<><div className={`forge-art tier-${selected.rarity}`} style={{"--tier":RARITIES[selected.rarity].color}}><ItemArt item={selected} level={inventory.enhancement[selected.id]||0}/><div className="forge-rings"/></div><div className="forge-console"><small style={{color:RARITIES[selected.rarity].color}}>{RARITIES[selected.rarity].label} · {selected.setName}</small><h2>{selected.name}</h2><div className="enhance-level"><span>Enhancement</span><b>+{inventory.enhancement[selected.id]||0}</b><em>/ +20</em></div><div className="enhance-track">{Array.from({length:20},(_,i)=><i key={i} className={i<(inventory.enhancement[selected.id]||0)?"on":""}/>)}</div><p>Failures consume shards but never destroy or downgrade gear. Salvaging enhanced gear returns extra material.</p><button className="enhance-action" disabled={busy||(inventory.enhancement[selected.id]||0)>=20} onClick={enhance}>Enhance · {RARITIES[selected.rarity].enhance*((inventory.enhancement[selected.id]||0)+1)} shards</button></div><div className="forge-list">{ownedItems.map((item)=><button key={item.id} className={selected.id===item.id?"active":""} onClick={()=>setSelectedId(item.id)}><ItemArt item={item} level={inventory.enhancement[item.id]||0} small/><span>{item.name}</span></button>)}</div></>}</section>}

    {afkBattleOpen && <AfkBattleScreen profile={profile} player={player} combatPower={combatPower} selected={selectedDungeon} active={afk} busy={busy} onSelect={(dungeon)=>setSelectedDungeonId(dungeon.id)} onStart={startAfkBattle} onClaim={claimAfkReward} onClose={()=>setAfkBattleOpen(false)}/>} 
    {coopBrowserOpen && <CoopRoomBrowser dungeon={selectedDungeon} party={party} busy={busy} onList={onListCoopRooms} onCreate={onCreateCoopRoom} onJoin={onJoinCoopRoom} onClose={()=>setCoopBrowserOpen(false)} onDone={async()=>{await onRefreshProgression?.();setCoopBrowserOpen(false)}}/>}
    {drop && <div className="v2-reveal"><div className={`v2-reveal-card tier-${drop.item.rarity}`} style={{"--tier":RARITIES[drop.item.rarity].color}}><small>{drop.duplicate?`DUPLICATE · +${drop.shards} SHARDS`:"NEW EQUIPMENT"}</small><ItemArt item={drop.item}/><h2>{drop.item.name}</h2>{!drop.duplicate&&<><button onClick={()=>{equip(drop.item);setDrop(null);setTab("character")}}>Equip upgrade</button>{inventory.equipped[drop.item.slot]&&<button onClick={()=>{equip(drop.item,true);setDrop(null);setTab("character")}}>Equip + salvage replaced</button>}</>}<button onClick={()=>{setDrop(null);setTab("vault")}}>Keep in inventory</button></div></div>}
  </main>;
}

function CoopRoomBrowser({ dungeon, party, busy, onList, onCreate, onJoin, onClose, onDone }) {
  const [rooms,setRooms]=useState([]);
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{setRooms(await onList?.(dungeon.id)||[])}catch(problem){setError(problem.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[dungeon.id]);
  const run=async(work)=>{setLoading(true);setError("");try{await work();await onDone()}catch(problem){setError(problem.message)}finally{setLoading(false)}};
  return <div className="coop-browser-overlay" role="dialog" aria-modal="true" aria-label="Co-op room browser" onPointerDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><section className="coop-browser"><header><div><small>POWER-LINK LOBBY</small><h2>{dungeon.name}</h2></div><button onClick={onClose}>×</button></header>{error&&<p className="coop-error">{error}</p>}{party?<div className="current-coop-room"><small>YOUR ROOM</small><b>{party.room_code||"MATCHING"}</b><span>{party.member_count||party.roster?.length||1}/3 runners</span></div>:<><div className="coop-room-actions"><button disabled={busy||loading} onClick={()=>run(()=>onCreate(dungeon.id,"public"))}>＋ Create public room</button><div><input value={code} maxLength={6} onChange={(event)=>setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="ROOM CODE"/><button disabled={code.length<4||loading} onClick={()=>run(()=>onJoin(code))}>Join</button></div></div><div className="room-list-head"><b>OPEN ROOMS</b><button disabled={loading} onClick={load}>{loading?"Scanning…":"Refresh"}</button></div><div className="coop-room-list">{!loading&&!rooms.length&&<p>No public rooms yet. Create one and become the leader.</p>}{rooms.map((room)=><button key={room.roomCode} disabled={Number(room.members)>=3} onClick={()=>run(()=>onJoin(room.roomCode))}><span><b>{room.leader}</b><small>{room.roomCode} · {Number(room.members||1)}/3 runners</small></span><em>{Number(room.teamCp||0).toLocaleString()} CP</em></button>)}</div></>}</section></div>;
}

function ItemInspector({ item, inventory, onClose, onEquip, onEquipRecycle, onEnhance, onSalvage, onSell }) {
  const level=inventory.enhancement[item.id]||0;
  const equipped=inventory.equipped[item.slot]===item.id;
  const current=byId(inventory.equipped[item.slot]);
  const power=itemCombatPower(item,level);
  const currentPower=itemCombatPower(current,inventory.enhancement[current?.id]||0);
  return <aside className="item-inspector" role="dialog" aria-modal="true" aria-label={`${item.name} details`}><button className="inspector-close" onClick={onClose} aria-label="Close item details">×</button><ItemArt item={item} level={level}/><small style={{color:RARITIES[item.rarity].color}}>{RARITIES[item.rarity].label} · {item.slot}</small><h2>{item.name}</h2><span>{item.setName}</span><div className={`power-compare ${power>currentPower?"upgrade":""}`}><b>{power} CP</b><small>{equipped?"Currently equipped":`${power-currentPower>=0?"+":""}${power-currentPower} vs equipped`}</small></div><p>{item.lore}</p><div className="inspector-actions"><button disabled={equipped} onClick={onEquip}>{equipped?"Equipped":"Equip"}</button>{!equipped&&current&&<button onClick={onEquipRecycle}>Equip + salvage old</button>}<button onClick={onEnhance}>Enhance +{level}</button>{!equipped&&<><button className="danger" onClick={onSalvage}>Salvage · {salvageValue(item,level)} shards</button><button className="sell" onClick={onSell}>Sell · ¥{saleValue(item,level).toLocaleString()}</button></>}</div></aside>;
}

function AfkBattleScreen({ profile, player, combatPower, selected, active, busy, onSelect, onStart, onClaim, onClose }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 700);
    return () => clearInterval(timer);
  }, []);
  const dungeon = active ? DUNGEONS.find((entry) => entry.id === active.dungeonId) || selected : selected;
  const started = active ? new Date(active.startedAt).getTime() : Date.now();
  const snapshot = afkBattleSnapshot({ startedAt: started, dungeonLevel: dungeon.level });
  const { elapsed, wave, enemyHp, enemiesPerWave } = snapshot;
  const waveProgress = active ? snapshot.waveProgress : 0;
  const defeated = active ? snapshot.defeated : 0;
  const playerHp = active ? 88 + Math.round(Math.sin(frame * .8) * 8) : 100;
  const ready = active && snapshot.ready;
  const access = dungeonAccess(dungeon, { level: player.level, cp: combatPower }, "solo");
  const damage = Math.max(12, Math.round(combatPower / Math.max(6, dungeon.level + 5)) + (frame % 4) * 7);
  const enemyNames = ["Ward Drone", "Grid Stalker", "Signal Guard", dungeon.boss];
  const nextRewardMinutes = snapshot.rewardMinutes;

  return <div className="afk-battle-overlay" role="dialog" aria-modal="true" aria-label="AFK auto-battle">
    <section className="afk-battle-screen">
      <header><div><small>NEO GRID // AUTONOMOUS OPERATION</small><h2>{active ? "Auto-Battle Live" : "Select Grind Zone"}</h2></div><div className={`afk-live ${active ? "on" : ""}`}><i/>{active ? "FIGHTING" : "READY"}</div><button onClick={onClose} aria-label="Close auto-battle">×</button></header>
      {!active && <div className="afk-location-strip" aria-label="AFK locations">{DUNGEONS.map((entry) => { const unlocked = dungeonAccess(entry, { level: player.level, cp: combatPower }, "solo").unlocked; return <button key={entry.id} disabled={!unlocked} className={entry.id === selected.id ? "selected" : ""} onClick={() => onSelect(entry)}><small>LV {entry.level}</small><b>{entry.name}</b><span>{entry.cp.toLocaleString()} CP</span></button>; })}</div>}
      <div className={`afk-arena zone-${Math.min(5, Math.floor(dungeon.level/20))} ${active ? "active" : "preview"}`}>
        <div className="afk-sky"><i/><i/><i/></div><div className="afk-city"><i/><i/><i/><i/><i/></div>
        <div className="afk-combat-hud"><div><span>{profile.codename}</span><b>{playerHp}%</b><i><em style={{width:`${playerHp}%`}}/></i></div><strong>WAVE {active ? wave : "—"}</strong><div className="enemy-health"><span>{enemyNames[(wave-1)%enemyNames.length]}</span><b>{active ? enemyHp : 100}%</b><i><em style={{width:`${active ? enemyHp : 100}%`}}/></i></div></div>
        <div className="afk-runner"><div className="runner-aura"/><RunnerPortrait profile={profile}/><i className="slash-one"/><i className="slash-two"/>{active && <b key={frame}>-{damage}</b>}</div>
        <div className="enemy-horde">{Array.from({length:enemiesPerWave},(_,index)=><div key={index} className={`horde-unit unit-${index} ${active&&index<Math.floor(waveProgress*enemiesPerWave)?"defeated":""}`}><i>{index===enemiesPerWave-1&&wave%5===0?"王":"影"}</i><b>{index===enemiesPerWave-1&&wave%5===0?dungeon.boss:"Hostile"}</b></div>)}</div>
        <div className="afk-ground"><i/><i/><i/></div>
        {active && <div className="battle-callout" key={`call-${frame}`}>{frame%3===0?"CRITICAL":frame%3===1?"CHAIN STRIKE":"AUTO SKILL"}</div>}
      </div>
      <div className="afk-readout">
        <div><small>LOCATION</small><b>{dungeon.name}</b><span>{dungeon.district}</span></div>
        <div><small>POWER CHECK</small><b className={access.unlocked?"good":"bad"}>{combatPower.toLocaleString()} / {dungeon.cp.toLocaleString()}</b><span>{access.unlocked?"Ready to dominate":"Increase Combat Power"}</span></div>
        <div><small>HOARD DEFEATED</small><b>{defeated.toLocaleString()}</b><span>{active?`Wave ${wave} in progress`:"Starts when deployed"}</span></div>
        <div><small>REWARD ACCESS</small><b>{dungeon.rarity}</b><span>~{dungeon.shardsPerHour} shards/hour</span></div>
      </div>
      <footer><p>{active ? (ready ? "Loot cache ready. Claiming ends this run and rolls one equipment drop." : `First loot cache in about ${nextRewardMinutes} min. You may close this screen—the battle continues online.`) : `Deploy to ${dungeon.name}. The server owns elapsed time and rewards even when the app is closed.`}</p>{active ? <><button className="afk-secondary" onClick={onClose}>Hide battle · keep grinding</button><button className="afk-primary" disabled={!ready||busy} onClick={onClaim}>{ready?"Claim loot cache":`Claim in ${nextRewardMinutes} min`}</button></> : <button className="afk-primary" disabled={!access.unlocked||busy} onClick={()=>onStart(dungeon)}>{access.unlocked?`Deploy to ${dungeon.name}`:`Need ${access.missingCp.toLocaleString()} more CP`}</button>}</footer>
    </section>
  </div>;
}
