import { useEffect, useMemo, useRef, useState } from "react";
import { finiteNumber, normalizeCandle } from "./tradingRules.js";

const compactPrice = (value) => finiteNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TradingChart({ candles = [], quote = null, positions = [] }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const [cursor, setCursor] = useState(null);

  const series = useMemo(() => {
    const clean = candles.map(normalizeCandle).filter(Boolean).sort((a, b) => a.time - b.time);
    if (!quote?.price || clean.length === 0) return clean;
    const next = clean.slice();
    const last = next[next.length - 1];
    const price = finiteNumber(quote.price);
    next[next.length - 1] = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
    return next;
  }, [candles, quote]);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(280, Math.floor(entry.contentRect.width));
      const height = Math.max(280, Math.floor(entry.contentRect.height));
      setSize({ width, height });
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);

    const plot = { left: 14, top: 16, right: width - 66, bottom: height - 28 };
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    ctx.fillStyle = "#f8f5eb";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(36,49,73,.09)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const y = plot.top + (plotHeight / 5) * i;
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i += 1) {
      const x = plot.left + (plotWidth / 6) * i;
      ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.bottom); ctx.stroke();
    }

    if (series.length < 2) {
      ctx.fillStyle = "#26324a";
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for verified live candles", width / 2, height / 2 - 5);
      ctx.fillStyle = "#778197";
      ctx.font = "12px system-ui";
      ctx.fillText("Trading stays locked until the gateway is healthy.", width / 2, height / 2 + 19);
      return;
    }

    const visibleCount = Math.max(35, Math.min(series.length, Math.floor(plotWidth / 7)));
    const visible = series.slice(-visibleCount);
    let low = Math.min(...visible.map((bar) => bar.low));
    let high = Math.max(...visible.map((bar) => bar.high));
    const padding = Math.max((high - low) * 0.13, high * 0.0005);
    low -= padding; high += padding;
    const priceY = (price) => plot.bottom - ((price - low) / (high - low || 1)) * plotHeight;
    const step = plotWidth / visible.length;
    const bodyWidth = Math.max(3, Math.min(9, step * 0.62));

    const gradient = ctx.createLinearGradient(0, plot.top, 0, plot.bottom);
    gradient.addColorStop(0, "rgba(57,107,255,.13)");
    gradient.addColorStop(1, "rgba(57,107,255,0)");
    ctx.beginPath();
    visible.forEach((bar, index) => {
      const x = plot.left + step * (index + 0.5);
      const y = priceY(bar.close);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(plot.right, plot.bottom); ctx.lineTo(plot.left, plot.bottom); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();

    visible.forEach((bar, index) => {
      const up = bar.close >= bar.open;
      const x = plot.left + step * (index + 0.5);
      const openY = priceY(bar.open); const closeY = priceY(bar.close);
      ctx.strokeStyle = up ? "#0d9f82" : "#e24b5d";
      ctx.fillStyle = up ? "#0d9f82" : "#e24b5d";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, priceY(bar.high)); ctx.lineTo(x, priceY(bar.low)); ctx.stroke();
      ctx.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(2, Math.abs(closeY - openY)));
    });

    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    for (let i = 0; i <= 5; i += 1) {
      const value = high - ((high - low) / 5) * i;
      const y = plot.top + (plotHeight / 5) * i;
      ctx.fillStyle = "#69758b";
      ctx.fillText(compactPrice(value), plot.right + 7, y + 3);
    }

    positions.forEach((position) => {
      const entry = finiteNumber(position.entry_price);
      if (entry < low || entry > high) return;
      const y = priceY(entry);
      ctx.save();
      ctx.setLineDash([5, 5]); ctx.strokeStyle = position.side === "sell" ? "#e24b5d" : "#3b6df6";
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      ctx.restore();
    });

    if (quote?.price) {
      const y = priceY(finiteNumber(quote.price));
      ctx.strokeStyle = "#243149"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      ctx.fillStyle = "#243149";
      ctx.fillRect(plot.right, y - 10, 64, 20);
      ctx.fillStyle = "#fff"; ctx.font = "800 10px ui-monospace, monospace";
      ctx.fillText(compactPrice(quote.price), plot.right + 5, y + 3.5);
    }

    if (cursor && cursor.x >= plot.left && cursor.x <= plot.right && cursor.y >= plot.top && cursor.y <= plot.bottom) {
      const index = Math.max(0, Math.min(visible.length - 1, Math.floor((cursor.x - plot.left) / step)));
      const bar = visible[index];
      const x = plot.left + step * (index + 0.5);
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(36,49,73,.42)";
      ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.bottom); ctx.moveTo(plot.left, cursor.y); ctx.lineTo(plot.right, cursor.y); ctx.stroke(); ctx.restore();
      const label = `O ${compactPrice(bar.open)}  H ${compactPrice(bar.high)}  L ${compactPrice(bar.low)}  C ${compactPrice(bar.close)}`;
      ctx.font = "800 10px ui-monospace, monospace";
      const labelWidth = ctx.measureText(label).width + 18;
      ctx.fillStyle = "rgba(36,49,73,.9)"; ctx.fillRect(12, 12, labelWidth, 25);
      ctx.fillStyle = "#fff"; ctx.fillText(label, 21, 28);
    }
  }, [cursor, positions, quote, series, size]);

  const move = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div className="nx-chart" ref={wrapRef}>
      <canvas ref={canvasRef} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setCursor(null)} aria-label="Live XAU USD candlestick chart" />
    </div>
  );
}

