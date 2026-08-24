import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const sourcePath = new URL("../src/NeoTokyoUnderworld.jsx", import.meta.url);
let source = await readFile(sourcePath, "utf8");
source += "\nexport { buildIchiDeck, ichiPlayable, ichiNewGame, ichiApply, ichiBotStep };\n";

const result = await esbuild.build({
  stdin: { contents: source, loader: "jsx", resolveDir: new URL("../src/", import.meta.url).pathname },
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  write: false,
  plugins: [{
    name: "ignore-css",
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    },
  }],
});

const tempDir = await mkdtemp(join(tmpdir(), "ichi-smoke-"));
const bundlePath = join(tempDir, "engine.mjs");
await writeFile(bundlePath, result.outputFiles[0].contents);
const { buildIchiDeck, ichiPlayable, ichiNewGame, ichiApply, ichiBotStep } = await import(pathToFileURL(bundlePath));

assert.equal(buildIchiDeck().length, 108, "classic deck should contain 108 cards");

for (let i = 0; i < 150; i++) {
  const g = ichiNewGame("Tester");
  const cardCount = g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0);
  assert.equal(cardCount, 108, "dealing/opening effects must preserve every card");
  assert.notEqual(g.discard.at(-1).v, "+4", "Wild Draw Four cannot open a round");
}

const base = () => ({
  deck: [
    { c: "cyan", v: 1 }, { c: "gold", v: 2 }, { c: "green", v: 3 },
    { c: "pink", v: 4 }, { c: "cyan", v: 5 }, { c: "gold", v: 6 },
  ],
  discard: [{ c: "pink", v: 7 }], color: "pink",
  players: [
    { name: "You", hand: [] }, { name: "Goro", hand: [] },
    { name: "Mika", hand: [] }, { name: "Tetsu", hand: [] },
  ],
  turn: 0, dir: 1, phase: "play", pending: null, drew: false,
  winner: null, unoWindow: false, msg: "", shout: "", shoutKey: 0,
});

{
  const g = base();
  const plusFour = { c: "wild", v: "+4" };
  const hand = [plusFour, { c: "pink", v: 2 }];
  assert.equal(ichiPlayable(plusFour, g, hand), false, "+4 is illegal while an active-color card is held");
  assert.equal(ichiPlayable(plusFour, g, [plusFour, { c: "cyan", v: 2 }]), true, "+4 is legal without an active-color card");
}

{
  const g = base();
  g.players[0].hand = [{ c: "pink", v: "S" }, { c: "cyan", v: 1 }];
  const next = ichiApply(g, 0, 0, null);
  assert.equal(next.turn, 2, "Skip must skip the next player");
  assert.equal(next.unoWindow, true, "human must receive an UNO call window at one card");
}

{
  const g = base();
  g.players[0].hand = [{ c: "pink", v: "R" }, { c: "cyan", v: 1 }];
  const next = ichiApply(g, 0, 0, null);
  assert.equal(next.dir, -1, "Reverse must change direction");
  assert.equal(next.turn, 3, "Reverse must advance counter-clockwise");
}

{
  const g = base();
  g.players[0].hand = [{ c: "pink", v: "+2" }, { c: "cyan", v: 1 }];
  const next = ichiApply(g, 0, 0, null);
  assert.equal(next.players[1].hand.length, 2, "Draw Two must add two cards");
  assert.equal(next.turn, 2, "Draw Two target must lose its turn");
}

{
  const g = base();
  g.turn = 1;
  g.players[1].hand = [{ c: "wild", v: "+4" }, { c: "pink", v: 3 }, { c: "cyan", v: 8 }];
  const next = ichiBotStep(g);
  assert.notEqual(next.discard.at(-1).v, "+4", "bot must not cheat with an illegal +4");
}

console.log("ICHI classic-rule smoke tests passed");
await rm(tempDir, { recursive: true, force: true });
