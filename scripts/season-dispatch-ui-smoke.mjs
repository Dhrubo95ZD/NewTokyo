import fs from "node:fs";
import assert from "node:assert/strict";

const ui = fs.readFileSync("src/season/SeasonHub.jsx", "utf8");
const css = fs.readFileSync("src/season/season-hub.css", "utf8");
const shellCss = fs.readFileSync("src/living-city.css", "utf8");
const game = fs.readFileSync("src/MafiaGame.jsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const marker of ["bw_progression_snapshot", "bw_operations_snapshot", "YOUR NEXT MOVE", "LONG-TERM TARGETS", "No energy is required", "Open campaign guide", "server recorded"]) {
  assert.ok(ui.includes(marker), `missing Dispatch contract: ${marker}`);
}
for (const marker of ["dispatch-hero", "dispatch-next", "dispatch-actions", "dispatch-objectives", "@media(max-width:650px)", "prefers-reduced-motion"]) {
  assert.ok(css.includes(marker), `missing Dispatch layout rule: ${marker}`);
}
assert.match(game, /dispatch:\s*<SeasonHub/);
const navigation = fs.readFileSync("src/ui/navigation.js", "utf8");
assert.ok(navigation.includes("['dispatch','Progress board']"), "progress board must remain reachable");
assert.ok(ui.includes("lifetime milestones") && !ui.includes("Date.UTC"), "do not present lifetime counts as a timed season");
assert.ok(ui.includes('onNavigate("factions")'), "faction links must open factions");
assert.equal(pkg.scripts["test:dispatch"], "node scripts/season-dispatch-ui-smoke.mjs");
console.log("Blackwood Dispatch season board and intuitive navigation checks passed");
