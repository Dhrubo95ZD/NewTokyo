import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../online/supabase.js";
import TradingChart from "./TradingChart.jsx";
import {
  EXCHANGE_SYMBOL, LEVERAGE_OPTIONS, MIN_MARGIN_YEN, normalizeQuote, orderPreview,
  positionPnl, quoteAge, quoteHealth, validateOrder,
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
  const [notice, setNotice] = useState("Connecting to the live gold gateway…");
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
    const [{ data: quoteData, error: quoteError }, { data: candleData, error: candleError }] = await Promise.all([
      supabase.from("market_quotes").select("symbol,price,source_at,received_at,sequence,status").eq("symbol", EXCHANGE_SYMBOL).maybeSingle(),
      supabase.from("market_candles").select("bucket_at,open,high,low,close").eq("symbol", EXCHANGE_SYMBOL).eq("interval", interval).order("bucket_at", { ascending: false }).limit(180),
    ]);
    if (quoteError) throw quoteError;
    if (candleError) throw candleError;
    setQuote(normalizeQuote(quoteData));
    setCandles((candleData || []).reverse());
  }, [timeframe]);

  const boot = useCallback(async () => {
    setReady(false); setNotice("Verifying market gateway…");
    try {
      await Promise.all([loadAccount(), loadMarket()]);
      setReady(true); setNotice("Live market connected");
    } catch (error) {
      setReady(false);
      setNotice(error?.message?.includes("get_my_exchange_state") || error?.code === "PGRST202"
        ? "Neo Exchange server migration is not installed yet."
        : `Exchange unavailable: ${error?.message || "gateway not configured"}`);
    }
  }, [loadAccount, loadMarket]);

  useEffect(() => {
    if (!open) return undefined;
    boot();
    const channel = supabase.channel(`neo-exchange-${makeId()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_quotes", filter: `symbol=eq.${EXCHANGE_SYMBOL}` }, ({ new: value }) => {
        const next = normalizeQuote(value);
        if (next) { setQuote(next); setNotice("Live market connected"); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_candles", filter: `symbol=eq.${EXCHANGE_SYMBOL}` }, () => {
        clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => loadMarket(), 250);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exchange_positions" }, () => loadAccount())
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
    setBusy(true); setNotice("Closing against the verified live quote…");
    const { data, error } = await supabase.rpc("close_my_exchange_position", { p_position_id: positionId, p_client_close_id: makeId() });
    if (error) setNotice(error.message);
    else { setNotice(`Position closed · ${Number(data?.pnlYen) >= 0 ? "+" : ""}${fmtYen(data?.pnlYen)}.`); await loadAccount(); }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="nx-overlay" role="dialog" aria-modal="true" aria-label="Neo Exchange live trading terminal">
      <section className="nx-terminal">
        <header className="nx-head">
          <div className="nx-brand"><i>金</i><div><small>WARD 09 · LIVE COMMODITIES</small><b>NEO EXCHANGE</b></div></div>
          <div className={`nx-feed ${health}`}><i />{health === "live" ? `LIVE · ${Math.round(age)}ms` : health === "stale" ? "STALE · ORDERS LOCKED" : "FEED OFFLINE"}</div>
          <button className="nx-close" onClick={onClose} aria-label="Close exchange">×</button>
        </header>

        <div className="nx-wallet">
          <div><small>AVAILABLE</small><b>{fmtYen(account.balance)}</b></div>
          <div><small>IN POSITIONS</small><b>{fmtYen(account.reserved)}</b></div>
          <div><small>LIVE P&amp;L</small><b className={totalPnl >= 0 ? "up" : "down"}>{totalPnl >= 0 ? "+" : ""}{fmtYen(totalPnl)}</b></div>
          <div><small>REALIZED</small><b className={account.realizedPnl >= 0 ? "up" : "down"}>{account.realizedPnl >= 0 ? "+" : ""}{fmtYen(account.realizedPnl)}</b></div>
        </div>

        <div className="nx-marketbar">
          <div><span className="nx-gold-dot" /><b>XAU/USD</b><small>Gold · US Dollar</small></div>
          <strong className={quote?.price >= candles[candles.length - 1]?.open ? "up" : "down"}>{quote ? fmtPrice(quote.price) : "—"}</strong>
          <nav>{[["1min", "1M"], ["5min", "5M"], ["15min", "15M"], ["1h", "1H"]].map(([value, label]) => <button key={value} className={timeframe === value ? "on" : ""} onClick={() => setTimeframe(value)}>{label}</button>)}</nav>
        </div>

        <main className="nx-workspace">
          <div className="nx-chart-column">
            <TradingChart candles={candles} quote={quote} positions={positions} />
            <div className={`nx-notice ${health}`}>{notice}<span>Provider timestamp is authoritative. No client-generated prices.</span></div>
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
            <button className={`nx-submit ${side}`} disabled={!validation.ok || busy || !ready} onClick={submit}>{busy ? "VERIFYING…" : `${side === "buy" ? "BUY" : "SELL"} XAU/USD`}<small>{validation.ok ? `Risk ${fmtYen(margin)} at ${leverage}×` : validation.error}</small></button>
          </aside>
        </main>

        <section className="nx-positions"><header><b>OPEN POSITIONS</b><span>{positions.length}</span></header>{positions.length ? positions.map((position) => <PositionRow key={position.id} position={position} quote={quote} busy={busy} onClose={closePosition} />) : <p>No open positions. Your combat earnings are ready when the feed is live.</p>}</section>
        <button className="nx-mobile-trade" disabled={health !== "live" || !ready} onClick={() => setTicketOpen(true)}>TRADE XAU/USD</button>
      </section>
    </div>
  );
}
