import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql,livePnlSql,terminal,chart,feed] = await Promise.all([
  readFile(new URL("../supabase/20260906_live_brokerage.sql", import.meta.url),"utf8"),
  readFile(new URL("../supabase/20260909_live_floating_pnl.sql", import.meta.url),"utf8"),
  readFile(new URL("../src/economy/EconomyHub.jsx", import.meta.url),"utf8"),
  readFile(new URL("../src/economy/TradingChart.jsx", import.meta.url),"utf8"),
  readFile(new URL("../supabase/functions/market-feed/index.ts", import.meta.url),"utf8"),
]);

for(const token of ["bw_broker_accounts","bw_market_candles","bw_broker_open_account","bw_broker_set_leverage","bw_broker_open_position","bw_broker_apply_risk"])
  assert.ok(sql.includes(token),`missing live brokerage contract: ${token}`);
for(const symbol of ["XAU/USD","XAG/USD","EUR/USD","GBP/USD","USD/JPY"])
  assert.ok(sql.includes(`'${symbol}'`),`missing market ${symbol}`);
for(const size of ["0.01","0.05","0.10","0.50","1.00","2.00","5.00"])
  assert.ok(sql.includes(size)||terminal.includes(Number(size).toString()),`missing lot size ${size}`);
assert.ok(sql.includes("p_leverage not in(500,1000)"),"account leverage is not restricted server-side");
assert.ok(sql.includes("drop constraint if exists bw_fx_positions_margin_check")&&sql.includes("check(margin>=1)"),"micro-lot margin is still blocked by the legacy $100 constraint");
assert.ok(sql.includes("compatibility no-op")&&!sql.includes("random()+random()+random"),"legacy random walk remains active");
assert.ok(feed.includes("TWELVE_DATA_API_KEY")&&feed.includes("time_series"),"server-side live provider adapter is missing");
assert.ok(feed.includes("/price?")&&terminal.includes('mode:"quotes"')&&terminal.includes("15000"),"open-position P/L is not backed by adaptive live quote polling");
assert.ok(livePnlSql.includes("bw_broker_mark_pnl_precise")&&livePnlSql.includes("unrealizedPnl"),"floating P/L still loses sub-dollar price movement");
assert.ok(feed.includes("SUPABASE_SERVICE_ROLE_KEY")&&!terminal.includes("TWELVE_DATA_API_KEY"),"provider secret could leak into the APK");
assert.ok(chart.includes("candle")&&chart.includes("crosshair")&&chart.includes("volume"),"professional candlestick chart features are missing");
assert.ok(!terminal.includes("Math.random"),"the trading client must not create prices or outcomes");

console.log("Live brokerage account, lot, feed and candlestick contracts passed");
