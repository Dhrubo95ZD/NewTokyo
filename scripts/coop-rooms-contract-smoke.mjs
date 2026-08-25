import fs from "node:fs";

const sql = ["../supabase/20260827_progression_hub.sql", "../supabase/20260828_gridhold_pvp.sql"]
  .map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
for (const contract of ["create_coop_room", "join_coop_room", "list_coop_rooms", "queue_coop_dungeon", "leave_coop_dungeon", "claim_coop_dungeon"]) {
  if (!sql.includes(contract)) throw new Error(`Missing co-op contract: ${contract}`);
}
for (const field of ["room_code", "visibility", "member_count", "teamCp"]) {
  if (!sql.includes(field)) throw new Error(`Missing co-op room field: ${field}`);
}
console.log("Co-op rooms contract smoke passed");
