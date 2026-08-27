import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const terminal = readFileSync(new URL("../src/trading/TradingTerminal.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/trading/trading-terminal.css", import.meta.url), "utf8");

assert.match(terminal, /nx-quick-order/, "Buy, Sell, risk, and leverage must stay beside the chart");
assert.match(terminal, /submit\("buy"\)/, "Buy must execute directly without opening another window");
assert.match(terminal, /submit\("sell"\)/, "Sell must execute directly without opening another window");
assert.match(terminal, /nx-position-list/, "open positions need persistent quick-close controls");
assert.match(terminal, /AUTO 0\.4% \/ 0\.8%/, "direction-aware SL/TP presets must stay visible");
assert.match(terminal, /position\.stop_loss/, "open positions must expose their armed stop loss");
assert.match(terminal, /position\.take_profit/, "open positions must expose their armed take profit");
assert.doesNotMatch(terminal, /ticketOpen|nx-ticket/, "the mobile sliding order ticket must not return");
assert.match(styles, /nx-quick-primary/, "quick execution controls need a responsive grid");
assert.match(styles, /touch-action:pan-x/, "position cards must scroll horizontally on narrow phones");
assert.match(styles, /padding:max\(24px,env\(safe-area-inset-top\)\)/, "Android status chrome must not overlap the Exchange header");
assert.match(styles, /extreme-risk/, "500x leverage needs unmistakable risk feedback");

console.log("Neo Exchange mobile UI contract smoke tests passed");
