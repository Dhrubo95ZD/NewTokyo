import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/command-deck-v7.css", import.meta.url), "utf8");

assert.match(app, /className="city-home-actions"/, "City action and title metadata need an explicit layout wrapper");
assert.match(app, /className="flavor city-home-status"/, "Title/streak metadata needs its own non-overlapping row");
assert.doesNotMatch(app, /p\.title[\s\S]{0,160}marginTop:\s*-6/, "Negative title margins must not return");
assert.match(css, /\.city-home-actions\{[^}]*display:flex/, "City action layout must be controlled by CSS");
assert.match(css, /\.city-home-actions>\.btn\{width:100%\}/, "Mobile City action must occupy its own row");
assert.match(css, /\.ntu \.panel::before\{[^}]*#58ddff0b/, "Panel sheen must remain subtle");

console.log("City mobile overlap and sheen regression checks passed.");
