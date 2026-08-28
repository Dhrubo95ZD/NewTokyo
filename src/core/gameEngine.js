export const SAVE_VERSION = 4;

export const DISTRICTS = [
  {
    id: "shinjuku",
    number: "01",
    name: "Shinjuku Afterglow",
    tagline: "Cut the signal feeding the street drones.",
    image: "/assets/campaign/district-one-concourse.webp",
    color: "#55e8ff",
    danger: 1,
    reward: 180,
    enemies: [
      { name: "Rail Jackal", title: "Scavenger unit", image: "/assets/campaign/rail-warden-k9.webp", hp: 48, attack: 7 },
      { name: "Signal Twins", title: "Syndicate interceptors", image: "/assets/campaign/roadblock-unit.webp", hp: 64, attack: 8 },
      { name: "Warden K-9", title: "District enforcer", image: "/assets/campaign/rail-warden-k9.webp", hp: 92, attack: 10, boss: true },
    ],
  },
  {
    id: "undercity",
    number: "02",
    name: "Undercity Circuit",
    tagline: "Break the arena's rigged combat network.",
    image: "/assets/world-v3/undercity-arena.webp",
    color: "#ff4d82",
    danger: 2,
    reward: 320,
    enemies: [
      { name: "Chrome Ronin", title: "Arena contender", image: "/assets/loot-v2/street-ronin.webp", hp: 74, attack: 10 },
      { name: "Neon Sentinel", title: "Security frame", image: "/assets/loot-v2/neon-sentinel.webp", hp: 88, attack: 12 },
      { name: "Crimson Oni", title: "Circuit champion", image: "/assets/loot-v2/crimson-oni.webp", hp: 126, attack: 14, boss: true },
    ],
  },
  {
    id: "depths",
    number: "03",
    name: "The Neon Depths",
    tagline: "Descend until the city stops pretending.",
    image: "/assets/neon-depths/depths-environment-v1.webp",
    color: "#a67cff",
    danger: 3,
    reward: 520,
    enemies: [
      { name: "Glitch Stalker", title: "Depths anomaly", image: "/assets/neon-depths/depths-actors-v1.webp", hp: 88, attack: 12 },
      { name: "Void Reaver", title: "Lost combat shell", image: "/assets/loot-v2/void-reaver.webp", hp: 106, attack: 14 },
      { name: "Ghost Protocol", title: "The thing below", image: "/assets/loot-v2/ghost-protocol.webp", hp: 145, attack: 16, boss: true },
    ],
  },
];

export const PERKS = [
  { id: "edge", name: "Monowire Edge", detail: "+4 damage this run", icon: "刃" },
  { id: "shell", name: "Reactive Shell", detail: "+16 max HP and heal 16", icon: "盾" },
  { id: "battery", name: "Hot Battery", detail: "Begin encounters with +2 focus", icon: "雷" },
];

export const META_UPGRADES = [
  { id: "power", name: "Edge calibration", detail: "+2 base damage", icon: "刃" },
  { id: "armor", name: "Impact weave", detail: "+1 damage resistance", icon: "装" },
  { id: "vitality", name: "Synthetic heart", detail: "+8 maximum HP", icon: "心" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const districtById = (id) => DISTRICTS.find((district) => district.id === id) || DISTRICTS[0];

export function newGame() {
  return {
    version: SAVE_VERSION,
    credits: 0,
    reputation: 0,
    streak: 0,
    bestDistrict: 0,
    victories: 0,
    runs: 0,
    upgrades: { power: 0, armor: 0, vitality: 0 },
    run: null,
  };
}

export function normalizeGame(raw) {
  const fresh = newGame();
  if (!raw || typeof raw !== "object") return fresh;
  return {
    ...fresh,
    ...raw,
    version: SAVE_VERSION,
    credits: Math.max(0, Number(raw.credits) || 0),
    reputation: Math.max(0, Number(raw.reputation) || 0),
    upgrades: { ...fresh.upgrades, ...(raw.upgrades || {}) },
    run: raw.run && raw.run.districtId ? raw.run : null,
  };
}

export function metaStats(game) {
  return {
    power: 10 + Number(game.upgrades.power || 0) * 2,
    armor: Number(game.upgrades.armor || 0),
    maxHp: 82 + Number(game.upgrades.vitality || 0) * 8,
  };
}

function makeEnemy(district, encounter, run) {
  const template = district.enemies[encounter];
  const scale = 1 + Math.max(0, run.loop || 0) * 0.12;
  const hp = Math.round(template.hp * scale);
  return {
    ...template,
    hp,
    maxHp: hp,
    intentIndex: 0,
    exposed: false,
  };
}

export function getIntent(run) {
  const enemy = run.enemy;
  const cycle = enemy.boss ? ["strike", "guard", "crush", "strike"] : ["strike", "charge", "crush", "guard"];
  const type = cycle[enemy.intentIndex % cycle.length];
  if (type === "charge") return { type, name: "Charging", detail: "No damage. Your next hit deals +35%.", damage: 0 };
  if (type === "guard") return { type, name: "Fortify", detail: "Blocks 50% of your next hit.", damage: 0 };
  const damage = Math.round(enemy.attack * (type === "crush" ? 1.7 : 1));
  return { type, name: type === "crush" ? "Crushing blow" : "Quick strike", detail: `${damage} incoming damage`, damage };
}

export function startRun(game, districtId) {
  const district = districtById(districtId);
  const stats = metaStats(game);
  const run = {
    districtId: district.id,
    encounter: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    focus: 0,
    combo: 0,
    shield: 0,
    powerBonus: 0,
    armorBonus: 0,
    battery: 0,
    perks: [],
    reboot: 1,
    status: "combat",
    turn: 1,
    message: "Target acquired. Read the intent, then make your move.",
  };
  run.enemy = makeEnemy(district, 0, run);
  return { ...game, runs: game.runs + 1, run };
}

function attackDamage(game, run, multiplier = 1) {
  const base = metaStats(game).power + run.powerBonus + Math.min(5, run.combo);
  return Math.max(1, Math.round(base * multiplier));
}

export function resolveTurn(game, action) {
  const run = game.run;
  if (!run || run.status !== "combat") return game;
  const next = { ...run, enemy: { ...run.enemy }, shield: 0, message: "" };
  const currentIntent = getIntent(next);
  const enemyWasGuarding = currentIntent.type === "guard";
  let damage = 0;
  let actionLine = "";

  if (action === "strike") {
    damage = attackDamage(game, next, 1);
    next.focus = clamp(next.focus + 1, 0, 5);
    next.combo += 1;
    actionLine = `Quick cut lands for ${damage}.`;
  } else if (action === "burst") {
    if (next.focus < 2) return { ...game, run: { ...run, message: "Burst needs 2 focus. Strike or guard first." } };
    next.focus -= 2;
    damage = attackDamage(game, next, 2.15);
    next.combo += 2;
    actionLine = `Arc burst tears through for ${damage}.`;
  } else if (action === "guard") {
    next.shield = 9 + metaStats(game).armor + next.armorBonus;
    next.focus = clamp(next.focus + 1, 0, 5);
    next.combo = Math.max(0, next.combo - 1);
    actionLine = `You brace behind ${next.shield} shield.`;
  } else if (action === "overdrive") {
    if (next.focus < 5) return { ...game, run: { ...run, message: "Overdrive needs a full focus meter." } };
    next.focus = 0;
    damage = attackDamage(game, next, 3.2);
    next.hp = clamp(next.hp + 10, 0, next.maxHp);
    next.combo += 3;
    actionLine = `OVERDRIVE hits for ${damage} and repairs 10 HP.`;
  } else {
    return game;
  }

  if (next.enemy.exposed && damage > 0) {
    damage = Math.round(damage * 1.35);
    next.enemy.exposed = false;
    actionLine += " Exploit bonus!";
  }
  if (enemyWasGuarding && damage > 0) damage = Math.ceil(damage / 2);
  next.enemy.hp = Math.max(0, next.enemy.hp - damage);
  if (next.enemy.hp <= 0) {
    const district = districtById(next.districtId);
    if (next.encounter === district.enemies.length - 1) {
      const payout = district.reward + Math.round(next.hp * 1.5) + next.perks.length * 30;
      next.status = "complete";
      next.payout = payout;
      next.message = `${district.name} is clear. ${payout} credits secured.`;
      return {
        ...game,
        credits: game.credits + payout,
        reputation: game.reputation + district.danger * 12,
        victories: game.victories + 1,
        streak: game.streak + 1,
        bestDistrict: Math.max(game.bestDistrict, district.danger),
        run: next,
      };
    }
    next.status = "reward";
    next.message = `${actionLine} ${next.enemy.name} is down. Choose one field upgrade.`;
    return { ...game, run: next };
  }

  let enemyLine = "";
  if (currentIntent.damage > 0) {
    const resistance = metaStats(game).armor + next.armorBonus;
    const taken = Math.max(0, currentIntent.damage - resistance - next.shield);
    next.hp = Math.max(0, next.hp - taken);
    enemyLine = taken ? `${next.enemy.name} answers for ${taken}.` : "Your guard cancels the hit.";
  } else if (currentIntent.type === "charge") {
    next.enemy.exposed = true;
    enemyLine = `${next.enemy.name} charges a dangerous attack.`;
  } else {
    enemyLine = `${next.enemy.name} fortifies its shell.`;
  }
  next.enemy.intentIndex += 1;
  next.turn += 1;
  next.message = `${actionLine} ${enemyLine}`;

  if (next.hp <= 0) {
    next.status = next.reboot > 0 ? "reboot" : "defeat";
    next.message = next.reboot > 0 ? "Critical failure. Your emergency reboot is ready." : "Run terminated. Bank what you learned and return stronger.";
  }
  return { ...game, run: next };
}

export function useReboot(game) {
  if (!game.run || game.run.status !== "reboot" || game.run.reboot < 1) return game;
  const run = { ...game.run, reboot: 0, hp: Math.ceil(game.run.maxHp * 0.55), focus: 3, combo: 0, shield: 0, status: "combat", message: "Emergency reboot complete: 55% HP and 3 focus." };
  return { ...game, run };
}

export function choosePerk(game, perkId) {
  const run = game.run;
  if (!run || run.status !== "reward" || !PERKS.some((perk) => perk.id === perkId)) return game;
  const district = districtById(run.districtId);
  const next = { ...run, perks: [...run.perks, perkId], encounter: run.encounter + 1, combo: 0, shield: 0, status: "combat" };
  if (perkId === "edge") next.powerBonus += 4;
  if (perkId === "shell") { next.maxHp += 16; next.hp = Math.min(next.maxHp, next.hp + 16); }
  if (perkId === "battery") next.battery += 2;

  if (next.encounter >= district.enemies.length) return game;
  next.focus = clamp(next.battery, 0, 5);
  next.enemy = makeEnemy(district, next.encounter, next);
  next.message = `Upgrade installed. ${next.enemy.name} blocks the route ahead.`;
  return { ...game, run: next };
}

export function abandonRun(game) {
  if (!game.run) return game;
  const consolation = Math.max(0, game.run.encounter * 35);
  return { ...game, credits: game.credits + consolation, streak: 0, run: null };
}

export function finishRun(game) {
  if (!game.run || game.run.status !== "complete") return game;
  return { ...game, run: null };
}

export function buyUpgrade(game, upgradeId) {
  if (!META_UPGRADES.some((upgrade) => upgrade.id === upgradeId)) return game;
  const level = Number(game.upgrades[upgradeId] || 0);
  const cost = upgradeCost(level);
  if (game.credits < cost || level >= 8) return game;
  return { ...game, credits: game.credits - cost, upgrades: { ...game.upgrades, [upgradeId]: level + 1 } };
}

export const upgradeCost = (level) => 120 + Number(level || 0) * 110;
