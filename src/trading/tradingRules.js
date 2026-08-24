export const EXCHANGE_SYMBOL = "XAU/USD";
export const QUOTE_STALE_MS = 2500;
export const QUOTE_DEAD_MS = 8000;
export const LEVERAGE_OPTIONS = [1, 3, 5, 10];
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
  if (!quote || finiteNumber(quote.price) <= 0 || age > QUOTE_DEAD_MS) return "offline";
  if (age > QUOTE_STALE_MS) return "stale";
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

export function validateOrder({ side, marginYen, leverage, availableYen, quote, now = Date.now() }) {
  if (!['buy', 'sell'].includes(side)) return { ok: false, error: "Choose buy or sell." };
  if (quoteHealth(quote, now) !== "live") return { ok: false, error: "Live quote is stale. Trading is locked." };
  const margin = Math.floor(finiteNumber(marginYen));
  if (margin < MIN_MARGIN_YEN) return { ok: false, error: `Minimum risk is ¥${MIN_MARGIN_YEN}.` };
  if (margin > Math.floor(finiteNumber(availableYen))) return { ok: false, error: "Not enough available yen." };
  if (!LEVERAGE_OPTIONS.includes(Number(leverage))) return { ok: false, error: "Unsupported risk level." };
  return { ok: true, value: { side, marginYen: margin, leverage: Number(leverage) } };
}

