export const BASE_GRID_SIZE = 8;

export const BUILDING_CATALOG = Object.freeze([
  { kind: "command-core", name: "Command Core", role: "hq", icon: "核", w: 2, h: 2, unlock: 1, max: 1, baseAlloy: 0, baseCells: 0, detail: "Controls construction capacity and unlocks stronger systems." },
  { kind: "alloy-extractor", name: "Alloy Extractor", role: "economy", icon: "資", w: 1, h: 1, unlock: 1, max: 3, baseAlloy: 180, baseCells: 0, detail: "Generates Alloy for structures and upgrades." },
  { kind: "cell-reactor", name: "Cell Reactor", role: "economy", icon: "電", w: 1, h: 1, unlock: 1, max: 3, baseAlloy: 220, baseCells: 0, detail: "Generates clean energy cells for advanced systems." },
  { kind: "pulse-turret", name: "Pulse Turret", role: "defense", icon: "砲", w: 1, h: 1, unlock: 1, max: 5, baseAlloy: 260, baseCells: 40, detail: "Fast defensive fire against incoming squads." },
  { kind: "barrier-node", name: "Barrier Node", role: "defense", icon: "盾", w: 1, h: 1, unlock: 2, max: 4, baseAlloy: 430, baseCells: 90, detail: "Projects protection over nearby structures." },
  { kind: "runner-bay", name: "Runner Bay", role: "offense", icon: "走", w: 2, h: 1, unlock: 2, max: 2, baseAlloy: 520, baseCells: 120, detail: "Improves attack readiness and tactical power." },
  { kind: "rail-cannon", name: "Rail Cannon", role: "defense", icon: "軌", w: 2, h: 1, unlock: 3, max: 2, baseAlloy: 950, baseCells: 260, detail: "Long-range defense with high single-target pressure." },
  { kind: "signal-array", name: "Signal Array", role: "support", icon: "網", w: 1, h: 1, unlock: 3, max: 2, baseAlloy: 760, baseCells: 310, detail: "Improves targeting and reduces tactical weaknesses." },
  { kind: "repair-depot", name: "Repair Depot", role: "support", icon: "修", w: 2, h: 1, unlock: 4, max: 1, baseAlloy: 1400, baseCells: 480, detail: "Restores damaged systems during defense." },
]);

export const PVP_RANKS = Object.freeze([
  { id: "ward-scout", name: "Ward Scout", min: 0, color: "#7f94a9", title: "Ward Builder", decor: "Signal Lanterns" },
  { id: "grid-sentinel", name: "Grid Sentinel", min: 200, color: "#37a7ff", title: "Grid Sentinel", decor: "Azure Gate" },
  { id: "district-vanguard", name: "District Vanguard", min: 500, color: "#5c73ff", title: "District Vanguard", decor: "Skyline Beacon" },
  { id: "city-guardian", name: "City Guardian", min: 900, color: "#a65de8", title: "City Guardian", decor: "Garden Array" },
  { id: "apex-architect", name: "Apex Architect", min: 1400, color: "#ff9d39", title: "Apex Architect", decor: "Aurora Beacon" },
  { id: "prism-commander", name: "Prism Commander", min: 2000, color: "#ef62dd", title: "Prism Commander", decor: "Prism Fountain" },
]);

export const ATTACK_TACTICS = Object.freeze([
  { id: "west-breach", name: "West Breach", icon: "←", detail: "Press the western perimeter. Strong when defenses cluster east." },
  { id: "center-push", name: "Core Push", icon: "↑", detail: "Drive toward the Command Core. Reliable, but faces central defenses." },
  { id: "east-flank", name: "East Flank", icon: "→", detail: "Enter from the eastern edge. Strong when defenses cluster west." },
  { id: "signal-cut", name: "Signal Cut", icon: "◇", detail: "Disrupt support systems before advancing. Strong against Barrier Nodes." },
]);

export const STARTER_BASE_LAYOUT = Object.freeze([
  { id: "core", kind: "command-core", level: 1, x: 3, y: 3 },
  { id: "alloy-1", kind: "alloy-extractor", level: 1, x: 1, y: 5 },
  { id: "cells-1", kind: "cell-reactor", level: 1, x: 6, y: 5 },
  { id: "turret-1", kind: "pulse-turret", level: 1, x: 1, y: 2 },
  { id: "turret-2", kind: "pulse-turret", level: 1, x: 6, y: 2 },
]);

export function buildingDefinition(kind) {
  return BUILDING_CATALOG.find((building) => building.kind === kind);
}

export function rankForTrophies(trophies = 0) {
  return [...PVP_RANKS].reverse().find((rank) => Number(trophies) >= rank.min) || PVP_RANKS[0];
}

export function buildingUpgradeCost(building) {
  const definition = buildingDefinition(building?.kind);
  const nextLevel = Math.max(1, Number(building?.level) || 1) + 1;
  if (!definition) return { alloy: 0, cells: 0 };
  if (definition.role === "hq") return { alloy: 650 * nextLevel * nextLevel, cells: 180 * nextLevel * nextLevel };
  return {
    alloy: Math.round(definition.baseAlloy * nextLevel * (1 + nextLevel * .18)),
    cells: Math.round(definition.baseCells * nextLevel * (1 + nextLevel * .15)),
  };
}

export function baseDefensePower(layout = []) {
  return Math.round(layout.reduce((power, building) => {
    const definition = buildingDefinition(building.kind);
    const level = Math.max(1, Number(building.level) || 1);
    if (!definition) return power;
    const rolePower = { hq: 230, defense: 190, support: 105, offense: 75, economy: 35 }[definition.role] || 0;
    return power + rolePower * level * (1 + level * .12);
  }, 0));
}

export function occupiedCells(layout = [], ignoreId = null) {
  const cells = new Set();
  for (const building of layout) {
    if (building.id === ignoreId) continue;
    const definition = buildingDefinition(building.kind);
    if (!definition) continue;
    for (let dx = 0; dx < definition.w; dx += 1) for (let dy = 0; dy < definition.h; dy += 1) cells.add(`${Number(building.x) + dx}:${Number(building.y) + dy}`);
  }
  return cells;
}

export function canPlaceBuilding(layout, building, x, y) {
  const definition = buildingDefinition(building?.kind);
  if (!definition || x < 0 || y < 0 || x + definition.w > BASE_GRID_SIZE || y + definition.h > BASE_GRID_SIZE) return false;
  const occupied = occupiedCells(layout, building.id);
  for (let dx = 0; dx < definition.w; dx += 1) for (let dy = 0; dy < definition.h; dy += 1) if (occupied.has(`${x + dx}:${y + dy}`)) return false;
  return true;
}

export function baseProgressionObjectives(base = {}) {
  const layout = base.layout || [];
  const hq = layout.find((building) => building.kind === "command-core")?.level || base.hqLevel || 1;
  const defenses = layout.filter((building) => buildingDefinition(building.kind)?.role === "defense").length;
  return [
    { id: "income", title: "Stabilize production", detail: "Build both resource generators.", done: layout.some((b) => b.kind === "alloy-extractor") && layout.some((b) => b.kind === "cell-reactor") },
    { id: "defense", title: "Secure the perimeter", detail: "Place three defensive structures.", done: defenses >= 3 },
    { id: "hq-three", title: "Reach Command Core 3", detail: `Current Core level: ${hq}.`, done: hq >= 3 },
    { id: "first-win", title: "Win a Gridhold attack", detail: "Scout a rival and earn at least one star.", done: Number(base.wins || 0) > 0 },
    { id: "sentinel", title: "Reach Grid Sentinel", detail: `${Number(base.trophies || 0)}/200 rating.`, done: Number(base.trophies || 0) >= 200 },
  ];
}
