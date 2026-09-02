import fs from "node:fs";
import assert from "node:assert/strict";

const sql=fs.readFileSync("supabase/20260915_core_rpg_progression.sql","utf8");
const ui=fs.readFileSync("src/progression/ProgressionHub.jsx","utf8");
const css=fs.readFileSync("src/progression/progression.css","utf8");
const jobs=fs.readFileSync("src/jobs/JobCenter.jsx","utf8");
const core=fs.readFileSync("src/online/CityCoreHub.jsx","utf8");

for(const marker of ["bw_factions","bw_faction_assignments","bw_faction_reputation","bw_story_missions","bw_progression_snapshot","bw_run_faction_assignment","bw_claim_story_mission","bw_claim_career_influence","bw_job_resign","bw_standing_score","request_id","greatest(.35","interval '20 seconds'"])
  assert.ok(sql.includes(marker),`missing progression contract: ${marker}`);

for(const faction of ["moretti-circle","harbor-union","federal-trust","northside-aid"])
  assert.ok(sql.includes(`'${faction}'`),`missing faction: ${faction}`);

assert.equal((sql.match(/\('(?:arrival|harbor|ledger|city)-[123]',/g)||[]).length,12,"expected twelve story missions");
assert.equal((sql.match(/\('(?:docks|casino|medical|education|law|banking)-[45]'/g)||[]).length,12,"expected two new ranks in every profession");
assert.ok(!/service_role|SUPABASE_SERVICE_ROLE/i.test(sql),"client migration must not contain a service role secret");

for(const marker of ["Story","Factions","Standing","Combat mastery","District assignments","No energy cost","bw_run_faction_assignment","bw_claim_story_mission"])
  assert.ok(ui.toLowerCase().includes(marker.toLowerCase()),`missing progression UI: ${marker}`);
assert.ok(core.includes("<ProgressionHub"),"campaign is not routed into CityCoreHub");
assert.ok(jobs.includes("bw_job_resign"),"career resignation control missing");
assert.ok(jobs.includes("Career influence"),"career-to-faction bridge missing");
assert.ok(css.includes("@media(max-width:430px)"),"small phone layout missing");
assert.ok(css.includes("prefers-reduced-motion"),"reduced motion handling missing");

console.log("Connected campaign, factions, careers, combat mastery and standing contracts passed");
