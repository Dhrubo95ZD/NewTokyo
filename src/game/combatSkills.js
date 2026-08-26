export const COMBAT_SKILLS = [
  { id: "arc-slash", name: "Arc Slash", glyph: "弧", level: 1, cooldown: 7, color: "#4b72ff", effect: "Wide energy cut that damages every nearby hostile." },
  { id: "pulse-guard", name: "Pulse Guard", glyph: "盾", level: 3, cooldown: 12, color: "#14a88d", effect: "Blocks damage briefly and restores 10% health." },
  { id: "vector-rush", name: "Vector Rush", glyph: "迅", level: 5, cooldown: 9, color: "#eb9d21", effect: "Rushes the nearest target and lands a heavy strike." },
  { id: "repair-cloud", name: "Repair Cloud", glyph: "復", level: 8, cooldown: 16, color: "#34b96f", effect: "Restores 30% health during a difficult wave." },
  { id: "gravity-well", name: "Gravity Well", glyph: "引", level: 12, cooldown: 14, color: "#9863eb", effect: "Pulls the horde inward and damages the whole group." },
  { id: "overdrive", name: "Overdrive", glyph: "速", level: 18, cooldown: 22, color: "#ee566f", effect: "Boosts attack damage and speed for six seconds." },
];

export const combatSkillById = (id) => COMBAT_SKILLS.find((skill) => skill.id === id);
export const unlockedCombatSkills = (level = 1) => COMBAT_SKILLS.filter((skill) => Number(level) >= skill.level);

export function normalizeCombatSkills(value, level = 1) {
  const unlocked = new Set(unlockedCombatSkills(level).map((skill) => skill.id));
  const raw = Array.isArray(value?.equipped) ? value.equipped : ["arc-slash"];
  return { version: 1, equipped: raw.filter((id, index) => unlocked.has(id) && raw.indexOf(id) === index).slice(0, 3) };
}

export function equipCombatSkill(value, skillId, slot, level = 1) {
  const skill = combatSkillById(skillId);
  if (!skill || Number(level) < skill.level) throw new Error(`Technique unlocks at level ${skill?.level || "?"}`);
  const equipped = normalizeCombatSkills(value, level).equipped.filter((id) => id !== skillId);
  equipped[Math.max(0, Math.min(2, Number(slot) || 0))] = skillId;
  return { version: 1, equipped: equipped.filter(Boolean).slice(0, 3) };
}
