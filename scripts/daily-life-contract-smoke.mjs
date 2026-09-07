import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/20260917_daily_life.sql', 'utf8');
const home = fs.readFileSync('src/ui/HomeBoard.jsx', 'utf8');
const hub = fs.readFileSync('src/ui/DailyLifeHub.jsx', 'utf8');
const navigation = fs.readFileSync('src/ui/navigation.js', 'utf8');
const css = fs.readFileSync('src/ui/after-dark.css', 'utf8');

for (const marker of [
  'bw_daily_streaks', 'bw_daily_reward_claims', 'bw_daily_objective_templates',
  'bw_daily_objective_claims', 'bw_weekly_objective_claims', 'bw_daily_life_snapshot',
  'bw_claim_daily_reward', 'bw_claim_daily_objective', 'bw_claim_weekly_objective',
  'bw_daily_metric', 'midnight UTC', 'on conflict do nothing'
]) assert.ok(sql.includes(marker), `missing Daily Life contract: ${marker}`);
for (const marker of ['Claim today', 'Choose your objectives', 'MISSION JOURNAL', 'Claim weekly reward', 'bw_claim_daily_reward', 'bw_claim_daily_objective']) assert.ok(hub.includes(marker), `missing Daily Life UI: ${marker}`);
assert.match(navigation, /\['daily','Daily Life'\]/);
assert.match(home, /bw_daily_life_snapshot/);
for (const marker of ['daily-life-board', 'daily-reward-track', 'daily-objective-grid', 'bw-daily-preview', 'prefers-reduced-motion']) assert.ok(css.includes(marker), `missing Daily Life styling: ${marker}`);
console.log('Daily Life rewards, objectives, journal and quality-of-life contracts passed.');
