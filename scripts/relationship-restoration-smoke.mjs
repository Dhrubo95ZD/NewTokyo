import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url), "utf8");
assert.match(source, /const GIRLS = LEGACY_STORY_ARCHIVE/);
assert.match(source, /const SIMI_MANUAL = LEGACY_SIMI_MANUAL/);
assert.doesNotMatch(source, /false && jealousy/);
assert.doesNotMatch(source, /false && pendingChoice/);
assert.match(source, /setJealousy\(\{ girl: g, other \}\)/);
assert.match(source, /q\.partner = g\.id/);
assert.match(source, /Hearts — Romance Routes/);
assert.match(source, /Play shared ending/);
console.log("Original branching romances, choices, jealousy and shared ending are restored.");
