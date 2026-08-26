export const RAID_SPECIALIZATIONS = [
  { id: "vanguard", name: "Vanguard", glyph: "盾", color: "#38a8df", action: "guard", role: "Protect the squad", bonus: "Guard actions reduce raid strain and deal 30% more break damage." },
  { id: "striker", name: "Striker", glyph: "斬", color: "#ef5f70", action: "assault", role: "Pressure the target", bonus: "Assault actions deal 30% more core damage." },
  { id: "technician", name: "Technician", glyph: "機", color: "#38b98b", action: "override", role: "Disable hostile systems", bonus: "Override actions deal 30% more system damage and expose weak points." },
];

export const RAID_OPERATIONS = [
  { id: "skyrail-lock", level: 20, name: "Skyrail Lockdown", district: "High Transit Ring", boss: "Rail Command Unit", cp: 1800, phases: ["Break the escort screen", "Sever the control lattice", "Stop the command unit"], loot: "Blue → Yellow", set: "Neon Sentinel" },
  { id: "storm-carrier", level: 50, name: "Storm Carrier", district: "Upper Freight Belt", boss: "Carrier Marshal", cp: 6200, phases: ["Clear the flight deck", "Disable the storm engines", "Defeat the marshal"], loot: "Yellow → Orange", set: "Storm Circuit" },
  { id: "prism-array", level: 99, name: "Prism Array", district: "City Signal Crown", boss: "Array Custodian", cp: 18000, phases: ["Align the outer relays", "Survive the spectrum surge", "Secure the array core"], loot: "Orange → Prismatic", set: "Prismatic chase" },
];

export const raidById = (id) => RAID_OPERATIONS.find((raid) => raid.id === id) || RAID_OPERATIONS[0];
export const specializationById = (id) => RAID_SPECIALIZATIONS.find((entry) => entry.id === id) || RAID_SPECIALIZATIONS[0];

export function raidAccess(raid, player = {}, combatPower = 0) {
  const missingLevel = Math.max(0, raid.level - Number(player.level || 1));
  const personalTarget = Math.ceil(raid.cp * .25);
  const missingCp = Math.max(0, personalTarget - Number(combatPower || 0));
  return { unlocked: missingLevel === 0 && missingCp === 0, missingLevel, missingCp, personalTarget };
}

export function normalizeRaidState(value) {
  if (!value || typeof value !== "object") return { specialization: "vanguard", clears: {}, party: null, authority: false };
  return {
    specialization: RAID_SPECIALIZATIONS.some((entry) => entry.id === value.specialization) ? value.specialization : "vanguard",
    clears: value.clears && typeof value.clears === "object" ? value.clears : {},
    party: value.party || null,
    authority: true,
  };
}

export function botLootPolicy(botCount = 0) {
  return Number(botCount) > 0
    ? { modifier: .5, label: "50% RAID LOOT", detail: "Bot support halves both equipment drop chance and material yield. Clear progress is unchanged." }
    : { modifier: 1, label: "100% RAID LOOT", detail: "A full human squad receives the complete material reward and a guaranteed equipment roll." };
}
