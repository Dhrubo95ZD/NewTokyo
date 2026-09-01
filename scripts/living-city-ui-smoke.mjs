import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [game,styles,main]=await Promise.all([
  readFile(new URL("../src/MafiaGame.jsx",import.meta.url),"utf8"),
  readFile(new URL("../src/living-city.css",import.meta.url),"utf8"),
  readFile(new URL("../src/main.jsx",import.meta.url),"utf8"),
]);

for(const marker of ["MOBILE_NAV","mobile-dock","page-motion","blackwood-skyline","district-map","AnimatedNumber","nav-scrim"])
  assert.ok(game.includes(marker),`missing Living City shell feature: ${marker}`);
for(const marker of ["env(safe-area-inset-top","env(safe-area-inset-bottom","prefers-reduced-motion","@keyframes pageArrive","@keyframes legendarySheen","@media(max-width:360px)","grid-template-columns:repeat(5,1fr)"])
  assert.ok(styles.includes(marker),`missing responsive/motion contract: ${marker}`);
assert.ok(styles.includes(".district-map-art{display:grid")&&styles.includes("grid-template-columns:1fr 1fr"),"narrow city map must avoid pin overlap");
assert.ok(styles.includes("animation:none!important"),"reduced-motion fallback missing");
assert.ok(main.includes('import "./living-city.css"'),"Living City design layer is not loaded last");
assert.ok(!game.includes("Math.random"),"visual shell must not invent game state");
console.log("Living City navigation, motion, safe-area and narrow-phone contracts passed");
