import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunnerPortrait } from "../online/CharacterCreator.jsx";
import "./district-campaign.css";

const STEPS = ["briefing", "skirmish", "loot", "boss"];

const ROLE_KITS = {
  striker: { label: "Striker", discipline: "Vanguard", hp: 108, damage: 15, grace: 0, accent: "#ff6c69", special: "Power Break" },
  guardian: { label: "Guardian", discipline: "Protector", hp: 122, damage: 10, grace: 1, accent: "#22bda8", special: "Field Barrier" },
  technician: { label: "Technician", discipline: "Controller", hp: 96, damage: 12, grace: 0, accent: "#6878ee", special: "Signal Jam" },
};

const ROLE_ALIASES = {
  ghost: "technician", samurai: "striker", netrunner: "technician", fixer: "guardian", scout: "technician",
};

const WEAPONS = [
  {
    id: "street-ronin:green:weapon", name: "Street Katana", setName: "Street Ronin",
    discipline: "striker", accent: "#ff6c69", stats: { attack: 9, speed: 2 },
    perk: "Perfect strikes deal +4 damage.", mark: "刃",
  },
  {
    id: "neon-sentinel:green:weapon", name: "Street Pulse Longsword", setName: "Neon Sentinel",
    discipline: "guardian", accent: "#4bd9d0", stats: { attack: 7, defense: 4 },
    perk: "The first boss hit is absorbed.", mark: "衛",
  },
  {
    id: "ghost-protocol:green:weapon", name: "Street Data Blade", setName: "Ghost Protocol",
    discipline: "technician", accent: "#8e83ff", stats: { attack: 7, tech: 4 },
    perk: "Special meter charges 20% faster.", mark: "脈",
  },
];

const ROLE_ORDERED_WEAPONS = (role) => {
  const preferred = role === "striker" ? "street-ronin:green:weapon"
    : role === "guardian" ? "neon-sentinel:green:weapon" : "ghost-protocol:green:weapon";
  return [...WEAPONS].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
};

export const DISTRICT_CAMPAIGN_DEFAULTS = Object.freeze({
  version: 1,
  status: "available",
  step: "briefing",
  scout: { locks: 0, misses: 0, complete: false },
  skirmish: { complete: false, attempts: 0 },
  loot: { weaponId: null, claimed: false },
  boss: { complete: false, attempts: 0, calibrationLocks: 0 },
  reward: { weaponId: null, enhancement: 0, shards: 0, credits: 0, xp: 0 },
  serverToken: null,
  rewardReceipt: null,
  complete: false,
});

export function normalizeDistrictCampaign(value) {
  const incoming = value && value.version === 1 ? value : {};
  const step = STEPS.includes(incoming.step) ? incoming.step : "briefing";
  return {
    ...DISTRICT_CAMPAIGN_DEFAULTS,
    ...incoming,
    step,
    scout: { ...DISTRICT_CAMPAIGN_DEFAULTS.scout, ...(incoming.scout || {}) },
    skirmish: { ...DISTRICT_CAMPAIGN_DEFAULTS.skirmish, ...(incoming.skirmish || {}) },
    loot: { ...DISTRICT_CAMPAIGN_DEFAULTS.loot, ...(incoming.loot || {}) },
    boss: { ...DISTRICT_CAMPAIGN_DEFAULTS.boss, ...(incoming.boss || {}) },
    reward: { ...DISTRICT_CAMPAIGN_DEFAULTS.reward, ...(incoming.reward || {}) },
  };
}

export function districtCampaignReward(value) {
  const campaign = normalizeDistrictCampaign(value);
  return {
    weaponId: campaign.reward.weaponId,
    enhancement: Math.max(0, Math.min(1, Number(campaign.reward.enhancement) || 0)),
    shards: Math.max(0, Number(campaign.reward.shards) || 0),
    credits: Math.max(0, Number(campaign.reward.credits) || 0),
    xp: Math.max(0, Number(campaign.reward.xp) || 0),
    districtComplete: Boolean(campaign.complete),
  };
}

// Applies this slice to the current v2 inventory shape. It is idempotent, so a
// reconnect or repeated cloud acknowledgement cannot duplicate the reward.
export function applyDistrictCampaignReward(value, campaignValue) {
  const reward = districtCampaignReward(campaignValue);
  if (!reward.weaponId) return value;
  const inventory = value || {};
  const owned = [...new Set([...(inventory.owned || []), reward.weaponId])];
  return {
    ...inventory,
    owned,
    equipped: { ...(inventory.equipped || {}), weapon: reward.weaponId },
    enhancement: {
      ...(inventory.enhancement || {}),
      [reward.weaponId]: Math.max(Number(inventory.enhancement?.[reward.weaponId]) || 0, reward.enhancement),
    },
    shards: Math.max(Number(inventory.shards) || 0, reward.shards),
    tutorialStep: reward.enhancement > 0 ? Math.max(Number(inventory.tutorialStep) || 0, 3) : 1,
  };
}

function resolveRole(role) {
  const key = ROLE_ALIASES[role] || role;
  return ROLE_KITS[key] ? key : "striker";
}

function ProgressRail({ active }) {
  return (
    <ol className="dc-progress" aria-label="District One campaign progress">
      {["Scout", "Intercept", "Arm", "Commander"].map((label, index) => {
        const current = STEPS.indexOf(active);
        return <li key={label} className={index < current ? "done" : index === current ? "active" : ""}><i>{index < current ? "✓" : index + 1}</i><span>{label}</span></li>;
      })}
    </ol>
  );
}

function SignalScout({ role, progress, onCommit }) {
  const [cursor, setCursor] = useState(8);
  const [direction, setDirection] = useState(1);
  const [feedback, setFeedback] = useState("Tap LOCK while the signal crosses the bright window.");
  const locks = progress.locks || 0;
  const kit = ROLE_KITS[role];
  const target = role === "technician" ? [39, 67] : [44, 62];

  useEffect(() => {
    if (locks >= 3) return undefined;
    const timer = window.setInterval(() => {
      setCursor((value) => {
        const next = value + direction * (role === "guardian" ? 2.35 : 2.8);
        if (next >= 96) { setDirection(-1); return 96; }
        if (next <= 4) { setDirection(1); return 4; }
        return next;
      });
    }, 32);
    return () => window.clearInterval(timer);
  }, [direction, locks, role]);

  const lockSignal = () => {
    if (locks >= 3) return;
    const hit = cursor >= target[0] && cursor <= target[1];
    const next = {
      ...progress,
      locks: hit ? Math.min(3, locks + 1) : locks,
      misses: (progress.misses || 0) + (hit ? 0 : 1),
      complete: hit && locks + 1 >= 3,
    };
    setFeedback(hit ? (locks + 1 >= 3 ? "Route mapped. The relief convoy has a safe approach." : "Signal locked. Find the next relay.") : "Signal slipped. Re-centre and try again.");
    onCommit(next);
  };

  return (
    <section className="dc-card dc-scout" style={{ "--dc-accent": kit.accent }}>
      <div className="dc-card-head"><div><small>STEP 01 · EAST MARKET RELAYS</small><h2>Scout the service route</h2></div><b>{locks}/3</b></div>
      <p>A relief convoy is blocked by illegal signal jammers. Map a safe route without drawing the patrol toward the market.</p>
      <div className="dc-signal" aria-label={`Signal cursor at ${Math.round(cursor)} percent`}>
        <div className="dc-signal-grid" />
        <div className="dc-target" style={{ left: `${target[0]}%`, width: `${target[1] - target[0]}%` }} />
        <i style={{ left: `${cursor}%` }} />
      </div>
      <div className="dc-locks">{[0, 1, 2].map((index) => <i key={index} className={index < locks ? "on" : ""} />)}</div>
      <button className="dc-primary" onClick={lockSignal} disabled={locks >= 3}>LOCK SIGNAL</button>
      <span className="dc-feedback" role="status">{feedback}</span>
      {locks >= 3 && <button className="dc-advance" onClick={() => onCommit({ ...progress, complete: true }, true)}>Move to interception</button>}
    </section>
  );
}

function RunnerGlyph({ lane, role, weapon, profile, phase }) {
  return (
    <div className={`dc-runner lane-${lane} ${phase === "opening" ? "counter-ready" : ""}`} style={{ "--runner": ROLE_KITS[role].accent }}>
      <RunnerPortrait profile={{ ...(profile || {}), role, archetype: role }} compact />
      <i /><b>{weapon ? weapon.mark : "走"}</b>
    </div>
  );
}

const ENCOUNTER_PATTERNS = {
  patrol: [2, 0, 1, 2, 1, 0, 2, 0],
  boss: [1, 0, 2, 1, 2, 0, 0, 2, 1, 0],
};

function initialEncounterState({ maxHp, enemyMax, shield }) {
  return {
    lane: 1, hp: maxHp, enemyHp: enemyMax, round: 0, phase: "telegraph",
    meter: 0, focus: 0, shield, stun: 0, combo: 0, struck: false,
    outcome: null, message: "Dodge the red lane. Counter when the target flashes OPEN.",
  };
}

export function resolveEncounterImpact(current, { dangerLane, boss = false, fastFocus = false }) {
  let hp = current.hp;
  let shield = current.shield;
  let focus = current.focus;
  let stun = current.stun;
  let message;
  if (stun > 0) {
    stun -= 1;
    message = "JAMMED — free counter window!";
  } else if (current.lane === dangerLane) {
    if (shield > 0) {
      shield -= 1;
      focus = Math.min(100, focus + 10);
      message = "Barrier absorbed the impact. Counter now!";
    } else {
      const damage = boss ? 24 : 16;
      hp = Math.max(0, hp - damage);
      message = `Hit for ${damage}. Move earlier on the next warning.`;
    }
  } else {
    focus = Math.min(100, focus + (fastFocus ? 28 : 22));
    message = "Clean dodge — target exposed!";
  }
  if (hp <= 0) return { ...current, hp: 0, shield, focus, stun, meter: 100, outcome: "defeat", message: "The convoy pulled back safely." };
  return { ...current, hp, shield, focus, stun, phase: "opening", meter: 0, struck: false, message };
}

export function resolveEncounterStrike(current, { role, baseDamage, weaponAttack = 0, fastFocus = false }) {
  if (current.outcome || current.phase !== "opening" || current.struck) return current;
  const combo = current.combo + 1;
  const roleBonus = role === "striker" ? 5 : 0;
  const damage = baseDamage + weaponAttack + roleBonus + Math.min(8, (combo - 1) * 2);
  const enemyHp = Math.max(0, current.enemyHp - damage);
  return {
    ...current, enemyHp, combo, struck: true,
    focus: Math.min(100, current.focus + (fastFocus ? 34 : 27)),
    outcome: enemyHp <= 0 ? "victory" : null,
    message: enemyHp <= 0 ? "Target disabled. Route secured." : `${combo > 1 ? `${combo}× COMBO · ` : ""}${damage} damage`,
  };
}

function LaneEncounter({ role, boss = false, weapon = null, profile = null, attempts = 0, onWin, onAttempt }) {
  const kit = ROLE_KITS[role];
  const maxHp = kit.hp + (weapon?.stats.defense || 0) * 2;
  const enemyMax = boss ? 176 : 84;
  const openingMs = boss ? 1050 : 1250;
  const telegraphMs = boss ? 1200 : 1450;
  const startingShield = (boss && weapon?.id.includes("neon-sentinel")) ? 1 : kit.grace;
  const pattern = boss ? ENCOUNTER_PATTERNS.boss : ENCOUNTER_PATTERNS.patrol;
  const [combat, setCombat] = useState(() => initialEncounterState({ maxHp, enemyMax, shield: startingShield }));
  const [advancing, setAdvancing] = useState(false);
  const touchStart = useRef(null);
  const winSent = useRef(false);
  const dangerLane = pattern[combat.round % pattern.length];

  useEffect(() => {
    if (combat.outcome) return undefined;
    const timer = window.setInterval(() => {
      setCombat((current) => {
        if (current.outcome) return current;
        const duration = current.phase === "telegraph" ? telegraphMs : openingMs;
        const meter = current.meter + (50 / duration) * 100;
        if (meter < 100) return { ...current, meter };

        const currentDanger = pattern[current.round % pattern.length];
        if (current.phase === "telegraph") {
          return resolveEncounterImpact(current, {
            dangerLane: currentDanger, boss, fastFocus: weapon?.id.includes("ghost-protocol"),
          });
        }

        return {
          ...current, phase: "telegraph", meter: 0, round: current.round + 1,
          combo: current.struck ? current.combo : 0, struck: false,
          message: current.struck ? "Read the next lane." : "Counter window missed — read the next lane.",
        };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [boss, combat.outcome, openingMs, pattern, telegraphMs, weapon?.id]);

  const move = useCallback((nextLane) => {
    setCombat((current) => current.outcome ? current : { ...current, lane: Math.max(0, Math.min(2, nextLane)) });
  }, []);

  const strike = () => {
    setCombat((current) => resolveEncounterStrike(current, {
      role, baseDamage: kit.damage, weaponAttack: weapon?.stats.attack || 0,
      fastFocus: weapon?.id.includes("ghost-protocol"),
    }));
  };

  const special = () => {
    setCombat((current) => {
      if (current.outcome || current.focus < 100) return current;
      if (role === "guardian") return {
        ...current, hp: Math.min(maxHp, current.hp + 30), shield: current.shield + 1,
        focus: 0, message: "FIELD BARRIER — integrity restored and one hit blocked.",
      };
      const damage = role === "striker" ? 34 : 15;
      const enemyHp = Math.max(0, current.enemyHp - damage);
      return {
        ...current, enemyHp, focus: 0, stun: role === "technician" ? 2 : current.stun,
        outcome: enemyHp <= 0 ? "victory" : null,
        message: role === "technician" ? "SIGNAL JAM — two attacks cancelled." : "POWER BREAK — guard shattered.",
      };
    });
  };

  const retry = () => {
    onAttempt?.(attempts + 1);
    winSent.current = false;
    setCombat(initialEncounterState({ maxHp, enemyMax, shield: startingShield }));
  };

  const continueVictory = async () => {
    if (winSent.current) return;
    winSent.current = true;
    setAdvancing(true);
    try { await onWin?.(); }
    finally {
      // A successful checkpoint unmounts this encounter. If the network rejects
      // it, release the button so the player can retry without replaying combat.
      window.setTimeout(() => { winSent.current = false; setAdvancing(false); }, 700);
    }
  };

  const handleTouchStart = (event) => { touchStart.current = event.changedTouches?.[0]?.clientX ?? null; };
  const handleTouchEnd = (event) => {
    const end = event.changedTouches?.[0]?.clientX;
    if (touchStart.current == null || end == null) return;
    const delta = end - touchStart.current;
    if (Math.abs(delta) > 34) move(combat.lane + (delta > 0 ? 1 : -1));
    touchStart.current = null;
  };

  if (combat.outcome === "defeat") return (
    <section className="dc-card dc-defeat" style={{ "--dc-accent": kit.accent }}>
      <small>SAFE WITHDRAWAL</small><h2>Route compromised</h2>
      <p>The convoy pulled back safely. Red means danger: swipe or use the large lane buttons before the warning fills.</p>
      <button className="dc-primary" onClick={retry}>Retry encounter</button>
    </section>
  );

  const phaseLabel = combat.phase === "telegraph" ? "DODGE" : "COUNTER";
  return (
    <section className={`dc-arena ${boss ? "boss" : ""} phase-${combat.phase} ${combat.outcome === "victory" ? "is-victory" : ""}`} style={{ "--dc-accent": kit.accent, "--phase-progress": `${combat.meter}%` }}>
      <div className="dc-hud">
        <div><small>{boss ? "ROGUE CONSTRUCTION EXOSUIT" : "JAMMER PATROL"}</small><b>{boss ? "Rail Warden K-9" : "Roadblock Unit"}</b></div>
        <div className="dc-bars"><label><span>YOU</span><i><b style={{ width: `${combat.hp / maxHp * 100}%` }} /></i><em>{combat.hp}/{maxHp}</em></label><label className="enemy"><span>TARGET</span><i><b style={{ width: `${combat.enemyHp / enemyMax * 100}%` }} /></i><em>{combat.enemyHp}/{enemyMax}</em></label></div>
      </div>
      <div className="dc-phase-banner"><b>{phaseLabel}</b><span>{combat.phase === "telegraph" ? "Leave the red lane" : "Target exposed — attack now"}</span><i><b style={{ width: `${combat.meter}%` }} /></i></div>
      <div className="dc-playfield" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {[0, 1, 2].map((track) => <button type="button" aria-label={`Move to ${["left", "centre", "right"][track]} lane`} onClick={() => move(track)} key={track} className={`dc-lane ${combat.phase === "telegraph" && dangerLane === track ? "danger" : ""} ${combat.lane === track ? "occupied" : ""}`}><i /><span>{combat.phase === "telegraph" && dangerLane === track ? "DANGER" : combat.lane === track ? "YOU" : "SAFE"}</span></button>)}
        <div className={`dc-opponent ${boss ? "is-boss" : "is-patrol"} ${combat.phase === "opening" ? "exposed" : ""}`}>
          <img src={boss ? "/assets/campaign/rail-warden-k9.webp" : "/assets/campaign/roadblock-unit.webp"} alt={boss ? "Rail Warden K-9 construction exosuit" : "Roadblock Unit security exosuit"} />
        </div>
        <RunnerGlyph lane={combat.lane} role={role} weapon={weapon} profile={profile} phase={combat.phase} />
        <div className="dc-combo"><b>{combat.combo}×</b><span>COMBO</span></div>
        {combat.shield > 0 && <div className="dc-shield">SHIELD ×{combat.shield}</div>}
        {combat.outcome === "victory" && <div className="dc-victory-overlay"><small>ENCOUNTER COMPLETE</small><h3>Route secured</h3><p>The target is disabled and cannot block the relief convoy.</p><button className="dc-primary" disabled={advancing} onClick={continueVictory}>{advancing ? "Securing progress…" : "Continue"}</button></div>}
      </div>
      <p className="dc-combat-log" role="status">{combat.message}</p>
      <div className="dc-controls">
        <div className="dc-movement"><button onClick={() => move(combat.lane - 1)} disabled={combat.lane === 0 || combat.outcome} aria-label="Move left"><b>‹</b><small>LEFT</small></button><button onClick={() => move(combat.lane + 1)} disabled={combat.lane === 2 || combat.outcome} aria-label="Move right"><b>›</b><small>RIGHT</small></button></div>
        <button className={`dc-strike ${combat.phase === "opening" && !combat.struck ? "ready" : ""}`} onClick={strike} disabled={combat.phase !== "opening" || combat.struck || combat.outcome}>COUNTER<small>{combat.phase === "opening" ? (combat.struck ? "hit landed" : "ATTACK NOW") : "dodge first"}</small></button>
        <button className="dc-special" onClick={special} disabled={combat.focus < 100 || combat.outcome}>{kit.special}<small>{combat.focus >= 100 ? "READY" : `${Math.round(combat.focus)}% focus`}</small><i><b style={{ width: `${combat.focus}%` }} /></i></button>
      </div>
    </section>
  );
}

function LootChoice({ role, selectedId, onSelect, onAdvance }) {
  const choices = ROLE_ORDERED_WEAPONS(role);
  return (
    <section className="dc-card dc-loot" style={{ "--dc-accent": ROLE_KITS[role].accent }}>
      <div className="dc-card-head"><div><small>STEP 03 · RECOVERED LOCKER</small><h2>Choose your first weapon</h2></div><b>GREEN</b></div>
      <p>Only one weapon can be powered before the commander arrives. Your discipline match is marked, but every choice is viable.</p>
      <div className="dc-loot-grid">
        {choices.map((weapon, index) => <button key={weapon.id} className={selectedId === weapon.id ? "selected" : ""} onClick={() => onSelect(weapon)} style={{ "--weapon": weapon.accent }}>
          {index === 0 && <em>DISCIPLINE MATCH</em>}<div className="dc-weapon-art"><i /><b>{weapon.mark}</b></div>
          <small>{weapon.setName}</small><strong>{weapon.name}</strong>
          <span>{Object.entries(weapon.stats).map(([stat, amount]) => `${stat.toUpperCase()} +${amount}`).join(" · ")}</span><p>{weapon.perk}</p>
        </button>)}
      </div>
      <button className="dc-primary" disabled={!selectedId} onClick={onAdvance}>Equip and face commander</button>
    </section>
  );
}

function Calibration({ weapon, locks, onLock }) {
  const [cursor, setCursor] = useState(5);
  const [direction, setDirection] = useState(1);
  const target = [54, 72];
  useEffect(() => {
    if (locks >= 2) return undefined;
    const timer = window.setInterval(() => setCursor((value) => {
      const next = value + direction * 3.1;
      if (next > 96) { setDirection(-1); return 96; }
      if (next < 4) { setDirection(1); return 4; }
      return next;
    }), 34);
    return () => window.clearInterval(timer);
  }, [direction, locks]);
  const tap = () => onLock(cursor >= target[0] && cursor <= target[1]);
  return <div className="dc-calibration" style={{ "--weapon": weapon.accent }}><small>FIELD CALIBRATION · {locks}/2</small><h3>Enhance {weapon.name} to +1</h3><p>The recovered parts cover this first enhancement. Lock both stable power cycles.</p><div><i style={{ left: `${target[0]}%`, width: `${target[1] - target[0]}%` }} /><b style={{ left: `${cursor}%` }} /></div><button className="dc-primary" onClick={tap} disabled={locks >= 2}>CALIBRATE</button></div>;
}

export default function DistrictCampaign({
  role = "striker",
  profile = null,
  value = null,
  onChange = null,
  onReward = null,
  onComplete = null,
  onExit = null,
  onBegin = null,
  onCheckpoint = null,
  onClaim = null,
  onCalibrate = null,
}) {
  const resolvedRole = resolveRole(profile?.archetype || profile?.role || role);
  const kit = ROLE_KITS[resolvedRole];
  const [campaign, setCampaign] = useState(() => normalizeDistrictCampaign(value));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const completionSent = useRef(Boolean(value?.complete));
  const weapon = useMemo(() => WEAPONS.find((item) => item.id === campaign.reward.weaponId) || null, [campaign.reward.weaponId]);

  useEffect(() => {
    if (value) setCampaign(normalizeDistrictCampaign(value));
  }, [value]);

  useEffect(() => {
    if (!campaign.complete || completionSent.current) return;
    completionSent.current = true;
    const reward = districtCampaignReward(campaign);
    onReward?.({ type: "campaign-complete", ...reward, campaign: "district-one" });
    onComplete?.(campaign, reward);
  }, [campaign, onComplete, onReward]);

  const commit = useCallback((updater) => {
    setCampaign((current) => {
      const draft = typeof updater === "function" ? updater(current) : updater;
      const next = normalizeDistrictCampaign(draft);
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const beginCampaign = async () => {
    if (syncing) return;
    setSyncing(true); setSyncError("");
    try {
      const result = await onBegin?.();
      commit((current) => ({ ...current, status: "active", serverToken: result?.serverToken || result?.token || current.serverToken || null }));
    } catch (error) { setSyncError(error.message || "Could not start District One"); }
    setSyncing(false);
  };
  const secureCheckpoint = useCallback(async (checkpoint) => {
    if (!onCheckpoint) return null;
    return onCheckpoint(campaign.serverToken, checkpoint);
  }, [campaign.serverToken, onCheckpoint]);
  const finishScout = async (scout, advance = false) => {
    if (!advance) { commit((current) => ({ ...current, status: "active", scout })); return; }
    setSyncing(true); setSyncError("");
    try { await secureCheckpoint("arrival"); commit((current) => ({ ...current, status: "active", scout, step: "skirmish" })); }
    catch (error) { setSyncError(error.message || "Arrival checkpoint did not sync"); }
    setSyncing(false);
  };
  const winSkirmish = useCallback(async () => {
    setSyncing(true); setSyncError("");
    try { await secureCheckpoint("skirmish"); commit((current) => ({ ...current, step: "loot", skirmish: { ...current.skirmish, complete: true } })); }
    catch (error) { setSyncError(error.message || "Interception checkpoint did not sync"); }
    setSyncing(false);
  }, [commit, secureCheckpoint]);
  const recordSkirmishAttempt = (attempts) => commit((current) => ({ ...current, skirmish: { ...current.skirmish, attempts } }));
  const selectWeapon = (item) => commit((current) => ({
    ...current,
    loot: { weaponId: item.id, claimed: true },
    reward: { ...current.reward, weaponId: item.id, shards: Math.max(12, current.reward.shards || 0) },
  }));
  const beginBoss = () => {
    if (!weapon) return;
    onReward?.({ type: "weapon", weaponId: weapon.id, enhancement: 0, shards: 12, campaign: "district-one" });
    commit((current) => ({ ...current, step: "boss" }));
  };
  const winBoss = useCallback(async () => {
    if (!weapon) return;
    setSyncing(true); setSyncError("");
    try {
      await secureCheckpoint("boss");
      const claim = await onClaim?.(campaign.serverToken, weapon.id);
      const rewardId = claim?.reward?.itemId || claim?.drop?.id || weapon.id;
      commit((current) => ({ ...current, boss: { ...current.boss, complete: true }, rewardReceipt: claim?.receipt || null, reward: { ...current.reward, weaponId: rewardId, shards: 12 } }));
    } catch (error) { setSyncError(error.message || "Boss reward did not sync"); }
    setSyncing(false);
  }, [campaign.serverToken, commit, onClaim, secureCheckpoint, weapon]);
  const recordBossAttempt = (attempts) => commit((current) => ({ ...current, boss: { ...current.boss, attempts } }));
  const calibrationLock = async (hit) => {
    if (!hit) return;
    const calibrationLocks = Math.min(2, (campaign.boss.calibrationLocks || 0) + 1);
    if (calibrationLocks < 2) { commit((current) => ({ ...current, boss: { ...current.boss, calibrationLocks } })); return; }
    setSyncing(true); setSyncError("");
    try {
      const result = await onCalibrate?.(weapon?.id);
      if (result && result.success === false) throw new Error("Calibration was unstable. Try the final lock again.");
      commit((current) => {
      const next = {
        ...current,
        status: "complete",
        complete: true,
        boss: { ...current.boss, calibrationLocks },
        reward: { ...current.reward, enhancement: 1, shards: 12, credits: 850, xp: 120 },
      };
      return next;
      });
    } catch (error) { setSyncError(error.message || "Enhancement did not sync"); }
    setSyncing(false);
  };

  return (
    <main className="district-campaign" style={{ "--dc-accent": kit.accent }}>
      <div className="dc-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <header className="dc-topbar"><div><small>DISTRICT ONE // EAST MARKET</small><h1>First Light Convoy</h1></div><div className="dc-role"><i />{kit.discipline}<small>{kit.label}</small></div>{onExit && <button onClick={onExit} aria-label="Close campaign">×</button>}</header>
      <ProgressRail active={campaign.step} />
      <div className="dc-objective"><span>{campaign.complete ? "DISTRICT SECURED" : `CURRENT OBJECTIVE · ${STEPS.indexOf(campaign.step) + 1}/4`}</span><b>{campaign.step === "briefing" ? "Map the convoy route" : campaign.step === "skirmish" ? "Clear the jammer patrol" : campaign.step === "loot" ? "Choose a field weapon" : campaign.boss.complete ? "Calibrate your weapon" : "Stop the roadblock commander"}</b></div>
      {syncError && <div className="dc-sync-error" role="alert">{syncError}</div>}

      <div className="dc-stage">
        {campaign.status === "available" && <section className="dc-card dc-intro"><div><small>WARD REQUEST 01</small><h2>Open the First Light route</h2><p>A medical and supply convoy is waiting beyond a disabled transit concourse. Scout the signal, clear the roadblock, choose your first real weapon and stop the rogue Rail Warden.</p><ul><li>Interactive scouting</li><li>Lane-based combat</li><li>Permanent Green weapon</li><li>Guaranteed +1 calibration</li></ul><button className="dc-primary" onClick={beginCampaign} disabled={syncing}>{syncing ? "SECURING ROUTE…" : "BEGIN DISTRICT ONE"}</button></div><img src="/assets/campaign/rail-warden-k9.webp" alt="Rail Warden K-9" /></section>}
        {campaign.status !== "available" && campaign.step === "briefing" && <SignalScout role={resolvedRole} progress={campaign.scout} onCommit={finishScout} />}
        {campaign.status !== "available" && campaign.step === "skirmish" && <LaneEncounter role={resolvedRole} profile={profile} attempts={campaign.skirmish.attempts} onWin={winSkirmish} onAttempt={recordSkirmishAttempt} />}
        {campaign.status !== "available" && campaign.step === "loot" && <LootChoice role={resolvedRole} selectedId={campaign.loot.weaponId} onSelect={selectWeapon} onAdvance={beginBoss} />}
        {campaign.status !== "available" && campaign.step === "boss" && !campaign.boss.complete && <LaneEncounter boss role={resolvedRole} profile={profile} weapon={weapon} attempts={campaign.boss.attempts} onWin={winBoss} onAttempt={recordBossAttempt} />}
        {campaign.status !== "available" && campaign.step === "boss" && campaign.boss.complete && !campaign.complete && weapon && <section className="dc-card dc-victory"><small>RAIL WARDEN DISABLED</small><h2>The convoy is moving</h2><p>Use recovered tuning parts to finish the initiation and make your first weapon permanently stronger.</p><Calibration weapon={weapon} locks={campaign.boss.calibrationLocks || 0} onLock={calibrationLock} /></section>}
        {campaign.complete && <section className="dc-card dc-complete"><div className="dc-complete-mark">✓</div><small>DISTRICT ONE COMPLETE</small><h2>East Market is connected</h2><p>The relief convoy reached the clinics and supply depots. Your runner now has a real loadout and a route into the wider city.</p><div className="dc-rewards"><span><b>{weapon?.name}</b><small>Equipped · +1</small></span><span><b>850</b><small>Credits</small></span><span><b>120</b><small>XP</small></span></div>{onExit && <button className="dc-primary" onClick={onExit}>Return to city</button>}</section>}
        {syncing && <div className="dc-syncing" role="status"><i /><b>Securing online progress…</b></div>}
      </div>
      <footer className="dc-footer"><span>ROLE EFFECT</span><b>{resolvedRole === "striker" ? "Perfect strike bonus" : resolvedRole === "technician" ? "Fast special charge" : "Recovery and shielding"}</b><i>Progress syncs to your signed-in runner.</i></footer>
    </main>
  );
}
