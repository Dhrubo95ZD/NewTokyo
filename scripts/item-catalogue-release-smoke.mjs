import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const [catalogue,style,cleanup,ledger,game,casino,economy,android,workflow]=await Promise.all([
  read("src/catalogue/ItemCatalogue.jsx"),read("src/catalogue/item-catalogue.css"),
  read("supabase/20260912_item_catalogue_release_cleanup.sql"),read("supabase/20260913_ledger_credits.sql"),
  read("src/MafiaGame.jsx"),read("src/casino/CasinoHub.jsx"),read("src/economy/EconomyHub.jsx"),
  read("android/variables.gradle"),read(".github/workflows/main.yml")
]);

assert.match(game,/\["catalogue", "Item Catalogue"\]/);
assert.match(catalogue,/bw_item_catalogue/);
assert.match(catalogue,/How to obtain/);
assert.match(catalogue,/exactChance/);
assert.match(style,/@media\(max-width:620px\)/);
assert.match(style,/prefers-reduced-motion/);
assert.match(cleanup,/create or replace function public\.bw_item_catalogue/);
assert.match(cleanup,/First meaningful combat win/);
assert.match(cleanup,/100 Intel cache/);
assert.match(cleanup,/Blackwood Malt Tonic/);
assert.match(ledger,/create table if not exists public\.bw_ledger_wallets/);
assert.match(ledger,/cannot be bought with dollars/i);
assert.match(ledger,/bw_reward_ledger_from_action/);
assert.doesNotMatch(ledger,/update public\.player_wallets/);
assert.match(casino,/LEDGER CREDITS/);
assert.match(economy,/Separate from dollar cash/);
assert.doesNotMatch(casino,/onWalletChange/);
assert.doesNotMatch(economy,/onWalletChange/);
assert.match(android,/targetSdkVersion = 36/);
assert.match(workflow,/platforms;android-36/);
for(const [name,sql] of [["catalogue",cleanup],["ledger",ledger]]) {
  assert.equal((sql.match(/\$\$/g)||[]).length%2,0,`${name} migration has unmatched dollar quotes`);
}

console.log("item catalogue, LC isolation and Android release contracts passed");
