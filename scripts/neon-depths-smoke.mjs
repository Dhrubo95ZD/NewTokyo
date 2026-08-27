import assert from "node:assert/strict";
import fs from "node:fs";
import { DEPTHS_OBJECTIVES, depthsRecommendedCp, generateDepthsRoute, normalizeDepthsState } from "../src/game/neonDepthsRules.js";

const a = generateDepthsRoute("stable-seed", 9);
const b = generateDepthsRoute("stable-seed", 9);
assert.deepEqual(a, b, "the server seed must produce a deterministic client route");
assert.equal(a[0].type, "combat");
assert.equal(a.at(-1).type, "boss");
assert.ok(a.some((room) => room.canExtract), "routes need safe extraction points");
assert.ok(a.some((room) => ["shootout", "breach", "salvage"].includes(room.type)), "routes need non-melee variety");
assert.ok(depthsRecommendedCp(8) > depthsRecommendedCp(4));
assert.equal(normalizeDepthsState({ active: true, seed: "stable-seed", tier: 9, route: a, room_index: 2 }).currentRoom.index, 2);
assert.deepEqual(Object.keys(DEPTHS_OBJECTIVES).sort(), ["boss","breach","combat","salvage","shootout"]);

const ui = fs.readFileSync(new URL("../src/game/NeonDepths.jsx", import.meta.url), "utf8");
for (const contract of ["depths-actors-v1.webp","depths-abilities-v1.webp","depths-environment-v1.webp","ExpeditionCanvas","UNSECURED BACKPACK","Extract safely","Overreach allowed"]) assert.ok(ui.includes(contract), `missing UI contract: ${contract}`);
assert.ok(!ui.includes("fillRect(ex-50,ey-50,100,100)"), "enemy art must not regress to shape placeholders");

const migration = fs.readFileSync(new URL("../supabase/20260901_neon_depths.sql", import.meta.url), "utf8");
for (const contract of ["start_neon_depths","advance_neon_depths","extract_neon_depths","abandon_neon_depths","room_index<>p_room_index","Room resolved too quickly","backpack='[]'::jsonb"]) assert.ok(migration.includes(contract), `missing server contract: ${contract}`);
console.log("Neon Depths rules, illustrated renderer, extraction, defeat loss and server contracts passed");
