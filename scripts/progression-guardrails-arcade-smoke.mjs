import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, concurrencySql, retirementSql, ui, css, hustle, operations, progression] = await Promise.all([
  readFile(new URL("../supabase/20260921_progression_guardrails_arcade_games.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260922_progression_concurrency_hardening.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260923_retire_arcade_skill_rooms.sql", import.meta.url), "utf8"),
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
  "bw_guard_story_claim_write", "bw_award_relic",
]) assert.ok(sql.includes(marker), `missing progression/Arcade guardrail: ${marker}`);

for (const marker of ["Blackjack, slots and roulette", "100 Arcade Dollars = $50 city cash", "no cash-to-Arcade conversion"]) {
  assert.ok(ui.includes(marker), `missing Arcade UI marker: ${marker}`);
}
assert.ok(!/Signal Lock|Courier Grid|signal_lock|courier_grid|bw_arcade_minigame/.test(ui), "retired skill rooms remain in Arcade UI");
assert.ok(!/skill-arcade-room|memory-grid|signal-keypad|courier-keypad|challenge-display/.test(css), "retired skill-room styling remains");
assert.ok(hustle.includes("240 runs per rolling 24 hours"), "Street Work budget is not visible");
assert.ok(operations.includes("20-clear UTC-day cap"), "operation budget is not visible");
assert.ok(progression.includes("dailyCap||72"), "faction budget is not visible");
assert.ok(concurrencySql.includes("pg_advisory_xact_lock"), "progression budget checks are not serialized");
assert.ok(concurrencySql.includes("hashtextextended"), "progression lock key is not stable");
assert.ok(retirementSql.includes("bw_reject_retired_arcade_game"), "retirement trigger is missing");
assert.ok(retirementSql.includes("drop function if exists public.bw_arcade_minigame_start"), "retired RPC is still available");
assert.ok(retirementSql.includes("'minigames', '[]'::jsonb"), "snapshot still advertises retired rooms");
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "migration has unmatched dollar quotes");
assert.equal((concurrencySql.match(/\$\$/g) || []).length % 2, 0, "concurrency migration has unmatched dollar quotes");
assert.equal((retirementSql.match(/\$\$/g) || []).length % 2, 0, "retirement migration has unmatched dollar quotes");
console.log("progression guardrails and three-room Arcade contracts passed");
