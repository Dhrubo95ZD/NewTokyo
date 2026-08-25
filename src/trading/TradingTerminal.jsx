import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../online/supabase.js";
import TradingChart from "./TradingChart.jsx";
import {
  EXCHANGE_SYMBOL, LEVERAGE_OPTIONS, MIN_MARGIN_YEN, normalizeQuote, orderPreview,
  marketSourceView, positionPnl, quoteAge, quoteHealth, validateOrder,
} from "./tradingRules.js";
import "./trading-terminal.css";

const fmtYen = (value) => `¥${Math.round(Number(value) || 0).toLocaleString()}`;
const fmtPrice = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const makeId = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
  const value = Math.floor(Math.random() * 16);
  return (char === "x" ? value : (value & 3) | 8).toString(16);
});

function PositionRow({ position, quote, busy, onClose }) {
  const pnl = positionPnl(position, quote);
  return (
    <article className="nx-position">
      <span className={`nx-side-tag ${position.side}`}>{position.side === "buy" ? "BUY" : "SELL"}</span>
      <div><b>{position.leverage}× · {fmtYen(position.margin_yen)} risk</b><small>{fmtPrice(position.entry_price)} entry</small></div>
      <strong className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{fmtYen(pnl)}</strong>
      <button disabled={busy || quoteHealth(quote) !== "live"} onClick={() => onClose(position.id)}>Close</button>
    </article>
  );
}

export default function TradingTerminal({ open, balance = 0, onClose, onWalletChange }) {
  const [quote, setQuote] = useState(null);
  const [candles, setCandles] = useState([]);
  const [positions, setPositions] = useState([]);
  const [marketEvent, setMarketEvent] = useState(null);
  const [account, setAccount] = useState({ balance: Number(balance) || 0, reserved: 0, realizedPnl: 0 });
  const [timeframe, setTimeframe] = useState("1min");
  const [side, setSide] = useState("buy");
  const [leverage, setLeverage] = useState(3);
  const [margin, setMargin] = useState(Math.max(MIN_MARGIN_YEN, Math.min(1000, Math.floor((Number(balance) || 0) * 0.1))));
  const [ticketOpen, setTicketOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Connecting to the Neo Exchange simulation…");
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const reloadTimer = useRef(null);

  const loadAccount = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_exchange_state");
    if (error) throw error;
    const next = {
      balance: Number(data?.balance ?? balance) || 0,
      reserved: Number(data?.reserved ?? 0) || 0,
      realizedPnl: Number(data?.realizedPnl ?? 0) || 0,
    };
    setAccount(next);
    setPositions(data?.positions || []);
    onWalletChange?.(next.balance);
    return next;
  }, [balance, onWalletChange]);

  const loadMarket = useCallback(async (interval = timeframe) => {
    const [{ data: quoteData, error: quoteError }, { data: candleData, error: candleError }, { data: eventData, error: eventError }] = await Promise.all([
      supabase.from("market_quotes").select("symbol,price,source_at,received_at,sequence,status,source_kind,source_name,regime,event_title,spread_bps").eq("symbol", EXCHANGE_SYMBOL).maybeSingle(),
      supabase.from("market_candles").select("bucket_at,open,high,low,close").eq("symbol", EXCHANGE_SYMBOL).eq("interval", interval).order("bucket_at", { ascending: false }).limit(180),
      supabase.from("market_events").select("id,title,direction,intensity,started_at,ends_at").eq("symbol", EXCHANGE_SYMBOL).gt("ends_at", new Date().toISOString()).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (quoteError) throw quoteError;
    if (candleError) throw candleError;
    if (eventError && eventError.code !== "PGRST205") throw eventError;
    setQuote(normalizeQuote(quoteData));
    setCandles((candleData || []).reverse());
    setMarketEvent(eventData || null);
  }, [timeframe]);

  const boot = useCallback(async () => {
    setReady(false); setNotice("Verifying the market engine…");
    try {
      await Promise.all([loadAccount(), loadMarket()]);
      setReady(true); setNotice("Market engine connected");
    } catch (error) {
      setReady(false);
      setNotice(error?.message?.includes("get_my_exchange_state") || error?.code === "PGRST202"
        ? "Neo Exchange server migration is not installed yet."
        : `Exchange unavailable: ${error?.message || "market engine not configured"}`);
    }
  }, [loadAccount, loadMarket]);

  useEffect(() => {
    if (!open) return undefined;
    boot();
    const channel = supabase.channel(`neo-exchange-${makeId()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_quotes", filter: `symbol=eq.${EXCHANGE_SYMBOL}` }, ({ new: value }) => {
        const next = normalizeQuote(value);
        if (next) {
          setQuote(next);
          if (!next.event_title) setMarketEvent(null);
          setNotice(next.source_kind === "simulated" ? "Simulation engine online" : "Licensed market connected");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_candles", filter: `symbol=eq.${EXCHANGE_SYMBOL}` }, () => {
        clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => loadMarket(), 250);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exchange_positions" }, () => loadAccount())
      .on("postgres_changes", { event: "*", schema: "public", table: "market_events" }, () => loadMarket())
      .subscribe();
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => { clearInterval(timer); clearTimeout(reloadTimer.current); supabase.removeChannel(channel); };
  }, [boot, loadAccount, loadMarket, open]);

  useEffect(() => {
    if (!open || !ready) return;
    loadMarket(timeframe).catch((error) => setNotice(error.message));
  }, [open, ready, timeframe, loadMarket]);

  useEffect(() => setAccount((current) => ({ ...current, balance: Number(balance) || current.balance })), [balance]);

  const health = quoteHealth(quote, clock);
  const age = quoteAge(quote, clock);
  const sourceView = useMemo(() => marketSourceView(quote), [quote]);
  const totalPnl = useMemo(() => positions.reduce((sum, position) => sum + positionPnl(position, quote), 0), [positions, quote]);
  const preview = useMemo(() => orderPreview({ side, marginYen: margin, leverage, quote }), [side, margin, leverage, quote]);
  const validation = validateOrder({ side, marginYen: margin, leverage, availableYen: account.balance, quote, now: clock });

  const submit = async () => {
    if (!validation.ok || busy) { if (!validation.ok) setNotice(validation.error); return; }
    setBusy(true); setNotice("Sending order to the matching engine…");
    const { data, error } = await supabase.rpc("open_my_exchange_position", {
      p_side: side,
      p_margin_yen: validation.value.marginYen,
      p_leverage: validation.value.leverage,
      p_stop_loss: stopLoss ? Number(stopLoss) : null,
      p_take_profit: takeProfit ? Number(takeProfit) : null,
      p_client_order_id: makeId(),
    });
    if (error) setNotice(error.message);
    else {
      setNotice(`${side === "buy" ? "Long" : "Short"} position opened at ${fmtPrice(data?.entryPrice)}.`);
      setTicketOpen(false); await loadAccount();
    }
    setBusy(false);
  };

  const closePosition = async (positionId) => {
    setBusy(true); setNotice(`Closing against the verified ${sourceView.simulated ? "simulation" : "live"} quote…`);
    const { data, error } = await supabase.rpc("close_my_exchange_position", { p_position_id: positionId, p_client_close_id: makeId() });
    if (error) setNotice(error.message);
    else { setNotice(`Position closed · ${Number(data?.pnlYen) >= 0 ? "+" : ""}${fmtYen(data?.pnlYen)}.`); await loadAccount(); }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="nx-overlay" role="dialog" aria-modal="true" aria-label="Neo Exchange trading terminal">
      <section className="nx-terminal">
        <header className="nx-head">
          <div className="nx-brand"><i>金</i><div><small>{sourceView.desk}</small><b>NEO EXCHANGE</b></div></div>
          <div className={`nx-feed ${health} ${sourceView.simulated ? "simulated" : ""}`}><i />{health === "live" ? `${sourceView.badge} · ${Math.round(age)}ms` : health === "stale" ? "STALE · ORDERS LOCKED" : "ENGINE OFFLINE"}</div>
          <button className="nx-close" onClick={onClose} aria-label="Close exchange">×</button>
        </header>

        <div className="nx-wallet">
          <div><small>AVAILABLE</small><b>{fmtYen(account.balance)}</b></div>
          <div><small>IN POSITIONS</small><b>{fmtYen(account.reserved)}</b></div>
          <div><small>OPEN P&amp;L</small><b className={totalPnl >= 0 ? "up" : "down"}>{totalPnl >= 0 ? "+" : ""}{fmtYen(totalPnl)}</b></div>
          <div><small>REALIZED</small><b className={account.realizedPnl >= 0 ? "up" : "down"}>{account.realizedPnl >= 0 ? "+" : ""}{fmtYen(account.realizedPnl)}</b></div>
        </div>

        <div className="nx-marketbar">
          <div><span className="nx-gold-dot" /><b>{sourceView.instrument}</b><small>{sourceView.subtitle}</small></div>
          <strong className={quote?.price >= candles[candles.length - 1]?.open ? "up" : "down"}>{quote ? fmtPrice(quote.price) : "—"}</strong>
          <nav>{[["1min", "1M"], ["5min", "5M"], ["15min", "15M"], ["1h", "1H"]].map(([value, label]) => <button key={value} className={timeframe === value ? "on" : ""} onClick={() => setTimeframe(value)}>{label}</button>)}</nav>
        </div>
        <div className="nx-market-context">
          <span><small>REGIME</small><b>{String(quote?.regime || "starting").replaceAll("_", " ")}</b></span>
          <span><small>SPREAD</small><b>{Number(quote?.spread_bps || 0).toFixed(2)} bps</b></span>
          <span className={marketEvent ? `event ${marketEvent.direction}` : "event"}><small>{marketEvent ? "MARKET EVENT" : "MARKET DESK"}</small><b>{marketEvent?.title || "Monitoring city order flow"}</b></span>
        </div>

        <main className="nx-workspace">
          <div className="nx-chart-column">
            <TradingChart candles={candles} quote={quote} positions={positions} sourceView={sourceView} />
            <div className={`nx-notice ${health}`}>{notice}<span>{sourceView.authority}</span></div>
          </div>

          <aside className={`nx-ticket ${ticketOpen ? "open" : ""}`}>
            <button className="nx-ticket-grab" onClick={() => setTicketOpen(false)} aria-label="Close trade ticket" />
            <div className="nx-side-tabs"><button className={side === "buy" ? "buy on" : "buy"} onClick={() => setSide("buy")}>BUY</button><button className={side === "sell" ? "sell on" : "sell"} onClick={() => setSide("sell")}>SELL</button></div>
            <label className="nx-field"><span>Risk from wallet</span><div><b>¥</b><input inputMode="numeric" value={margin} onChange={(event) => setMargin(Math.max(0, Math.floor(Number(event.target.value) || 0)))} /></div></label>
            <div className="nx-percent-row">{[10, 25, 50, 100].map((pct) => <button key={pct} onClick={() => setMargin(Math.max(MIN_MARGIN_YEN, Math.floor(account.balance * pct / 100)))}>{pct}%</button>)}</div>
            <label className="nx-label">Risk multiplier</label>
            <div className="nx-leverage">{LEVERAGE_OPTIONS.map((value) => <button key={value} className={leverage === value ? "on" : ""} onClick={() => setLeverage(value)}>{value}×</button>)}</div>
            <div className="nx-preview"><span>Exposure <b>{fmtYen(preview.exposureYen)}</b></span><span>Est. entry <b>{fmtPrice(preview.entryPrice)}</b></span><span>Liquidation <b>{fmtPrice(preview.liquidationPrice)}</b></span></div>
            <button className="nx-advanced-toggle" onClick={() => setAdvanced((value) => !value)}>{advanced ? "Hide protection" : "Add stop-loss / take-profit"}<span>{advanced ? "−" : "+"}</span></button>
            {advanced && <div className="nx-protection"><label>Stop loss<input inputMode="decimal" placeholder="Optional price" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} /></label><label>Take profit<input inputMode="decimal" placeholder="Optional price" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} /></label></div>}
            <button className={`nx-submit ${side}`} disabled={!validation.ok || busy || !ready} onClick={submit}>{busy ? "VERIFYING…" : `${side === "buy" ? "BUY" : "SELL"} ${sourceView.instrument}`}<small>{validation.ok ? `Risk ${fmtYen(margin)} at ${leverage}×` : validation.error}</small></button>
          </aside>
        </main>

        <section className="nx-positions"><header><b>OPEN POSITIONS</b><span>{positions.length}</span></header>{positions.length ? positions.map((position) => <PositionRow key={position.id} position={position} quote={quote} busy={busy} onClose={closePosition} />) : <p>No open positions. Your city earnings are ready when the market engine is online.</p>}</section>
        <button className="nx-mobile-trade" disabled={health !== "live" || !ready} onClick={() => setTicketOpen(true)}>TRADE {sourceView.instrument}</button>
      </section>
    </div>
  );
}
