import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, ui, game, nav, casino] = await Promise.all([
  readFile(new URL("../supabase/20260920_city_services.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/civic/CivicServicesHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/navigation.js", import.meta.url), "utf8"),
  readFile(new URL("../src/casino/CasinoHub.jsx", import.meta.url), "utf8"),
]);

for (const marker of ["bw_civic_contracts", "bw_civic_runs", "bw_civic_projects", "bw_civic_donations", "bw_civic_services_snapshot", "bw_civic_contract_start", "bw_civic_contract_complete", "bw_civic_donate", "bw_redeem_arcade_winnings", "bw_record_arcade_winnings"]) {
  assert.ok(migration.includes(marker), "missing City Services contract " + marker);
}
for (const marker of ["Civic Contracts", "Community Fund", "bw_civic_services_snapshot", "bw_civic_contract_start", "bw_civic_contract_complete", "bw_civic_donate"]) {
  assert.ok(ui.includes(marker), "missing civic UI marker " + marker);
}
assert.ok(game.includes("CivicServicesHub") && game.includes("CITY_DIRECTORY"), "city directory is not connected");
assert.ok(nav.includes("['civic','Civic Contracts']"), "civic route is missing");
assert.ok(casino.includes("bw_redeem_arcade_winnings") && casino.includes("ARCADE DOLLARS"), "Arcade Dollar boundary is missing");
assert.ok(migration.includes("source in ('operation','faction','civic')"), "Takeover civic contribution source is missing");
assert.ok(migration.includes("There is intentionally no city-cash -> Arcade Dollar RPC") || migration.includes("no city-cash"), "cash-to-arcade boundary is missing");
console.log("City Services and Arcade Dollar contracts passed.");
