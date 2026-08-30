import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [hub, game, schema] = await Promise.all([
  readFile(new URL("../src/online/CommunityHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
]);

for (const token of ['from("chat_messages")', 'from("profiles")', 'from("leaderboard_entries")', 'rpc("sync_my_leaderboard")', 'rpc("get_my_crew_state")', 'postgres_changes'])
  assert.ok(hub.includes(token), `online community missing ${token}`);
for (const label of ["World Chat", "Players", "Rankings", "Family"])
  assert.ok(game.includes(`"${label}"`), `navigation missing ${label}`);
for (const fakeName of ["Elena Rossi", "Frankie Vale", "Tommy Greco", "#1,842"])
  assert.ok(!game.includes(fakeName) && !hub.includes(fakeName), `placeholder data remains: ${fakeName}`);
assert.ok(schema.includes('create policy "profiles are visible"'), "authenticated player directory policy is missing");
assert.ok(schema.includes('create policy "signed in users send chat"'), "authenticated world chat policy is missing");

console.log("Real-player chat, directory, rankings and family checks passed");
