const ENCOUNTER_ROTATION = ["melee", "shooter", "puzzle", "melee", "shooter", "hybrid"];
const ENEMY_FAMILIES = [
  ["Drain Runners", "追", "#42e6ff"], ["Tunnel Drones", "機", "#9b6cff"],
  ["Vault Sentries", "衛", "#ffbd4a"], ["Tide Skimmers", "潮", "#35e8ba"],
  ["Glass Swarm", "晶", "#ff65b1"], ["Bastion Units", "砦", "#ff765f"],
  ["Freight Mechs", "鋼", "#78a8ff"], ["Archive Packets", "録", "#58ddff"],
  ["Ember Walkers", "炎", "#ff8b42"], ["Aurora Fragments", "光", "#70ffd4"],
  ["Tower Hunters", "塔", "#c875ff"], ["Core Arbiters", "核", "#ff5f91"],
];
const DUNGEON_LEVELS = [1,5,10,20,30,40,50,60,70,80,90,99];

export function operationEncounterProfile(dungeon) {
  const level = Number(dungeon?.level || 1);
  const found = DUNGEON_LEVELS.findIndex((entry) => entry === level);
  const index = found < 0 ? 0 : found;
  const [family, glyph, color] = ENEMY_FAMILIES[index];
  const mode = ENCOUNTER_ROTATION[index % ENCOUNTER_ROTATION.length];
  return {
    mode,
    family,
    glyph,
    color,
    label: mode === "melee" ? "Arena assault" : mode === "shooter" ? "Target suppression" : mode === "puzzle" ? "Circuit breach" : "Adaptive gauntlet",
    detail: mode === "melee" ? "Close-range waves with dodge timing." : mode === "shooter" ? "Clear hostile targets before they lock on." : mode === "puzzle" ? "Read and repeat the access sequence under pressure." : "A high-difficulty breach selected from multiple encounter protocols.",
  };
}
