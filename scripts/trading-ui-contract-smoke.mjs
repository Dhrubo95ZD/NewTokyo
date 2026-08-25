import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const terminal = readFileSync(new URL("../src/trading/TradingTerminal.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/trading/trading-terminal.css", import.meta.url), "utf8");

assert.match(terminal, /nx-quick-order/, "Buy, Sell, risk, and leverage must stay beside the chart");
assert.match(terminal, /submit\("buy"\)/, "Buy must execute directly without opening another window");
assert.match(terminal, /submit\("sell"\)/, "Sell must execute directly without opening another window");
assert.match(terminal, /nx-position-list/, "open positions need persistent quick-close controls");
assert.doesNotMatch(terminal, /ticketOpen|nx-ticket/, "the mobile sliding order ticket must not return");
assert.match(styles, /nx-quick-primary/, "quick execution controls need a responsive grid");
assert.match(styles, /touch-action:pan-x/, "position cards must scroll horizontally on narrow phones");
assert.match(styles, /padding:max\(24px,env\(safe-area-inset-top\)\)/, "Android status chrome must not overlap the Exchange header");

console.log("Neo Exchange mobile UI contract smoke tests passed");
