import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/online/ProgressionHub.jsx", import.meta.url), "utf8");
for (const mode of ["operations","endless","afk","coop","raids","progress"]) assert.ok(source.includes(`[\"${mode}\"`) || source.includes(`battleMode === \"${mode}\"`), `missing ${mode}`);
assert.match(source, /battle-mode-tabs/);
assert.match(source, /EndlessCircuit/);
assert.match(source, /Launch full-screen fight/);
const css = fs.readFileSync(new URL("../src/game/battle-command.css", import.meta.url), "utf8");
assert.match(css, /grid-template-columns:repeat\(3/);
assert.match(css, /position:sticky/);
console.log("Battle mode command-center layout contract passed.");
