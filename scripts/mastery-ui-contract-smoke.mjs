import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const hub = read("../src/online/OnlineHub.jsx");
const game = read("../src/NeoTokyoUnderworld.jsx");
const board = read("../src/online/MasteryBoard.jsx");
const rules = read("../src/online/masteryRules.js");
const progression = read("../src/online/ProgressionHub.jsx");
for (const token of ["MasteryBoard", "investMastery", "masteryBonuses", "masteryOpen"]) if (!hub.includes(token)) throw new Error(`Missing mastery integration: ${token}`);
for (const token of ['["mastery", "Mastery", "技"]', "onOpenMastery"]) if (!game.includes(token)) throw new Error(`Missing Mastery navigation: ${token}`);
for (const token of ["Vanguard", "Pathfinder", "Engineer"]) if (!rules.includes(token)) throw new Error(`Missing Mastery branch: ${token}`);
if (!board.includes("Google account")) throw new Error("Missing Mastery cloud-save explanation");
if (!progression.includes("combatTotals")) throw new Error("Mastery bonuses are not applied to active combat");
for (const forbidden of ["BaseCommand", "onOpenBase", "baseOpen", "gridhold-overlay"]) {
  if (hub.includes(forbidden) || game.includes(forbidden)) throw new Error(`Removed base UI is still active: ${forbidden}`);
}
console.log("Mastery UI contract smoke passed");
