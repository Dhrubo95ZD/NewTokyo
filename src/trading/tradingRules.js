export const EXCHANGE_SYMBOL = "XAU/USD";
export const QUOTE_STALE_MS = 2500;
export const QUOTE_DEAD_MS = 8000;
export const SIM_QUOTE_STALE_MS = 8000;
export const SIM_QUOTE_DEAD_MS = 18000;
export const LEVERAGE_OPTIONS = [1, 3, 5, 10, 100, 500];
export const MIN_MARGIN_YEN = 100;

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function quoteAge(quote, now = Date.now()) {
  const source = new Date(quote?.source_at || quote?.sourceAt || 0).getTime();
  return Number.isFinite(source) && source > 0 ? Math.max(0, now - source) : Infinity;
}

export function quoteHealth(quote, now = Date.now()) {
  const age = quoteAge(quote, now);
  const simulated = quote?.source_kind === "simulated" || quote?.sourceKind === "simulated";
  const staleAfter = simulated ? SIM_QUOTE_STALE_MS : QUOTE_STALE_MS;
  const deadAfter = simulated ? SIM_QUOTE_DEAD_MS : QUOTE_DEAD_MS;
  if (!quote || quote.status === "halted" || finiteNumber(quote.price) <= 0 || age > deadAfter) return "offline";
  if (quote.status === "closed" || age > staleAfter) return "stale";
  return "live";
}

export function normalizeQuote(value) {
  if (!value) return null;
  const price = finiteNumber(value.price);
  if (price <= 0) return null;
  return {
    symbol: value.symbol || EXCHANGE_SYMBOL,
    price,
    source_at: value.source_at || value.sourceAt || null,
    received_at: value.received_at || value.receivedAt || null,
    sequence: finiteNumber(value.sequence),
    status: value.status || "open",
    source_kind: value.source_kind || value.sourceKind || "live",
    source_name: value.source_name || value.sourceName || "Market Gateway",
    regime: value.regime || "range",
    event_title: value.event_title || value.eventTitle || null,
    spread_bps: finiteNumber(value.spread_bps || value.spreadBps, 1),
  };
}

export function marketSourceView(quote) {
  const simulated = quote?.source_kind !== "live";
  return simulated ? {
    simulated: true,
    badge: "SIM",
    desk: "WARD 09 · SYNTHETIC COMMODITIES",
    instrument: "XAU/USD SIM",
    subtitle: "Synthetic Gold · Training Market",
    connected: "Simulation engine online",
    authority: "Server simulation controls every price and fill.",
  } : {
    simulated: false,
    badge: "LIVE",
    desk: "WARD 09 · LIVE COMMODITIES",
    instrument: "XAU/USD",
    subtitle: "Gold · US Dollar",
    connected: "Licensed market connected",
    authority: "Provider timestamp controls every price and fill.",
  };
}

export function normalizeCandle(value) {
  const time = new Date(value?.bucket_at || value?.time || 0).getTime();
  const open = finiteNumber(value?.open);
  const high = finiteNumber(value?.high);
  const low = finiteNumber(value?.low);
  const close = finiteNumber(value?.close);
  if (!Number.isFinite(time) || time <= 0 || Math.min(open, high, low, close) <= 0) return null;
  return { time, open, high, low, close };
}

export function positionPnl(position, quote) {
  const entry = finiteNumber(position?.entry_price || position?.entryPrice);
  const price = finiteNumber(quote?.price);
  const margin = finiteNumber(position?.margin_yen || position?.marginYen);
  const leverage = finiteNumber(position?.leverage, 1);
  if (entry <= 0 || price <= 0 || margin <= 0) return 0;
  const direction = position?.side === "sell" ? -1 : 1;
  return Math.round(margin * leverage * ((price - entry) / entry) * direction);
}

export function liquidationPrice({ side, entryPrice, leverage }) {
  const entry = finiteNumber(entryPrice);
  const lev = Math.max(1, finiteNumber(leverage, 1));
  if (!entry) return 0;
  const distance = 0.98 / lev;
  return side === "sell" ? entry * (1 + distance) : Math.max(0, entry * (1 - distance));
}

export function orderPreview({ side, marginYen, leverage, quote }) {
  const price = finiteNumber(quote?.price);
  const margin = Math.max(0, Math.floor(finiteNumber(marginYen)));
  const lev = LEVERAGE_OPTIONS.includes(Number(leverage)) ? Number(leverage) : 1;
  const spreadRate = 0.0001;
  const entryPrice = side === "sell" ? price * (1 - spreadRate) : price * (1 + spreadRate);
  return {
    entryPrice,
    exposureYen: margin * lev,
    liquidationPrice: liquidationPrice({ side, entryPrice, leverage: lev }),
  };
}

export function protectionPresets({ side, entryPrice }) {
  const entry = finiteNumber(entryPrice);
  const direction = side === "sell" ? -1 : 1;
  return {
    stopLoss: entry * (1 - direction * 0.004),
    takeProfit: entry * (1 + direction * 0.008),
  };
}

export function validateProtection({ side, entryPrice, stopLoss, takeProfit, liquidation }) {
  const entry = finiteNumber(entryPrice);
  const sl = stopLoss === "" || stopLoss == null ? null : finiteNumber(stopLoss, NaN);
  const tp = takeProfit === "" || takeProfit == null ? null : finiteNumber(takeProfit, NaN);
  const liq = finiteNumber(liquidation);
  if (!entry) return { ok: false, error: "Waiting for an entry quote." };
  if (sl != null && (!Number.isFinite(sl) || sl <= 0)) return { ok: false, error: "Stop loss must be a positive price." };
  if (tp != null && (!Number.isFinite(tp) || tp <= 0)) return { ok: false, error: "Take profit must be a positive price." };
  if (side === "sell") {
    if (sl != null && sl <= entry) return { ok: false, error: "A short stop loss must be above entry." };
    if (tp != null && tp >= entry) return { ok: false, error: "A short take profit must be below entry." };
    if (sl != null && liq && sl >= liq) return { ok: false, error: "Stop loss must trigger before liquidation." };
  } else {
    if (sl != null && sl >= entry) return { ok: false, error: "A long stop loss must be below entry." };
    if (tp != null && tp <= entry) return { ok: false, error: "A long take profit must be above entry." };
    if (sl != null && liq && sl <= liq) return { ok: false, error: "Stop loss must trigger before liquidation." };
  }
  return { ok: true, value: { stopLoss: sl, takeProfit: tp } };
}

export function validateOrder({ side, marginYen, leverage, availableYen, quote, now = Date.now() }) {
  if (!['buy', 'sell'].includes(side)) return { ok: false, error: "Choose buy or sell." };
  if (quoteHealth(quote, now) !== "live") return { ok: false, error: "Market quote is stale. Trading is locked." };
  const margin = Math.floor(finiteNumber(marginYen));
  if (margin < MIN_MARGIN_YEN) return { ok: false, error: `Minimum risk is ¥${MIN_MARGIN_YEN}.` };
  if (margin > Math.floor(finiteNumber(availableYen))) return { ok: false, error: "Not enough available yen." };
  if (!LEVERAGE_OPTIONS.includes(Number(leverage))) return { ok: false, error: "Unsupported risk level." };
  return { ok: true, value: { side, marginYen: margin, leverage: Number(leverage) } };
}
