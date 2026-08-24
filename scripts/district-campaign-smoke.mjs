import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const sourcePath = new URL("../src/game/DistrictCampaign.jsx", import.meta.url);
const result = await esbuild.build({
  entryPoints: [sourcePath.pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  write: false,
  plugins: [{
    name: "ignore-css",
    setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" })); },
  }],
});

const tempDir = await mkdtemp(join(tmpdir(), "district-campaign-smoke-"));
const bundlePath = join(tempDir, "campaign.mjs");
await writeFile(bundlePath, result.outputFiles[0].contents);
const {
  DISTRICT_CAMPAIGN_DEFAULTS,
  normalizeDistrictCampaign,
  districtCampaignReward,
  applyDistrictCampaignReward,
  resolveEncounterImpact,
  resolveEncounterStrike,
} = await import(pathToFileURL(bundlePath));

const fresh = normalizeDistrictCampaign(null);
assert.equal(fresh.status, "available");
assert.equal(fresh.step, "briefing");
assert.equal(fresh.complete, false);

const completed = normalizeDistrictCampaign({
  ...DISTRICT_CAMPAIGN_DEFAULTS,
  reward: {
    weaponId: "neon-sentinel:green:weapon",
    enhancement: 1,
    shards: 12,
    credits: 850,
    xp: 120,
  },
  complete: true,
});
assert.deepEqual(districtCampaignReward(completed), {
  weaponId: "neon-sentinel:green:weapon",
  enhancement: 1,
  shards: 12,
  credits: 850,
  xp: 120,
  districtComplete: true,
});

const inventory = {
  version: 2,
  owned: [],
  equipped: { weapon: null, helmet: null, armor: null, boots: null },
  enhancement: {}, shards: 0, tutorialStep: 0,
};
const once = applyDistrictCampaignReward(inventory, completed);
const twice = applyDistrictCampaignReward(once, completed);
assert.deepEqual(once.owned, ["neon-sentinel:green:weapon"]);
assert.deepEqual(twice.owned, once.owned, "retries must not duplicate campaign equipment");
assert.equal(twice.equipped.weapon, "neon-sentinel:green:weapon");
assert.equal(twice.enhancement["neon-sentinel:green:weapon"], 1);
assert.equal(twice.shards, 12);
assert.equal(twice.tutorialStep, 3);

const combat = {
  lane: 0, hp: 32, enemyHp: 20, shield: 0, focus: 0, stun: 0,
  phase: "telegraph", meter: 100, struck: false, combo: 0, outcome: null,
};
const cleanDodge = resolveEncounterImpact(combat, { dangerLane: 2 });
assert.equal(cleanDodge.hp, 32, "leaving the danger lane must avoid damage");
assert.equal(cleanDodge.phase, "opening", "a dodge must create a counter window");
assert.equal(cleanDodge.focus, 22, "a clean dodge must build focus");

const hit = resolveEncounterImpact({ ...combat, lane: 2 }, { dangerLane: 2 });
assert.equal(hit.hp, 16, "remaining in the warning lane must take patrol damage");

const win = resolveEncounterStrike({ ...cleanDodge, enemyHp: 9 }, {
  role: "striker", baseDamage: 15, weaponAttack: 0,
});
assert.equal(win.enemyHp, 0);
assert.equal(win.outcome, "victory", "zero enemy HP must immediately enter the explicit victory state");

const duplicateTap = resolveEncounterStrike(win, { role: "striker", baseDamage: 15 });
assert.deepEqual(duplicateTap, win, "victory and repeated taps must not apply more damage");

console.log("District One campaign smoke tests passed");
await rm(tempDir, { recursive: true, force: true });
