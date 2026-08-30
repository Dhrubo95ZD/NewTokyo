import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [account, game, main, styles] = await Promise.all([
  readFile(new URL("../src/MafiaAccount.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MafiaGame.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/mafia.css", import.meta.url), "utf8"),
]);

for (const token of ["signInWithOAuth", "exchangeCodeForSession", 'from("player_saves")', 'from("profiles")', "CharacterCreation", "schemaVersion: 4"])
  assert.ok(account.includes(token), `account flow missing ${token}`);
assert.ok(main.includes("<MafiaAccount"), "the account gate must wrap the Android game");
for (const label of ["Energy", "Nerve", "Health", "Happy"])
  assert.ok(game.includes(`label=\"${label}\"`), `resource label missing ${label}`);
assert.ok(styles.includes("font-size:7px!important") && styles.includes(".resource span"), "mobile resource labels must remain visible");

console.log("Google account, character creation and mobile resource UI checks passed");
