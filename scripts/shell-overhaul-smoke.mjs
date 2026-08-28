import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [game, hub, workflow] = await Promise.all([
  readFile(new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/online/OnlineHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/main.yml", import.meta.url), "utf8"),
]);

for (const action of ["Enter Battle", "Continue Story", "Claim Rewards"]) {
  assert.ok(game.includes(action), `home command deck is missing ${action}`);
}
assert.ok(game.includes('armoryProgress === 0 ? (onOpenBattle ? onOpenBattle() : setScreen("fights"))'), "first-run CTA must open the first battle");
assert.ok(game.includes("<Suspense fallback="), "lazy game surfaces need a visible loading state");
for (const surface of ["TradingTerminal", "EconomyHub", "MasteryBoard", "CrewCommand"]) {
  assert.ok(hub.includes(`const ${surface} = lazy(`), `${surface} should load on demand`);
}
assert.match(workflow, /run: npm ci/);
assert.match(workflow, /run: npm test/);

console.log("Streamlined shell, onboarding route and CI regression checks passed");

