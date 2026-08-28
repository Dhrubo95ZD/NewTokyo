import assert from "node:assert/strict";
import { buyUpgrade, choosePerk, getIntent, metaStats, newGame, resolveTurn, startRun, upgradeCost, useReboot } from "./gameEngine.js";

let game = startRun(newGame(), "shinjuku");
assert.equal(game.run.status, "combat");
assert.equal(getIntent(game.run).type, "strike");

const before = game.run.enemy.hp;
game = resolveTurn(game, "strike");
assert.ok(game.run.enemy.hp < before, "strike damages the enemy");
assert.equal(game.run.focus, 1, "strike builds focus");

const unchanged = resolveTurn(game, "overdrive");
assert.equal(unchanged.run.focus, 1, "overdrive cannot fire early");

game = { ...game, run: { ...game.run, focus: 5 } };
game = resolveTurn(game, "overdrive");
assert.equal(game.run.focus, 0, "overdrive spends focus");

game = { ...game, run: { ...game.run, status: "reboot", reboot: 1, hp: 0 } };
game = useReboot(game);
assert.equal(game.run.status, "combat");
assert.equal(game.run.reboot, 0);
assert.ok(game.run.hp > 0);

game = { ...game, run: { ...game.run, status: "reward" } };
const hpBeforePerk = game.run.maxHp;
game = choosePerk(game, "shell");
assert.equal(game.run.maxHp, hpBeforePerk + 16);
assert.equal(game.run.encounter, 1);

let upgraded = { ...newGame(), credits: 500 };
upgraded = buyUpgrade(upgraded, "power");
assert.equal(upgraded.upgrades.power, 1);
assert.equal(upgraded.credits, 500 - upgradeCost(0));
assert.equal(metaStats(upgraded).power, 12);

console.log("Core run-loop tests passed");

