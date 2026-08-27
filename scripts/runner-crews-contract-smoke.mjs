import assert from "node:assert/strict";
import fs from "node:fs";
import { crisisPrepReady, normalizeCrewState } from "../src/social/crewRules.js";

assert.ok(crisisPrepReady({ threshold:300, prep:{ logistics:300, intel:301, security:500 } }));
assert.equal(normalizeCrewState({ authority:true, publicCrews:[{}] }).publicCrews.length, 1);
const sql = fs.readFileSync(new URL("../supabase/20260831_runner_crews_endless.sql", import.meta.url), "utf8");
for (const contract of ["create_runner_crew","join_runner_crew","contribute_city_crisis","strike_city_crisis","claim_city_crisis_reward","start_endless_grind","resolve_endless_grind","public.require_google_player()","for update"]) assert.ok(sql.includes(contract), `missing ${contract}`);
assert.match(sql, /greatest\(1,current_stage-1\)/);
assert.match(sql, /public\.roll_dungeon_drop/);
console.log("Runner Crew and authoritative Endless SQL contracts passed.");
