import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, ui, game, adviser] = await Promise.all([
  readFile(new URL("../supabase/20260905_families_wars.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/families/FamilyCommandCenter.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/online/CommunityHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/blackwood-adviser/index.ts", import.meta.url), "utf8"),
]);

for (const table of ["bw_family_applications", "bw_family_armory", "bw_family_operations", "bw_family_wars", "bw_family_war_hits", "bw_family_territories", "bw_family_chat"])
  assert.ok(sql.includes(`public.${table}`), `missing authoritative ${table}`);
for (const rpc of ["bw_family_snapshot", "bw_family_apply", "bw_family_vault_transfer", "bw_family_armory_transfer", "bw_family_create_operation", "bw_family_enlist_war", "bw_family_claim_territory"])
  assert.ok(sql.includes(`function public.${rpc}`) && ui.includes(`"${rpc}"`), `family contract missing ${rpc}`);
assert.ok(sql.includes("after insert on public.bw_attack_logs"), "combat does not feed family chain and war scoring");
assert.ok(sql.includes("revoke execute on function public.join_runner_crew"), "legacy instant family joining remains exposed");
assert.ok(sql.includes("different authenticated family member") || ui.includes("different authenticated family member"), "real-member operation rule is not communicated");
assert.ok(!ui.includes("Math.random"), "family outcomes must not be rolled on the client");
assert.ok(game.includes("FamilyCommandCenter"), "Families 2.0 is not integrated into the online hub");
assert.ok(adviser.includes("familyState") && adviser.includes("ranked war"), "Consigliere does not understand account-aware family progress");

console.log("Families 2.0 authority, UI, war and adviser checks passed");
