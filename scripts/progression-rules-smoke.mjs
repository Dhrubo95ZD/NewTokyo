import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CURRENT_RUNNER_ROLES,
  DISTRICT_ONE_CHECKPOINTS,
  validateRunnerIdentity,
} from "../src/online/progressionRules.js";

assert.deepEqual(CURRENT_RUNNER_ROLES, ["striker", "guardian", "technician"]);
assert.deepEqual(DISTRICT_ONE_CHECKPOINTS, ["arrival", "skirmish", "boss"]);
assert.deepEqual(validateRunnerIdentity({ codename: "Nova_7", role: "striker" }), {
  ok: true,
  value: { codename: "Nova_7", role: "striker" },
});
assert.equal(validateRunnerIdentity({ codename: "ab", role: "striker" }).ok, false);
assert.equal(validateRunnerIdentity({ codename: "bad name", role: "guardian" }).ok, false);
assert.equal(validateRunnerIdentity({ codename: "Valid_Name", role: "mage" }).ok, false);
assert.equal(validateRunnerIdentity({ codename: "Legacy", role: "ghost" }).ok, true);

const migration = await readFile(new URL("../supabase/20260824_district_one_progression.sql", import.meta.url), "utf8");
for (const fragment of [
  "require_google_player()",
  "auth.uid()",
  "set_my_runner_identity",
  "start_district_one",
  "advance_district_one",
  "claim_first_campaign_reward",
  "for update",
  "unique (user_id, campaign_id, reward_key)",
  "revoke insert, update, delete",
]) assert.ok(migration.toLowerCase().includes(fragment), `migration missing: ${fragment}`);

console.log("District One progression rule smoke tests passed");
