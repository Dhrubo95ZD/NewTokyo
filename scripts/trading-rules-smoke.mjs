import assert from "node:assert/strict";
import {
  liquidationPrice, marketSourceView, normalizeCandle, normalizeQuote, orderPreview, positionPnl, protectionPresets, quoteHealth, validateOrder, validateProtection,
} from "../src/trading/tradingRules.js";

const now = Date.now();
const live = { price: 2400, source_at: new Date(now - 250).toISOString() };
assert.equal(quoteHealth(live, now), "live");
assert.equal(quoteHealth({ ...live, source_at: new Date(now - 4000).toISOString() }, now), "stale");
assert.equal(quoteHealth(null, now), "offline");

const simulated = { ...live, source_kind: "simulated", source_at: new Date(now - 4000).toISOString() };
assert.equal(quoteHealth(simulated, now), "live", "the two-second simulator must tolerate scheduler jitter");
assert.equal(quoteHealth({ ...simulated, source_at: new Date(now - 10000).toISOString() }, now), "stale");
assert.equal(quoteHealth({ ...simulated, source_at: new Date(now - 20000).toISOString() }, now), "offline");
assert.equal(marketSourceView(simulated).badge, "SIM");
assert.equal(marketSourceView({ ...live, source_kind: "live" }).badge, "LIVE");
assert.equal(normalizeQuote({ price: "2385.12", source_kind: "simulated", spread_bps: "2.25" }).spread_bps, 2.25);

assert.equal(validateOrder({ side: "buy", marginYen: 5000, leverage: 5, availableYen: 9000, quote: live, now }).ok, true);
assert.equal(validateOrder({ side: "buy", marginYen: 10000, leverage: 5, availableYen: 9000, quote: live, now }).ok, false);
assert.equal(validateOrder({ side: "buy", marginYen: 5000, leverage: 50, availableYen: 9000, quote: live, now }).ok, false);
assert.equal(validateOrder({ side: "buy", marginYen: 5000, leverage: 100, availableYen: 9000, quote: live, now }).ok, true);
assert.equal(validateOrder({ side: "sell", marginYen: 5000, leverage: 500, availableYen: 9000, quote: live, now }).ok, true);

const longPnl = positionPnl({ side: "buy", entry_price: 2400, margin_yen: 10000, leverage: 5 }, { price: 2424 });
const shortPnl = positionPnl({ side: "sell", entry_price: 2400, margin_yen: 10000, leverage: 5 }, { price: 2376 });
assert.equal(longPnl, 500);
assert.equal(shortPnl, 500);

const preview = orderPreview({ side: "buy", marginYen: 10000, leverage: 5, quote: live });
assert.equal(preview.exposureYen, 50000);
assert.ok(preview.entryPrice > 2400);
assert.ok(preview.liquidationPrice < preview.entryPrice);
assert.ok(liquidationPrice({ side: "sell", entryPrice: 2400, leverage: 10 }) > 2400);
const guards = protectionPresets({ side: "buy", entryPrice: 2400 });
assert.equal(validateProtection({ side: "buy", entryPrice: 2400, stopLoss: guards.stopLoss, takeProfit: guards.takeProfit, liquidation: 2300 }).ok, true);
assert.equal(validateProtection({ side: "buy", entryPrice: 2400, stopLoss: 2410, takeProfit: 2450, liquidation: 2300 }).ok, false);
assert.equal(validateProtection({ side: "sell", entryPrice: 2400, stopLoss: 2390, takeProfit: 2350, liquidation: 2500 }).ok, false);
assert.deepEqual(normalizeCandle({ bucket_at: new Date(now).toISOString(), open: 1, high: 3, low: 0.5, close: 2 }).close, 2);

console.log("Neo Exchange trading-rule smoke tests passed");
