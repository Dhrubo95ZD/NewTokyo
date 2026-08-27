import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cricketDeliveryDuration, resolveCricketSwing, swipeCricketShot } from "../src/arcade/arcadeRules.js";

assert.equal(resolveCricketSwing({ progress: 0.84, laneMatch: true, intent: "drive", random: 1 }).runs, 4);
assert.equal(resolveCricketSwing({ progress: 0.84, laneMatch: true, intent: "power", random: 1 }).runs, 6);
assert.equal(resolveCricketSwing({ progress: 0.4, laneMatch: true, intent: "drive", random: 1 }).tier, "miss");
assert.equal(resolveCricketSwing({ progress: 0.84, laneMatch: false, intent: "drive", random: 1 }).runs, 0);
assert.equal(resolveCricketSwing({ progress: 0.4, laneMatch: true, intent: "power", random: 0.1 }).wicket, true);
assert.equal(swipeCricketShot({ dx: -70, dy: -60, duration: 250 }).lane, "leg");
assert.equal(swipeCricketShot({ dx: 8, dy: -70, duration: 250 }).lane, "straight");
assert.equal(swipeCricketShot({ dx: 70, dy: -60, duration: 250 }).lane, "off");
assert.equal(swipeCricketShot({ dx: 110, dy: -80, duration: 120 }).intent, "power");
assert.equal(swipeCricketShot({ dx: 5, dy: 3, duration: 120 }), null);
assert.ok(cricketDeliveryDuration(115) >= 1100 && cricketDeliveryDuration(205) <= 1300, "delivery must be readable but responsive");

const [arcade, styles, hub] = await Promise.all([
  readFile(new URL("../src/arcade/ArcadeGames.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/arcade/arcade-games.css", import.meta.url), "utf8"),
  readFile(new URL("../src/online/online-hub.css", import.meta.url), "utf8"),
]);
assert.ok(arcade.includes("performance.now()-f.started"), "swing timing must use the release timestamp");
assert.ok(arcade.includes("onPointerDown={beginSwipe}") && arcade.includes("onPointerUp={finishSwipe}"), "cricket must capture directional swipes");
assert.ok(arcade.includes("style={{left:`${Math.min(100,progress*100)}%`}}"), "marker must travel across the full rail");
assert.ok(!arcade.includes("transform:`translateX(${Math.min(100,progress*100)}%)`"), "broken marker translation must not return");
assert.ok(styles.includes(".cricket-v2{position:fixed") && styles.includes("z-index:500"), "a started match must use a dedicated full-screen layer");
assert.ok(styles.includes("transition:left 16ms linear"), "timing marker should animate smoothly");
assert.ok(hub.includes("The portrait owns the complete orb surface") && hub.includes("background:#07111f"), "legacy pink avatar backing must be covered");

console.log("Avatar and full-screen swipe cricket tests passed");
