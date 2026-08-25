import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/20260826_neo_exchange_simulator.sql", import.meta.url), "utf8");

assert.match(sql, /active_source text not null check \(active_source in \('simulated','live'\)\)/);
assert.match(sql, /create or replace function public\.ingest_exchange_tick/);
assert.match(sql, /'live','Licensed Live Gateway'/, "the licensed gateway must keep the shared ingestion boundary");
assert.match(sql, /create or replace function public\.advance_simulated_market/);
assert.match(sql, /private\.exchange_market_state/, "future market state must stay private from players");
assert.match(sql, /cron\.schedule\('neo-exchange-sim-tick','2 seconds'/);
assert.match(sql, /close all exchange positions before changing market source/);
assert.match(sql, /quote\.source_kind='live'.*interval '2\.5 seconds'.*interval '8 seconds'/s);
assert.match(sql, /quote\.spread_bps\/10000/, "server fills must use the current dynamic spread");
assert.match(sql, /revoke all on function public\.advance_simulated_market\(\) from public,anon,authenticated/);
assert.match(sql, /alter publication supabase_realtime add table public\.market_events/);

console.log("Neo Exchange simulator contract smoke tests passed");
