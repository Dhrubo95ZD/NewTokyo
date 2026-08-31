import { useMemo, useState } from "react";

const FRAMES = [["1min","M1"],["5min","M5"],["15min","M15"],["1h","H1"],["4h","H4"],["1day","D1"]];
const fmtTime = value => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function TradingChart({ candles = [], digits = 5, symbol, timeframe, onTimeframe, quote }) {
  const [bars, setBars] = useState(80), [hover, setHover] = useState(null);
  const visible = useMemo(() => candles.slice(-bars).map(c => ({ ...c, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume || 0) })), [candles, bars]);
  const metrics = useMemo(() => {
    if (!visible.length) return null;
    const low = Math.min(...visible.map(c => c.low)), high = Math.max(...visible.map(c => c.high));
    const pad = Math.max((high - low) * .08, Math.pow(10, -digits) * 10);
    return { low: low - pad, high: high + pad, volume: Math.max(1, ...visible.map(c => c.volume)) };
  }, [visible, digits]);
  const chart = { left: 28, right: 908, top: 22, bottom: 326, volumeTop: 342, volumeBottom: 404 };
  const y = value => chart.bottom - (value - metrics.low) / (metrics.high - metrics.low) * (chart.bottom - chart.top);
  const x = index => chart.left + (index + .5) * (chart.right - chart.left) / visible.length;
  const point = hover == null ? null : visible[hover];
  const move = event => { const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * 1000; setHover(Math.max(0, Math.min(visible.length - 1, Math.floor((px - chart.left) / (chart.right - chart.left) * visible.length)))); };
  return <section className="pro-chart">
    <header><div className="chart-frames">{FRAMES.map(([id,label]) => <button className={timeframe===id?"active":""} onClick={()=>onTimeframe(id)} key={id}>{label}</button>)}</div><div className="chart-tools"><button onClick={()=>setBars(v=>Math.max(40,v-20))}>＋</button><button onClick={()=>setBars(v=>Math.min(240,v+20))}>−</button><span>{bars} bars</span></div></header>
    <div className="chart-readout"><b>{symbol}</b>{point ? <><span>O <i>{point.open.toFixed(digits)}</i></span><span>H <i>{point.high.toFixed(digits)}</i></span><span>L <i>{point.low.toFixed(digits)}</i></span><span>C <i>{point.close.toFixed(digits)}</i></span><em>{fmtTime(point.bucket_at)}</em></> : <span>{quote?.source === "twelve_data" ? "LIVE MARKET DATA" : "WAITING FOR LIVE FEED"}</span>}</div>
    {!metrics ? <div className="chart-empty"><b>No live candles loaded</b><span>Refresh the feed or choose another timeframe.</span></div> : <svg viewBox="0 0 1000 430" preserveAspectRatio="none" onMouseMove={move} onMouseLeave={()=>setHover(null)}>
      <rect width="1000" height="430" className="chart-bg"/>
      {[0,1,2,3,4,5].map(i=>{const value=metrics.high-(metrics.high-metrics.low)*i/5,py=chart.top+(chart.bottom-chart.top)*i/5;return <g key={`y${i}`}><line x1={chart.left} x2={chart.right} y1={py} y2={py} className="grid-line"/><text x="920" y={py+4} className="axis-text">{value.toFixed(digits)}</text></g>})}
      {[0,1,2,3,4,5,6].map(i=>{const index=Math.min(visible.length-1,Math.floor(i*(visible.length-1)/6)),px=x(index);return <g key={`x${i}`}><line x1={px} x2={px} y1={chart.top} y2={chart.volumeBottom} className="grid-line vertical"/><text x={px} y="422" textAnchor="middle" className="axis-text">{new Date(visible[index].bucket_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</text></g>})}
      {visible.map((c,index)=>{const px=x(index),up=c.close>=c.open,color=up?"up":"down",width=Math.max(2,(chart.right-chart.left)/visible.length*.62),bodyTop=Math.min(y(c.open),y(c.close)),bodyHeight=Math.max(1,Math.abs(y(c.open)-y(c.close))),volumeHeight=c.volume/metrics.volume*(chart.volumeBottom-chart.volumeTop);return <g key={`${c.bucket_at}-${index}`}><line x1={px} x2={px} y1={y(c.high)} y2={y(c.low)} className={`wick ${color}`}/><rect x={px-width/2} y={bodyTop} width={width} height={bodyHeight} className={`candle ${color}`}/><rect x={px-width/2} y={chart.volumeBottom-volumeHeight} width={width} height={volumeHeight} className={`volume ${color}`}/></g>})}
      {quote?.mid && <g><line x1={chart.left} x2={chart.right} y1={y(Number(quote.mid))} y2={y(Number(quote.mid))} className="market-line"/><rect x="912" y={y(Number(quote.mid))-10} width="79" height="20" className="market-price"/><text x="951" y={y(Number(quote.mid))+4} textAnchor="middle" className="market-price-text">{Number(quote.mid).toFixed(digits)}</text></g>}
      {point && <g className="crosshair"><line x1={x(hover)} x2={x(hover)} y1={chart.top} y2={chart.volumeBottom}/><line x1={chart.left} x2={chart.right} y1={y(point.close)} y2={y(point.close)}/><rect x="912" y={y(point.close)-10} width="79" height="20"/><text x="951" y={y(point.close)+4} textAnchor="middle">{point.close.toFixed(digits)}</text></g>}
    </svg>}
    <footer><span><i/> Real provider candles</span><span>OHLC · UTC · crosshair enabled</span></footer>
  </section>;
}
