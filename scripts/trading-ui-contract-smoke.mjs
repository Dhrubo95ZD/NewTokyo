import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const terminal = readFileSync(new URL("../src/trading/TradingTerminal.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/trading/trading-terminal.css", import.meta.url), "utf8");

assert.match(terminal, /nx-ticket-scroll/, "trade controls need an independent scroll region");
assert.match(terminal, /nx-ticket-footer/, "the order action must live in a sticky sheet footer");
assert.match(terminal, /nx-ticket-hide/, "mobile players need an obvious way to restore the chart");
assert.match(styles, /height:clamp\(300px,48dvh,440px\)/, "mobile sheet must preserve chart visibility");
assert.match(styles, /touch-action:pan-y/, "mobile sheet must accept vertical scrolling");
assert.match(styles, /ticket-open \.nx-mobile-trade/, "the launcher must hide while the ticket is open");
assert.match(styles, /padding:max\(24px,env\(safe-area-inset-top\)\)/, "Android status chrome must not overlap the Exchange header");

console.log("Neo Exchange mobile UI contract smoke tests passed");
