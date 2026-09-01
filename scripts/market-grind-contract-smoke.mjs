import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql,market,hustles,game,adviser] = await Promise.all([
  readFile(new URL("../supabase/20260910_blackwood_market_grind.sql",import.meta.url),"utf8"),
  readFile(new URL("../src/market/MarketHub.jsx",import.meta.url),"utf8"),
  readFile(new URL("../src/hustles/HustleHub.jsx",import.meta.url),"utf8"),
  readFile(new URL("../src/MafiaGame.jsx",import.meta.url),"utf8"),
  readFile(new URL("../supabase/functions/blackwood-adviser/index.ts",import.meta.url),"utf8"),
]);
for(const token of ["bw_market_listings","bw_market_sales","bw_market_list","bw_market_buy","bw_market_cancel","bw_hustle_profiles","bw_do_hustle"])
  assert.ok(sql.includes(token),`missing market/grind authority: ${token}`);
assert.ok(sql.includes("greatest(.25")&&sql.includes("interval '3 seconds'")&&sql.includes("mastery = mastery + 1"),"unlimited grind guardrails are missing");
assert.ok(sql.includes("for update")&&sql.includes("fee :=")&&sql.includes("request_id"),"market escrow or idempotency is missing");
assert.ok(market.includes("bw_market_buy")&&market.includes("Price book")&&!market.includes("Math.random"),"real-player market client is incomplete");
assert.ok(hustles.includes("0 energy")&&hustles.includes("Never below 25%")&&!hustles.includes("Math.random"),"non-energy grind UI is incomplete");
assert.ok(game.includes('["market", "Player Market"]')&&game.includes('["hustles", "Street Work"]'),"market or grind navigation is missing");
assert.ok(adviser.includes('"hustles"')&&adviser.includes('"market"')&&adviser.includes("25% floor"),"Consigliere does not understand the new economy loop");
console.log("Player market escrow and unlimited grind contracts passed");
