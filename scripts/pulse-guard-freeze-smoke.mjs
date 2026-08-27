import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url), "utf8");

assert.match(source, /pulse-guard[\s\S]*duration:\.8/, "Pulse Guard must declare its ring duration");
assert.match(source, /repair-cloud[\s\S]*duration:\.8/, "Repair Cloud must use the safe duration-aware ring path");
assert.match(source, /const radius = Math\.max\(0\.1,/, "Canvas effect radii must never become negative");
assert.doesNotMatch(source, /ctx\.arc\(q\.x, q\.y, q\.r \+ \(0\.4 - q\.t\)/, "Legacy negative-radius renderer must not return");

console.log("Pulse Guard canvas freeze regression checks passed.");
