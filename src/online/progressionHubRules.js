export const DUNGEONS = Object.freeze([
  { id: "street-drain", level: 1, name: "Street Drain", district: "Ward 09", cp: 0, minutes: 10, shardsPerHour: 8, rarity: "Green → Blue", boss: "Drain Warden" },
  { id: "service-tunnels", level: 5, name: "Neon Service Tunnels", district: "East Market", cp: 220, minutes: 12, shardsPerHour: 12, rarity: "Green → Blue", boss: "Tunnel Keeper" },
  { id: "market-vaults", level: 10, name: "East Market Vaults", district: "District One", cp: 450, minutes: 15, shardsPerHour: 18, rarity: "Green → Yellow", boss: "Vault Sentinel" },
  { id: "flooded-metro", level: 20, name: "Flooded Metro", district: "Lowline", cp: 900, minutes: 18, shardsPerHour: 28, rarity: "Blue → Yellow", boss: "Tide Engine" },
  { id: "glassworks", level: 30, name: "Shattered Glassworks", district: "South Ring", cp: 1500, minutes: 20, shardsPerHour: 42, rarity: "Blue → Orange", boss: "Kiln Guardian" },
  { id: "iron-ward", level: 40, name: "Iron Ward Bastion", district: "Ward 12", cp: 2400, minutes: 24, shardsPerHour: 60, rarity: "Yellow → Orange", boss: "Bastion Marshal" },
  { id: "orbital-freight", level: 50, name: "Orbital Freight Spine", district: "Skyrail", cp: 3600, minutes: 28, shardsPerHour: 82, rarity: "Yellow → Orange", boss: "Freight Colossus" },
  { id: "storm-archive", level: 60, name: "Storm Archive", district: "Data Quarter", cp: 5200, minutes: 32, shardsPerHour: 110, rarity: "Yellow → Orange", boss: "Archive Tempest" },
  { id: "ember-citadel", level: 70, name: "Ember Citadel", district: "Foundry Crown", cp: 7200, minutes: 36, shardsPerHour: 145, rarity: "Orange", boss: "Citadel Regent" },
  { id: "aurora-rift", level: 80, name: "Aurora Rift", district: "Northern Verge", cp: 9600, minutes: 40, shardsPerHour: 190, rarity: "Orange → Prismatic", boss: "Rift Custodian" },
  { id: "crownless-tower", level: 90, name: "Crownless Tower", district: "Central Spire", cp: 12500, minutes: 45, shardsPerHour: 250, rarity: "Orange → Prismatic", boss: "Tower Arbiter" },
  { id: "prism-core", level: 99, name: "Prism Core", district: "City Heart", cp: 16000, minutes: 50, shardsPerHour: 340, rarity: "Prismatic chase", boss: "Core Sovereign" },
]);

export const RARITY_RANK = Object.freeze({ green: 1, blue: 2, yellow: 3, orange: 4, prismatic: 5 });

export function itemCombatPower(item, enhancement = 0) {
  if (!item) return 0;
  const stats = Object.values(item.stats || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return Math.round(stats * 14 * (1 + Math.max(0, Number(enhancement) || 0) * 0.06) + RARITY_RANK[item.rarity] * 18);
}

export function chooseBestLoadout(items = [], enhancement = {}) {
  return items.reduce((best, item) => {
    if (!item?.slot) return best;
    const current = best[item.slot];
    const power = itemCombatPower(item, enhancement[item.id]);
    if (!current || power > current.power) best[item.slot] = { id: item.id, power };
    return best;
  }, {});
}

export function calculateCombatPower({ level = 1, stats = {}, gear = {}, enhancementTotal = 0 } = {}) {
  const baseStats = ["str", "def", "spd", "dex"].reduce((sum, key) => sum + Math.max(0, Number(stats[key]) || 0), 0);
  const gearStats = ["str", "def", "spd", "dex"].reduce((sum, key) => sum + Math.max(0, Number(gear[key]) || 0), 0);
  return Math.max(0, Math.round(Math.max(1, Number(level) || 1) * 30 + baseStats * 8 + gearStats * 14 + Math.max(0, Number(enhancementTotal) || 0) * 10));
}

export function dungeonAccess(dungeon, { level = 1, cp = 0 } = {}, mode = "solo") {
  const levelReady = Number(level) >= dungeon.level;
  const requiredCp = mode === "coop" ? Math.ceil(dungeon.cp * 0.75) : dungeon.cp;
  const cpReady = Number(cp) >= requiredCp;
  return { unlocked: levelReady && cpReady, levelReady, cpReady, requiredCp, missingCp: Math.max(0, requiredCp - Number(cp || 0)) };
}

export function nextDungeon(dungeons = DUNGEONS, player = {}) {
  return dungeons.find((dungeon) => !dungeonAccess(dungeon, player, "solo").unlocked)
    || dungeons[dungeons.length - 1];
}

export function salvageValue(item, enhancement = 0) {
  const base = { green: 4, blue: 10, yellow: 25, orange: 80, prismatic: 300 }[item?.rarity] || 0;
  return base + Math.floor(base * Math.max(0, Number(enhancement) || 0) * 0.35);
}

export function saleValue(item, enhancement = 0) {
  return salvageValue(item, enhancement) * 75;
}

export function afkBattleSnapshot({ startedAt = Date.now(), now = Date.now(), dungeonLevel = 1 } = {}) {
  const elapsed = Math.max(0, Number(now) - new Date(startedAt).getTime());
  const waveLength = 6200;
  const wave = Math.floor(elapsed / waveLength) + 1;
  const waveProgress = (elapsed % waveLength) / waveLength;
  const enemiesPerWave = 3 + Math.floor(Math.max(1, Number(dungeonLevel) || 1) / 25);
  return {
    elapsed,
    wave,
    waveProgress,
    enemiesPerWave,
    enemyHp: Math.max(3, Math.round(100 - waveProgress * 100)),
    defeated: Math.floor(elapsed / waveLength) * enemiesPerWave + Math.min(enemiesPerWave - 1, Math.floor(waveProgress * enemiesPerWave)),
    ready: elapsed >= 600000,
    rewardMinutes: elapsed >= 600000 ? 0 : Math.max(1, Math.ceil((600000 - elapsed) / 60000)),
  };
}

export function progressionObjectives({ campaignDone = false, inventory = {}, cp = 0, player = {} } = {}) {
  const equipped = ["weapon","helmet","armor","boots"].filter((slot)=>inventory.equipped?.[slot]).length;
  const maxEnhancement = Math.max(0, ...Object.values(inventory.enhancement || {}).map(Number));
  const bestLevel = Math.max(0, Number(inventory.dungeon?.bestLevel) || 0);
  return [
    { id: "district-one", title: "Secure District One", detail: "Unlock repeatable city operations.", done: campaignDone, route: "journey" },
    { id: "allocate", title: "Shape your build", detail: "Spend every available stat point.", done: (Number(player.statPoints) || 0) === 0, route: "character" },
    { id: "loadout", title: "Complete a four-piece loadout", detail: `${equipped}/4 equipment slots filled.`, done: equipped === 4, route: "character" },
    { id: "enhance-five", title: "Forge an item to +5", detail: `Highest enhancement +${maxEnhancement}.`, done: maxEnhancement >= 5, route: "enhance" },
    { id: "cp-2500", title: "Reach 2,500 CP", detail: `${Math.round(cp).toLocaleString()}/2,500 Combat Power.`, done: cp >= 2500, route: "character" },
    { id: "dungeon-50", title: "Clear a level 50 dungeon", detail: `Highest clear: level ${bestLevel}.`, done: bestLevel >= 50, route: "journey" },
    { id: "prism-core", title: "Breach the level 99 Prism Core", detail: "The endgame Prismatic chase.", done: bestLevel >= 99, route: "journey" },
  ];
}
