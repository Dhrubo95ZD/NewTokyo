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

console.log("District One campaign smoke tests passed");
await rm(tempDir, { recursive: true, force: true });
