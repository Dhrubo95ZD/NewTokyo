import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [component, shell, styles] = await Promise.all([
  readFile(new URL("../src/game/SyndicateCampaign.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/game/syndicate-campaign.css", import.meta.url), "utf8"),
]);
for (const token of ["Nothing in Your Pockets", "The Rain Bank", "Mafia Boss", "future chapters", "Loot the service vault", "Protect the workers"])
  assert.ok(component.includes(token), `story content missing ${token}`);
assert.ok(shell.includes("<SyndicateCampaign") && shell.includes("applySyndicateChoice"), "story must be reachable and award money");
assert.ok(styles.includes("syndicate-choice-grid") && styles.includes("safe-area-inset-bottom"), "story UI needs responsive choices and safe area");
console.log("Syndicate campaign smoke tests passed");
