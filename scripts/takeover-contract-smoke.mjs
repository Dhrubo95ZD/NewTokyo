import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, hub, nav] = await Promise.all([
  readFile(new URL("../supabase/20260919_blackwood_takeover.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/takeover/TakeoverHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/navigation.js", import.meta.url), "utf8"),
]);

for (const marker of ["bw_takeover_seasons", "bw_takeover_pledges", "bw_takeover_contributions", "bw_takeover_snapshot", "bw_takeover_pledge", "bw_takeover_claim", "bw_takeover_record_operation", "allegiance is locked"]) {
  assert.ok(sql.includes(marker), "missing Takeover contract: " + marker);
}
for (const marker of ["Blackwood Takeover", "FACTION LEDGER", "DISTRICT CONTROL", "bw_takeover_snapshot", "bw_takeover_pledge", "bw_takeover_claim"]) {
  assert.ok(hub.includes(marker), "missing Takeover UI: " + marker);
}
assert.ok(nav.includes("takeover"), "Takeover navigation is missing");
console.log("Blackwood Takeover server, UI and navigation contracts passed.");
