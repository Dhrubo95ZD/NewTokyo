import { useEffect, useMemo, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";
import "./district-operations.css";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const APPROACHES = {
  careful: ["Quiet plan", "Recon, timing and dexterity"],
  direct: ["Direct action", "Strength, defence and control"],
  social: ["Inside contact", "Crime skill and intelligence"],
};
const STAGES = ["Intel", "Preparation", "Execution", "Extraction"];
const PHASES = [
  ["entry", "Entry", "Open the encounter on your terms"],
  ["pressure", "Pressure", "Hold the advantage when the boss reacts"],
  ["extraction", "Extraction", "Leave with the district record intact"],
];

export default function DistrictOperations({ onState }) {
  const [data, setData] = useState(null);
  const [rise, setRise] = useState(null);
  const [districtId, setDistrictId] = useState(null);
  const [operationId, setOperationId] = useState(null);
  const [approach, setApproach] = useState("careful");
  const [mode, setMode] = useState("solo");
  const [bossPlan, setBossPlan] = useState({ entry: "careful", pressure: "direct", extraction: "careful" });
  const [view, setView] = useState("operations");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [event, setEvent] = useState(null);

  const load = async () => {
    setError("");
    const [opsResult, riseResult] = await Promise.all([
      supabase.rpc("bw_operations_snapshot"),
      supabase.rpc("bw_rise_snapshot"),
    ]);
    if (opsResult.error) setError(opsResult.error.message);
    else {
      setData(opsResult.data);
      setDistrictId(current => current || opsResult.data?.districts?.[0]?.id);
    }
    if (riseResult.error) setError(current => current || riseResult.error.message);
    else setRise(riseResult.data);
  };

  useEffect(() => { load(); }, []);

  const district = useMemo(
    () => data?.districts?.find(item => item.id === districtId) || data?.districts?.[0],
    [data, districtId],
  );
  const operation = useMemo(
    () => district?.operations?.find(item => item.id === operationId) || district?.operations?.[0],
    [district, operationId],
  );

  const invoke = async (rpc, params) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setEvent(null);
    const { data: value, error: problem } = await supabase.rpc(rpc, params);
    if (problem) setError(problem.message);
    else {
      if (value?.operations) setData(value.operations);
      if (value?.rise) setRise(value.rise);
      if (!value?.operations && !value?.rise && value?.districts) setData(value);
      setEvent(value?.event || null);
      onState?.(value?.state?.player || value?.operations?.player || value?.rise?.player);
    }
    setBusy(false);
  };

  const invokeRise = async (rpc, params) => {
    await invoke(rpc, params);
    const refreshed = await supabase.rpc("bw_rise_snapshot");
    if (!refreshed.error) setRise(refreshed.data);
  };

  const pinTarget = async itemId => {
    await invoke("bw_set_collection_target", { p_item_id: itemId });
    const [opsResult, riseResult] = await Promise.all([
      supabase.rpc("bw_operations_snapshot"),
      supabase.rpc("bw_rise_snapshot"),
    ]);
    if (!opsResult.error) setData(opsResult.data);
    if (!riseResult.error) setRise(riseResult.data);
  };

  const begin = () => invoke("bw_begin_district_operation", {
    p_operation_id: operation.id,
    p_approach: approach,
    p_mode: mode,
  });
  const advance = choice => invoke("bw_advance_district_operation", {
    p_choice: choice,
    p_request_id: crypto.randomUUID(),
  });

  if (!data) {
    return <div className="operations-page"><header className="operations-hero"><small>BLACKWOOD FIELD OFFICE</small><h1>District Operations</h1><p>{error || "Opening the city operations board…"}</p>{error && <button onClick={load}>Retry</button>}</header></div>;
  }

  return <div className="operations-page">
    <header className="operations-hero">
      <div><small>BLACKWOOD FIELD OFFICE · LIVE</small><h1>Rise to Power</h1><p>Make a plan, read the city and leave a permanent mark on every district you touch.</p></div>
      <aside><span><small>TODAY</small><b>{data.grind?.today || 0} runs</b></span><span><small>EFFICIENCY</small><b>{Math.round((data.grind?.nextEfficiency || 1) * 100)}%</b></span><span><small>PARTS</small><b>{Number(rise?.parts || 0).toLocaleString()}</b></span></aside>
    </header>
    <nav className="rise-tabs" aria-label="Rise to Power sections">{[["operations", "Operations"], ["bosses", "Boss board"], ["workshop", "Workshop"], ["ladder", "Unlock path"]].map(([id, label]) => <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}>{label}</button>)}</nav>
    {error && <div className="operations-alert bad">{error}<button onClick={() => setError("")}>×</button></div>}
    {event && <div className={`operations-alert ${event.success ? "good" : "warn"}`}>
      <b>{event.title}</b><span>{event.message}</span>
      {(event.cash || event.xp || event.mastery || event.parts || event.firstClear) && <em>{event.cash ? `+${money(event.cash)}` : ""}{event.xp ? ` · +${event.xp} XP` : ""}{event.mastery ? ` · +${event.mastery} mastery` : ""}{event.parts ? ` · +${event.parts} parts` : ""}{event.firstClear ? " · FIRST CLEAR" : ""}{event.itemName ? ` · Found ${event.itemName}` : ""}</em>}
    </div>}
    {view === "operations" && (data.active
      ? <ActiveOperation active={data.active} busy={busy} onAdvance={advance} />
      : <OperationsBoard data={data} district={district} operation={operation} districtId={districtId} approach={approach} mode={mode} busy={busy} setDistrictId={setDistrictId} setOperationId={setOperationId} setApproach={setApproach} setMode={setMode} begin={begin} />)}
    {view === "bosses" && <BossBoard rise={rise} plan={bossPlan} setPlan={setBossPlan} busy={busy} challenge={bossId => invokeRise("bw_challenge_district_boss_plan", { p_boss_id: bossId, p_plan: bossPlan, p_request_id: crypto.randomUUID() })} pinTarget={pinTarget} />}
    {view === "workshop" && <Workshop rise={rise} busy={busy} act={invokeRise} />}
    {view === "ladder" && <UnlockPath rise={rise} />}
  </div>;
}

function OperationsBoard({ data, district, operation, districtId, approach, mode, busy, setDistrictId, setOperationId, setApproach, setMode, begin }) {
  return <>
    <section className="district-board"><header><span><small>TACTICAL MAP</small><h2>Choose a district</h2></span><em>Heat falls by 5 every hour</em></header><div>{data.districts.map(item => <button className={districtId === item.id ? "active" : ""} style={{ "--district": item.accent }} onClick={() => { setDistrictId(item.id); setOperationId(null); }} key={item.id}><i><GameIcon name="operations" /></i><span><small>{item.zone}</small><b>{item.name}</b><em>Threat {item.threat} · {item.clears} clears</em></span><strong>{item.heat}<small>HEAT</small></strong><figure><i style={{ width: `${item.heat}%` }} /></figure></button>)}</div></section>
    {district && <section className="operation-dossier" style={{ "--district": district.accent }}><header><div><small>{district.zone} · THREAT {district.threat}</small><h2>{district.name}</h2><p>{district.summary}</p><em>20-clear UTC-day cap · full efficiency for the first 10 clears</em></div><dl><div><dt>Heat</dt><dd>{district.heat}/100</dd></div><div><dt>Mastery</dt><dd>{district.mastery}</dd></div><div><dt>Clears</dt><dd>{district.clears}</dd></div></dl></header>
      <div className="operation-list">{district.operations.map(item => <button className={operation?.id === item.id ? "active" : ""} disabled={data.player.level < item.requiredLevel} onClick={() => setOperationId(item.id)} key={item.id}><span><small>DIFFICULTY {item.difficulty}</small><b>{item.name}</b><em>{item.briefing}</em></span><aside><small>NPC CAPTAIN</small><b>{item.captainName}</b><em>{money(item.baseCash)} · {item.baseXp} XP</em></aside>{data.player.level < item.requiredLevel && <strong>LEVEL {item.requiredLevel}</strong>}</button>)}</div>
      {operation && <div className="operation-plan"><div><small>CHOOSE OPENING PLAN</small><nav>{Object.entries(APPROACHES).map(([id, [name, detail]]) => <button className={approach === id ? "active" : ""} onClick={() => setApproach(id)} key={id}><GameIcon name={id === "direct" ? "combat" : id === "social" ? "social" : "targets"} /><span><b>{name}</b><em>{detail}</em></span></button>)}</nav></div><div><small>TEAM</small><nav>{[["solo", "Solo", "Your account stats only"], ["family", "Family-supported", "Real family members add support"]].map(([id, name, detail]) => <button className={mode === id ? "active" : ""} onClick={() => setMode(id)} key={id}><GameIcon name={id === "solo" ? "players" : "family"} /><span><b>{name}</b><em>{detail}</em></span></button>)}</nav></div><button className="begin-operation" disabled={busy || data.player.level < operation.requiredLevel} onClick={begin}>{busy ? "Preparing dossier…" : "Begin operation"}<span>Every stage asks a different question · No energy required</span></button><p className="operation-odds"><b>Rare find:</b> {(Number(operation.rareChance) * 100).toFixed(1)}% on a successful extraction. The first 10 daily clears are full efficiency; rewards then settle at 40%.</p></div>}
    </section>}
  </>;
}

function BossBoard({ rise, plan, setPlan, busy, challenge, pinTarget }) {
  if (!rise) return <RiseLoading />;
  const targetId = rise.target?.item?.id;
  return <section className="rise-panel"><header><small>DISTRICT ENDGAME</small><h2>Boss board</h2><p>Each boss is a three-stage encounter. Pick a plan that answers its mechanic; two stages out of three win the record. Target relic chance is 20% per victory and guaranteed on every fifth victory.</p></header><div className="boss-plan-summary"><b>Current encounter plan</b>{PHASES.map(([id, label]) => <span key={id}><small>{label}</small><strong>{APPROACHES[plan[id]]?.[0]}</strong></span>)}</div><div className="boss-grid">{rise.bosses?.map(boss => <article className={boss.unlocked ? "unlocked" : "locked"} style={{ "--district": boss.accent }} key={boss.id}><small>{boss.districtName}</small><h3>{boss.name}</h3><strong>{boss.title}</strong><p>{boss.briefing}</p><div className="boss-mechanic"><small>READ THE MECHANIC</small><b>{boss.mechanic}</b><span>{boss.failureHint}</span></div><div className="boss-phases">{PHASES.map(([id, label, detail]) => <label key={id}><span><b>{label}</b><em>{detail}</em></span><select value={plan[id]} onChange={event => setPlan(current => ({ ...current, [id]: event.target.value }))} aria-label={`${label} approach`}><option value="careful">{APPROACHES.careful[0]}</option><option value="direct">{APPROACHES.direct[0]}</option><option value="social">{APPROACHES.social[0]}</option></select><small className={plan[id] === boss[`${id}Approach`] ? "recommended" : ""}>{plan[id] === boss[`${id}Approach`] ? "Good fit for this boss" : `Recommended: ${APPROACHES[boss[`${id}Approach`]]?.[0] || "read the clue"}`}</small></label>)}</div><dl><div><dt>Record</dt><dd>{boss.wins}–{boss.losses}</dd></div><div><dt>Reward</dt><dd>{boss.partsReward} parts</dd></div><div><dt>Target</dt><dd>{boss.rewardName}</dd></div></dl><div className="boss-target-actions"><button className="secondary-action" disabled={busy || targetId === boss.rewardItemId} onClick={() => pinTarget(boss.rewardItemId)}>{targetId === boss.rewardItemId ? "Target pinned" : "Pin target"}</button><span>{boss.targetDrops || 0} drops · next guarantee after {5 - (Number(boss.wins || 0) % 5)} wins</span></div>{!boss.unlocked && <p className="boss-lock">Requires level {boss.requiredLevel}, {boss.requiredMastery} mastery and {boss.requiredClears} clears. Current: level {rise.player?.level}, {boss.mastery} mastery and {boss.clears} clears.</p>}<button disabled={busy || !boss.unlocked || boss.cooldownSeconds > 0} onClick={() => challenge(boss.id)}>{boss.cooldownSeconds > 0 ? `Recon ${Math.ceil(boss.cooldownSeconds / 60)}m` : boss.unlocked ? "Run three-stage encounter" : "Locked"}</button></article>)}</div></section>;
}

function Workshop({ rise, busy, act }) {
  if (!rise) return <RiseLoading />;
  const duplicates = (rise.inventory || []).filter(item => item.available > 0);
  return <section className="rise-panel workshop"><header><small>DETERMINISTIC PROGRESSION</small><h2>Blackwood Workshop</h2><p><b>{Number(rise.parts || 0).toLocaleString()} parts available.</b> No failed upgrades and no paid materials. Lock a favourite before dismantling spare copies.</p></header><div className="workshop-block"><h3>Improve owned equipment</h3><div className="workshop-grid">{(rise.inventory || []).map(item => <article key={item.id}><span><small>{item.rarity} · rank {item.upgradeRank || 0}/3 {item.locked ? "· LOCKED" : ""}</small><b>{item.name}</b></span><button disabled={busy || item.upgradeRank >= 3 || rise.parts < item.upgradeCost} onClick={() => act("bw_upgrade_rise_item", { p_item_id: item.id, p_request_id: crypto.randomUUID() })}>{item.upgradeRank >= 3 ? "Maximum rank" : `Upgrade · ${item.upgradeCost} parts`}</button></article>)}</div></div><div className="workshop-block"><h3>Dismantle spare copies</h3>{duplicates.length ? <div className="workshop-grid">{duplicates.map(item => <article key={item.id}><span><small>{item.rarity} · {item.available} spare {item.locked ? "· LOCKED" : ""}</small><b>{item.name}</b></span><button disabled={busy || item.locked} onClick={() => act("bw_dismantle_item", { p_item_id: item.id, p_quantity: 1, p_request_id: crypto.randomUUID() })}>{item.locked ? "Unlock before dismantling" : `Dismantle one · +${({ common: 4, uncommon: 9, rare: 22, epic: 55, legendary: 140 }[item.rarity] || 4)}`}</button></article>)}</div> : <p className="empty-note">No spare equipment. Equipped copies are always protected.</p>}</div><div className="workshop-block"><h3>Boss-blueprint builds</h3><div className="recipe-grid">{rise.recipes?.map(recipe => <article key={recipe.id}><small>{recipe.item.rarity} · level {recipe.requiredLevel}</small><h4>{recipe.item.name}</h4><p>{recipe.item.description}</p><button disabled={busy || !recipe.bossDefeated || rise.player.level < recipe.requiredLevel || rise.parts < recipe.partsCost} onClick={() => act("bw_craft_rise_item", { p_recipe_id: recipe.id, p_request_id: crypto.randomUUID() })}>{!recipe.bossDefeated ? "Boss blueprint locked" : `Build · ${recipe.partsCost} parts`}</button></article>)}</div></div></section>;
}

function UnlockPath({ rise }) {
  if (!rise) return <RiseLoading />;
  return <section className="rise-panel"><header><small>VISIBLE PROGRESSION</small><h2>Your route through Blackwood</h2><p>Build district mastery, defeat a distinct boss, unlock its workshop blueprint, then move to the next district.</p></header><div className="unlock-path">{rise.bosses?.map((boss, index) => <article className={boss.wins > 0 ? "done" : boss.unlocked ? "ready" : ""} key={boss.id}><i>{boss.wins > 0 ? "✓" : index + 1}</i><div><small>{boss.districtName} · LEVEL {boss.requiredLevel}</small><h3>{boss.title}</h3><p>{boss.requiredMastery} mastery · {boss.requiredClears} clears · Blueprint and targeted {boss.rewardRarity} relic</p></div><strong>{boss.wins > 0 ? "DEFEATED" : boss.unlocked ? "READY" : "LOCKED"}</strong></article>)}</div></section>;
}

function RiseLoading() { return <section className="rise-panel"><p>Opening the Rise to Power ledger…</p></section>; }

function ActiveOperation({ active, busy, onAdvance }) {
  const options = active.stageOptions || Object.entries(APPROACHES).map(([id, [label, detail]]) => ({ id, label, detail, clue: detail }));
  return <section className="active-operation" style={{ "--district": active.accent }}><header><div><small>{active.districtName} · ACTIVE DOSSIER</small><h2>{active.operationName}</h2><p>{active.briefing}</p></div><span><small>CONDITION</small><b>{active.condition}%</b><figure><i style={{ width: `${active.condition}%` }} /></figure></span></header><div className="active-scenario"><small>DOSSIER CONDITION · {active.scenarioLabel}</small><p>{active.scenarioClue}</p></div><div className="stage-track">{STAGES.map((stage, index) => <div className={index + 1 < active.currentStage ? "done" : index + 1 === active.currentStage ? "current" : ""} key={stage}><i>{index + 1 < active.currentStage ? "✓" : index + 1}</i><span><small>STAGE {index + 1}</small><b>{stage}</b></span></div>)}</div><article><small>CURRENT OBJECTIVE</small><h3>{active.stageTitle}</h3><p>{active.stageBrief}</p>{active.currentStage === 3 && <div className="npc-card"><GameIcon name="combat" /><span><small>NPC CAPTAIN</small><b>{active.captainName}</b><em>Difficulty {active.difficulty}</em></span></div>}<div className="active-metrics"><span><small>OPENING PLAN</small><b>{APPROACHES[active.approach]?.[0]}</b></span><span><small>TEAM</small><b>{active.mode === "family" ? `${active.supporters} family members` : "Solo"}</b></span><span><small>RECORD</small><b>{active.successes} passed · {active.failures} setbacks</b></span></div></article><footer><small>Choose the response that fits this stage</small><div>{options.map(option => <button disabled={busy} onClick={() => onAdvance(option.id)} key={option.id}><GameIcon name={option.id === "direct" ? "combat" : option.id === "social" ? "social" : "targets"} /><span><b>{option.label}</b><em>{option.detail}</em><small>{option.clue}</small></span></button>)}</div></footer></section>;
}
