import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const apiKey = process.env.TWELVE_DATA_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const symbol = process.env.MARKET_SYMBOL || "XAU/USD";
const port = Number(process.env.PORT || 8080);
if (!apiKey || !supabaseUrl || !serviceKey) throw new Error("TWELVE_DATA_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let socket;
let reconnectTimer;
let heartbeatTimer;
let lastAcceptedAt = 0;
let lastSourceAt = 0;
let lastPrice = null;
let sequence = Date.now() * 1000;
let settlementQueue = Promise.resolve();
let pendingTick = null;
let flushScheduled = false;

const log = (message, detail = "") => console.log(new Date().toISOString(), message, detail);

function parseUtc(datetime) {
  if (!datetime) return null;
  const iso = datetime.includes("T") ? datetime : datetime.replace(" ", "T");
  const time = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(time.getTime()) ? time.toISOString() : null;
}

async function seedCandles(interval) {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", "180");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.status === "error") throw new Error(payload.message || `history request failed (${response.status})`);
  const rows = (payload.values || []).map((bar) => ({
    symbol, interval, bucket_at: parseUtc(bar.datetime),
    open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close),
  })).filter((bar) => bar.bucket_at && Math.min(bar.open, bar.high, bar.low, bar.close) > 0);
  if (!rows.length) return;
  const { error } = await admin.from("market_candles").upsert(rows, { onConflict: "symbol,interval,bucket_at" });
  if (error) throw error;
  log(`seeded ${rows.length} ${interval} candles`);
}

async function seedAll() {
  for (const interval of ["1min", "5min", "15min", "1h"]) {
    try { await seedCandles(interval); } catch (error) { log(`history seed failed for ${interval}`, error.message); }
  }
}

function settleTick(price, timestampSeconds) {
  const sourceAt = new Date(Number(timestampSeconds) * 1000);
  if (!(price > 0) || !Number.isFinite(sourceAt.getTime())) return;
  sequence += 1;
  pendingTick = { price, sourceAt: sourceAt.toISOString(), sequence };
  if (flushScheduled) return;
  // No timer/batching delay: only synchronous provider bursts are collapsed.
  flushScheduled = true;
  queueMicrotask(flushTick);
}

function flushTick() {
  flushScheduled = false;
  const tick = pendingTick; pendingTick = null;
  if (!tick) return;
  settlementQueue = settlementQueue.catch(() => undefined).then(async () => {
    const { data, error } = await admin.rpc("settle_exchange_tick", {
      p_symbol: symbol, p_price: tick.price, p_source_at: tick.sourceAt, p_sequence: tick.sequence,
    });
    if (error) throw error;
    if (data?.accepted) {
      lastAcceptedAt = Date.now();
      lastSourceAt = new Date(tick.sourceAt).getTime();
      lastPrice = tick.price;
    }
  }).catch((error) => log("tick settlement rejected", error.message));
}

function connect() {
  clearTimeout(reconnectTimer); clearInterval(heartbeatTimer);
  const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`;
  socket = new WebSocket(url);
  socket.on("open", () => {
    log("market websocket connected");
    socket.send(JSON.stringify({ action: "subscribe", params: { symbols: symbol } }));
    heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: "heartbeat" }));
    }, 10000);
  });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.event === "price" && message.symbol === symbol) settleTick(Number(message.price), Number(message.timestamp));
      else if (message.status === "error") log("provider message", message.message || JSON.stringify(message));
    } catch (error) { log("invalid provider message", error.message); }
  });
  socket.on("error", (error) => log("market websocket error", error.message));
  socket.on("close", () => {
    clearInterval(heartbeatTimer); log("market websocket closed; retrying");
    reconnectTimer = setTimeout(connect, 2500);
  });
}

createServer((request, response) => {
  if (request.url !== "/health") { response.writeHead(404).end("Not found"); return; }
  const sourceAgeMs = lastSourceAt ? Math.max(0, Date.now() - lastSourceAt) : null;
  const acceptedAgeMs = lastAcceptedAt ? Date.now() - lastAcceptedAt : null;
  const healthy = sourceAgeMs !== null && sourceAgeMs < 8000 && acceptedAgeMs < 8000;
  response.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ healthy, symbol, lastPrice, sourceAgeMs, acceptedAgeMs }));
}).listen(port, () => log(`health server listening on ${port}`));

await seedAll();
setInterval(seedAll, 15 * 60 * 1000).unref();
connect();
