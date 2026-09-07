import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, concurrencySql, ui, css, hustle, operations, progression] = await Promise.all([
  readFile(new URL("../supabase/20260921_progression_guardrails_arcade_games.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260922_progression_concurrency_hardening.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/casino/CasinoHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/casino/casino.css", import.meta.url), "utf8"),
  readFile(new URL("../src/hustles/HustleHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/operations/DistrictOperations.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/progression/ProgressionHub.jsx", import.meta.url), "utf8"),
]);

for (const marker of [
  "bw_redeem_arcade_winnings", "cash_awarded := (p_credits / 100) * 50", "cityCashPer100', 50",
  "bw_progression_guardrails", "bw_enforce_progression_guardrail", "bw_guard_hustle_budget",
  "bw_guard_faction_budget", "bw_guard_operation_budget", "bw_guard_relic_budget",
  "bw_guard_story_claim_write", "bw_award_relic", "bw_arcade_challenges",
  "bw_arcade_minigame_start", "bw_arcade_minigame_submit", "signal_lock", "courier_grid",
]) assert.ok(sql.includes(marker), `missing progression/Arcade guardrail: ${marker}`);

for (const marker of ["Signal Lock", "Courier Grid", "bw_arcade_minigame_start", "bw_arcade_minigame_submit", "100 Arcade Dollars = $50 city cash", "server-checked"]) {
  assert.ok(ui.includes(marker), `missing Arcade UI marker: ${marker}`);
}
assert.ok(!/Math\.random/.test(ui), "Arcade outcomes must stay server-generated");
for (const marker of ["skill-arcade-room", "memory-grid", "signal-keypad", "courier-keypad", "prefers-reduced-motion"]) {
  assert.ok(css.includes(marker), `missing Arcade skill-room styling: ${marker}`);
}
assert.ok(hustle.includes("240 runs per rolling 24 hours"), "Street Work budget is not visible");
assert.ok(operations.includes("20-clear UTC-day cap"), "operation budget is not visible");
assert.ok(progression.includes("dailyCap||72"), "faction budget is not visible");
assert.ok(concurrencySql.includes("pg_advisory_xact_lock"), "progression budget checks are not serialized");
assert.ok(concurrencySql.includes("hashtextextended"), "progression lock key is not stable");
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "migration has unmatched dollar quotes");

console.log("progression guardrails and Arcade skill-room contracts passed");
