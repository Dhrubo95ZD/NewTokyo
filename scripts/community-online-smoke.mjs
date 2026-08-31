import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [hub, game, schema] = await Promise.all([
  readFile(new URL("../src/online/CommunityHub.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260908_world_chat_hotfix.sql", import.meta.url), "utf8"),
]);

for (const token of ['rpc("bw_world_chat_snapshot"', 'rpc("bw_world_chat_send"', 'from("profiles")', 'from("leaderboard_entries")', 'rpc("sync_my_leaderboard")', 'rpc("get_my_crew_state")', 'postgres_changes'])
  assert.ok(hub.includes(token) || (token === 'rpc("get_my_crew_state")' && hub.includes("FamilyCommandCenter")), `online community missing ${token}`);
for (const label of ["World Chat", "Players", "Rankings", "Family"])
  assert.ok(game.includes(`"${label}"`), `navigation missing ${label}`);
for (const fakeName of ["Elena Rossi", "Frankie Vale", "Tommy Greco", "#1,842"])
  assert.ok(!game.includes(fakeName) && !hub.includes(fakeName), `placeholder data remains: ${fakeName}`);
assert.ok(schema.includes("security definer") && schema.includes("grant execute on function public.bw_world_chat_send(text) to authenticated"), "authenticated world chat RPC is missing");
assert.ok(schema.includes("alter publication supabase_realtime add table public.chat_messages"), "world chat realtime publication is missing");

console.log("Real-player chat, directory, rankings and family checks passed");
