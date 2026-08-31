import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [legacySql,brokerSql,ui,jobs] = await Promise.all([
  readFile("supabase/20260904_casino_economy_careers.sql","utf8"),
  readFile("supabase/20260906_live_brokerage.sql","utf8"),
  readFile("src/economy/EconomyHub.jsx","utf8"),
  readFile("src/jobs/JobCenter.jsx","utf8"),
]);
for(const token of ["bw_job_submit_interview","bank_offer_unlocked"])
  assert.ok(legacySql.includes(token),`career contract missing ${token}`);
for(const token of ["XAU/USD","EUR/USD","bw_broker_snapshot","bw_broker_open_position","bw_broker_close_position"])
  assert.ok(brokerSql.includes(token),`brokerage contract missing ${token}`);
for(const token of ["market-feed","crypto.randomUUID","bw_broker_open_position","TradingChart"])
  assert.ok(ui.includes(token),`live Economy UI missing ${token}`);
assert.ok(jobs.includes("questions.map")&&jobs.includes("bw_job_promote"),"career interview/promotion UI missing");
console.log("live economy and careers contracts: ok");
