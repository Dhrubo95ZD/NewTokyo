import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const [arcade, styles, shell, migration] = await Promise.all([
  readFile(new URL("../src/arcade/ArcadeGames.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/arcade/arcade-games.css", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/20260902_arcade_exchange_overhaul.sql", import.meta.url), "utf8"),
]);
const cricketArt=await stat(new URL("../public/assets/arcade-v2/neon-cricket-arena-v1.webp", import.meta.url));

for (const token of ["CricketGameV2","NeonReflex","CircuitMemory","12 BALL CHASE","SWIPE TO SWING","swipeCricketShot"])
  assert.ok(arcade.includes(token), `arcade contract missing ${token}`);
assert.ok(shell.includes("<CricketGameV2") && shell.includes("<NeonReflex") && shell.includes("<CircuitMemory"), "all retained games need direct Arcade routes");
assert.ok(styles.includes("neon-cricket-arena-v1.webp"), "painted cricket arena must be used by the playfield");
for(const token of ["settle_exchange_protection_after_quote","p_leverage not in (1,3,5,10,100,500)","stop loss must trigger before liquidation"])
  assert.ok(migration.includes(token),`exchange migration missing ${token}`);
assert.ok(cricketArt.size>100_000,"cricket game art is missing or unexpectedly tiny");

console.log("Arcade and exchange overhaul smoke tests passed");
