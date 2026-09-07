import fs from "node:fs";
import assert from "node:assert/strict";

const ui = fs.readFileSync("src/season/SeasonHub.jsx", "utf8");
const css = fs.readFileSync("src/season/season-hub.css", "utf8");
const shellCss = fs.readFileSync("src/living-city.css", "utf8");
const game = fs.readFileSync("src/MafiaGame.jsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const marker of ["bw_progression_snapshot", "bw_operations_snapshot", "YOUR NEXT MOVE", "SEASON TARGETS", "No energy is required", "Open campaign guide", "server recorded"]) {
  assert.ok(ui.includes(marker), `missing Dispatch contract: ${marker}`);
}
for (const marker of ["dispatch-hero", "dispatch-next", "dispatch-actions", "dispatch-objectives", "@media(max-width:650px)", "prefers-reduced-motion"]) {
  assert.ok(css.includes(marker), `missing Dispatch layout rule: ${marker}`);
}
for (const marker of [".dispatch-promo", "Open Dispatch", "@media(max-width:760px)"]) {
  assert.ok(game.includes(marker) || shellCss.includes(marker), `missing Dispatch entry styling: ${marker}`);
}
assert.match(game, /\["dispatch", "Dispatch"\]/);
assert.match(game, /dispatch:\s*<SeasonHub/);
assert.match(game, /\["dispatch","Dispatch"\]/);
assert.equal(pkg.scripts["test:dispatch"], "node scripts/season-dispatch-ui-smoke.mjs");
console.log("Blackwood Dispatch season board and intuitive navigation checks passed");
