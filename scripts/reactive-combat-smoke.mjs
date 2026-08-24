import assert from "node:assert/strict";
import { createReactiveCombat, stepReactiveCombat } from "../src/game/reactiveCombatEngine.js";

const moving = createReactiveCombat({ role: "striker" });
const moved = stepReactiveCombat(moving, { moveX: 1 }, 0.05);
assert.ok(moved.player.x > moving.player.x, "continuous movement must update position immediately");

const fighting = createReactiveCombat({ role: "striker" });
fighting.enemy.x = fighting.player.x + 70;
fighting.enemy.y = fighting.player.y;
const firstHit = stepReactiveCombat(fighting, { attackPressed: true }, 0.016);
assert.ok(firstHit.enemy.hp < fighting.enemy.hp, "an in-range directional attack must damage the target");
assert.equal(firstHit.player.combo, 1);
assert.ok(firstHit.player.focus > 0, "landing attacks must build Focus");

const dashTest = createReactiveCombat({ role: "technician" });
dashTest.enemy.x = dashTest.player.x + 60;
dashTest.enemy.y = dashTest.player.y;
dashTest.enemy.windup = 0.01;
dashTest.enemy.windupMax = 0.5;
dashTest.enemy.targetX = dashTest.player.x;
dashTest.enemy.targetY = dashTest.player.y;
const dashed = stepReactiveCombat(dashTest, { moveX: 1, dashPressed: true }, 0.02);
assert.equal(dashed.player.hp, dashTest.player.hp, "dash invulnerability must negate an impact");
assert.ok(dashed.player.dashCooldown > 0);

const technician = createReactiveCombat({ role: "technician" });
technician.player.focus = 100;
const jammed = stepReactiveCombat(technician, { skillPressed: true }, 0.016);
assert.ok(jammed.enemy.stunned > 2, "Signal Jam must interrupt and stun the target");
assert.ok(jammed.enemy.hp < technician.enemy.hp);

const guardian = createReactiveCombat({ role: "guardian" });
guardian.player.hp -= 40;
guardian.player.focus = 100;
const shielded = stepReactiveCombat(guardian, { skillPressed: true }, 0.016);
assert.ok(shielded.player.hp > guardian.player.hp, "Field Barrier must restore integrity");
assert.ok(shielded.player.invulnerable > 1);

const victory = createReactiveCombat({ role: "striker" });
victory.enemy.x = victory.player.x + 60;
victory.enemy.y = victory.player.y;
victory.enemy.hp = 1;
const won = stepReactiveCombat(victory, { attackPressed: true }, 0.016);
assert.equal(won.enemy.hp, 0);
assert.equal(won.status, "victory", "zero target HP must complete combat synchronously");

const defeat = createReactiveCombat({ role: "striker" });
defeat.player.hp = 1;
defeat.enemy.windup = 0.01;
defeat.enemy.windupMax = 0.5;
defeat.enemy.targetX = defeat.player.x;
defeat.enemy.targetY = defeat.player.y;
const lost = stepReactiveCombat(defeat, {}, 0.02);
assert.equal(lost.status, "defeat");

console.log("Reactive arena simulation smoke tests passed");
