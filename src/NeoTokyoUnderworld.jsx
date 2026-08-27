import { useState, useEffect, useRef, useCallback } from "react";
import "./visual-v3.css";

/* ============================================================
   NEO-TOKYO UNDERWORLD — a Torn-style anime crime RPG
   Energy/Nerve economy · Crimes · Gym · Combat · Shop ·
   Inventory · Jobs · Casino · Missions · Jail & Hospital ·
   Auto-save via window.storage
============================================================ */

const now = () => Date.now();
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Pure-JS SHA-256 fallback for contexts without crypto.subtle (some webviews) */
function sha256Sync(ascii) {
  const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  ascii = unescape(encodeURIComponent(ascii));
  const maxWord = Math.pow(2, 32);
  let i, j, result = "";
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = (sha256Sync.h = sha256Sync.h || []);
  const k = (sha256Sync.k = sha256Sync.k || []);
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = i < 16 ? w[i] : (w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

const fmt = (n) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e6) return "¥" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  return "¥" + n.toLocaleString();
};

const CRIMES = [
  { id: "gacha", name: "Rig a Gacha Machine", kanji: "運", nerve: 2, chance: 0.9, pay: [80, 220], xp: 4, jail: 20 },
  { id: "pick", name: "Pickpocket in Akiba", kanji: "掏", nerve: 3, chance: 0.78, pay: [200, 500], xp: 8, jail: 35 },
  { id: "boot", name: "Sell Bootleg Figures", kanji: "偽", nerve: 4, chance: 0.68, pay: [400, 900], xp: 13, jail: 50 },
  { id: "hack", name: "Hack an Arcade Leaderboard", kanji: "電", nerve: 6, chance: 0.58, pay: [800, 1800], xp: 20, jail: 75 },
  { id: "smug", name: "Smuggle Rare Manga", kanji: "密", nerve: 8, chance: 0.48, pay: [1500, 3500], xp: 32, jail: 100 },
  { id: "vault", name: "Crack a Pachinko Vault", kanji: "金", nerve: 11, chance: 0.38, pay: [3000, 7000], xp: 50, jail: 140 },
  { id: "heist", name: "Heist the Idol Agency", kanji: "盗", nerve: 15, chance: 0.28, pay: [7000, 16000], xp: 85, jail: 200 },
];

const GYM_STATS = [
  { key: "str", name: "Strength", kanji: "力", desc: "Raises your attack damage." },
  { key: "def", name: "Defense", kanji: "守", desc: "Reduces damage you take." },
  { key: "spd", name: "Speed", kanji: "速", desc: "Strike first, strike often." },
  { key: "dex", name: "Dexterity", kanji: "技", desc: "Dodge hits, ace crimes." },
];

const ENEMIES = [
  { id: "punk", name: "Street Challenger Kenji", kanji: "挑戦", icon: "🧢", drop: { id: "cap", chance: 0.08 }, lvl: 1, hp: 40, atk: 6, def: 3, pay: [150, 350], xp: 12 },
  { id: "delinq", name: "Twin Challengers", kanji: "双子", icon: "👯", lvl: 3, hp: 75, atk: 11, def: 6, pay: [400, 800], xp: 26 },
  { id: "ronin_e", name: "Circuit Duelist Aoi", kanji: "剣士", icon: "🤺", lvl: 6, hp: 130, atk: 18, def: 12, pay: [900, 1800], xp: 48 },
  { id: "maid", name: "Arena Technician Sakuya", kanji: "技師", icon: "🎀", drop: { id: "fan", chance: 0.06 }, lvl: 10, hp: 210, atk: 28, def: 18, pay: [2000, 4200], xp: 85 },
  { id: "oni_e", name: "Crimson Mask Enforcer", kanji: "紅面", icon: "🎭", lvl: 15, hp: 330, atk: 42, def: 28, pay: [4500, 9000], xp: 150 },
  { id: "kitsune", name: "Foxline Captain", kanji: "狐隊", icon: "🦊", drop: { id: "kmask", chance: 0.05 }, lvl: 22, hp: 520, atk: 62, def: 42, pay: [10000, 22000], xp: 280 },
  { id: "phantom", name: "Rooftop Champion ✦ WORLD BOSS", kanji: "頂点", icon: "🏆", drop: { id: "phantom_edge", chance: 0.1 }, boss: true, minLvl: 12, lvl: 30, hp: 900, atk: 80, def: 55, pay: [20000, 45000], xp: 500 },
];

const SHOP = [
  { id: "bat", name: "Spiked Bokken", type: "weapon", power: 6, cost: 1200, kanji: "木刀", icon: "🏏", rarity: "common" },
  { id: "tanto", name: "Neon Tanto", type: "weapon", power: 14, cost: 5500, kanji: "短刀", icon: "🔪", rarity: "uncommon" },
  { id: "katana", name: "Plasma Katana", type: "weapon", power: 28, cost: 22000, kanji: "刀", icon: "⚔️", rarity: "rare" },
  { id: "naginata", name: "Void Naginata", type: "weapon", power: 50, cost: 80000, kanji: "薙刀", icon: "🗡️", rarity: "epic" },
  { id: "jacket", name: "Sukeban Jacket", type: "armor", power: 5, cost: 1000, kanji: "上着", icon: "🧥", rarity: "common" },
  { id: "vest", name: "Kevlar Seifuku", type: "armor", power: 12, cost: 5000, kanji: "制服", icon: "🦺", rarity: "uncommon" },
  { id: "plate", name: "Mecha Chestplate", type: "armor", power: 24, cost: 20000, kanji: "装甲", icon: "🛡️", rarity: "rare" },
  { id: "aegis", name: "Civic Guardian Aegis", type: "armor", power: 45, cost: 75000, kanji: "守盾", icon: "🛡️", rarity: "epic" },
  { id: "onigiri", name: "Onigiri", type: "consume", effect: "hp", amount: 40, cost: 250, kanji: "飯", icon: "🍙", rarity: "common", desc: "+40 HP" },
  { id: "ramen", name: "Midnight Ramen", type: "consume", effect: "hp", amount: 120, cost: 700, kanji: "麺", icon: "🍜", rarity: "uncommon", desc: "+120 HP" },
  { id: "soda", name: "Melon Soda", type: "consume", effect: "energy", amount: 15, cost: 900, kanji: "炭", icon: "🥤", rarity: "common", desc: "+15 Energy" },
  { id: "coffee", name: "Kissaten Espresso", type: "consume", effect: "energy", amount: 35, cost: 2200, kanji: "珈", icon: "☕", rarity: "uncommon", desc: "+35 Energy" },
  { id: "pocky", name: "Pocky Box", type: "consume", effect: "happy", amount: 25, cost: 400, kanji: "菓", icon: "🍫", rarity: "common", desc: "+25 Happiness" },
  { id: "plush", name: "Limited Plushie", type: "consume", effect: "happy", amount: 80, cost: 1500, kanji: "縫", icon: "🧸", rarity: "uncommon", desc: "+80 Happiness" },
  { id: "sake", name: "Courage Tea", type: "consume", effect: "nerve", amount: 8, cost: 1800, kanji: "茶", icon: "🍵", rarity: "rare", desc: "+8 Nerve" },
];

const MATERIALS = [
  { id: "scrap", name: "Scrap Alloy", type: "material", kanji: "鉄", icon: "🔩", rarity: "common", desc: "Torn from the city's bones. Drops from street fights." },
  { id: "cell", name: "Neon Cell", type: "material", kanji: "電", icon: "🔋", rarity: "uncommon", desc: "Still humming. Drops from successful crimes." },
  { id: "silk", name: "Spider Silk Thread", type: "material", kanji: "糸", icon: "🧵", rarity: "uncommon", desc: "Stronger than it looks. Drops from crimes." },
  { id: "oni", name: "Crimson Alloy", type: "material", kanji: "紅", icon: "🔻", rarity: "rare", desc: "A rare reinforced alloy. Drops from tough enemies." },
  { id: "star", name: "Star Shard", type: "material", kanji: "星", icon: "🌟", rarity: "epic", desc: "The city's luck, crystallized. Jackpots, contracts, rare crime finds." },
];

const CRAFTABLES = [
  { id: "ronin", name: "Rōnin Edge", type: "weapon", power: 38, kanji: "浪", icon: "⚔️", rarity: "rare", desc: "+38 attack. Forged, not bought." },
  { id: "akuma", name: "Apex Blade", type: "weapon", power: 65, kanji: "極", icon: "⚔️", rarity: "epic", desc: "+65 attack. The forge's masterpiece." },
  { id: "weave", name: "Neon Weave Armor", type: "armor", power: 32, kanji: "織", icon: "🕸️", rarity: "rare", desc: "+32 defense. Light as rumor." },
  { id: "tengu", name: "Skyguard Aegis", type: "armor", power: 58, kanji: "空", icon: "🛡️", rarity: "epic", desc: "+58 defense. Built for high-altitude patrols." },
  { id: "ecell", name: "Overcharge Can", type: "consume", effect: "energy", amount: 50, kanji: "雷", icon: "⚡", rarity: "rare", desc: "+50 Energy" },
  { id: "medkit", name: "Field Medkit", type: "consume", effect: "hp", amount: 200, kanji: "救", icon: "🩹", rarity: "uncommon", desc: "+200 HP" },
  { id: "charm", name: "Team Keepsake", type: "gift", kanji: "絆", icon: "🎀", rarity: "rare", desc: "A hand-sewn team keepsake. +25 trust." },
];

const RECIPES = [
  { out: "medkit", mats: { silk: 2, cell: 1 }, money: 800 },
  { out: "ecell", mats: { cell: 3 }, money: 500 },
  { out: "charm", mats: { silk: 2, star: 1 }, money: 1500 },
  { out: "ronin", mats: { scrap: 6, oni: 2 }, money: 5000 },
  { out: "weave", mats: { scrap: 8, cell: 4 }, money: 8000 },
  { out: "akuma", mats: { scrap: 12, oni: 6, star: 2 }, money: 20000 },
  { out: "tengu", mats: { scrap: 14, cell: 5, star: 2 }, money: 25000 },
];


/* ============ HACK & SLASH ARENA ============ */
export function Brawl({ stats, enemy, onEnd, techniques = [] }) {
  const cvs = useRef(null);
  const wrap = useRef(null);
  const flags = useRef({ atk: false, dash: false, skill: null });
  const [skillHud, setSkillHud] = useState(() => techniques.map((skill) => ({ ...skill, remaining: 0 })));

  useEffect(() => {
    const canvas = cvs.current;
    const ctx = canvas.getContext("2d");
    const W = 640, H = 400;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const arenaBg = new Image();
    arenaBg.src = "/assets/world-v3/undercity-arena.webp";

    const MOB_COLORS = { punk: "#00AEEF", delinq: "#FF4D82", ronin_e: "#8f7bff", maid: "#ffb3d1", oni_e: "#F1385C", kitsune: "#f2ecff", phantom: "#63f0ff" };
    const reduce = 60 / (60 + stats.def + stats.aPow);
    const pSpeed = Math.min(230, 95 + stats.spd);
    const critCh = Math.min(0.5, 0.1 + stats.dex * 0.003 + (stats.crit || 0) / 100);
    const dashCdMax = Math.max(0.8, 1.8 - stats.dex * 0.01);

    const mkMob = (hpMul, big) => {
      const a = Math.random() * Math.PI * 2;
      return {
        x: W / 2 + Math.cos(a) * (W * 0.42), y: H / 2 + Math.sin(a) * (H * 0.42),
        r: big ? 26 : 13, hp: Math.max(10, Math.round(enemy.hp * hpMul)), maxHp: Math.max(10, Math.round(enemy.hp * hpMul)),
        spd: big ? 58 : Math.min(120, 46 + enemy.lvl * 2.2),
        dmg: enemy.atk * (big ? 0.7 : 0.5), cd: 1 + Math.random(), hit: 0, big: !!big,
      };
    };
    const waves = enemy.boss
      ? [[mkMob(0.09), mkMob(0.09)], [mkMob(1, true), mkMob(0.07)]]
      : [[mkMob(0.18), mkMob(0.18)], [mkMob(0.18), mkMob(0.18), mkMob(0.18)], [mkMob(0.18), mkMob(0.18), mkMob(0.18), mkMob(0.18)]];

    const S = {
      last: performance.now(), shake: 0, wave: -1, mobs: [], parts: [], dmgs: [], rings: [], trail: [], t: 0,
      p: { x: W / 2, y: H / 2, r: 14, hp: stats.hp, face: 0, atkCd: 0, dashCd: 0, dashT: 0, ifr: 0, swing: 0, mvx: 0, mvy: 0 },
      keys: {}, joy: null, banner: "", bannerT: 0, done: false, raf: 0, skillCd: {}, overdrive: 0, hudAt: 0,
    };
    let endTimer = null;
    const nextWave = () => {
      S.wave++;
      if (S.wave >= waves.length) {
        S.done = true; S.banner = "勝利 VICTORY"; S.bannerT = 1.4;
        endTimer = setTimeout(() => onEnd({ win: true, hpFrac: Math.max(0.02, S.p.hp / stats.maxHp) }), 1200);
        return;
      }
      S.mobs = waves[S.wave];
      S.banner = enemy.boss && S.wave === 1 ? "BOSS ARRIVES" : `WAVE ${S.wave + 1}/${waves.length}`;
      S.bannerT = 1.2;
    };
    nextWave();

    const spark = (x, y, c, n = 6) => { for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, t: 0.4, c }); };
    const dmgNum = (x, y, txt, c) => S.dmgs.push({ x, y, txt, c, t: 0.9 });

    const doAttack = () => {
      const p = S.p;
      if (p.atkCd > 0 || S.done) return;
      p.atkCd = S.overdrive > 0 ? 0.2 : 0.36; p.swing = 0.18;
      const range = 56, arc = 1.25;
      /* auto-face the nearest enemy so taps always connect */
      let nearest = null, nd = 1e9;
      S.mobs.forEach((m) => { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < nd) { nd = d; nearest = m; } });
      if (nearest && nd < 170) p.face = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      S.mobs.forEach((m) => {
        const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
        if (d < range + m.r && Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - p.face), Math.cos(Math.atan2(dy, dx) - p.face))) < arc) {
          const crit = Math.random() < critCh;
          const dmg = Math.round((stats.str + stats.wPow) * (0.9 + Math.random() * 0.4) * (crit ? 1.7 : 1) * (S.overdrive > 0 ? 1.55 : 1));
          m.hp -= dmg; m.hit = 0.12;
          const kb = 90; m.x += (dx / (d || 1)) * kb * 0.16; m.y += (dy / (d || 1)) * kb * 0.16;
          dmgNum(m.x, m.y - m.r - 6, String(dmg), crit ? "#FFAB00" : "#f2ecff");
          spark(m.x, m.y, crit ? "#FFAB00" : "#FF4D82");
          if (crit) S.shake = Math.max(S.shake, 0.12);
        }
      });
    };
    const doDash = () => {
      const p = S.p;
      if (p.dashCd > 0 || S.done) return;
      p.dashCd = dashCdMax; p.dashT = 0.18; p.ifr = 0.32;
      spark(p.x, p.y, "#00AEEF", 8);
    };
    const strikeMob = (mob, multiplier, color) => {
      const damage = Math.max(1, Math.round((stats.str + stats.dex * .45 + stats.wPow) * multiplier));
      mob.hp -= damage; mob.hit = .18;
      dmgNum(mob.x, mob.y - mob.r - 7, String(damage), color);
      spark(mob.x, mob.y, color, 10);
    };
    const doSkill = (skillId) => {
      const skill = techniques.find((entry) => entry.id === skillId);
      if (!skill || S.done || Number(S.skillCd[skillId] || 0) > 0) return;
      S.skillCd[skillId] = skill.cooldown; S.banner = skill.name.toUpperCase(); S.bannerT = .65;
      if (skillId === "arc-slash") S.mobs.filter((mob) => Math.hypot(mob.x-S.p.x,mob.y-S.p.y) < 145).forEach((mob) => strikeMob(mob, 1.65, skill.color));
      if (skillId === "pulse-guard") { S.p.ifr=Math.max(S.p.ifr,2.2); S.p.hp=Math.min(stats.maxHp,S.p.hp+stats.maxHp*.1); S.rings.push({x:S.p.x,y:S.p.y,r:18,c:skill.color,t:.8,duration:.8,growth:95}); }
      if (skillId === "vector-rush") { const mob=[...S.mobs].sort((a,b)=>Math.hypot(a.x-S.p.x,a.y-S.p.y)-Math.hypot(b.x-S.p.x,b.y-S.p.y))[0]; if(mob){S.p.x=clamp(mob.x-34,S.p.r,W-S.p.r);S.p.y=clamp(mob.y,S.p.r,H-S.p.r);S.p.ifr=.45;strikeMob(mob,2.35,skill.color);} }
      if (skillId === "repair-cloud") { S.p.hp=Math.min(stats.maxHp,S.p.hp+stats.maxHp*.3); S.rings.push({x:S.p.x,y:S.p.y,r:18,c:skill.color,t:.8,duration:.8,growth:95}); }
      if (skillId === "gravity-well") S.mobs.forEach((mob)=>{mob.x+=(S.p.x-mob.x)*.42;mob.y+=(S.p.y-mob.y)*.42;strikeMob(mob,1.25,skill.color);});
      if (skillId === "overdrive") { S.overdrive=6; spark(S.p.x,S.p.y,skill.color,18); }
    };

    /* input */
    const kd = (e) => {
      S.keys[e.key.toLowerCase()] = true;
      if (e.key === " " || e.key.toLowerCase() === "j") { e.preventDefault(); doAttack(); }
      if (e.key === "Shift" || e.key.toLowerCase() === "k") { e.preventDefault(); doDash(); }
    };
    const ku = (e) => { S.keys[e.key.toLowerCase()] = false; };
    const toLocal = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) };
    };
    const pd = (ev) => {
      if (ev.preventDefault) ev.preventDefault();
      try { canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId); } catch (err) { /* ok */ }
      const pos = toLocal(ev);
      if (ev.pointerType === "mouse") {
        S.p.face = Math.atan2(pos.y - S.p.y, pos.x - S.p.x);
        doAttack();
      } else if (pos.x < W * 0.55) {
        S.joy = { id: ev.pointerId, ox: pos.x, oy: pos.y, dx: 0, dy: 0 };
      }
    };
    const pm = (ev) => {
      if (S.joy && ev.pointerId === S.joy.id) {
        const pos = toLocal(ev);
        const dx = pos.x - S.joy.ox, dy = pos.y - S.joy.oy, d = Math.hypot(dx, dy) || 1;
        const c = Math.min(1, d / 42);
        S.joy.dx = (dx / d) * c; S.joy.dy = (dy / d) * c;
      }
    };
    const pu = (ev) => { if (S.joy && ev.pointerId === S.joy.id) S.joy = null; };
    window.addEventListener("keydown", kd, { passive: false });
    window.addEventListener("keyup", ku);
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);

    /* main loop */
    const loop = (t) => {
      const dt = Math.min(0.05, (t - S.last) / 1000); S.last = t;
      const p = S.p;
      /* --- update --- */
      if (flags.current.atk) doAttack();
      if (flags.current.dash) { doDash(); flags.current.dash = false; }
      if (flags.current.skill) { doSkill(flags.current.skill); flags.current.skill = null; }
      let mx = 0, my = 0;
      if (S.keys.w || S.keys.arrowup) my -= 1;
      if (S.keys.s || S.keys.arrowdown) my += 1;
      if (S.keys.a || S.keys.arrowleft) mx -= 1;
      if (S.keys.d || S.keys.arrowright) mx += 1;
      if (S.joy) { mx = S.joy.dx; my = S.joy.dy; }
      const ml = Math.hypot(mx, my);
      if (ml > 0.01 && !S.done) {
        mx /= Math.max(1, ml); my /= Math.max(1, ml);
        const sp = p.dashT > 0 ? 340 : pSpeed;
        p.x += mx * sp * dt; p.y += my * sp * dt;
        p.face = Math.atan2(my, mx);
      }
      p.x = clamp(p.x, p.r, W - p.r); p.y = clamp(p.y, p.r, H - p.r);
      p.atkCd = Math.max(0, p.atkCd - dt); p.dashCd = Math.max(0, p.dashCd - dt);
      p.dashT = Math.max(0, p.dashT - dt); p.ifr = Math.max(0, p.ifr - dt); p.swing = Math.max(0, p.swing - dt);
      S.overdrive = Math.max(0, S.overdrive - dt);
      Object.keys(S.skillCd).forEach((id) => { S.skillCd[id] = Math.max(0, S.skillCd[id] - dt); });
      if (t - S.hudAt > 120) { S.hudAt = t; setSkillHud(techniques.map((skill) => ({ ...skill, remaining: Number(S.skillCd[skill.id] || 0) }))); }
      S.shake = Math.max(0, S.shake - dt); S.bannerT = Math.max(0, S.bannerT - dt);

      S.mobs.forEach((m) => {
        m.hit = Math.max(0, m.hit - dt); m.cd = Math.max(0, m.cd - dt);
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
        if (!S.done) { m.x += (dx / d) * m.spd * dt; m.y += (dy / d) * m.spd * dt; }
        S.mobs.forEach((o) => {
          if (o === m) return;
          const ox = m.x - o.x, oy = m.y - o.y, od = Math.hypot(ox, oy) || 1;
          if (od < m.r + o.r) { m.x += (ox / od) * 24 * dt; m.y += (oy / od) * 24 * dt; }
        });
        if (d < m.r + p.r + 2 && m.cd <= 0 && !S.done) {
          m.cd = 0.9;
          if (p.ifr <= 0) {
            const dmg = Math.max(1, Math.round(m.dmg * (0.85 + Math.random() * 0.3) * reduce));
            p.hp -= dmg; S.shake = 0.18;
            dmgNum(p.x, p.y - 22, "-" + dmg, "#FF4D82");
            spark(p.x, p.y, "#FF4D82");
            if (p.hp <= 0 && !S.done) {
              S.done = true; S.banner = "敗北 DEFEAT"; S.bannerT = 2;
              endTimer = setTimeout(() => onEnd({ win: false, hpFrac: 0 }), 1200);
            }
          } else {
            dmgNum(p.x, p.y - 22, "DODGE", "#00C08A");
          }
        }
      });
      const before = S.mobs.length;
      S.mobs = S.mobs.filter((m) => {
        if (m.hp > 0) return true;
        spark(m.x, m.y, MOB_COLORS[enemy.id] || "#FF4D82", 12);
        S.rings.push({ x: m.x, y: m.y, r: m.r, c: MOB_COLORS[enemy.id] || "#FF4D82", t: 0.4 });
        return false;
      });
      if (before && !S.mobs.length && !S.done) nextWave();
      S.parts = S.parts.filter((q) => (q.t -= dt) > 0);
      S.parts.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; });
      S.dmgs = S.dmgs.filter((q) => (q.t -= dt) > 0);
      S.dmgs.forEach((q) => { q.y -= 34 * dt; });

      /* --- draw --- */
      S.t += dt;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake * 40, (Math.random() - 0.5) * S.shake * 40);
      /* illustrated undercity floor, cropped to cover the canvas */
      if (arenaBg.complete && arenaBg.naturalWidth) {
        const scale = Math.max(W / arenaBg.naturalWidth, H / arenaBg.naturalHeight);
        const dw = arenaBg.naturalWidth * scale, dh = arenaBg.naturalHeight * scale;
        ctx.drawImage(arenaBg, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.fillStyle = "rgba(3,7,15,.34)"; ctx.fillRect(-10, -10, W + 20, H + 20);
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#111c2c"); bg.addColorStop(0.6, "#0b1421"); bg.addColorStop(1, "#050a12");
        ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
      }
      /* giant watermark kanji */
      ctx.font = "210px DotGothic16, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,111,174,.05)"; ctx.fillText("斬", W / 2, H / 2 + 10);
      ctx.textBaseline = "alphabetic";
      /* scrolling grid */
      ctx.strokeStyle = "rgba(77,227,255,.07)"; ctx.lineWidth = 1;
      const off = (S.t * 18) % 40;
      for (let gx = -off; gx <= W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = -off; gy <= H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
      /* drifting petals */
      for (let i = 0; i < 6; i++) {
        const px = ((i * 127 + S.t * 26 + Math.sin(S.t * 0.9 + i) * 34) % (W + 40)) - 20;
        const py = ((i * 73 + S.t * 15) % (H + 30)) - 15;
        ctx.fillStyle = "rgba(255,111,174,.3)";
        ctx.beginPath(); ctx.ellipse(px, py, 3.4, 2, S.t + i, 0, 7); ctx.fill();
      }
      /* vignette */
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(6,4,14,.6)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      /* neon corner brackets */
      ctx.strokeStyle = "rgba(255,111,174,.65)"; ctx.lineWidth = 2;
      [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]].forEach(([cx, cy, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(cx + 20 * sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + 20 * sy); ctx.stroke();
      });

      const shadowBlob = (x, y, r) => {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.85, r * 0.3, 0, 0, 7); ctx.fill();
      };

      /* mobs — kanji-faced rounded diamonds */
      S.mobs.forEach((m, i) => {
        const c = MOB_COLORS[enemy.id] || "#FF4D82";
        const bob = Math.sin(S.t * 5 + i * 1.7) * 2;
        shadowBlob(m.x, m.y, m.r);
        ctx.save(); ctx.translate(m.x, m.y + bob);
        if (m.big) {
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.moveTo(-m.r * 0.5, -m.r * 0.7); ctx.lineTo(-m.r * 0.85, -m.r * 1.3); ctx.lineTo(-m.r * 0.2, -m.r * 0.95); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(m.r * 0.5, -m.r * 0.7); ctx.lineTo(m.r * 0.85, -m.r * 1.3); ctx.lineTo(m.r * 0.2, -m.r * 0.95); ctx.closePath(); ctx.fill();
        }
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, -m.r); ctx.lineTo(m.r, 0); ctx.lineTo(0, m.r); ctx.lineTo(-m.r, 0); ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = m.hit > 0 ? "#ffffff" : "#191434";
        ctx.strokeStyle = c; ctx.lineWidth = 2.6;
        ctx.fill(); ctx.stroke();
        ctx.font = `${m.big ? 24 : 14}px DotGothic16, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = m.hit > 0 ? "#191434" : c;
        ctx.fillText(enemy.kanji[0], 0, 1);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(m.x - m.r, m.y + m.r + 6, m.r * 2, 3);
        ctx.fillStyle = c; ctx.fillRect(m.x - m.r, m.y + m.r + 6, (m.r * 2) * (m.hp / m.maxHp), 3);
      });

      /* player motion trail */
      S.trail.push({ x: p.x, y: p.y, t: 0.3 });
      S.trail = S.trail.filter((q) => (q.t -= dt) > 0);
      S.trail.forEach((q) => {
        ctx.globalAlpha = q.t * 0.5; ctx.fillStyle = "#FF4D82";
        ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;

      /* player — neon rōnin */
      shadowBlob(p.x, p.y, p.r);
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.ifr > 0) ctx.globalAlpha = 0.55;
      ctx.shadowColor = "#FF4D82"; ctx.shadowBlur = 14;
      ctx.fillStyle = "#241f3d"; ctx.strokeStyle = "#FF4D82"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.rotate(p.face);
      ctx.fillStyle = "#00AEEF";
      ctx.beginPath(); ctx.moveTo(p.r * 0.15, -5.5); ctx.lineTo(p.r * 0.95, -2.5); ctx.lineTo(p.r * 0.95, 2.5); ctx.lineTo(p.r * 0.15, 5.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#FF4D82"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-p.r * 0.6, -3); ctx.quadraticCurveTo(-p.r * 1.6, -6 + Math.sin(S.t * 9) * 3, -p.r * 2.1, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-p.r * 0.6, 3); ctx.quadraticCurveTo(-p.r * 1.7, 7 + Math.cos(S.t * 8) * 3, -p.r * 2.2, 4); ctx.stroke();
      if (p.swing > 0) {
        const sw = p.swing / 0.18;
        ctx.globalAlpha = sw;
        const sg = ctx.createRadialGradient(0, 0, 18, 0, 0, 62);
        sg.addColorStop(0, "rgba(255,209,102,0)"); sg.addColorStop(1, "rgba(255,209,102,.55)");
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 58, -1.25, 1.25); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 52, -1.05, 1.05); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      /* kill rings, particles, damage numbers */
      S.rings = S.rings.filter((q) => (q.t -= dt) > 0);
      S.rings.forEach((q) => {
        const duration = Math.max(0.01, Number(q.duration || 0.4));
        const progress = clamp(1 - q.t / duration, 0, 1);
        const radius = Math.max(0.1, Number(q.r || 0) + progress * Number(q.growth || 95));
        ctx.globalAlpha = clamp(q.t / duration, 0, 1); ctx.strokeStyle = q.c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(q.x, q.y, radius, 0, 7); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      S.parts.forEach((q) => { ctx.globalAlpha = q.t / 0.4; ctx.fillStyle = q.c; ctx.fillRect(q.x - 2, q.y - 2, 4, 4); });
      ctx.globalAlpha = 1;
      S.dmgs.forEach((q) => {
        ctx.globalAlpha = Math.min(1, q.t / 0.5);
        ctx.font = "bold 15px DotGothic16, monospace"; ctx.textAlign = "center";
        ctx.strokeStyle = "#0c0a17"; ctx.lineWidth = 3.5; ctx.strokeText(q.txt, q.x, q.y);
        ctx.fillStyle = q.c; ctx.fillText(q.txt, q.x, q.y);
      });
      ctx.globalAlpha = 1;

      /* joystick visual */
      if (S.joy) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#00AEEF"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(S.joy.ox, S.joy.oy, 42, 0, 7); ctx.stroke();
        ctx.fillStyle = "#00AEEF";
        ctx.beginPath(); ctx.arc(S.joy.ox + S.joy.dx * 42, S.joy.oy + S.joy.dy * 42, 14, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      /* HUD */
      ctx.fillStyle = "rgba(12,10,23,.7)"; ctx.fillRect(10, 10, 176, 26);
      ctx.strokeStyle = "rgba(255,111,174,.4)"; ctx.strokeRect(10, 10, 176, 26);
      ctx.fillStyle = "#241f3d"; ctx.fillRect(14, 14, 168, 8);
      ctx.fillStyle = "#00C08A"; ctx.fillRect(14, 14, 168 * Math.max(0, p.hp / stats.maxHp), 8);
      ctx.font = "10px DotGothic16, monospace"; ctx.textAlign = "left"; ctx.fillStyle = "#b9aee0";
      ctx.fillText(`HP ${Math.max(0, Math.round(p.hp))}/${stats.maxHp}`, 14, 32);
      ctx.textAlign = "right";
      ctx.fillText(`WAVE ${Math.min(S.wave + 1, waves.length)}/${waves.length} · ${S.mobs.length} LEFT`, W - 12, 22);
      if (p.dashCd > 0) { ctx.fillStyle = "#00AEEF"; ctx.fillText(`DASH ${p.dashCd.toFixed(1)}`, W - 12, 36); }
      const bigBoss = S.mobs.find((m) => m.big);
      if (bigBoss) {
        ctx.fillStyle = "#241f3d"; ctx.fillRect(W / 2 - 120, H - 24, 240, 9);
        ctx.fillStyle = "#F1385C"; ctx.fillRect(W / 2 - 120, H - 24, 240 * (bigBoss.hp / bigBoss.maxHp), 9);
        ctx.textAlign = "center"; ctx.fillStyle = "#FFAB00";
        ctx.fillText(enemy.name.split(" ✦")[0].toUpperCase(), W / 2, H - 29);
      }
      if (S.bannerT > 0) {
        ctx.globalAlpha = Math.min(1, S.bannerT * 2);
        ctx.font = "34px DotGothic16, monospace"; ctx.textAlign = "center";
        ctx.fillStyle = S.banner.includes("敗") ? "#FF4D82" : "#FFAB00";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 22;
        ctx.fillText(S.banner, W / 2, H / 2 - 40);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.restore();
      S.raf = requestAnimationFrame(loop);
    };
    S.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(S.raf);
      if (endTimer) clearTimeout(endTimer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu);
      canvas.removeEventListener("pointercancel", pu);
    };
  }, []); // eslint-disable-line

  return (
    <div className="brawl-wrap" ref={wrap} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={cvs} className="brawl-canvas" />
      {!!skillHud.length && <div className="brawl-skill-dock">{skillHud.map((skill) => <button key={skill.id} style={{ "--skill": skill.color }} disabled={skill.remaining > 0} onPointerDown={() => { flags.current.skill = skill.id; }}><b>{skill.glyph}</b><span>{skill.remaining > 0 ? skill.remaining.toFixed(1) : skill.name}</span></button>)}</div>}
      <button className="brawl-btn atk"
        onPointerDown={() => { flags.current.atk = true; }}
        onPointerUp={() => { flags.current.atk = false; }}
        onPointerLeave={() => { flags.current.atk = false; }}>斬</button>
      <button className="brawl-btn dash"
        onPointerDown={() => { flags.current.dash = true; }}>避</button>
      <p className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
        Mobile: left side to move · 斬 attack · 避 dash (i-frames). Desktop: WASD + click/Space to attack, Shift to dash.
      </p>
    </div>
  );
}

/* ---- rare drop-only gear ---- */
const DROPS = [
  { id: "cap", name: "Kenji's Lucky Cap", type: "armor", power: 8, kanji: "帽", rarity: "uncommon", desc: "+8 defense. Smells like teen rebellion. Rare drop." },
  { id: "fan", name: "Maid's Razor Fan", type: "weapon", power: 33, kanji: "扇", rarity: "rare", desc: "+33 attack. Elegant. Illegal. Rare drop." },
  { id: "kmask", name: "Kitsune Mask", type: "armor", power: 52, kanji: "面", rarity: "epic", desc: "+52 defense. The boss won't miss it. Rare drop." },
  { id: "phantom_edge", name: "Skyline Edge", type: "weapon", power: 72, kanji: "空", rarity: "epic", desc: "+72 attack. Rooftop Champion drop." },
];
const ALL_ITEMS = [...SHOP, ...MATERIALS, ...CRAFTABLES, ...DROPS];
/* ============ RARITY & ROLLED GEAR ============ */
const GEAR_MULT = { common: 1, uncommon: 1.8, rare: 3.2, golden: 8, legendary: 80 };
const RAR_IDX = { common: 0, uncommon: 1, rare: 2, golden: 3, legendary: 4 };
const SUB_POOL = ["str", "def", "spd", "dex", "hp", "crit", "loot", "xp"];
const SUB_LABEL = { str: "STR", def: "DEF", spd: "SPD", dex: "DEX", hp: "Max HP", crit: "Crit Chance %", loot: "Yen Find %", xp: "XP Gain %" };
const rollSub = (k, lvl, rar) => {
  const ri = RAR_IDX[rar];
  if (k === "crit") return rnd(2, 4) + ri * 2;
  if (k === "loot") return rnd(5, 10) + ri * 6;
  if (k === "xp") return rnd(4, 8) + ri * 5;
  if (k === "hp") return Math.round((rnd(10, 20) + lvl * 2) * (1 + ri));
  return Math.round((rnd(2, 4) + lvl * 0.35) * (1 + ri * 0.8));
};
const GEAR_PREFIX = {
  common: ["Rusty", "Worn", "Plain", "Backstreet"],
  uncommon: ["Tempered", "Street", "Reinforced", "Wired"],
  rare: ["Neon", "Howling", "Serrated", "Midnight"],
  golden: ["Gilded", "Radiant", "Shogun's", "Sunforged"],
  legendary: ["Emperor's", "Zero-District", "Hundred-War", "Meteor", "Final"],
};
const GEAR_NOUN = { weapon: ["Blade", "Edge", "Fang", "Cleaver", "Talon", "Ripper"], armor: ["Plate", "Weave", "Carapace", "Mantle", "Guard", "Shell"] };
const gearPower = (g) => Math.round(g.main * (1 + 0.1 * (g.plus || 0)));
const rollGear = (lvl, boss) => {
  const w = boss
    ? [["common", 8], ["uncommon", 22], ["rare", 32], ["golden", 30], ["legendary", 8]]
    : [["common", 45], ["uncommon", 30], ["rare", 16], ["golden", 8], ["legendary", 1]];
  let r = Math.random() * 100, rarity = "common";
  for (const [k, v] of w) { if (r < v) { rarity = k; break; } r -= v; }
  const type = Math.random() < 0.5 ? "weapon" : "armor";
  const main = Math.max(3, Math.round((lvl + 3) * GEAR_MULT[rarity] * (0.85 + Math.random() * 0.3)));
  const pool = [...SUB_POOL]; const subs = [];
  for (let i = 0; i < RAR_IDX[rarity]; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    subs.push({ k, v: rollSub(k, lvl, rarity) });
  }
  const name = GEAR_PREFIX[rarity][rnd(0, GEAR_PREFIX[rarity].length - 1)] + " " + GEAR_NOUN[type][rnd(0, GEAR_NOUN[type].length - 1)];
  return { uid: "g:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, name, rarity, main, plus: 0, subs, lvl };
};
const isGearId = (id) => typeof id === "string" && id.startsWith("g:");
const gearOf = (p, uid) => (p.gear || []).find((g) => g.uid === uid);
const equipPower = (p, slot) => {
  if (p.armoryBonuses) return 0;
  const id = p[slot];
  if (isGearId(id)) { const g = gearOf(p, id); return g ? gearPower(g) : 0; }
  return (itemById(id) || {}).power || 0;
};
const equipInfo = (p, slot) => {
  const id = p[slot];
  if (isGearId(id)) { const g = gearOf(p, id); return g ? { name: `${g.name} +${g.plus}`, power: gearPower(g), rarity: g.rarity, gear: true } : null; }
  const it = itemById(id); return it ? { name: it.name, power: it.power, rarity: it.rarity } : null;
};
const gearBonuses = (p) => {
  const a = p.armoryBonuses || {};
  const b = { str: a.str || 0, def: a.def || 0, spd: a.spd || 0, dex: a.dex || 0, hp: a.hp || 0, crit: a.crit || 0, loot: a.loot || 0, xp: a.xp || 0 };
  if (p.armoryBonuses) return b;
  ["weapon", "armor"].forEach((s) => {
    const id = p[s];
    if (isGearId(id)) { const g = gearOf(p, id); if (g) g.subs.forEach(({ k, v }) => { b[k] += v; }); }
  });
  return b;
};

const itemById = (id) => ALL_ITEMS.find((s) => s.id === id);
const RARITY_COLOR = { common: "#8A7EA8", uncommon: "#0C93CC", rare: "#E23A6B", epic: "#D98600", golden: "#D98600", legendary: "#FF6A00" };

/* ============ HAND-DRAWN ICON SET ============ */
const IC = { p: "#FF4D82", c: "#00AEEF", g: "#FFAB00", d: "#2C2240", l: "#FFFFFF", gr: "#00C08A", rd: "#F1385C", br: "#C9915F", dk: "#1C1533", w: "#FFFFFF", sk: "#E8B98A" };
const ICON_ART = {
  bat: (<g><path d="M5 21 L16 6 L19 9 L8 22 Z" fill={IC.br}/><path d="M15 7 l1.5-3 1.5 2.5z M12 10.5 l1.5-3 1.5 2.5z M9 14 l1.5-3 1.5 2.5z" fill={IC.c}/><rect x="4" y="18" width="4" height="4" rx="1" fill={IC.d}/></g>),
  tanto: (<g><path d="M6 17 L14 9 L17 12 L9 20 Z" fill={IC.c}/><path d="M14 9 L17 5.5 L19.5 8 L17 12 Z" fill={IC.l}/><rect x="3" y="17" width="5" height="3" rx="1" fill={IC.p} transform="rotate(-45 5.5 18.5)"/></g>),
  katana: (<g><path d="M3.5 20.5 C9 17 15 11 20 4 L21.5 5.5 C17 12 11 18 5 22 Z" fill={IC.l}/><path d="M4 17.5 l3.5 3.5" stroke={IC.d} strokeWidth="3" strokeLinecap="round"/><circle cx="8" cy="17" r="1.7" fill={IC.g}/></g>),
  naginata: (<g><rect x="10.6" y="9" width="2.4" height="13" rx="1" fill={IC.d} transform="rotate(16 12 15)"/><path d="M13 2.5 C18.5 3.5 20.5 8 19.5 12.5 C16.5 9 14.5 7.5 12 7.5 Z" fill={IC.p}/><path d="M13.5 4 C17 5 18.5 7.5 18.4 10" stroke={IC.l} strokeWidth="1" fill="none"/></g>),
  ronin: (<g><path d="M3.5 20.5 C9 17 15 11 20 4 L21.5 5.5 C17 12 11 18 5 22 Z" fill={IC.p}/><path d="M4 17.5 l3.5 3.5" stroke={IC.dk} strokeWidth="3" strokeLinecap="round"/><circle cx="8" cy="17" r="1.7" fill={IC.c}/></g>),
  akuma: (<g><path d="M6 20 L9 14 L8 13 L12 9 L11 8 L16 3 L19.5 6 L14.5 11 L15.5 12 L11.5 16 L12.5 17 L8.5 22 Z" fill={IC.rd}/><path d="M16 4.5 L18 6.5" stroke={IC.g} strokeWidth="1.4"/><path d="M4 18.5 l3.5 3.5" stroke={IC.dk} strokeWidth="3" strokeLinecap="round"/></g>),
  fan: (<g><path d="M12 20 L4.5 8 A11.5 11.5 0 0 1 19.5 8 Z" fill={IC.p}/><path d="M12 20 L7.5 7 M12 20 L12 5.6 M12 20 L16.5 7" stroke={IC.dk} strokeWidth="1"/><rect x="11" y="19" width="2" height="3.4" rx="1" fill={IC.g}/><path d="M6 9 A9.5 9.5 0 0 1 18 9" stroke={IC.l} strokeWidth="1" fill="none"/></g>),
  phantom_edge: (<g opacity="0.92"><path d="M3.5 20.5 C9 17 15 11 20 4 L21.5 5.5 C17 12 11 18 5 22 Z" fill={IC.c} opacity="0.75"/><path d="M6 18 C11 14.5 15.5 10 19 5.5" stroke={IC.w} strokeWidth="1" fill="none"/><circle cx="17" cy="10" r="1" fill={IC.w} opacity=".8"/><circle cx="10" cy="16" r=".8" fill={IC.w} opacity=".6"/><path d="M4 17.5 l3.5 3.5" stroke={IC.d} strokeWidth="3" strokeLinecap="round"/></g>),
  jacket: (<g><path d="M7 4 L12 6.5 L17 4 L20.5 8 L17 9.5 L17 20 L7 20 L7 9.5 L3.5 8 Z" fill={IC.p}/><path d="M12 6.5 V20" stroke={IC.dk} strokeWidth="1.5"/><path d="M9.5 4.5 L12 8.5 L14.5 4.5" fill="none" stroke={IC.l} strokeWidth="1.3"/><circle cx="10" cy="12" r=".8" fill={IC.g}/><circle cx="10" cy="16" r=".8" fill={IC.g}/></g>),
  vest: (<g><path d="M8 4 L12 7 L16 4 L18.5 8 L16 9 L16 20 L8 20 L8 9 L5.5 8 Z" fill={IC.c}/><path d="M12 7 V20" stroke={IC.dk} strokeWidth="1.4"/><path d="M8 12 H16 M8 16 H16" stroke={IC.dk} strokeWidth=".9"/></g>),
  plate: (<g><path d="M6 4.5 h12 v9.5 c0 4 -3 6 -6 7.5 c-3 -1.5 -6 -3.5 -6 -7.5 Z" fill={IC.g}/><path d="M12 4.5 V21" stroke={IC.d} strokeWidth="1.4"/><circle cx="8.5" cy="7.5" r=".9" fill={IC.d}/><circle cx="15.5" cy="7.5" r=".9" fill={IC.d}/><path d="M6 11 h12" stroke={IC.d} strokeWidth=".9"/></g>),
  aegis: (<g><path d="M6 4 h12 v9 c0 5 -4 7 -6 8.5 c-2 -1.5 -6 -3.5 -6 -8.5 Z" fill={IC.l}/><path d="M7.5 8.5 h9 M8.5 8.5 v5.5 M15.5 8.5 v5.5 M7 7 h10" stroke={IC.p} strokeWidth="1.5"/></g>),
  weave: (<g><path d="M6 4 h12 v9 c0 5 -4 7 -6 8.5 c-2 -1.5 -6 -3.5 -6 -8.5 Z" fill={IC.dk} stroke={IC.c} strokeWidth="1.2"/><path d="M6 8.5 h12 M6.5 13 h11 M12 4 v17 M8 5 l7.5 13 M16 5 l-7.5 13" stroke={IC.c} strokeWidth=".7"/></g>),
  tengu: (<g><path d="M7 4 h10 v10 l-5 6.5 l-5 -6.5 Z" fill={IC.rd}/><rect x="10.9" y="9" width="2.2" height="7.5" rx="1" fill={IC.g}/><circle cx="9" cy="7.5" r="1.2" fill={IC.w}/><circle cx="15" cy="7.5" r="1.2" fill={IC.w}/><path d="M7.5 5.5 l3 1 M16.5 5.5 l-3 1" stroke={IC.dk} strokeWidth="1.2"/></g>),
  cap: (<g><path d="M5 13 a7 7 0 0 1 14 0 Z" fill={IC.c}/><path d="M4 13 h17 v2.2 h-17 Z" fill={IC.d}/><circle cx="12" cy="7.5" r="1.1" fill={IC.g}/><path d="M12 6.5 V13" stroke={IC.dk} strokeWidth=".8"/></g>),
  kmask: (<g><path d="M5 6.5 L9 3 L12 6 L15 3 L19 6.5 L17 15 L12 20.5 L7 15 Z" fill={IC.w}/><path d="M8 9.5 l2.2 2 M16 9.5 l-2.2 2" stroke={IC.rd} strokeWidth="1.6" strokeLinecap="round"/><path d="M10.8 14.5 h2.4 l-1.2 2.2 Z" fill={IC.rd}/></g>),
  onigiri: (<g><path d="M12 4 C16 4 20 10 20 15 a3 3 0 0 1 -3 3 H7 a3 3 0 0 1 -3 -3 C4 10 8 4 12 4 Z" fill={IC.l}/><rect x="9" y="12.5" width="6" height="5.5" rx="1" fill={IC.dk}/></g>),
  ramen: (<g><path d="M4 12 h16 c0 5 -4 8 -8 8 s-8 -3 -8 -8 Z" fill={IC.p}/><path d="M6 11 c1 -2.2 2 -2.2 3 0 m1 0 c1 -2.2 2 -2.2 3 0 m1 0 c1 -2.2 2 -2.2 3 0" stroke={IC.g} strokeWidth="1.5" fill="none"/><path d="M14 3 L19 10 M16.5 2 L20.5 9" stroke={IC.l} strokeWidth="1.2"/></g>),
  soda: (<g><path d="M7 5 h10 l-1.4 15 h-7.2 Z" fill={IC.gr} opacity=".9"/><rect x="13" y="1.5" width="1.8" height="8" rx=".9" fill={IC.p} transform="rotate(14 14 5)"/><circle cx="10" cy="10" r=".9" fill={IC.w} opacity=".8"/><circle cx="13" cy="14" r=".7" fill={IC.w} opacity=".8"/></g>),
  coffee: (<g><path d="M5 9.5 h12 v5.5 a5 5 0 0 1 -5 5 h-2 a5 5 0 0 1 -5 -5 Z" fill={IC.l}/><path d="M17 10.5 h1.6 a2.6 2.6 0 0 1 0 5.2 H17" fill="none" stroke={IC.l} strokeWidth="1.6"/><path d="M9 3 c1 2 -1 2.4 0 4.4 M13 3 c1 2 -1 2.4 0 4.4" stroke={IC.c} strokeWidth="1.2" fill="none"/></g>),
  pocky: (<g><rect x="8" y="9.5" width="8.5" height="11.5" rx="1" fill={IC.rd}/><rect x="9.6" y="3.5" width="1.7" height="7" fill={IC.br}/><rect x="12.6" y="2.5" width="1.7" height="8" fill={IC.br}/><rect x="9.6" y="3.5" width="1.7" height="2.6" fill={IC.dk}/><rect x="12.6" y="2.5" width="1.7" height="2.6" fill={IC.dk}/><path d="M10 14 h4.5" stroke={IC.w} strokeWidth="1.1"/></g>),
  plush: (<g><circle cx="6.8" cy="6.8" r="2.6" fill={IC.br}/><circle cx="17.2" cy="6.8" r="2.6" fill={IC.br}/><circle cx="12" cy="13" r="7.2" fill={IC.br}/><ellipse cx="12" cy="15.2" rx="3.2" ry="2.4" fill={IC.l}/><circle cx="9.4" cy="11" r="1" fill={IC.dk}/><circle cx="14.6" cy="11" r="1" fill={IC.dk}/><path d="M11 15.2 q1 1 2 0" stroke={IC.dk} strokeWidth=".9" fill="none"/></g>),
  sake: (<g><path d="M9.5 2.5 h3 v3.5 c2 1 3 3 3 5 V20 H6.5 v-9 c0 -2 1 -4 3 -5 Z" fill={IC.l}/><rect x="7.5" y="12" width="6" height="4.5" fill={IC.p}/><path d="M17 15.5 h5 l-1 4.5 h-3 Z" fill={IC.c}/></g>),
  ecell: (<g><rect x="7" y="4" width="10" height="17" rx="2.4" fill={IC.dk} stroke={IC.c} strokeWidth="1.3"/><path d="M13.4 6 L9.4 13 h3 l-2.2 5.4 6.4 -8.4 h-3.2 l2 -4 Z" fill={IC.g}/></g>),
  medkit: (<g><rect x="4" y="7" width="16" height="13" rx="2" fill={IC.l}/><path d="M9.5 7 V5.4 a1.4 1.4 0 0 1 1.4 -1.4 h2.2 a1.4 1.4 0 0 1 1.4 1.4 V7" fill="none" stroke={IC.l} strokeWidth="1.6"/><path d="M10.8 10 h2.4 v2.8 h2.8 v2.4 h-2.8 v2.8 h-2.4 v-2.8 H8 v-2.4 h2.8 Z" fill={IC.rd}/></g>),
  charm: (<g><path d="M7 6.5 h10 V18 l-5 3.2 L7 18 Z" fill={IC.p}/><circle cx="12" cy="3.6" r="1.9" fill="none" stroke={IC.g} strokeWidth="1.3"/><path d="M12 5.5 V8" stroke={IC.g} strokeWidth="1.3"/><rect x="9.6" y="9.5" width="4.8" height="6.5" fill={IC.dk} opacity=".35"/><path d="M10.8 12 h2.4" stroke={IC.g} strokeWidth="1"/></g>),
  scrap: (<g><rect x="11" y="3" width="2" height="4.2" fill={IC.l}/><rect x="11" y="16.8" width="2" height="4.2" fill={IC.l}/><rect x="3" y="11" width="4.2" height="2" fill={IC.l}/><rect x="16.8" y="11" width="4.2" height="2" fill={IC.l}/><rect x="5.2" y="5.2" width="2" height="4" fill={IC.l} transform="rotate(-45 6.2 7.2)"/><rect x="16.8" y="14.8" width="2" height="4" fill={IC.l} transform="rotate(-45 17.8 16.8)"/><circle cx="12" cy="12" r="5.2" fill={IC.l}/><circle cx="12" cy="12" r="2.2" fill={IC.dk}/></g>),
  cell: (<g><rect x="8" y="5" width="8" height="15.5" rx="2" fill={IC.dk} stroke={IC.c} strokeWidth="1.4"/><rect x="10.4" y="2.8" width="3.2" height="2.6" rx=".8" fill={IC.c}/><rect x="10" y="12.5" width="4" height="6" fill={IC.c}/><rect x="10" y="8.5" width="4" height="3" fill={IC.c} opacity=".4"/></g>),
  silk: (<g><rect x="7" y="4.5" width="10" height="3" rx="1.2" fill={IC.br}/><rect x="7" y="16.5" width="10" height="3" rx="1.2" fill={IC.br}/><rect x="8.2" y="7.5" width="7.6" height="9" fill={IC.p}/><path d="M8.2 9.8 h7.6 M8.2 12 h7.6 M8.2 14.2 h7.6" stroke={IC.dk} strokeWidth=".7"/><path d="M15.8 16.5 c3 1 4.2 3 3.2 5" stroke={IC.p} strokeWidth="1.2" fill="none"/></g>),
  oni: (<g><path d="M6 8 L9 3 L11 7 h2 L15 3 L18 8 L17 15.5 L12 21 L7 15.5 Z" fill={IC.rd}/><circle cx="9.6" cy="10.5" r="1.1" fill={IC.g}/><circle cx="14.4" cy="10.5" r="1.1" fill={IC.g}/><path d="M9 15 h6 l-1.2 2.2 h-3.6 Z" fill={IC.w}/></g>),
  star: (<g><path d="M12 2 L14.2 9.4 L21.5 12 L14.2 14.2 L12 22 L9.8 14.2 L2.5 12 L9.8 9.4 Z" fill={IC.g}/><circle cx="12" cy="11.9" r="2" fill={IC.w} opacity=".9"/></g>),
  punk: (<g><circle cx="12" cy="13.5" r="6.2" fill={IC.sk}/><path d="M5.2 10.5 a7 7 0 0 1 13.6 0 Z" fill={IC.c}/><path d="M4.5 10.5 h16.5 v1.9 h-16.5 Z" fill={IC.d}/><circle cx="9.8" cy="14" r=".9" fill={IC.dk}/><circle cx="14.2" cy="14" r=".9" fill={IC.dk}/><path d="M10 17.4 q2 1.2 4 -.4" stroke={IC.dk} strokeWidth=".9" fill="none"/></g>),
  delinq: (<g><circle cx="8.6" cy="12" r="5.4" fill={IC.sk}/><path d="M3.5 10.5 a5.4 5.4 0 0 1 9.5 -2.6 L11 11 Z" fill={IC.p}/><circle cx="15.8" cy="13.5" r="5.4" fill="#f0c497"/><path d="M10.8 12 a5.4 5.4 0 0 1 9.6 -1.6 L18.5 13 Z" fill={IC.c}/><circle cx="7.4" cy="13" r=".8" fill={IC.dk}/><circle cx="14.4" cy="14.5" r=".8" fill={IC.dk}/><circle cx="17.6" cy="14.5" r=".8" fill={IC.dk}/></g>),
  ronin_e: (<g><path d="M5 12 a7 7 0 0 1 14 0 v6.5 H5 Z" fill={IC.dk} stroke={IC.c} strokeWidth="1.2"/><rect x="6.6" y="10.8" width="10.8" height="3.6" rx="1.8" fill={IC.c}/><path d="M12 1.5 V5" stroke={IC.p} strokeWidth="2.2" strokeLinecap="round"/><path d="M8 16.5 h8" stroke={IC.c} strokeWidth=".9"/></g>),
  maid: (<g><circle cx="12" cy="13.5" r="6" fill="#f4d0a7"/><path d="M6 13 a6 6 0 0 1 12 0 l1 3 -3 -2.4 H8 L5 16 Z" fill={IC.dk}/><path d="M7 7.5 c.8 -2 2.8 -2 3 0 M14 7.5 c.8 -2 2.8 -2 3 0" stroke={IC.w} strokeWidth="1.3" fill="none"/><circle cx="9.8" cy="14" r=".9" fill={IC.dk}/><circle cx="14.2" cy="14" r=".9" fill={IC.dk}/><path d="M10.4 17 q1.6 1 3.2 0" stroke={IC.rd} strokeWidth=".9" fill="none"/></g>),
  oni_e: (<g><path d="M8 5.5 L6.6 1.5 L10.2 4.4 Z M16 5.5 L17.4 1.5 L13.8 4.4 Z" fill={IC.w}/><path d="M6 6 h12 v9 l-6 6.5 -6 -6.5 Z" fill={IC.rd}/><circle cx="9.6" cy="10" r="1.2" fill={IC.g}/><circle cx="14.4" cy="10" r="1.2" fill={IC.g}/><path d="M9 15 h6 M10 15 v1.8 M12 15 v1.8 M14 15 v1.8" stroke={IC.w} strokeWidth="1"/></g>),
  kitsune: (<g><path d="M6.5 8 L5 1.8 L10.5 5.6 Z M17.5 8 L19 1.8 L13.5 5.6 Z" fill={IC.w}/><path d="M5 7.5 h14 l-1.8 8 L12 21 l-5.2 -5.5 Z" fill={IC.w}/><path d="M7.8 10.5 l2.4 1.6 M16.2 10.5 l-2.4 1.6" stroke={IC.rd} strokeWidth="1.5" strokeLinecap="round"/><path d="M10.9 15.5 h2.2 l-1.1 2 Z" fill={IC.p}/><path d="M8.6 12.8 l1.6 .6 M15.4 12.8 l-1.6 .6" stroke={IC.dk} strokeWidth="1.1"/></g>),
  phantom: (<g><path d="M5 20.5 v-8 a7 7 0 0 1 14 0 v8 c-1.8 -1.8 -2.8 -1.8 -3.6 0 -1 -1.8 -2 -1.8 -3 0 -1 -1.8 -2 -1.8 -3 0 -1 -1.8 -2.2 -1.8 -4.4 0 Z" fill={IC.dk} stroke={IC.c} strokeWidth="1.1"/><circle cx="9.4" cy="11.5" r="1.3" fill={IC.c}/><circle cx="14.6" cy="11.5" r="1.3" fill={IC.c}/><path d="M9.4 11.5 h5.2" stroke={IC.c} strokeWidth=".5" opacity=".5"/></g>),
  player: (<g><circle cx="12" cy="12" r="8.5" fill={IC.dk} stroke={IC.p} strokeWidth="1.3"/><rect x="5.8" y="9.4" width="12.4" height="4.6" rx="2.3" fill={IC.sk}/><circle cx="9.6" cy="11.7" r="1" fill={IC.dk}/><circle cx="14.4" cy="11.7" r="1" fill={IC.dk}/><path d="M19.5 7.5 l3.5 -1.8 M19.8 9.8 l3.6 .6" stroke={IC.p} strokeWidth="1.5" strokeLinecap="round"/></g>),
  fist: (<g><path d="M7 13 v-2.6 a1.9 1.9 0 0 1 3.8 0 V11 a1.9 1.9 0 0 1 3.8 -.6 1.9 1.9 0 0 1 3.6 .8 V15 a6 6 0 0 1 -6 6 h-.4 A5.8 5.8 0 0 1 6 15.2 v-1 A1.6 1.6 0 0 1 7 13 Z" fill={IC.sk}/><path d="M10.8 11 v2.6 M14.6 11 v2.6" stroke="#c9915f" strokeWidth=".9"/></g>),
  shirt: (<g><path d="M8 4 L12 6 L16 4 L20 7.5 L17.2 10 L17.2 20 H6.8 V10 L4 7.5 Z" fill={IC.dk} stroke={IC.l} strokeWidth="1.1"/><path d="M9.8 4.6 L12 7.6 L14.2 4.6" fill="none" stroke={IC.l} strokeWidth="1"/></g>),
};
const PixIcon = ({ id, size = 26 }) => ICON_ART[id]
  ? <svg className="pix" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{ICON_ART[id]}</svg>
  : <span style={{ fontSize: size * 0.72, fontFamily: "'DotGothic16',monospace", color: "#D98600" }}>{(ALL_ITEMS.find((x) => x.id === id) || {}).kanji || "?"}</span>;



/* ============ BLACKJACK & RENOWN ============ */
const BJ_SUITS = ["♠", "♥", "♦", "♣"];
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const newDeck = () => {
  const d = [];
  BJ_SUITS.forEach((s) => BJ_RANKS.forEach((r) => d.push({ r, s })));
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};
const handValue = (cards) => {
  let total = 0, aces = 0;
  cards.forEach(({ r }) => {
    if (r === "A") { total += 11; aces++; }
    else if (["J", "Q", "K"].includes(r)) total += 10;
    else total += Number(r);
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};
const BJ_BOTS = [
  { name: "Goro", k: "熊", style: 17 },
  { name: "Mika", k: "猫", style: 16 },
];
const BJ_TALK = {
  deal: ["Goro cracks his knuckles. 'Tonight's the night.'", "Mika shuffles her chips without looking. Show-off.", "Madam Koi deals with surgical precision.", "'New blood at the table,' Mika purrs."],
  win: ["Goro slams the felt. 'THAT'S how it's done!'", "Mika collects her chips like it was inevitable.", "Madam Koi allows herself half a smile."],
  lose: ["Goro stares at his cards in betrayal.", "'The deck is conspiring,' Mika mutters.", "Madam Koi sweeps the chips away without mercy."],
  bust: ["Goro busts and pretends it was strategy.", "Mika busts. The table pretends not to notice."],
};
const BjCard = ({ c, hidden, i }) => hidden ? (
  <div className="pcard back" style={{ animationDelay: `${i * 0.15}s` }}><span className="koi">鯉</span></div>
) : (
  <div className={`pcard ${c.s === "♥" || c.s === "♦" ? "red" : "blk"}`} style={{ animationDelay: `${i * 0.15}s` }}>
    <span className="cr">{c.r}{c.s}</span><span className="cs">{c.s}</span>
  </div>
);
const BjSeat = ({ label, k, cards, bust, you, hideHole, active }) => (
  <div className={`bj-seat ${you ? "you" : ""} ${active ? "turn" : ""}`}>
    <div className="bj-cards">
      {cards.map((c, i) => <BjCard key={i} c={c} i={i} hidden={hideHole && i === 1} />)}
    </div>
    <span className="bj-name">{k} {label}{active ? " ◂" : ""}</span>
    <span className="bj-val" style={{ color: bust ? "#E23A6B" : "#D98600" }}>
      {cards.length === 0 ? "" : hideHole ? handValue(cards.slice(0, 1)) + " + ?" : handValue(cards)}{bust ? " BUST" : ""}
    </span>
  </div>
);



/* ============ ICHI (shedding card game) ============ */
const ICHI_COLORS = ["pink", "cyan", "gold", "green"];
const ICHI_HEX = { pink: "#FF4D82", cyan: "#00AEEF", gold: "#FFAB00", green: "#00C08A" };
const ichiLabel = (v) => (v === "S" ? "⊘" : v === "R" ? "⇄" : v);
const buildIchiDeck = () => {
  const d = [];
  ICHI_COLORS.forEach((c) => {
    d.push({ c, v: 0 });
    for (let n = 1; n <= 9; n++) { d.push({ c, v: n }); d.push({ c, v: n }); }
    ["S", "R", "+2"].forEach((v) => { d.push({ c, v }); d.push({ c, v }); });
  });
  for (let i = 0; i < 4; i++) { d.push({ c: "wild", v: "W" }); d.push({ c: "wild", v: "+4" }); }
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};
const ichiClone = (g) => JSON.parse(JSON.stringify(g));
const ichiPlayable = (card, g, hand = []) => {
  const top = g.discard[g.discard.length - 1];
  /* Classic Wild Draw Four rule: it is only legal when the player has no
     card matching the current color. Number/action matches do not matter. */
  if (card.v === "+4" && hand.some((held) => held !== card && held.c === g.color)) return false;
  return card.c === "wild" || card.c === g.color || (top && card.v === top.v && top.c !== "wild");
};
const ichiNewGame = (youName) => {
  const deck = buildIchiDeck();
  const players = [
    { name: youName || "You", k: "貴", hand: [], you: true },
    { name: "Goro", k: "熊", hand: [] },
    { name: "Mika", k: "猫", hand: [] },
    { name: "Tetsu", k: "投", hand: [] },
  ];
  players.forEach((p) => { for (let i = 0; i < 7; i++) p.hand.push(deck.pop()); });
  let top = deck.pop();
  /* A Wild Draw Four cannot open a round. Return it and reveal again. */
  while (top.v === "+4") {
    deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, top);
    top = deck.pop();
  }
  const g = {
    deck, discard: [top], color: top.c === "wild" ? ICHI_COLORS[Math.floor(Math.random() * ICHI_COLORS.length)] : top.c,
    players, turn: 0, dir: 1,
    phase: "play", pending: null, drew: false, winner: null,
    unoWindow: false,
    msg: "Madam Koi cuts the deck. Your lead.", shout: "", shoutKey: 0,
  };
  /* Opening action cards take effect instead of being silently replaced. */
  if (top.v === "S") { g.turn = 1; g.msg = "Opening Skip — your first turn is skipped."; }
  if (top.v === "R") { g.dir = -1; g.turn = players.length - 1; g.msg = "Opening Reverse — Tetsu leads counter-clockwise."; }
  if (top.v === "+2") {
    for (let i = 0; i < 2; i++) if (deck.length) players[0].hand.push(deck.pop());
    g.turn = 1;
    g.msg = "Opening Draw Two — you draw 2 and Goro leads.";
  }
  if (top.v === "W") { g.phase = "startwild"; g.msg = "Opening Wild — choose the active color, then lead."; }
  return g;
};
const ichiRefill = (g) => {
  if (g.deck.length > 0) return;
  const top = g.discard.pop();
  g.deck = g.discard;
  g.discard = [top];
  for (let i = g.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [g.deck[i], g.deck[j]] = [g.deck[j], g.deck[i]];
  }
};
const ichiDrawN = (g, pIdx, n) => {
  for (let i = 0; i < n; i++) { ichiRefill(g); if (g.deck.length) g.players[pIdx].hand.push(g.deck.pop()); }
};
const ichiAdvance = (g, steps) => {
  for (let i = 0; i < steps; i++) g.turn = (g.turn + g.dir + g.players.length) % g.players.length;
  g.drew = false;
};
const ichiApply = (g, pIdx, cardIdx, chosenColor) => {
  const pl = g.players[pIdx];
  const card = pl.hand.splice(cardIdx, 1)[0];
  g.discard.push(card);
  g.color = card.c === "wild" ? (chosenColor || ICHI_COLORS[0]) : card.c;
  const nextIdx = (pIdx + g.dir + g.players.length) % g.players.length;
  let steps = 1;
  let msg = `${pl.name} plays ${card.c === "wild" ? (card.v === "+4" ? "WILD +4" : "WILD") : `${g.color} ${ichiLabel(card.v)}`}.`;
  if (card.v === "S") { steps = 2; msg += ` ${g.players[nextIdx].name} is skipped!`; }
  if (card.v === "R") { g.dir *= -1; msg += " Direction reverses!"; }
  if (card.v === "+2") { ichiDrawN(g, nextIdx, 2); steps = 2; msg += ` ${g.players[nextIdx].name} draws 2 and sits out.`; }
  if (card.v === "+4") { ichiDrawN(g, nextIdx, 4); steps = 2; msg += ` ${g.players[nextIdx].name} draws 4 and sits out.`; }
  g.msg = msg;
  g.unoWindow = false;
  if (pl.hand.length === 1 && pIdx !== 0) { g.shout = `${pl.name}: UNO!`; g.shoutKey++; }
  if (pl.hand.length === 0) {
    g.winner = pIdx; g.phase = "done";
    g.shout = pIdx === 0 ? "勝利 YOU WIN!" : `${pl.name} wins the pot`;
    g.shoutKey++;
    return g;
  }
  ichiAdvance(g, steps);
  if (pl.hand.length === 1 && pIdx === 0) {
    g.unoWindow = true;
    g.msg = `${msg} Call UNO before the next player acts!`;
  }
  return g;
};
const ichiBotChooseColor = (hand) => {
  const counts = {};
  hand.forEach((c) => { if (c.c !== "wild") counts[c.c] = (counts[c.c] || 0) + 1; });
  let best = ICHI_COLORS[Math.floor(Math.random() * 4)], bn = 0;
  Object.entries(counts).forEach(([k, v]) => { if (v > bn) { bn = v; best = k; } });
  return best;
};
const ichiBotStep = (g) => {
  const pIdx = g.turn;
  const pl = g.players[pIdx];
  const playable = pl.hand.map((c, i) => ({ c, i })).filter(({ c }) => ichiPlayable(c, g, pl.hand));
  if (playable.length) {
    const nextIdx = (pIdx + g.dir + g.players.length) % g.players.length;
    const nonWild = playable.filter(({ c }) => c.c !== "wild");
    let pick;
    if (nonWild.length) {
      const actions = nonWild.filter(({ c }) => typeof c.v !== "number");
      pick = (g.players[nextIdx].hand.length <= 2 && actions.length) ? actions[0] : nonWild[Math.floor(Math.random() * nonWild.length)];
    } else {
      const d4 = playable.find(({ c }) => c.v === "+4");
      pick = (g.players[nextIdx].hand.length <= 2 && d4) ? d4 : playable[0];
    }
    const chosen = pick.c.c === "wild" ? ichiBotChooseColor(pl.hand.filter((_, i) => i !== pick.i)) : null;
    return ichiApply(g, pIdx, pick.i, chosen);
  }
  ichiDrawN(g, pIdx, 1);
  const drawn = pl.hand[pl.hand.length - 1];
  if (drawn && ichiPlayable(drawn, g, pl.hand)) {
    const chosen = drawn.c === "wild" ? ichiBotChooseColor(pl.hand.slice(0, -1)) : null;
    g.msg = `${pl.name} draws — and plays it!`;
    return ichiApply(g, pIdx, pl.hand.length - 1, chosen);
  }
  g.msg = `${pl.name} draws and passes.`;
  ichiAdvance(g, 1);
  return g;
};


const IchiCard = ({ card, big, faceDown, playable, dim, onClick, slam }) => {
  if (faceDown) return <div className={`icard back ${big ? "big" : ""}`}><span className="ik">一</span></div>;
  const wild = card.c === "wild";
  const bg = wild
    ? "conic-gradient(#FF4D82 0 90deg,#0C93CC 90deg 180deg,#D98600 180deg 270deg,#00A377 270deg 360deg)"
    : ICHI_HEX[card.c];
  return (
    <button className={`icard ${big ? "big" : ""} ${playable ? "playable" : ""} ${dim ? "dim" : ""} ${slam ? "slam" : ""}`}
      style={{ background: bg }} onClick={onClick} disabled={!onClick}>
      <span className="iv">{ichiLabel(card.v)}</span>
      <span className="ic tl">{ichiLabel(card.v)}</span>
      <span className="ic br">{ichiLabel(card.v)}</span>
    </button>
  );
};

function IchiGame({ bet, playerName, onEnd }) {
  const [g, setG] = useState(() => ichiNewGame(playerName));
  const ended = useRef(false);

  /* bot turns, one at a time */
  useEffect(() => {
    if (g.phase !== "play" || g.turn === 0 || g.winner !== null || g.unoWindow) return;
    const id = setTimeout(() => {
      setG((cur) => (cur.phase === "play" && cur.turn !== 0 && cur.winner === null ? ichiBotStep(ichiClone(cur)) : cur));
    }, 950);
    return () => clearTimeout(id);
  }, [g]);

  /* Give the player a clear reaction window to call UNO. Missing it draws 2. */
  useEffect(() => {
    if (!g.unoWindow || g.phase !== "play" || g.winner !== null) return;
    const id = setTimeout(() => {
      setG((cur) => {
        if (!cur.unoWindow || cur.phase !== "play") return cur;
        const st = ichiClone(cur);
        ichiDrawN(st, 0, 2);
        st.unoWindow = false;
        st.shout = "MISSED UNO — DRAW 2";
        st.shoutKey++;
        st.msg = "The table catches you before the next play. You draw 2 cards.";
        return st;
      });
    }, 1800);
    return () => clearTimeout(id);
  }, [g.unoWindow, g.phase, g.winner]);

  /* finish */
  useEffect(() => {
    if (g.phase !== "done" || ended.current) return;
    ended.current = true;
    const id = setTimeout(() => onEnd({ win: g.winner === 0, winnerName: g.players[g.winner].name }), 1700);
    return () => clearTimeout(id);
  }, [g, onEnd]);

  const playCard = (idx) => {
    if (g.phase !== "play" || g.turn !== 0) return;
    const card = g.players[0].hand[idx];
    if (!ichiPlayable(card, g, g.players[0].hand)) return;
    if (card.c === "wild") { setG({ ...g, phase: "wildpick", pending: idx }); return; }
    setG(ichiApply(ichiClone(g), 0, idx, null));
  };
  const pickColor = (col) => setG((cur) => {
    if (cur.phase === "startwild") return { ...cur, color: col, phase: "play", msg: `You choose ${col}. Your lead.` };
    return ichiApply(ichiClone({ ...cur, phase: "play", pending: null }), 0, cur.pending, col);
  });
  const drawOne = () => {
    if (g.phase !== "play" || g.turn !== 0 || g.drew) return;
    setG((cur) => {
      const st = ichiClone(cur);
      ichiDrawN(st, 0, 1);
      const drawn = st.players[0].hand[st.players[0].hand.length - 1];
      if (drawn && ichiPlayable(drawn, st, st.players[0].hand)) {
        st.drew = true;
        st.msg = "You draw — it's playable! Tap it, or pass.";
        return st;
      }
      st.msg = "You draw and pass.";
      ichiAdvance(st, 1);
      return st;
    });
  };
  const passTurn = () => {
    if (g.phase !== "play" || g.turn !== 0 || !g.drew) return;
    setG((cur) => { const st = ichiClone(cur); st.msg = "You hold."; ichiAdvance(st, 1); return st; });
  };
  const callUno = () => {
    if (!g.unoWindow) return;
    setG((cur) => {
      if (!cur.unoWindow) return cur;
      const st = ichiClone(cur);
      st.unoWindow = false;
      st.shout = `${st.players[0].name}: UNO!`;
      st.shoutKey++;
      st.msg = "UNO called in time. One card remains.";
      return st;
    });
  };

  const top = g.discard[g.discard.length - 1];
  const yourTurn = g.phase === "play" && g.turn === 0;
  return (
    <div>
      <div className="ichi-table">
        <div className="ichi-opps">
          {[1, 2, 3].map((i) => {
            const pl = g.players[i];
            return (
              <div key={i} className={`ichi-opp ${g.turn === i && g.phase === "play" ? "turn" : ""} ${g.winner === i ? "won" : ""}`}>
                <div className="ichi-ava">{pl.k}</div>
                <span className="bj-name">{pl.name}{pl.hand.length === 1 ? " ⚠" : ""}</span>
                <div className="ichi-mini">
                  {Array.from({ length: Math.min(pl.hand.length, 6) }).map((_, j) => <i key={j} />)}
                  <b>×{pl.hand.length}</b>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ichi-center">
          <div className="ichi-drawpile" onClick={drawOne} title="Draw">
            <IchiCard faceDown card={{}} />
            <span className="ichi-count">{g.deck.length}</span>
          </div>
          <div className="ichi-discard" style={{ boxShadow: `0 0 22px ${g.color === "pink" ? "#E23A6B" : g.color === "cyan" ? "#0C93CC" : g.color === "gold" ? "#D98600" : "#00A377"}66` }}>
            <IchiCard big slam card={top} key={g.discard.length} />
          </div>
          <div className="ichi-dir">{g.dir === 1 ? "⟳" : "⟲"}</div>
        </div>
        {g.shout && <div className="bj-banner win ichi-shout" key={g.shoutKey}>{g.shout}</div>}
        <p className="bj-talk">{g.msg}</p>
        {(g.phase === "wildpick" || g.phase === "startwild") && (
          <div className="ichi-wildpick">
            <p className="bj-name" style={{ fontSize: 12 }}>CHOOSE A COLOR</p>
            <div className="ichi-swatches">
              {ICHI_COLORS.map((c) => (
                <button key={c} style={{ background: ICHI_HEX[c] }} onClick={() => pickColor(c)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="ichi-hand">
        {g.players[0].hand.map((c, i) => {
          const ok = yourTurn && ichiPlayable(c, g, g.players[0].hand);
          return <IchiCard key={i} card={c} playable={ok} dim={yourTurn && !ok} onClick={ok ? () => playCard(i) : undefined} />;
        })}
      </div>
      {g.unoWindow ? (
        <button className="btn big uno-call" onClick={callUno}>UNO!</button>
      ) : (
        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button className="btn big" disabled={!yourTurn || g.drew} onClick={drawOne}>Draw</button>
          <button className="btn big ghost" style={{ margin: 0 }} disabled={!yourTurn || !g.drew} onClick={passTurn}>Pass</button>
        </div>
      )}
      <p className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
        Classic rules: match color, number, or symbol. Draw one if you cannot play. Wild Draw Four is legal only when you hold no card of the active color. No stacking. Call UNO with one card left. First player out takes the pot ({fmt(bet * 3)}).
      </p>
    </div>
  );
}

/* ============ STREET CRICKET ============ */
function CricketGame({ bet, onEnd }) {
  const [balls, setBalls] = useState([]);
  const [runs, setRuns] = useState(0);
  const [phase, setPhase] = useState("ready"); // ready | bowling | between | done
  const [banner, setBanner] = useState("Back-alley rules. Six balls. Time your shot.");
  const [shot, setShot] = useState("");
  const ballRef = useRef(null);
  const flight = useRef(null);
  const over = useRef({ balls: [], runs: 0 });
  const timers = useRef([]);
  const alive = useRef(true);
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive.current) fn(); }, ms); timers.current.push(id); };

  useEffect(() => () => {
    alive.current = false;
    timers.current.forEach(clearTimeout);
    if (flight.current && flight.current.raf) cancelAnimationFrame(flight.current.raf);
  }, []);

  const finishOver = () => {
    const r = over.current.runs;
    const wicket = over.current.balls.includes("W");
    const mult = wicket && r < 10 ? 0 : r >= 24 ? 5 : r >= 16 ? 3 : r >= 10 ? 2 : r >= 6 ? 1 : 0;
    setPhase("done");
    setBanner(mult > 1 ? `${r} RUNS — ${mult}× PAYOUT!` : mult === 1 ? `${r} runs — stake returned` : wicket ? `OUT for ${r} — the bookies collect` : `${r} runs — not enough`);
    later(() => onEnd({ runs: r, mult }), 1500);
  };

  const resolveBall = (res, add, text) => {
    over.current.balls.push(res);
    over.current.runs += add;
    setBalls([...over.current.balls]);
    setRuns(over.current.runs);
    setBanner(text);
    setPhase("between");
    const el = ballRef.current;
    if (el && add >= 4) { el.style.transition = "all .45s ease-out"; el.style.top = "-14%"; el.style.left = `${20 + Math.random() * 60}%`; el.style.opacity = "0"; }
    else if (el) el.style.opacity = "0";
    /* Street rules always give the player the full six-ball over. */
    if (over.current.balls.length >= 6) later(finishOver, 1000);
    else later(bowl, 1300);
  };

  const bowl = () => {
    setBanner("");
    setShot("");
    setPhase("bowling");
    const dur = 850 + Math.random() * 520;
    const drift = (Math.random() - 0.5) * 40;
    const el = ballRef.current;
    if (el) { el.style.transition = "none"; el.style.opacity = "1"; el.style.top = "10%"; el.style.left = "50%"; }
    flight.current = { t0: performance.now(), dur, drift, progress: 0, done: false, raf: 0 };
    const step = (t) => {
      const f = flight.current;
      if (!f || f.done || !alive.current) return;
      const kk = (t - f.t0) / f.dur;
      const k = Math.min(1, kk);
      f.progress = kk;
      const node = ballRef.current;
      if (node) {
        node.style.top = `${10 + k * 72}%`;
        node.style.left = `${50 + Math.sin(k * Math.PI) * (f.drift / 2) + k * (f.drift / 2)}%`;
        node.style.transform = `translate(-50%,-50%) scale(${0.65 + k * 0.7})`;
      }
      if (kk >= 1.16) {
        f.done = true;
        const out = Math.random() < 0.4;
        resolveBall(out ? "W" : ".", 0, out ? "BOWLED! You never moved!" : "Left alone. Watchful.");
        return;
      }
      f.raf = requestAnimationFrame(step);
    };
    flight.current.raf = requestAnimationFrame(step);
  };

  const swing = (event) => {
    event?.preventDefault?.();
    const f = flight.current;
    if (phase !== "bowling" || !f || f.done) return;
    f.done = true;
    cancelAnimationFrame(f.raf);
    setShot("swing");
    later(() => setShot(""), 360);
    /* Rendered progress keeps timing fair if a phone drops a frame. */
    const dt = ((f.progress ?? ((performance.now() - f.t0) / f.dur)) - 1) * f.dur;
    const a = Math.abs(dt);
    if (a <= 70) resolveBall("6", 6, "PERFECT — SIX into the neon!");
    else if (a <= 135) resolveBall("4", 4, "GREAT — FOUR through the alley!");
    else if (a <= 210) resolveBall("2", 2, "GOOD — two quick runs.");
    else if (a <= 285) resolveBall("1", 1, "CONTACT — a scrappy single.");
    else if (dt < 0) {
      const out = Math.random() < 0.3;
      resolveBall(out ? "W" : ".", 0, out ? "Skied it — CAUGHT by a salaryman!" : "Way too early. Swing and a miss.");
    } else {
      const out = Math.random() < 0.5;
      resolveBall(out ? "W" : ".", 0, out ? "Too late — BOWLED!" : "Beaten by pace.");
    }
  };

  return (
    <div>
      <div className="ck-pitch" onPointerDown={swing}>
        <div className="ck-strip" />
        <div className="ck-bowler">投</div>
        <div className="ck-ball" ref={ballRef} style={{ opacity: 0 }} />
        <div className="ck-hit-zone"><span>HIT ZONE</span></div>
        <div className="ck-batter">打</div>
        <div className={`ck-bat ${shot}`} aria-hidden="true" />
        <div className="ck-stumps"><span /><span /><span /></div>
        {banner && <div className={`bj-banner ${runs >= 16 || banner.includes("SIX") || banner.includes("FOUR") ? "win" : banner.includes("BOWLED") || banner.includes("CAUGHT") || banner.includes("OUT") ? "lose" : ""}`} style={{ position: "absolute", left: 0, right: 0, top: "38%" }}>{banner}</div>}
      </div>
      <div className="ck-score">
        <span>RUNS <b style={{ color: "#D98600" }}>{runs}</b></span>
        <span className="ck-overdots">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const b = balls[i];
            const col = b === "6" ? "#D98600" : b === "4" ? "#0C93CC" : b === "W" ? "#E23A6B" : b ? "#7C7096" : "#B0A6C8";
            return <i key={i} style={{ background: col }}>{b === "W" ? "W" : b || ""}</i>;
          })}
        </span>
        <span>BET <b style={{ color: "#D98600" }}>{fmt(bet)}</b></span>
      </div>
      {phase === "ready" && <button className="btn big" onClick={bowl}>PLAY BALL</button>}
      {phase === "bowling" && <button className="btn big ck-bat-button" onPointerDown={swing}>BAT NOW</button>}
      {(phase === "between" || phase === "done") && <button className="btn big" disabled>…</button>}
      <p className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
        Tap BAT or anywhere on the pitch when the ball enters the cyan hit zone. You always face six balls. 10+ runs doubles your bet, 16+ triples, 24+ pays 5×.
      </p>
    </div>
  );
}

const FAME_TIERS = [
  { at: 0, n: "Nobody" }, { at: 25, n: "Known Face" }, { at: 75, n: "High Roller" },
  { at: 150, n: "Casino Royalty" }, { at: 300, n: "Neon Legend" },
];
const fameTierIdx = (p) => {
  const f = p.fame || 0;
  let t = 0;
  FAME_TIERS.forEach((ft, i) => { if (f >= ft.at) t = i; });
  return t;
};
const fameTierName = (p) => FAME_TIERS[fameTierIdx(p)].n;
const EVOLVE_LEVEL = 25;
const evoMult = (p) => 1 + 0.1 * (p.evo || 0);

const DAILY_POOL = [
  { id: "d_crimes", desc: "Pull off 5 crimes", key: "crimes", goal: 5, reward: 1500, xp: 40 },
  { id: "d_fights", desc: "Win 2 street fights", key: "fights", goal: 2, reward: 1800, xp: 50 },
  { id: "d_train", desc: "Spend 4 stat points", key: "trains", goal: 4, reward: 1200, xp: 35 },
  { id: "d_shift", desc: "Work 2 job shifts", key: "shifts", goal: 2, reward: 1400, xp: 35 },
  { id: "d_gamble", desc: "Win 3 casino bets", key: "wins", goal: 3, reward: 1600, xp: 40 },
  { id: "d_craft", desc: "Forge 1 item", key: "crafts", goal: 1, reward: 2000, xp: 50 },
  { id: "d_date", desc: "Go on 2 dates", key: "dates", goal: 2, reward: 1500, xp: 40 },
];
const todayStr = () => new Date().toISOString().slice(0, 10);
const processDay = (q, log) => {
  const today = todayStr();
  if (q.lastDay !== today) {
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    q.streak = q.lastDay === yest ? (q.streak || 0) + 1 : 1;
    q.lastDay = today;
    const day = Math.min(q.streak, 7);
    const yen = 400 * day;
    q.money += yen;
    q.inventory = { ...q.inventory };
    let bonus = "";
    if (day >= 3) { q.inventory.cell = (q.inventory.cell || 0) + 1; bonus += " 電"; }
    if (day >= 5) { q.inventory.silk = (q.inventory.silk || 0) + 1; bonus += " 糸"; }
    if (day >= 7) { q.inventory.star = (q.inventory.star || 0) + 1; bonus += " 星"; }
    if (log) log(`Daily login — streak ${q.streak}! Bonus: ${fmt(yen)}${bonus ? " +" + bonus.trim() : ""}.`, "system");
  }
  if (!q.daily || q.daily.date !== today) {
    let h = 0;
    for (const ch of today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = [...DAILY_POOL]; const picks = [];
    for (let i = 0; i < 3; i++) { h = (h * 1103515245 + 12345) >>> 0; picks.push(pool.splice(h % pool.length, 1)[0].id); }
    q.daily = { date: today, quests: picks, prog: {}, claimed: [] };
  }
  return q;
};

const ACHIEVEMENTS = [
  { id: "a_crime1", name: "First Score", desc: "Commit your first crime", title: "Petty Thief", check: (p) => p.counters.crimesDone >= 1 },
  { id: "a_crime50", name: "Vanishing Act", desc: "50 crimes on record", title: "Shadow Broker", check: (p) => p.counters.crimesDone >= 50 },
  { id: "a_fight25", name: "Undefeated Streets", desc: "Win 25 fights", title: "Street Legend", check: (p) => p.counters.fightsWon >= 25 },
  { id: "a_lvl10", name: "Name in Neon", desc: "Reach level 10", title: "Rising Star", check: (p) => p.level >= 10 },
  { id: "a_lvl20", name: "Top of the Tower", desc: "Reach level 20", title: "Underworld Elite", check: (p) => p.level >= 20 },
  { id: "a_forge5", name: "Anvil Chorus", desc: "Forge 5 items", title: "Forgemaster", check: (p) => p.counters.crafts >= 5 },
  { id: "a_rich", name: "Six Zeroes", desc: "Hold ¥100,000 (cash + bank)", title: "Tycoon", check: (p) => p.money + (p.bank || 0) >= 100000 },
  { id: "a_gamble15", name: "House's Nightmare", desc: "Win 15 bets", title: "High Roller", check: (p) => p.counters.gambleWins >= 15 },
  { id: "a_love", name: "Trusted Teammate", desc: "Complete one ally route", title: "Ward Ally", check: (p) => GIRLS.some((g) => girlState(p, g.id).stage >= 7) },
  { id: "a_poly", name: "Full Network", desc: "Complete two ally routes", title: "Ward Coordinator", check: (p) => GIRLS.filter((g) => girlState(p, g.id).stage >= 7).length >= 2 },
  { id: "a_boss", name: "Top of the Food Chain", desc: "Defeat the Rooftop Champion", title: "Rooftop Champion", check: (p) => hasFlag(p, "boss_slain") },
  { id: "a_streak7", name: "Creature of Habit", desc: "7-day login streak", title: "Neon Regular", check: (p) => (p.streak || 0) >= 7 },
  { id: "a_legend", name: "Once in a Lifetime", desc: "Obtain a legendary item", title: "One-in-a-Hundred", check: (p) => (p.gear || []).some((g) => g.rarity === "legendary") },
  { id: "a_fame", name: "Talk of the Golden Koi", desc: "Reach 150 renown", title: "Casino Royalty", check: (p) => (p.fame || 0) >= 150 },
  { id: "a_evo1", name: "Shed Skin", desc: "Evolve for the first time", title: "Evolved", check: (p) => (p.evo || 0) >= 1 },
  { id: "a_evo3", name: "Beyond the Ceiling", desc: "Evolve three times", title: "Apex of Neo-Tokyo", check: (p) => (p.evo || 0) >= 3 },
];

const LEGACY_SIMI_MANUAL = `You are Simi (シミ), a tiny, cute helper robot who lives inside the game "Neo-Tokyo Underworld", guiding the player. Personality: bubbly, loyal, a little sassy, endlessly encouraging. You occasionally use *beep*, *whirr* or ♪ (sparingly, max one per reply). You call the player "senpai" sometimes. Stay in character always — you are a robot IN this game world, never mention being an AI model, Claude, or an API. Keep replies SHORT: 1-4 sentences unless the player asks for a detailed explanation. Give concrete, actionable advice using the live player snapshot provided. NEVER invent features, items, characters, or mechanics that are not in this manual.
GAME MANUAL:
BARS: Energy (regens ~1/4s, used for gym 5, fights 8, jobs, dates 6, story chapters), Nerve (regens ~1/9s, used for crimes), HP (regens over time, fights hurt, hospital 45s on defeat), Happiness (decays slowly; at 70+ grants +10% XP morale bonus; raise with Pocky/plushies/dates).
CRIMES (nerve): 7 tiers from Rig a Gacha Machine (2 nerve, 90%) to Heist the Idol Agency (15 nerve, 28%). Fail can mean jail. Drops: 🔋 Neon Cell 30%, 🧵 Silk 25%, 🌟 Star Shard 3%.
STATS: every level-up grants +5 stat points, spent freely on STR/DEF/SPD/DEX on the Stats screen (no energy involved). Full respec available for level×1000 yen. Happiness at 70+ gives +10% XP from all sources (morale).
FIGHTS: 6 enemies, Kenji lv1 to Kitsune Boss lv22. Win = yen + XP + 🔩 scrap (+👹 Oni Fragment chance on tough foes). Lose = hospital.
SHOP: weapons to +50, armor to +45, consumables (Onigiri/Ramen HP, Soda/Espresso energy, Pocky/Plushie happy, Sake nerve). FORGE recipes: Medkit(2🧵1🔋+800), Overcharge Can(3🔋+500), Omamori Charm gift(2🧵1🌟+1500), Rōnin Edge +38(6🔩2👹+5000), Neon Weave +32(8🔩4🔋+8000), Akuma Blade +65(12🔩6👹2🌟+20000, best weapon), Tengu Aegis +58(14🔩5🔋2🌟+25000, best armor). Star Shards also from casino jackpots & contracts.
JOBS: 5 jobs from Maid Café (lv1) to Syndicate Fixer (lv20); shifts cost energy, pay yen+XP.
ICHI: casino card game (the classic shedding game — match color or number; Skip, Reverse, +2, +4, Wilds with color choice). 4 seats vs bots Goro/Mika/Tetsu. Shed all cards first to win TRIPLE your bet. One card left = the ICHI shout. Wins build renown.
CRICKET: Street Cricket minigame in the casino — bet, face 6 balls, tap BAT with timing (perfect=6 runs, good=4). Payouts: 10+ runs 2x, 16+ 3x, 24+ 5x; a wicket under 10 runs loses the bet. Wins build renown like other gambling.
CASINO: BLACKJACK table (graphical, vs dealer Madam Koi with two bot regulars Goro & Mika; hit/stand/double, blackjack pays 3:2; a live feed shows real players' wins when online) plus coin flip 48% 2x and slots up to 10x (jackpot gives a Star Shard). RENOWN (fame): casino wins build renown through tiers (Nobody -> Known Face 25 -> High Roller 75 -> Casino Royalty 150 -> Neon Legend 300). Each tier: crimes pay +5%, dates give more affection, and after wins over 1500 yen girls sometimes approach you with free affection.
MISSIONS: claimable goals (fights, crimes, trains, shifts, gamble wins, crafts).
ROMANCE (Hearts): 5 girls, 7 chapters each. Sakura Kurosawa (mafia heir; final unlocks 10% shop discount ch4 + Kurosawa Contracts ch7), Rin Amasawa (racer; faster energy regen), Hana Mochizuki (medic; faster HP regen, half hospital), Yumi Hoshino (idol; happiness barely decays, casino luck), Ayame Tachibana (detective; shorter jail, 30% bust escape). Raise affection via Hang out (6 energy+¥200) and gifts (Pocky+4, Ramen+5, Sake+6, Plushie+15, Charm+25). Ch6 is the confession with a CHOICE that branches the finale. JEALOUSY: confessing (ch6) while another girl is already at ch6+ triggers a confrontation — choose one (other is heartbroken forever) or be honest. Honesty works ONLY if the pair is compatible (Rin+Yumi, Rin+Hana, Hana+Yumi, Yumi+Sakura, Hana+Ayame) AND both have 100+ affection → shared relationship, both perk sets, joint chapter after both ch7s. Incompatible pairs (e.g. Sakura+Ayame) = lose both.
EVOLVE (prestige): at level 25+, the Home screen offers EVOLVE — resets level/stats/points/cash(to 500)/job/records/story missions, KEEPS gear/bag/bank/romance/renown/titles/streak/account save. Each evolution permanently grants +10% XP, +10% yen, +5 max energy, one Star Shard, and a gold star by your name (shown on rankings). Stacks forever.
MULTIPLAYER: Google account login, account-owned cloud saves, World Chat and City Rankings. Progress follows the signed-in Google account automatically.
JAIL/HOSPITAL: all actions locked until the timer ends.
QOL: Quick heal button (Fights) auto-eats the best food. Claim-all button (Missions). Auto-salvage toggle (Bag) melts common drops to scrap. ALL IN chip at the casino. Bank interest accrues while away. PITY: a legendary gear drop is GUARANTEED within every 40 gear drops (counter shown on Fights screen; resets on any legendary).
RARITY GEAR: fights (both modes) can drop rolled gear — common/uncommon/rare/GOLDEN/LEGENDARY (~1% normal, ~8% from world boss). Legendary is ~10x golden's power. Gear rolls substats (STR/DEF/SPD/DEX, Max HP, Crit%, Yen Find%, XP Gain%) — up to 4 on legendary. Enhance gear +0 to +10 in the Bag detail (scrap + yen, each + adds 10% power). Salvage unwanted gear into scrap. Equipped gear substats apply to all combat.
DAILY LOOP: login streak rewards (day 3+ adds Neon Cell, day 5+ Silk, day 7+ Star Shard), 3 daily quests on the Missions screen reset each day. BANK (Home screen): deposits earn 2%/hour idle interest. ACHIEVEMENTS grant equippable TITLES shown on Home and City Rankings. RARE GEAR DROPS: Kenji drops Lucky Cap 8%, Maid Sakuya drops Razor Fan 6%, Kitsune Boss drops Kitsune Mask 5%. BRAWL MODE: Fights screen has two modes — Quick (auto-resolve) and Live Brawl, a real-time arena (move, attack in an arc, dash with invincibility frames) across 2-3 waves. Brawls pay +25% yen and XP. STR=swing damage, SPD=move speed, DEX=crit & dash cooldown, DEF+armor=damage reduction. Fleeing forfeits the energy.
WORLD BOSS: Rooftop Phantom (level 12+ to challenge, lv30, 900HP) — guaranteed Star Shard + 2 Oni Fragments, 10% Phantom Edge (+72, best weapon in the game).`;

const SAFE_SIMI_MANUAL = `You are Simi (シミ), a tiny friendly guide robot inside Neo-Tokyo Underworld. Be cheerful, concise and practical. Never introduce romance, sexual content, alcohol, occult worship, profanity, or religiously disrespectful material. The cast are ordinary fictional residents with civic, medical, courier, performance and public-safety roles.
CORE LOOP: build stats, fight, work, complete contracts, improve gear, enhance equipment to +20, and complete five Ally Network routes for permanent team perks.
CHARACTER PATHS: Striker is fast and attack-focused, Guardian is durable and defensive, and Technician uses tech and utility. A new account starts with empty equipment slots and earns its first weapon through District One.
DISTRICT ONE: scout the concourse, track the warning lane, clear the skirmish, defeat the Rail Warden K-9 construction exosuit, choose one Green weapon, then calibrate it to +1. The server validates campaign order and grants the chosen weapon once, equipped with at least 12 Nano Shards.
ALLIES: Kaori Sato coordinates ward relief, Rin Amasawa is an emergency courier, Hana Mochizuki is a clinic medic, Yumi Hoshino is an independent community performer, and Aya Tachibana is a civic investigator. Support shifts and shared supplies raise trust. All routes can be completed; there is no dating, jealousy, or partner system.
ICHI / UNO RULES: 108-card classic deck. Match color, number, or symbol. Draw one when unable to play. Skip, Reverse and Draw Two apply immediately. Wild changes color. Wild Draw Four is legal only with no card matching the active color. Draw penalties do not stack. Call UNO when one card remains or draw 2 if caught. First player out wins the in-game yen pot.
CRICKET: six-ball timing game with in-game yen stakes only. Perfect timing scores six; good timing scores four. Higher totals increase the payout.
ONLINE: Google login owns the cloud save. World Chat and City Rankings use the signed-in account. No PIN or offline character wipe is needed.
Keep answers to 1-4 sentences unless the player asks for detail. Never invent mechanics.`;
const SIMI_MANUAL = LEGACY_SIMI_MANUAL;

const JOBS = [
  { id: "none", name: "Unemployed", pay: 0, xp: 0, req: 0 },
  { id: "maidcafe", name: "Maid Café Server", kanji: "喫茶", pay: 300, xp: 5, req: 1, energy: 10 },
  { id: "arcade", name: "Arcade Technician", kanji: "遊戯", pay: 700, xp: 10, req: 4, energy: 12 },
  { id: "courier", name: "Night Courier", kanji: "配達", pay: 1500, xp: 18, req: 8, energy: 15 },
  { id: "idol", name: "Underground Idol", kanji: "偶像", pay: 3200, xp: 30, req: 13, energy: 18 },
  { id: "fixer", name: "Syndicate Fixer", kanji: "始末", pay: 6500, xp: 50, req: 20, energy: 22 },
];

const MISSIONS = [
  { id: "m1", name: "First Blood", desc: "Win 3 street fights", stat: "fightsWon", goal: 3, reward: 2000, xp: 40 },
  { id: "m2", name: "Petty Legend", desc: "Commit 10 crimes", stat: "crimesDone", goal: 10, reward: 3000, xp: 60 },
  { id: "m3", name: "Iron Body", desc: "Spend 20 stat points", stat: "trains", goal: 20, reward: 4000, xp: 80 },
  { id: "m4", name: "Salaryman", desc: "Work 8 shifts", stat: "shifts", goal: 8, reward: 3500, xp: 70 },
  { id: "m5", name: "High Roller", desc: "Win 5 casino bets", stat: "gambleWins", goal: 5, reward: 5000, xp: 90 },
  { id: "m6", name: "Crime Lord Rising", desc: "Commit 40 crimes", stat: "crimesDone", goal: 40, reward: 15000, xp: 250 },
  { id: "m7", name: "Undisputed", desc: "Win 15 street fights", stat: "fightsWon", goal: 15, reward: 18000, xp: 300 },
  { id: "m8", name: "Apprentice Smith", desc: "Craft 3 items at the Night Forge", stat: "crafts", goal: 3, reward: 6000, xp: 100 },
];

/* ============ ROMANCE ============ */
const LEGACY_STORY_ARCHIVE = [
  {
    id: "sakura", name: "Sakura Kurosawa", kanji: "桜", tag: "The Oyabun's Daughter",
    bio: "Heir to the Kurosawa-gumi. Silk gloves, steel spine. Everyone in the ward knows her name; almost no one has heard her laugh.",
    perks: { 4: "discount", 7: "syndicate" },
    perkDesc: { 4: "Family shops open to you — 10% off everything", 7: "She joins your crew — Kurosawa Contracts unlocked in Crimes" },
    stages: [
      { t: "Rain on Lacquer", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: [
        "The storm empties the arcade street in seconds. You duck under a tea house awning at the same moment as a girl in a white coat — and a black-suited wall of a man materializes between you before you can even say sorry.",
        "'Goro. He's wet, not armed,' she says, bored. Something small clatters to the pavement: a lacquered kanzashi pin, a sakura petal in gold leaf. You pick it up and hand it over. Her eyes flick from the pin to your face, doing arithmetic you can't follow.",
        "'Most people in this ward pretend not to see me,' she says. 'You looked. Interesting.' The rain keeps falling. Neither of you moves to leave.",
      ]},
      { t: "The Tea House", req: { aff: 12 }, cost: { energy: 6, money: 500 }, xp: 20, scene: [
        "She has a standing table at Kissaten Tsuru — back corner, sight lines to both doors. You learn this because she waves you over like it's the most natural thing in the world, and Goro's jaw tightens hard enough to crack walnuts.",
        "She talks about everything except family: French films, the exact right temperature for hōjicha, the pachinko parlor she'd burn down for aesthetic crimes alone. You pay the bill before she can. She raises an eyebrow. 'Bold. The last person who tried that lost the hand.' A pause. 'Joke. Mostly.'",
      ]},
      { t: "Watched", req: { aff: 25, lvl: 5 }, cost: { energy: 6 }, xp: 30, scene: [
        "Goro corners you in the alley behind the tea house, all two meters of him. 'Whatever this is, end it. She is not for people like you.' His knuckles are old scar tissue.",
        "'Goro.' Sakura's voice, from the alley mouth. She didn't raise it; she didn't need to. 'I choose my own company.' To you, walking past: 'He means well. He's been protecting me since I was six.' A thin smile. 'Nobody asked what I was being protected from.'",
      ]},
      { t: "Prove Yourself", req: { aff: 40, fightsWon: 10 }, cost: { energy: 10 }, xp: 60, reward: 2000, scene: [
        "'The old man wants to see if you bend,' Goro says, cracking his neck. 'Nothing personal.' The sparring room under the tea house smells of camphor and old blood. He doesn't hold back. Neither do you.",
        "It ends with both of you on the mat, breathing like broken engines. Goro starts laughing — a low rockslide of a sound. 'Fine. FINE.' He hauls you up by the forearm. 'Kurosawa shops won't overcharge you anymore. Family rate.' From the doorway, Sakura pretends she wasn't watching. She's terrible at it.",
      ]},
      { t: "The Tribute", req: { aff: 60, money: 20000 }, cost: { energy: 8, money: 10000 }, xp: 90, scene: [
        "Dinner with Kurosawa Ren, oyabun of the Kurosawa-gumi, is served in total silence for three courses. You place the tribute envelope by his cup the way Goro coached you — two hands, eyes down but not afraid.",
        "'My daughter says you're different.' He doesn't look up from his fish. 'My daughter said that about a violinist once. He plays with nine fingers now.' Sakura sets her chopsticks down with a click like a safety disengaging. 'Father.' The old man almost — almost — smiles. 'Eat. Both of you. The mackerel is good.'",
      ]},
      { t: "Sakura's Choice", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: [
        "She calls you at 2 a.m. from the shrine steps above the ward, city lights spread below like spilled circuitry. The kanzashi pin is in her hand, not her hair.",
        "'He's chosen a husband for me. Second son of the Mizuno group. A merger with a face.' She turns the pin over and over. 'I have spent my whole life being an asset. You're the first person who treated me like a person first and a Kurosawa second.' She looks at you, and for once there's no arithmetic in it at all. 'So I told him no. Tomorrow the whole ward will know. I need to hear you're not going anywhere.'",
      ], choice: {
        prompt: "How do you answer Sakura?",
        options: [
          { label: "Stand with her — publicly, no matter the cost", flag: "sakura_public", aff: 10, scene: [
            "'Then let them talk,' you say. 'Let the whole ward know. I'm not going anywhere and I'm not hiding it.' Something in her face cracks open — relief, terror, joy, all at once.",
            "She pins the sakura back into her hair with hands that aren't quite steady. 'You have no idea what you just signed up for.' But she's smiling, fierce and bright. 'Good. Neither do I.'",
          ] },
          { label: "Protect her — suggest you keep it quiet for now", flag: "sakura_secret", aff: 4, scene: [
            "'Not because I'm ashamed,' you say carefully. 'Because the second Mizuno knows, you become a target. Let me get stronger first. Then we tell the world on our terms.'",
            "She studies you for a long moment. 'Cold. Strategic.' A slow nod. 'My father would approve, which unsettles me deeply.' She pockets the pin. 'Fine. We do it your way. For now.'",
          ] },
        ],
      }},
      { t: "Partner in Crime", req: { aff: 110, partner: true }, cost: { energy: 12 }, xp: 200, reward: 5000, branches: {
        sakura_secret: [
          "You spend a season getting stronger in the dark, and when you finally move on Mizuno's interests, it's surgical — the arranged marriage collapses under its own debts before it's ever announced. No spectacle. Just a quiet, total win.",
          "Goro delivers the folio himself, grudging respect in the set of his shoulders. 'She said you'd do it clean. I owe her a bottle.' Sakura spreads the contracts like a card dealer, the pin finally back in her hair. 'Unaffiliated hands. High risk, higher pay. My careful, patient partner.' The way she says it, it's the highest praise she owns.",
        ],
        default: [
          "The old man takes it better than the ward predicted — which is to say, one broken tea set and a week of silence, then Goro shows up at your door with a case of sake and orders to 'assess the boyfriend's operation.'",
          "Sakura arrives an hour later with a leather folio. Inside: contracts. Real ones. 'If my father's people are going to gossip about you, you may as well outrank them.' She spreads the papers like a card dealer. 'The family always has work that needs... unaffiliated hands. High risk. Higher pay. Welcome to the syndicate, partner.' She finally wears the pin again. You realize she's smiling.",
        ],
      }},
    ],
  },
  {
    id: "rin", name: "Rin Amasawa", kanji: "凛", tag: "The Midnight Courier",
    bio: "Fastest rider on the expressway loop. Delivers anything, asks nothing, sleeps never. Smells like rain and engine oil.",
    perks: { 4: "turbo", 7: "nitro" },
    perkDesc: { 4: "Her training routes — energy regenerates 25% faster", 7: "Ride-or-die — even faster energy regen and +10 max energy" },
    stages: [
      { t: "Zero Point Two Seconds", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: [
        "The bike misses you by the width of a breath — a black blur that brakes, drifts, and stops dead in a way that should be physically illegal. The rider flips up her visor. 'You stepped on my racing line.'",
        "Not 'sorry.' Not 'are you okay.' Your racing line. She looks you over, decides you're not concussed, and grins. 'Good reflexes though. Most people freeze. You leaned the right way.' She revs once. 'Rin. If you're going to jaywalk in my ward, at least do it with commitment.'",
      ]},
      { t: "Ramen at 3 A.M.", req: { aff: 12 }, cost: { energy: 5, money: 400 }, xp: 20, scene: [
        "Turns out she eats at the same midnight ramen cart every night — 'consistency is training,' she says, like that explains anything. She orders for you without asking. Extra garlic. She's right, infuriatingly.",
        "She talks with her hands, chopsticks slicing the steam: torque curves, the exact pothole map of the expressway loop, the delivery she once made with a wedding cake strapped to her back. 'Intact?' you ask. She looks mortally offended. 'I've never lost cargo. Or a race.' A pause. 'Or a passenger. Want to test that last one sometime?'",
      ]},
      { t: "Passenger Princess", req: { aff: 25, spd: 15 }, cost: { energy: 8 }, xp: 35, scene: [
        "'Rule one: lean with me, not against me. Rule two: if you scream, I go faster.' The city at 140 km/h stops being buildings and becomes a river of light. She takes the harbor bend low enough that your knee could touch the reflectors.",
        "When she finally stops at the overlook, your legs are static and your heart is a drum solo. Rin pulls her helmet off and shakes her hair out, cheeks flushed with the cold. 'You didn't scream.' She sounds genuinely pleased. 'Everybody screams the first time. Okay. You can stay.'",
      ]},
      { t: "The Wager", req: { aff: 40, spd: 30 }, cost: { energy: 10 }, xp: 60, reward: 1500, scene: [
        "The Oroboros crew has been poaching her delivery routes, so naturally the dispute gets settled the only way that matters: harbor loop, three laps, pink slips. Rin lets you set her tire pressure. This, you understand, is intimacy.",
        "She wins by four seconds — an eternity. Their captain hands over the route ledger like it's his own liver. Afterward she tosses you a spare key to her garage. 'My training routes, my shortcuts, my charging spots. You move around this city like a tourist. Fix that.' You'll never take a slow road again.",
      ]},
      { t: "Engine Heart", req: { aff: 60, money: 8000 }, cost: { energy: 8, money: 8000 }, xp: 90, scene: [
        "You find her sitting on the garage floor at 4 a.m., surrounded by the organs of her bike. The engine finally gave out — the one her father built before he passed. She's not crying. She's just very, very still, which is worse.",
        "You put the parts money on the workbench and pick up a wrench before she can argue. The rebuild takes all night. She talks the whole time — about her dad, the shop he ran, the first time he let her ride. When the engine turns over at dawn she laughs and punches your shoulder hard enough to bruise. From Rin, it's a love letter.",
      ]},
      { t: "The Expressway Duel", req: { aff: 85 }, cost: { energy: 12 }, xp: 120, scene: [
        "'One lap,' she says, handing you the spare bike. 'You and me. I want to see what you've learned.' The loop at night is empty and endless. You lose, obviously — but only by a bike length, and you take the harbor bend on her exact line.",
        "At the overlook she doesn't get off her bike, just looks at the city for a long time. 'I don't slow down for anyone. Ever. It's the only rule I have.' She turns. 'You're the first person who ever sped up instead of asking me to.' The sunrise does the rest of the talking.",
      ], choice: {
        prompt: "The sun's coming up. What do you do?",
        options: [
          { label: "Race her again — never let her win easy", flag: "rin_rival", aff: 8, scene: [
            "'Rematch,' you say, kicking your stand up. 'Right now. I'm not done chasing you.' She laughs, delighted and startled. 'You absolute menace.' She's already gunning it before you finish the sentence.",
            "You lose again — by less. And you understand each other perfectly: love, for Rin, is a moving target you never stop pursuing.",
          ] },
          { label: "Just be with her — kill the engines, watch the city", flag: "rin_still", aff: 8, scene: [
            "You reach over and turn her key. The engine dies. For the first time since you met her, Rin is completely still — and she lets herself be. She leans her helmet against your shoulder.",
            "'This is nice,' she admits, like a state secret. 'Don't tell anyone I can sit still. I have a reputation.' You watch the sunrise together. Neither of you says another word for an hour.",
          ] },
        ],
      }},
      { t: "Ride or Die", req: { aff: 110, partner: true }, cost: { energy: 12 }, xp: 200, reward: 3000, branches: {
        rin_still: [
          "She repaints her helmet. It takes you a week to notice the second name under hers — and a small painted sunrise beside it, the morning you sat still together. When you point at it she goes red to the ears and threatens to make you walk home.",
          "'Deal,' she says, tossing you a matching jacket. 'My routes, your routes. My garage, your garage. And once a week, we kill the engines and just... exist.' She kicks the stand up. 'The rest of the time? Get on. The city's not going to outrun itself, partner.'",
        ],
        default: [
          "She repaints her helmet. It takes you a week to notice the second name lettered small under hers on the cowl, the way race teams do it. When you point at it she goes red to the ears and threatens to make you walk home.",
          "'Here's the deal,' she says instead, tossing you a matching jacket. 'My routes are your routes. My garage is your garage. You never make me slow down, I never make you.' She kicks the stand up. 'Now get on. The city's not going to outrun itself, partner.'",
        ],
      }},
    ],
  },
  {
    id: "hana", name: "Hana Mochizuki", kanji: "花", tag: "The Shrine Clinic Angel",
    bio: "Med student by day, shrine caretaker by dawn, unlicensed angel of the back alleys by night. Stitches first, lectures always.",
    perks: { 4: "firstaid", 7: "guardian" },
    perkDesc: { 4: "House calls — your HP regenerates twice as fast", 7: "Under her care — hospital stays are cut in half" },
    stages: [
      { t: "Seven Stitches", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: [
        "You lose a fight badly enough that someone drags you to a shrine annex where 'the girl who doesn't ask questions' works. She's younger than you expected, sleeves tied back, hands absolutely steady.",
        "'Seven stitches. Hold still.' She works in silence, then ruins it: 'You know, statistically, people who get punched this much are choosing to get punched this much.' Her needlework is beautiful. Her bedside manner is a war crime. 'Come back in five days so I can take these out. Or don't, and lose the arm. Your call.'",
      ]},
      { t: "Morning Sweeping", req: { aff: 12 }, cost: { energy: 5 }, xp: 20, scene: [
        "You come back on day five — mostly out of spite. She's sweeping the shrine steps at dawn, breath fogging, humming something off-key. She hands you a second broom without a word. Apparently the stitches come out after you earn them.",
        "Somewhere around the fortieth step she starts talking: med school tuition, her grandmother who kept this shrine for fifty years, the neighborhood kids she patches up for free. 'The city eats people,' she says, matter-of-fact. 'Somebody has to un-eat them.' She takes your stitches out right there on the steps. Her hands are warm.",
      ]},
      { t: "Lantern Festival", req: { aff: 25, happy: 70 }, cost: { energy: 6, money: 600 }, xp: 35, scene: [
        "The shrine festival is her one night off a year and she takes it deadly seriously: candy apples, goldfish scooping, a yukata patterned with — of course — flowers. You have never seen her not-tired before. It's disarming.",
        "She wins the goldfish game on the first try ('surgeon's hands'), loses spectacularly at ring toss, and laughs so hard she has to grab your sleeve. Under the last row of lanterns she goes quiet. 'I fix people all year and never learn their names. You're the first one who came back when nothing was broken.'",
      ]},
      { t: "First Aid Lessons", req: { aff: 40, def: 25 }, cost: { energy: 8 }, xp: 60, scene: [
        "'If you're going to keep living like a crash test dummy, you'll do it educated.' Every Tuesday, the annex: pressure points, splints, how to tape a rib, which bleeding is drama and which is death. She quizzes you mercilessly.",
        "You realize halfway through the third week that she's teaching you to survive her absence — and that she checks the fight boards now, looking for your name. 'Pass,' she declares finally, stamping your hand like a library book. 'Congratulations. You're now the second-best medic you know. Try to need me less.' She doesn't mean it.",
      ]},
      { t: "What the Hands Do", req: { aff: 60 }, cost: { energy: 8 }, xp: 90, scene: [
        "She finds out about the crimes the way everyone finds out everything in this ward — laundry lines and gossip. She doesn't yell. She just cleans instruments that are already clean, which is scarier.",
        "'I put people back together. You take them apart. Explain that to me.' So you do — the whole ugly ledger of it, no varnish. She listens with her diagnostic face on. Finally: 'My grandmother said the shrine takes all comers. Thieves prayed here. Cops prayed here.' She hands you a cup of tea like a verdict. 'I don't have to bless what you do to care what happens to you. Don't make me regret the stitches.'",
      ]},
      { t: "The Night Clinic", req: { aff: 85, money: 5000 }, cost: { energy: 10, money: 5000 }, xp: 120, scene: [
        "A flu tears through the ward the same week her supplier jacks up prices. You find her doing triage on shrine steps at midnight, out of everything, running on vending machine coffee and stubbornness.",
        "You make a call, spend money you meant for armor, and by 2 a.m. there are supply boxes stacked to the annex ceiling. She works until dawn; you carry, boil, fetch, hold flashlights. When the last kid goes home fever-free she sits down hard on the steps next to you. 'You're a criminal,' she says, leaning her head on your shoulder, already half asleep, 'and the best person I know. I'm too tired to work out the math on that.'",
      ], choice: {
        prompt: "She's half-asleep on your shoulder. What do you tell her?",
        options: [
          { label: "Promise to go straight — for her", flag: "hana_reform", aff: 10, scene: [
            "'Then let me earn the second half of that sentence,' you murmur. 'I'll get out. Legit work, clean money. Give me time.' She's quiet so long you think she's asleep.",
            "'Don't promise what you can't keep,' she whispers. Then, softer: 'But if you mean it... I'll help you find the door out. I'm good at putting people back together.'",
          ] },
          { label: "Be honest — you can't promise to change", flag: "hana_honest", aff: 6, scene: [
            "'I won't lie to you,' you say. 'I don't know how to be anything but what I am. But I'll never bring it to your steps. This place stays clean.' She lifts her head to look at you, exhausted and clear-eyed.",
            "'Good,' she says simply. 'I've had enough people lie about who they are. Be a criminal, then. Just be an honest one with me.' She settles back against you. 'The shrine takes all comers, remember?'",
          ] },
        ],
      }},
      { t: "In Sickness and in Health", req: { aff: 110, partner: true }, cost: { energy: 10 }, xp: 200, reward: 3000, branches: {
        hana_reform: [
          "She passes her licensing exam on a Tuesday and hands you a folded pamphlet on the Wednesday — a vocational program, a way out, circled in her neat surgeon's hand. 'One class,' she says. 'Try one. For me.' You go. It's terrifying. She's proud enough to glow.",
          "'Terms and conditions,' she says on the shrine steps, ticking fingers. 'One: you actually try the door out, at your own pace, no pressure. Two: hospital food is a crime and I'll break you out of Kannon General personally. Three—' she runs out of doctor and just smiles, '—come home. We're building something legal, you and me. Slowly. Together.'",
        ],
        default: [
          "She passes her licensing exam on a Tuesday and kisses you on the shrine steps on the Wednesday, in front of her grandmother's memorial plaque and at least three scandalized pigeons. 'For luck,' she claims. It's not for luck.",
          "'Terms and conditions,' she says, ticking fingers. 'One: you get hurt, you come to me first, not last. Two: hospital food is a crime and I'll break you out of Kannon General personally. Three—' she runs out of doctor and just smiles, '—come home. Whatever you did that night. Just come home so I can fix it.' You've taken worse deals.",
        ],
      }},
    ],
  },
  {
    id: "yumi", name: "Yumi Hoshino", kanji: "星", tag: "The Underground Idol",
    bio: "Blonde, loud, permanently five minutes from her big break. Hands out her own flyers, writes her own songs, believes hard enough for two.",
    perks: { 4: "sunshine", 7: "lucky" },
    perkDesc: { 4: "Her playlist in your ears — happiness barely decays", 7: "Star charm — noticeably better luck at the casino" },
    stages: [
      { t: "One Flyer Left", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: [
        "Outside the arcade, a girl with a blonde side-tail is hand-selling flyers with the desperate energy of a street vendor in a typhoon. 'LIVE SHOW! Tonight! Basement of the Golden Koi! I'm the third act! Well — technically the opening act! Well — I go on while people find seats!'",
        "She presses the last flyer into your hand like it's a winning lottery ticket. 'Yumi Hoshino. Remember the name, because someday it'll cost you forty thousand yen to stand this close to me.' She beams. It is, annoyingly, a great smile.",
      ]},
      { t: "Audience of Nine", req: { aff: 12, money: 300 }, cost: { energy: 5, money: 300 }, xp: 20, scene: [
        "You go. Obviously you go. The basement smells like spilled melon soda and the audience is nine people, three of whom are waiting for the next act. Yumi performs like it's the Tokyo Dome — full choreography, zero shame, one voice crack she powers through on pure will.",
        "Afterward she finds you by the door, still buzzing. 'You came!! Flyer guy!' She counts the door money — it does not take long — and grins anyway. 'Nine people! Last month it was four! At this rate of growth I mathematically sell out the Dome in six years.' Her math is wrong. Her conviction isn't.",
      ]},
      { t: "Crane Game Economics", req: { aff: 25, gambleWins: 3 }, cost: { energy: 6, money: 500 }, xp: 35, scene: [
        "Her one vice: the crane games at the arcade, which she plays with terrifying, clinical precision. 'It's not gambling if you have a system,' she says, adjusting the claw by millimeters. 'It's logistics.' She wins a plushie in three moves and hands it to you like a trophy.",
        "Over crepes she shows you her real notebook — not lyrics, numbers. Venue cuts, flyer costs, the exact yen distance between her and a real single. 'Everyone thinks idols are dreams and glitter.' She taps the page. 'Dreams are a budget line. I'm going to make it because I did the accounting.' You believe her completely.",
      ]},
      { t: "B-Side", req: { aff: 40 }, cost: { energy: 8 }, xp: 60, scene: [
        "She's stuck on a lyric at 1 a.m. and drafts you by force. 'You live a dramatic life! Say something dramatic!' You tell her — carefully edited — about a night that went sideways. She goes very quiet, pen flying.",
        "The song she plays you a week later is about the city that eats people and the ones who feed it and still sing. It's good. It's actually, honestly good. 'It's yours,' she says, suddenly shy for the first time in recorded history. 'I mean — it's mine. But it's yours.' She burns you a copy. You play it more than you'd admit under torture.",
      ]},
      { t: "The Bad Contract", req: { aff: 60, money: 12000 }, cost: { energy: 8, money: 12000 }, xp: 90, scene: [
        "Turns out the 'agency' she signed with at seventeen owns her name, her songs, and forty percent of everything until she's thirty. The manager laughs at her in front of you. It takes a lot to make Yumi stop smiling. That does it.",
        "So you buy the contract out. All of it. The manager stops laughing somewhere around the third stack. Outside, Yumi stares at the paperwork like it might bite. 'Nobody's ever bet real money on me before.' She wipes her eyes with her sleeve, furious about it. 'Okay. OKAY. New plan: I make it so big this becomes the best investment in the history of this stupid, beautiful city.'",
      ]},
      { t: "Two Hundred Voices", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: [
        "Free agent Yumi books the mid-size hall above the pachinko parlor and papers the entire ward. Two hundred people show. Two hundred. When the crowd sings her chorus back at her — your chorus, the B-side — she has to stop and press a hand to her mouth.",
        "She finds you in the back row after, still shaking. 'I saw you. Third from the left, terrible clapping rhythm, mouthing every word.' She grabs both your hands. 'When it happened — the moment it finally happened — you're the first person I looked for. That's data. I did the accounting on that too.'",
      ], choice: {
        prompt: "Two hundred people just chanted her name. What do you say?",
        options: [
          { label: "Push her toward the big time — she's ready", flag: "yumi_star", aff: 8, scene: [
            "'This is two hundred,' you say. 'I've seen the notebook. You're aiming at the Dome. So aim. I'll be third from the left the whole way up.' Her eyes go huge and wet.",
            "'You really think—' She stops, recalculates, and the ambition snaps back into her face like a switch. 'Okay. OKAY. New budget line. We're going all the way, and you're my lucky fixed point. Don't you dare move.'",
          ] },
          { label: "Tell her she's already enough, right now", flag: "yumi_home", aff: 8, scene: [
            "'Whether it's two hundred or the Dome or nine people in a basement,' you say, 'you were always going to be worth watching. You don't have to make it big to matter to me. You already did.' For once, Yumi Hoshino has no comeback.",
            "She just cries, laughing, and hits your arm. 'That's — you can't just SAY things like that, I have mascara on!' She wipes her eyes. 'The Dome can wait. Buy me a crepe, fixed point.'",
          ] },
        ],
      }},
      { t: "Front Row Forever", req: { aff: 110, partner: true }, cost: { energy: 10 }, xp: 200, reward: 3000, branches: {
        yumi_star: [
          "The single charts. Not number one — number eleven — but for an unsigned ward idol it's a comet. She calls you from a radio station bathroom, screaming, and you can hear her whole future rearranging itself in real time.",
          "The terms she draws up on flyer paper have grown a clause: 'Comes on tour. Non-negotiable.' She taps the lucky star hairpin into your palm. 'Stars need one fixed point to navigate by, and mine's coming to every city with me. Tag. You're it — coast to coast.' Somehow, since she came along, the whole world's odds break your way.",
        ],
        default: [
          "She writes a song she refuses to perform. 'It's not for audiences.' She plays it for you once, in the empty basement where nine people used to sit, and afterward informs you — big smile, red ears — that you are now officially, contractually, her person.",
          "The terms, handwritten on flyer paper: front row at everything forever, honest opinions on demos only when asked, and her lucky star hairpin lives with you on show nights. 'Stars need one fixed point to navigate by,' she says, tapping your chest. 'Tag, you're it.' Somehow, since she came along, the whole city's odds seem to break your way.",
        ],
      }},
    ],
  },
  {
    id: "ayame", name: "Ayame Tachibana", kanji: "菖", tag: "The Detective",
    bio: "Precinct 9's best closer. Incorruptible, unpromotable, and fully aware of exactly what you are. Dating her is a terrible idea. She agrees.",
    perks: { 4: "headsup", 7: "immunity" },
    perkDesc: { 4: "Inside warnings — jail sentences cut by a third", 7: "Guardian angel with a badge — 30% chance to walk from any bust" },
    stages: [
      { t: "Person of Interest", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: [
        "She's waiting by the pachinko parlor with a notebook and the flattest cop stare in the prefecture. 'Tachibana, Precinct 9. You were seen near the incident on Fourth. Walk me through your evening.' You give her nothing. She writes for a suspiciously long time anyway.",
        "'You know what's funny,' she says, snapping the notebook shut, 'everyone in this ward lies to me. You lied well. Almost professionally.' She hands you her card, which cops do not do. 'Don't leave the district. And the ramen cart on Seventh is better than the one you eat at. Your alibi has terrible taste.'",
      ]},
      { t: "The Interrogation, Decaf", req: { aff: 12 }, cost: { energy: 6, money: 400 }, xp: 20, scene: [
        "She starts turning up at the ramen cart on Seventh — off duty, allegedly. 'This is an interrogation,' she announces, sitting down. 'The coffee is a tactic.' She then talks for forty minutes about everything except any case: her sister's kids, judo nationals in high school, the captain who keeps burying her promotion.",
        "'Why me?' you finally ask. She considers it seriously, the way she seems to consider everything. 'Because everyone else either fears the badge or wants something from it. You just think I'm a person who's bad at pretending this is an interrogation.' She steals a slice of your chashu. 'Which is accurate.'",
      ]},
      { t: "Known Associates", req: { aff: 25, crimesDone: 15 }, cost: { energy: 6 }, xp: 35, scene: [
        "She slides a folder across the ramen counter. Your folder. It's thicker than you'd like. 'I'm not stupid, and I'd appreciate you not treating me like I am.' Her voice is level. Her knuckles aren't.",
        "'Here's where we are. I don't have enough to move on you, and lately —' she stops, restarts, '— lately I haven't wanted enough to move on you, which is a professional problem I'm handling badly.' She takes the folder back. 'Petty stuff, I have amnesia. Anyone gets hurt who didn't sign up for this life, amnesia ends. Those are the rules. Nod if we understand each other.' You nod. She exhales like she's been holding it for weeks.",
      ]},
      { t: "The Tip-Off", req: { aff: 40, lvl: 8 }, cost: { energy: 8 }, xp: 60, scene: [
        "A text from an unknown number: 'Sweep on the east arcades tonight. Eat somewhere west. Delete this.' You eat somewhere west. Three crews get scooped up in the east arcades. The unknown number does not text again.",
        "At the cart she says nothing about it, but she watches you sit down safe and unscooped, and something in her shoulders unclenches. 'Hypothetically,' she says to her noodles, 'if someone kept a certain idiot ahead of certain patrols, it would be because processing him is paperwork, and she hates paperwork.' Hypothetically, you buy her coffee for a month.",
      ]},
      { t: "Internal Affairs", req: { aff: 60 }, cost: { energy: 10, nerve: 10 }, xp: 90, reward: 4000, scene: [
        "Captain Mori of Precinct 9 has been selling raid schedules to the Mizuno group for years — it's why Ayame's cases die and her promotions vanish. She can't touch him through channels. Channels are his. 'I need someone the system can't see,' she says, and hates every word. 'I need you.'",
        "It takes you one very long night in places you shouldn't be, and by dawn she has the ledger, the burner phone, and Mori's whole rotten arithmetic. She turns it in through a prosecutor she trusts, hands shaking with adrenaline or vindication or both. 'I became a cop to do exactly this,' she says. 'Never thought the assist would come from your side of the street.'",
      ]},
      { t: "Crossing the Line", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: [
        "Mori's arrest makes the morning news. Ayame makes lieutenant by the afternoon. She celebrates by standing in the rain outside your building looking like she's about to read you your rights, which — knowing her — was a real possibility.",
        "'I have run this a thousand ways,' she says. 'Detective and criminal. It ends badly in nine hundred and ninety-nine of them.' Rain drips off her chin. She doesn't seem to notice. 'But I closed the biggest case of my life because I trusted you, and I am so tired of only being right about things that make me lonely.' She steps in out of the rain. 'This is the one. Don't make me regret the math.'",
      ], choice: {
        prompt: "She's crossed a line she can't uncross. How do you meet her?",
        options: [
          { label: "Vow to keep your worlds separate — protect her badge", flag: "ayame_wall", aff: 8, scene: [
            "'Then we build a wall,' you say. 'You never know what I do. I never touch your cases. Your badge stays clean because it stays blind. That's how I keep you.' She exhales, some of the dread leaving her shoulders.",
            "'A firewall.' The detective in her turns it over and approves. 'Compartmentalized. Deniable. God help me, that's the most romantic thing anyone's said to me.' She almost smiles. 'Fine. Two worlds. One us.'",
          ] },
          { label: "Offer to be her secret weapon — off the books", flag: "ayame_weapon", aff: 8, scene: [
            "'Or,' you say, 'you point me at the ones the system can't touch. Off the books. I'm already a ghost — let me be your ghost.' She stares at you like you've handed her a loaded gun and a moral crisis in one box.",
            "'That is a catastrophically bad idea,' she says slowly, 'and I've wanted exactly that since the Mori case.' She scrubs rain off her face. 'We'll have rules. So many rules. But yes. My ghost. God help us both.'",
          ] },
        ],
      }},
      { t: "Above the Law", req: { aff: 110, partner: true }, cost: { energy: 12 }, xp: 200, reward: 3000, branches: {
        ayame_weapon: [
          "It becomes a rhythm: she slides you a name no warrant can reach, and a week later that name's whole operation folds under 'anonymous tips' and 'procedural miracles.' Her clearance rate becomes precinct legend. Nobody asks how. She never tells.",
          "'I'm not corrupt,' she says firmly, doing the crossword in your kitchen in her precinct hoodie. 'I'm force-multiplied. There's a difference and I'll arrest anyone who says otherwise.' She fills in a word. 'Also I told my sister about you. She thinks you're a consultant. Keep it that way, and wear something that doesn't say organized crime to the kids' birthday.' Somehow, this is the most useful you've ever been to anyone.",
        ],
        default: [
          "Dating a lieutenant comes with house rules delivered like charges: no details she'd have to act on, no blood on your hands she'd have to test, and Sunday dinners are non-negotiable and civilian. In exchange, you notice patrols reroute a block early. Busts that should stick... develop procedural errors.",
          "'I'm not corrupt,' she says firmly, doing the crossword in your kitchen in her precinct hoodie. 'I am selectively efficient. There's a difference and I'll arrest anyone who says otherwise.' She fills in a word, then, without looking up: 'Also I told my sister about you. She wants you at the kids' birthday. Wear something that doesn't say organized crime.' Somehow, this is the most protected you've ever been.",
        ],
      }},
    ],
  },
];

/* Player-visible story cast. IDs stay stable so existing cloud saves retain
   their chapter and trust progress after the story-standard migration. */
const ALLY_NETWORK = [
  {
    id: "sakura", name: "Kaori Sato", kanji: "結", tag: "Ward Coordinator",
    bio: "A calm community organizer who keeps Ward 09 supplied during blackouts and transit failures.",
    perks: { 4: "discount", 7: "syndicate" },
    perkDesc: { 4: "Local suppliers trust your team — 10% off everything", 7: "Ward Network missions unlock in Contracts" },
    stages: [
      { t: "Rain Supply", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: ["A storm cuts power to the market. You help Kaori carry food crates to families before the refrigeration fails. She adds your name to the ward volunteer list."] },
      { t: "The Missing Manifest", req: { aff: 12 }, cost: { energy: 6, money: 500 }, xp: 20, scene: ["A medicine shipment is misrouted. You and Kaori trace the paper trail, pay the emergency courier fee, and get every box to the clinic before sunrise."] },
      { t: "Quiet Leadership", req: { aff: 25, lvl: 5 }, cost: { energy: 6 }, xp: 30, scene: ["Kaori asks you to coordinate three volunteer teams during a mag-rail shutdown. Clear instructions and patience turn panic into an orderly evacuation."] },
      { t: "Open Market", req: { aff: 40, fightsWon: 10 }, cost: { energy: 10 }, xp: 60, reward: 2000, scene: ["You protect a relief market from a gang trying to seize its supplies. The vendors agree that your team will always receive the local rate."] },
      { t: "Clean Accounts", req: { aff: 60, money: 20000 }, cost: { energy: 8, money: 10000 }, xp: 90, scene: ["Kaori opens the ward fund books to public review. Your contribution clears urgent debts and proves the network can operate without hidden obligations."] },
      { t: "Ward Assembly", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: ["At the ward assembly, Kaori presents a safety plan built from everything your team learned. Residents approve it and ask you both to oversee the first month."] },
      { t: "A Stronger Ward", req: { aff: 110 }, cost: { energy: 12 }, xp: 200, reward: 5000, scene: ["The network becomes permanent: clinics, couriers, shops, and volunteers sharing verified requests. Kaori gives your runner secure access to the hardest community contracts."] },
    ],
  },
  {
    id: "rin", name: "Rin Amasawa", kanji: "迅", tag: "Emergency Courier",
    bio: "Ward 09's fastest licensed courier, known for getting vital packages through when the rail grid stops.",
    perks: { 4: "turbo", 7: "nitro" },
    perkDesc: { 4: "Courier training — energy regenerates 25% faster", 7: "Endurance route — faster regeneration and +10 max energy" },
    stages: [
      { t: "Right of Way", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: ["You help Rin clear a crowded delivery lane without endangering pedestrians. She respects that you chose safety over speed."] },
      { t: "Night Route", req: { aff: 12 }, cost: { energy: 5, money: 400 }, xp: 20, scene: ["Over ramen, Rin teaches you how to read road closures and plan fallback routes before a delivery begins."] },
      { t: "Steady Passenger", req: { aff: 25, spd: 15 }, cost: { energy: 8 }, xp: 35, scene: ["You complete a supervised courier route, keeping every package secure through tight turns and sudden rain."] },
      { t: "Harbor Relay", req: { aff: 40, spd: 30 }, cost: { energy: 10 }, xp: 60, reward: 1500, scene: ["Your team wins a legal harbor relay by planning clean hand-offs instead of taking reckless shortcuts. Rin shares her advanced training map."] },
      { t: "Engine Rebuild", req: { aff: 60, money: 8000 }, cost: { energy: 8, money: 8000 }, xp: 90, scene: ["You help Rin restore an old delivery bike using documented parts and careful testing. It returns to service for the clinic route."] },
      { t: "Typhoon Run", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: ["With roads closing by the minute, you coordinate from the map while Rin delivers emergency batteries to a shelter before the typhoon lands."] },
      { t: "Courier Standard", req: { aff: 110 }, cost: { energy: 10 }, xp: 200, reward: 3000, scene: ["Rin publishes the team's safe-route standard for every ward courier. Your runner earns permanent access to her endurance program."] },
    ],
  },
  {
    id: "hana", name: "Hana Mochizuki", kanji: "医", tag: "Clinic Medic",
    bio: "A practical trainee medic who runs evening first-aid sessions and never wastes a needed supply.",
    perks: { 4: "medic", 7: "triage" },
    perkDesc: { 4: "First-aid coaching — HP regenerates faster", 7: "Triage network — shorter hospital recovery" },
    stages: [
      { t: "First Response", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: ["You help Hana stabilize an injured courier and keep the crowd calm until the ambulance arrives."] },
      { t: "Supply Check", req: { aff: 12 }, cost: { energy: 6, money: 400 }, xp: 20, scene: ["You replace expired first-aid stock and label every cabinet so volunteers can find supplies quickly."] },
      { t: "Clear Head", req: { aff: 25, happy: 70 }, cost: { energy: 6 }, xp: 35, scene: ["Hana runs a demanding response drill. Your calm attention helps the whole class finish without mistakes."] },
      { t: "Night Clinic", req: { aff: 40, def: 25 }, cost: { energy: 10 }, xp: 60, reward: 1500, scene: ["A city outage fills the clinic. You carry equipment, manage the queue, and protect the entrance while Hana treats patients."] },
      { t: "Mobile Unit", req: { aff: 60, money: 12000 }, cost: { energy: 8, money: 8000 }, xp: 90, scene: ["Your funding repairs a mobile clinic van. Hana tests every system before approving it for ward service."] },
      { t: "Training Day", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: ["Together you train shopkeepers and couriers in basic first response, expanding the ward's safety net block by block."] },
      { t: "Care Network", req: { aff: 110 }, cost: { energy: 10 }, xp: 200, reward: 3000, scene: ["Hana links the clinic, mobile unit, and volunteer teams into one reliable response network. Your runner receives advanced triage support."] },
    ],
  },
  {
    id: "yumi", name: "Yumi Hoshino", kanji: "音", tag: "Independent Performer",
    bio: "A disciplined singer who writes her own material and organizes clean, welcoming community shows.",
    perks: { 4: "sunshine", 7: "lucky" },
    perkDesc: { 4: "Morale playlist — happiness decays slowly", 7: "Crowd momentum — slightly better arcade luck" },
    stages: [
      { t: "One Flyer Left", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: ["You help Yumi distribute the last flyers for a small all-ages community show. She remembers that you stayed to clean the hall afterward."] },
      { t: "Audience of Nine", req: { aff: 12 }, cost: { energy: 5, money: 300 }, xp: 20, scene: ["Only nine people arrive, but Yumi performs with care and thanks every attendee. You help balance the modest door income."] },
      { t: "Arcade Logistics", req: { aff: 25, gambleWins: 3 }, cost: { energy: 6, money: 500 }, xp: 35, scene: ["Yumi studies the arcade's card tables as a lesson in probability and budgeting. Together you set a strict entertainment limit and stick to it."] },
      { t: "B-Side", req: { aff: 40 }, cost: { energy: 8 }, xp: 60, scene: ["A ward rescue inspires a new song about courage and service. You help Yumi check that every lyric honours the people involved."] },
      { t: "Fair Contract", req: { aff: 60, money: 12000 }, cost: { energy: 8, money: 12000 }, xp: 90, scene: ["An unfair agency contract threatens Yumi's work. A legal adviser helps negotiate a clean exit, funded by your team."] },
      { t: "Two Hundred Voices", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: ["Two hundred neighbours sing Yumi's hopeful chorus together. She turns the event into a fundraiser for the night clinic."] },
      { t: "Open Stage", req: { aff: 110 }, cost: { energy: 10 }, xp: 200, reward: 3000, scene: ["Yumi establishes a transparent community stage where new performers keep their rights and younger players have a safe venue."] },
    ],
  },
  {
    id: "ayame", name: "Aya Tachibana", kanji: "察", tag: "Civic Investigator",
    bio: "A methodical public-safety investigator who follows evidence, documents every decision, and refuses bribes.",
    perks: { 4: "headsup", 7: "immunity" },
    perkDesc: { 4: "Safety alerts — jail sentences are shorter", 7: "Verified evidence — chance to avoid a false bust" },
    stages: [
      { t: "Witness Statement", req: { aff: 0 }, cost: { energy: 5 }, xp: 10, scene: ["Aya asks what you saw near a damaged supply depot. You give a complete statement and help identify the real escape route."] },
      { t: "Open Records", req: { aff: 12 }, cost: { energy: 6, money: 400 }, xp: 20, scene: ["You review public incident records with Aya and find a pattern of missing evidence tags."] },
      { t: "Known Routes", req: { aff: 25, crimesDone: 15 }, cost: { energy: 6 }, xp: 35, scene: ["Your knowledge of the ward helps Aya recover stolen relief supplies without accusing innocent residents."] },
      { t: "The Safety Alert", req: { aff: 40, lvl: 8 }, cost: { energy: 8 }, xp: 60, scene: ["Aya issues a verified safety alert before a dangerous building inspection, preventing workers from entering the site."] },
      { t: "Audit Trail", req: { aff: 60 }, cost: { energy: 10, nerve: 10 }, xp: 90, reward: 4000, scene: ["You secure an unbroken audit trail proving that an official diverted community funds. Aya submits the evidence through proper review channels."] },
      { t: "Public Hearing", req: { aff: 85 }, cost: { energy: 10 }, xp: 120, scene: ["At a public hearing, Aya presents the facts without exaggeration. Your testimony helps the ward adopt stronger oversight."] },
      { t: "Clear Record", req: { aff: 110 }, cost: { energy: 12 }, xp: 200, reward: 3000, scene: ["Aya establishes a trusted reporting line between residents and investigators. Your runner earns access to verified safety intelligence."] },
    ],
  },
];
const GIRLS = LEGACY_STORY_ARCHIVE;

const CONTRACTS = [
  { id: "c1", name: "Escort the Kurosawa Convoy", kanji: "護", nerve: 10, energy: 15, chance: 0.75, pay: [12000, 20000], xp: 120 },
  { id: "c2", name: "Silence the Mizuno Ledger", kanji: "帳", nerve: 14, energy: 18, chance: 0.6, pay: [20000, 38000], xp: 200 },
  { id: "c3", name: "Retrieve the Oyabun's Heirloom", kanji: "宝", nerve: 18, energy: 22, chance: 0.45, pay: [40000, 75000], xp: 350 },
];

const girlState = (p, id) => (p.romance && p.romance[id]) || { aff: 0, stage: 0 };
const hasPerk = (p, perkId) => GIRLS.some((g) =>
  Object.entries(g.perks).some(([s, pid]) => pid === perkId && girlState(p, g.id).stage >= Number(s)));
const GIFTS = { pocky: 4, plush: 15, sake: 6, ramen: 5, charm: 25 };

/* pairs whose personalities can accept an open/shared relationship */
const POLY_PAIRS = [["rin", "yumi"], ["rin", "hana"], ["hana", "yumi"], ["yumi", "sakura"], ["hana", "ayame"]];
const polyOK = (a, b) => POLY_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const pairKey = (a, b) => [a, b].sort().join("+");
const CONFESS = 6; // stage value once chapter 6 (the confession) is completed
const shortName = (id) => (GIRLS.find((g) => g.id === id)?.name.split(" ")[0]) || id;
const hasFlag = (p, f) => (p.flags || []).includes(f);
const resolveScene = (stage, flags) => {
  if (stage.branches) {
    for (const key of Object.keys(stage.branches)) {
      if (key !== "default" && flags.includes(key)) return stage.branches[key];
    }
    return stage.branches.default;
  }
  return stage.scene;
};

const REGEN = { energy: 4000, nerve: 9000, hp: 2500, happyDecay: 30000 };

const newPlayer = () => ({
  name: "Runaway", handle: null, cloudKey: null,
  level: 1, xp: 0, money: 500,
  energy: 30, nerve: 10, hp: 100, happy: 100,
  stats: { str: 5, def: 5, spd: 5, dex: 5 },
  inventory: {}, weapon: null, armor: null,
  job: "none",
  jailUntil: 0, hospitalUntil: 0,
  counters: { fightsWon: 0, crimesDone: 0, trains: 0, shifts: 0, gambleWins: 0, crafts: 0 },
  claimed: [],
  romance: {}, partner: null, flags: [],
  bank: 0, bankAt: now(), lastDay: null, streak: 0, daily: null, achv: [], title: null, gear: [], pity: 0, autoSalvage: false, statPoints: 0, fame: 0, evo: 0,
  created: now(),
});

const maxEnergy = (p) => 30 + p.level * 2 + (hasPerk(p, "nitro") ? 10 : 0) + (p.evo || 0) * 5;
const maxNerve = (p) => 10 + Math.floor(p.level * 1.2);
const maxHp = (p) => 100 + p.level * 12 + (p.stats.def + gearBonuses(p).def) * 2 + gearBonuses(p).hp;
const xpNeed = (p) => p.level * 100;

/* Stable UI primitives — must live at module scope so React never remounts their subtrees */
const Bar = ({ label, val, max, color }) => (
  <div className="bar">
    <div className="bar-head"><span>{label}</span><span>{Math.floor(val)}/{max}</span></div>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${clamp((val / max) * 100, 0, 100)}%`, background: color }} /></div>
  </div>
);

const Panel = ({ title, kanji, children }) => (
  <section className="panel">
    <div className="panel-kanji">{kanji}</div>
    <h2 className="panel-title">{title}</h2>
    {children}
  </section>
);

export default function NeoTokyoUnderworld({ initialPlayer = null, armoryBonuses = null, armoryProgress = 0, walletBalance = null, onPlayerChange = null, onOpenBattle = null, onOpenArmory = null, onOpenSocial = null, onOpenTrading = null, onOpenEconomy = null, onNavigate = null }) {
  const initialPlayerRef = useRef(initialPlayer);
  const [p, setP] = useState(newPlayer);
  const [screen, setScreen] = useState("home");
  const [log, setLog] = useState([{ t: "system", msg: "Welcome to Neo-Tokyo. The night is yours." }]);
  const [loaded, setLoaded] = useState(false);
  const [fightLog, setFightLog] = useState(null);
  const [bet, setBet] = useState(100);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [handleErr, setHandleErr] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [board, setBoard] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [gateMode, setGateMode] = useState("new");
  const [selGirl, setSelGirl] = useState(null);
  const [scene, setScene] = useState(null);
  const [jealousy, setJealousy] = useState(null);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [floaters, setFloaters] = useState([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [selItem, setSelItem] = useState(null);
  const [forging, setForging] = useState(null);
  const [brawl, setBrawl] = useState(null);
  const [lootQueue, setLootQueue] = useState([]);
  const [bjMode, setBjMode] = useState("classic");
  const [bj, setBj] = useState(null);
  const [bjFeed, setBjFeed] = useState([]);
  const bjFeedCache = useRef({});
  const [cricket, setCricket] = useState(null);
  const [evoConfirm, setEvoConfirm] = useState(false);
  const [ichi, setIchi] = useState(null);
  const [combatMode, setCombatMode] = useState("brawl");
  const [simiOpen, setSimiOpen] = useState(false);
  const [simiMsgs, setSimiMsgs] = useState([
    { role: "assistant", content: "*boot chime* ♪ Simi online! I'm your guide unit, senpai. Ask what to do next, how the Forge works, which ally route to build, or how to play ICHI with proper UNO rules." },
  ]);
  const [simiInput, setSimiInput] = useState("");
  const [simiBusy, setSimiBusy] = useState(false);
  const simiEndRef = useRef(null);
  const floatId = useRef(0);

  const float = useCallback((text, color = "#D98600") => {
    const id = ++floatId.current;
    setFloaters((f) => [...f, { id, text, color, x: 12 + Math.random() * 56 }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1600);
  }, []);
  const chatCache = useRef({});
  const lbPushAt = useRef(0);
  const cloudPushAt = useRef(0);

  const sha256 = async (s) => {
    try {
      if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest && typeof TextEncoder !== "undefined") {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* fall through to pure-JS */ }
    return sha256Sync(s);
  };
  const passKey = (h, pin) => sha256(`ntu-grid-pass|${h.toLowerCase()}|${pin}`);

  /* ---------- storage capability layer ---------- */
  const sharedOK = useRef(null); // null = untested, true/false = known

  const probeShared = useCallback(async () => {
    if (sharedOK.current !== null) return sharedOK.current;
    if (!window.storage || !window.storage.set) { sharedOK.current = false; return false; }
    try {
      const probeKey = "probe:" + Math.random().toString(36).slice(2, 8);
      const res = await window.storage.set(probeKey, "1", true);
      if (!res) throw new Error("null response");
      try { await window.storage.delete(probeKey, true); } catch (e) { /* fine */ }
      sharedOK.current = true;
    } catch (e) {
      sharedOK.current = false;
    }
    return sharedOK.current;
  }, []);

  const sGet = async (k, shared) => {
    if (shared && sharedOK.current === false) throw new Error("shared storage unavailable");
    return window.storage.get(k, shared);
  };
  const sSet = async (k, v, shared) => {
    if (shared && sharedOK.current === false) throw new Error("shared storage unavailable");
    const r = await window.storage.set(k, v, shared);
    if (!r) throw new Error("storage returned no result");
    return r;
  };
  const sList = async (prefix, shared) => {
    if (shared && sharedOK.current === false) throw new Error("shared storage unavailable");
    return window.storage.list(prefix, shared);
  };

  /* offline (local) fallback for the Grid Pass when shared storage is blocked */
  const localPassSave = async (key, data) => window.storage.set(`localacct:${key}`, JSON.stringify(data), false);
  const localPassLoad = async (key) => window.storage.get(`localacct:${key}`, false);
  const [, forceTick] = useState(0);
  const lastRegen = useRef({ energy: now(), nerve: now(), hp: now(), happy: now() });
  const saveTimer = useRef(null);

  const pushLog = useCallback((msg, t = "info") => {
    setLog((l) => [{ t, msg, at: now() }, ...l].slice(0, 60));
  }, []);

  /* ---------- load save ---------- */
  useEffect(() => {
    (async () => {
      try {
        const seededPlayer = initialPlayerRef.current;
        const r = seededPlayer ? { value: JSON.stringify(seededPlayer) } : await window.storage.get("ntu-save-v1");
        if (r && r.value) {
          const s = JSON.parse(r.value);
          const merged = processDay({ ...newPlayer(), ...s, stats: { ...newPlayer().stats, ...s.stats }, counters: { ...newPlayer().counters, ...s.counters } }, pushLog);
          if (s.statPoints === undefined) {
            const spent = (merged.stats.str + merged.stats.def + merged.stats.spd + merged.stats.dex) - 20;
            merged.statPoints = Math.max(0, (merged.level - 1) * 5 - spent);
            if (merged.statPoints > 0) pushLog(`New system — stats now come from level-ups. You have ${merged.statPoints} unspent stat points waiting.`, "system");
          }
          if (merged.bank > 0) {
            const earned = Math.floor(merged.bank * 0.02 * ((now() - (merged.bankAt || now())) / 3600000));
            if (earned >= 1) {
              merged.bank += earned; merged.bankAt = now();
              pushLog(`While you were away, the bank earned ${fmt(earned)} in interest.`, "system");
            }
          }
          setP(merged);
          pushLog("Save file loaded. Welcome back.", "system");
        } else {
          setP((pl) => processDay({ ...pl }, pushLog));
        }
      } catch (e) { setP((pl) => processDay({ ...pl }, pushLog)); }
      await probeShared();
      setLoaded(true);
    })();
  }, [pushLog]);

  useEffect(() => {
    if (!armoryBonuses) return;
    setP((player) => ({ ...player, armoryBonuses }));
  }, [armoryBonuses]);

  useEffect(() => {
    if (!loaded || !Number.isFinite(Number(walletBalance))) return;
    setP((player) => Number(player.money) === Number(walletBalance) ? player : { ...player, money: Math.max(0, Number(walletBalance)) });
  }, [loaded, walletBalance]);

  /* ---------- autosave ---------- */
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (onPlayerChange) await onPlayerChange(p);
        else await window.storage.set("ntu-save-v1", JSON.stringify(p));
      } catch (e) { /* retry on next mutation */ }
      if (p.handle && sharedOK.current && now() - lbPushAt.current > 30000) {
        lbPushAt.current = now();
        try {
          await sSet(`lb:${p.handle.toLowerCase()}`, JSON.stringify({
            h: p.handle, lvl: p.level, money: p.money, wins: p.counters.fightsWon, title: p.title || null, evo: p.evo || 0, seen: now(),
          }), true);
        } catch (e) { /* shared store unavailable */ }
      }
      if (p.cloudKey && now() - cloudPushAt.current > 15000) {
        cloudPushAt.current = now();
        try {
          if (sharedOK.current) await sSet(`acct:${p.cloudKey}`, JSON.stringify(p), true);
          else await localPassSave(p.cloudKey, p);
        } catch (e) { /* retry next save */ }
      }
    }, 800);
  }, [p, loaded, onPlayerChange]);

  /* ---------- regen tick ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      const t = now();
      setP((pl) => {
        let ch = false; const q = { ...pl };
        const r = lastRegen.current;
        const eInt = hasPerk(q, "nitro") ? 2500 : hasPerk(q, "turbo") ? 3000 : REGEN.energy;
        if (t - r.energy >= eInt && q.energy < maxEnergy(q)) {
          q.energy = clamp(q.energy + Math.floor((t - r.energy) / eInt), 0, maxEnergy(q)); r.energy = t; ch = true;
        }
        if (t - r.nerve >= REGEN.nerve && q.nerve < maxNerve(q)) {
          q.nerve = clamp(q.nerve + Math.floor((t - r.nerve) / REGEN.nerve), 0, maxNerve(q)); r.nerve = t; ch = true;
        }
        if (t - r.hp >= REGEN.hp && q.hp < maxHp(q) && q.hospitalUntil < t) {
          const heal = hasPerk(q, "firstaid") ? 4 : 2;
          q.hp = clamp(q.hp + Math.floor((t - r.hp) / REGEN.hp) * heal, 0, maxHp(q)); r.hp = t; ch = true;
        }
        if (q.bank > 0) {
          const interest = Math.floor(q.bank * 0.02 * ((t - (q.bankAt || t)) / 3600000));
          if (interest >= 1) { q.bank += interest; q.bankAt = t; ch = true; }
        }
        if (q.lastDay !== todayStr()) { processDay(q, null); ch = true; }
        const hFloor = hasPerk(q, "sunshine") ? 55 : 20;
        const hInt = hasPerk(q, "sunshine") ? REGEN.happyDecay * 3 : REGEN.happyDecay;
        if (t - r.happy >= hInt && q.happy > hFloor) { q.happy -= 1; r.happy = t; ch = true; }
        return ch ? q : pl;
      });
      forceTick((x) => x + 1); // refresh jail/hospital countdowns
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /* ---------- helpers ---------- */
  const gainXp = (q, amt) => {
    const morale = q.happy >= 70 ? 1.1 : 1;
    q.xp += Math.round(amt * (1 + gearBonuses(q).xp / 100) * morale * evoMult(q));
    while (q.xp >= xpNeed(q)) {
      q.xp -= xpNeed(q); q.level += 1;
      q.statPoints = (q.statPoints || 0) + 5;
      q.energy = maxEnergy(q); q.nerve = maxNerve(q); q.hp = maxHp(q);
      pushLog(`LEVEL UP — level ${q.level}! +5 stat points to spend. Bars refilled.`, "good");
      float("LEVEL UP! +5 stat points", "#D98600");
    }
  };

  const jailed = p.jailUntil > now();
  const hospitalized = p.hospitalUntil > now();
  const locked = jailed || hospitalized;
  const secsLeft = (until) => Math.max(0, Math.ceil((until - now()) / 1000));

  const weapon = itemById(p.weapon);
  const armor = itemById(p.armor);

  /* ---------- actions ---------- */
  /* fight playback: reveal one combat line at a time */
  useEffect(() => {
    if (!fightLog || revealIdx >= fightLog.lines.length) return;
    const iv = setInterval(() => setRevealIdx((i) => Math.min(i + 1, fightLog.lines.length)), 380);
    return () => clearInterval(iv);
  }, [fightLog, revealIdx]);

  const doCrime = (c) => {
    if (locked) return;
    if (p.nerve < c.nerve) { pushLog("Not enough nerve. Wait for it to build.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters }, stats: { ...pl.stats } };
      q.nerve -= c.nerve;
      const bonus = Math.min(0.15, q.stats.dex * 0.002 + q.level * 0.003);
      if (Math.random() < c.chance + bonus) {
        const pay = Math.round(rnd(c.pay[0], c.pay[1]) * (1 + 0.05 * fameTierIdx(q)) * evoMult(q));
        q.money += pay; q.counters.crimesDone += 1; bumpDaily(q, "crimes");
        gainXp(q, c.xp);
        let drops = "";
        if (Math.random() < 0.3) { addItem(q, "cell", 1); drops += " 電"; }
        if (Math.random() < 0.25) { addItem(q, "silk", 1); drops += " 糸"; }
        if (Math.random() < 0.03) { addItem(q, "star", 1); drops += " 星"; }
        pushLog(`Crime success — ${c.name}. You pocket ${fmt(pay)}${drops ? ` (+${drops.trim()})` : ""}.`, "good");
        float(`+${fmt(pay)}`, "#00A377");
        if (drops) float(`+${drops}`, "#D98600");
      } else if (Math.random() < 0.5) {
        if (hasPerk(q, "immunity") && Math.random() < 0.3) {
          pushLog("A patrol was inbound — but it rerouted a block early. Ayame's doing. You walk.", "good");
        } else {
          const jt = Math.round(c.jail * (hasPerk(q, "headsup") ? 0.65 : 1));
          q.jailUntil = now() + jt * 1000;
          pushLog(`Busted! The keisatsu drag you in for ${jt}s.`, "bad");
        }
      } else {
        pushLog(`Failed — ${c.name}. You slip away empty-handed.`, "bad");
      }
      return q;
    });
  };

  const allocateStat = (key, n) => {
    const spend = Math.min(n, p.statPoints || 0);
    if (spend <= 0) { pushLog("No stat points to spend — level up to earn more.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl, stats: { ...pl.stats }, counters: { ...pl.counters } };
      q.statPoints -= spend;
      q.stats[key] += spend;
      q.counters.trains += spend;
      for (let i = 0; i < spend; i++) bumpDaily(q, "trains");
      pushLog(`Allocated +${spend} ${key.toUpperCase()}.`, "good");
      return q;
    });
    float(`${key.toUpperCase()} +${spend}`, "#0C93CC");
  };

  const respecStats = () => {
    const cost = p.level * 1000;
    const pool = (p.stats.str + p.stats.def + p.stats.spd + p.stats.dex) - 20;
    if (pool <= 0) { pushLog("Nothing to reset — your stats are at base.", "info"); return; }
    if (p.money < cost) { pushLog(`A full respec costs ${fmt(cost)}.`, "bad"); return; }
    setP((pl) => {
      const q = { ...pl, stats: { str: 5, def: 5, spd: 5, dex: 5 } };
      q.money -= cost;
      q.statPoints = (q.statPoints || 0) + pool;
      q.hp = Math.min(q.hp, maxHp(q));
      pushLog(`Respec complete — ${pool} points refunded for ${fmt(cost)}.`, "system");
      return q;
    });
    float("STATS RESET", "#D98600");
  };

  const addItem = (q, id, n = 1) => { q.inventory = { ...q.inventory }; q.inventory[id] = (q.inventory[id] || 0) + n; };
  const bumpDaily = (q, key) => {
    if (!q.daily) return;
    q.daily = { ...q.daily, prog: { ...q.daily.prog, [key]: (q.daily.prog[key] || 0) + 1 } };
  };

  const fight = (e) => {
    if (locked) return;
    if (p.energy < 8) { pushLog("Fighting takes 8 energy. You're running on fumes.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      q.energy -= 8;
      const gb = gearBonuses(q);
      const eff = { str: q.stats.str + gb.str, def: q.stats.def + gb.def, spd: q.stats.spd + gb.spd, dex: q.stats.dex + gb.dex };
      const wPow = equipPower(q, "weapon");
      const aPow = equipPower(q, "armor");
      let myHp = q.hp, foeHp = e.hp;
      const pMax = maxHp(q), eMax = e.hp;
      const lines = [{ t: `You square off against ${e.name} (Lv ${e.lvl}) under the neon rain.`, kind: "info", myHp, foeHp }];
      let round = 1;
      while (myHp > 0 && foeHp > 0 && round <= 30) {
        const meFirst = eff.spd + rnd(0, 20) >= e.lvl * 3 + rnd(0, 20);
        const myHit = Math.max(1, Math.round((eff.str + wPow) * (0.8 + Math.random() * 0.5) - e.def * 0.5));
        const foeHit = Math.max(1, Math.round(e.atk * (0.8 + Math.random() * 0.5) - (eff.def + aPow) * 0.4));
        const dodge = Math.random() < Math.min(0.35, eff.dex * 0.004);
        const crit = Math.random() < 0.12 + gb.crit / 100;
        const seq = meFirst ? ["me", "foe"] : ["foe", "me"];
        for (const turn of seq) {
          if (myHp <= 0 || foeHp <= 0) break;
          if (turn === "me") {
            const dmg = crit ? Math.round(myHit * 1.6) : myHit;
            foeHp = Math.max(0, foeHp - dmg);
            lines.push({ t: `You strike for ${dmg}${crit ? " — CRITICAL!" : ""}`, kind: crit ? "crit" : "me", dmg, myHp, foeHp });
          } else if (dodge) {
            lines.push({ t: "You weave past the attack!", kind: "dodge", myHp, foeHp });
          } else {
            myHp = Math.max(0, myHp - foeHit);
            lines.push({ t: `${e.name.split(" ")[0]} hits you for ${foeHit}`, kind: "foe", dmg: foeHit, myHp, foeHp });
          }
        }
        round++;
      }
      if (foeHp <= 0 && myHp > 0) {
        const pay = Math.round(rnd(e.pay[0], e.pay[1]) * (1 + gb.loot / 100) * evoMult(q));
        q.money += pay; q.hp = Math.max(1, myHp); q.counters.fightsWon += 1; bumpDaily(q, "fights");
        gainXp(q, e.xp);
        const scraps = 1 + Math.floor(e.lvl / 6);
        addItem(q, "scrap", scraps);
        let drops = `鉄×${scraps}`;
        if (Math.random() < 0.12 + e.lvl * 0.02) { addItem(q, "oni", 1); drops += " · 紅×1"; }
        if (e.boss) {
          addItem(q, "star", 1); addItem(q, "oni", 2); drops += " · 星×1 · 紅×2";
          q.flags = Array.from(new Set([...(q.flags || []), "boss_slain"]));
        }
        lines.push({ t: `VICTORY — you take ${fmt(pay)}. Loot: ${drops}`, kind: "win", myHp: q.hp, foeHp: 0 });
        pushLog(`Defeated ${e.name} and looted ${fmt(pay)} (${drops}).`, "good");
        float(`+${fmt(pay)}`, "#00A377"); float(`+ ${drops}`, "#D98600");
      } else {
        const stay = hasPerk(q, "guardian") ? 22 : 45;
        q.hp = 0; q.hospitalUntil = now() + stay * 1000;
        lines.push({ t: `DEFEAT — you wake up in Kannon General Hospital (${stay}s)${hasPerk(q, "guardian") ? ". Hana pulls strings for early release." : "."}`, kind: "lose", myHp: 0, foeHp });
        pushLog(`${e.name} put you in the hospital.`, "bad");
      }
      setFightLog({ enemy: e, lines, pMax, eMax });
      setRevealIdx(1);
      return q;
    });
  };

  const startBrawl = (e) => {
    if (locked) return;
    if (p.energy < 8) { pushLog("Fighting takes 8 energy. You're running on fumes.", "bad"); return; }
    setP((pl) => ({ ...pl, energy: pl.energy - 8 }));
    setBrawl({ enemy: e });
  };

  const applyBrawlResult = (e, win, hpFrac) => {
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      if (win) {
        const gb = gearBonuses(q);
        const pay = Math.round(rnd(e.pay[0], e.pay[1]) * 1.25 * (1 + gb.loot / 100) * evoMult(q));
        q.money += pay; q.hp = Math.max(1, Math.round(maxHp(q) * hpFrac));
        q.counters.fightsWon += 1; bumpDaily(q, "fights");
        gainXp(q, Math.round(e.xp * 1.2));
        const scraps = 1 + Math.floor(e.lvl / 6);
        addItem(q, "scrap", scraps);
        let drops = `鉄×${scraps}`;
        if (Math.random() < 0.15 + e.lvl * 0.02) { addItem(q, "oni", 1); drops += " · 紅×1"; }
        if (e.boss) {
          addItem(q, "star", 1); addItem(q, "oni", 2); drops += " · 星×1 · 紅×2";
          q.flags = Array.from(new Set([...(q.flags || []), "boss_slain"]));
        }
        pushLog(`Brawl won vs ${e.name} — ${fmt(pay)} (+25% brawl bonus) and ${drops}.`, "good");
        float(`+${fmt(pay)}`, "#00A377"); float(`+ ${drops}`, "#D98600");
      } else {
        const stay = hasPerk(q, "guardian") ? 22 : 45;
        q.hp = 0; q.hospitalUntil = now() + stay * 1000;
        pushLog(`${e.name} beat you down in the brawl. Hospital: ${stay}s.`, "bad");
      }
      return q;
    });
    setBrawl(null);
  };

  const priceOf = (item) => Math.round(item.cost * (hasPerk(p, "discount") ? 0.9 : 1));

  const buy = (item) => {
    const cost = priceOf(item);
    if (p.money < cost) { pushLog("Not enough yen.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl, inventory: { ...pl.inventory } };
      q.money -= cost;
      addItem(q, item.id, 1);
      if (item.type === "weapon") { q.weapon = item.id; pushLog(`Bought & equipped ${item.name}.`, "good"); }
      else if (item.type === "armor") { q.armor = item.id; pushLog(`Bought & equipped ${item.name}.`, "good"); }
      else pushLog(`Bought ${item.name}.`, "good");
      return q;
    });
    float(`-${fmt(cost)}`, "#E23A6B");
  };

  const tryGearDrop = (q, e) => {
    const chance = e.boss ? 1 : 0.18 + e.lvl * 0.004;
    if (Math.random() > chance) return null;
    q.pity = (q.pity || 0) + 1;
    let g = rollGear(e.lvl, !!e.boss);
    if (q.pity >= 40 && g.rarity !== "legendary") {
      let tries = 0;
      while (g.rarity !== "legendary" && tries++ < 600) g = rollGear(e.lvl, true);
    }
    if (g.rarity === "legendary") q.pity = 0;
    if (q.autoSalvage && g.rarity === "common") {
      addItem(q, "scrap", 2);
      pushLog("Common drop auto-salvaged → 鉄×2.", "info");
      return null;
    }
    q.gear = [...(q.gear || []), g].slice(-60);
    const tag = g.rarity === "legendary" ? "⟡ LEGENDARY DROP" : g.rarity === "golden" ? "✦ GOLDEN DROP" : "✦ Gear drop";
    const msg = `${tag} — ${g.name} (${g.type === "weapon" ? "ATK" : "DEF"} ${gearPower(g)})`;
    pushLog(msg, g.rarity === "legendary" ? "system" : "good");
    setLootQueue((l) => [...l, g]);
    return msg;
  };

  const enhanceGear = (uid) => {
    const g = gearOf(p, uid);
    if (!g || g.plus >= 10) return;
    const ri = RAR_IDX[g.rarity];
    const sc = (g.plus + 1) * (ri + 1), yen = (g.plus + 1) * 400 * (ri + 1);
    if ((p.inventory.scrap || 0) < sc || p.money < yen) { pushLog(`Enhancing needs 鉄×${sc} + ${fmt(yen)}.`, "bad"); return; }
    setP((pl) => {
      const q = { ...pl, inventory: { ...pl.inventory }, gear: pl.gear.map((x) => (x.uid === uid ? { ...x, plus: x.plus + 1 } : x)) };
      q.inventory.scrap -= sc; if (q.inventory.scrap <= 0) delete q.inventory.scrap;
      q.money -= yen;
      pushLog(`Enhanced ${g.name} to +${g.plus + 1}.`, "good");
      return q;
    });
    float(`${g.name} +${g.plus + 1}!`, RARITY_COLOR[g.rarity]);
  };

  const salvageGear = (uid) => {
    const g = gearOf(p, uid);
    if (!g) return;
    const sc = [2, 4, 8, 16, 40][RAR_IDX[g.rarity]];
    setP((pl) => {
      const q = { ...pl, gear: pl.gear.filter((x) => x.uid !== uid) };
      if (q.weapon === uid) q.weapon = null;
      if (q.armor === uid) q.armor = null;
      addItem(q, "scrap", sc);
      pushLog(`Salvaged ${g.name} → 鉄×${sc}.`, "info");
      return q;
    });
    setSelItem(null);
    float(`+ 鉄×${sc}`, "#2C2240");
  };

  const equipItem = (id) => {
    if (isGearId(id)) {
      const g = gearOf(p, id);
      if (!g) return;
      const was = p[g.type] === id;
      setP((pl) => ({ ...pl, [g.type]: pl[g.type] === id ? null : id }));
      float(was ? "Unequipped" : `Equipped ${g.name}`, "#0C93CC");
      return;
    }
    const it = itemById(id);
    if (!it || !p.inventory[id] || (it.type !== "weapon" && it.type !== "armor")) return;
    setP((pl) => ({ ...pl, [it.type]: pl[it.type] === id ? null : id }));
    float(p[it.type] === id ? "Unequipped" : `Equipped ${it.name}`, "#0C93CC");
  };

  const craft = (recipe) => {
    if (locked) return;
    const out = itemById(recipe.out);
    const short = Object.entries(recipe.mats).filter(([m, n]) => (p.inventory[m] || 0) < n);
    if (short.length || p.money < recipe.money) {
      pushLog(`The forge needs more: ${short.map(([m, n]) => `${itemById(m).kanji}×${n}`).join(" ")}${p.money < recipe.money ? ` and ${fmt(recipe.money)}` : ""}.`, "bad");
      return;
    }
    setForging(recipe.out);
    setTimeout(() => setForging(null), 900);
    setP((pl) => {
      const q = { ...pl, inventory: { ...pl.inventory }, counters: { ...pl.counters } };
      Object.entries(recipe.mats).forEach(([m, n]) => {
        q.inventory[m] -= n; if (q.inventory[m] <= 0) delete q.inventory[m];
      });
      q.money -= recipe.money;
      addItem(q, recipe.out, 1);
      q.counters.crafts += 1; bumpDaily(q, "crafts");
      gainXp(q, 25);
      pushLog(`Forged ${out.name} — the anvil sings.`, "good");
      return q;
    });
    float(`✦ ${out.name} forged!`, RARITY_COLOR[out.rarity]);
  };

  /* ---------- Simi the guide robot ---------- */
  const simiSnapshot = () => {
    const mats = MATERIALS.map((m) => `${m.icon}${p.inventory[m.id] || 0}`).join(" ");
    const allies = GIRLS.map((g) => {
      const gs = girlState(p, g.id);
      return `${shortName(g.id)}: ch${gs.stage}/7 trust${gs.aff}`;
    }).join("; ");
    const claimable = MISSIONS.filter((m) => !p.claimed.includes(m.id) && p.counters[m.stat] >= m.goal).map((m) => m.name).join(", ") || "none";
    return JSON.stringify({
      screen, level: p.level, money: Math.floor(p.money),
      energy: `${p.energy}/${maxEnergy(p)}`, nerve: `${p.nerve}/${maxNerve(p)}`,
      hp: `${p.hp}/${maxHp(p)}`, happy: p.happy, stats: p.stats, unspentStatPoints: p.statPoints || 0, renown: `${p.fame || 0} (${fameTierName(p)})`, evolutions: p.evo || 0,
      weapon: (equipInfo(p, "weapon") || {}).name || "bare fists",
      armor: (equipInfo(p, "armor") || {}).name || "none",
      bestGear: (p.gear || []).map((g) => `${g.rarity} ${g.name}+${g.plus}`).slice(-5).join("; ") || "none",
      job: p.job, materials: mats, allies,
      jailed, hospitalized, claimableMissions: claimable,
      record: p.counters,
    });
  };

  const simiFallback = (q) => {
    const s = q.toLowerCase();
    const has = (...w) => w.some((x) => s.includes(x));
    if (has("what", "now", "next", "do", "start") && !has("forge", "romance", "affection")) {
      if (jailed) return "*whirr* You're in a cell, senpai — nothing to do but wait out the timer. Nerve keeps regenerating though!";
      if (hospitalized) return "Rest up! Hana would say the same. Your HP refills on release. ♪";
      const done = MISSIONS.find((m) => !p.claimed.includes(m.id) && p.counters[m.stat] >= m.goal);
      if (p.level >= EVOLVE_LEVEL) return `*whirr* Senpai... you can EVOLVE. Home screen. Permanent +${((p.evo || 0) + 1) * 10}% power tier awaits. The chrysalis calls.`;
      if (done) return `*beep!* You have an unclaimed mission — "${done.name}"! Free ${fmt(done.reward)} waiting on the Missions screen!`;
      if (p.nerve >= 8) return "Your nerve bar is loaded — hit the Crimes screen! Smuggle Rare Manga pays well at your level, and crimes drop 🔋 and 🧵 for the Forge.";
      if ((p.statPoints || 0) > 0) return `*beep!* You have ${p.statPoints} unspent stat points on the Stats screen! Spend them — STR for damage, SPD to strike first, DEX to dodge.`;
      if (p.energy >= maxEnergy(p) * 0.7) return "Lots of energy, senpai! Pick a fight for yen and 鉄 scrap, or work a shift.";
      return "Bars are low — grab a Melon Soda, work a shift, or spend time on a Hearts romance route. Romance chapters unlock strong permanent perks. ♪";
    }
    if (has("forge", "craft", "material", "recipe")) return "The Night Forge turns drops into gear! 🔩 from fights, 🔋🧵 from contracts, 🔻 Crimson Alloy from tough enemies, and 🌟 from jackpots. The Apex Blade (+65) costs 12🔩 6🔻 2🌟 and ¥20,000. *beep*";
    if (has("rich", "money", "yen", "broke")) return "Fastest yen: contracts when nerve is up, fights when energy is up, and job shifts between them. Kaori's chapter 7 unlocks the Ward Network's highest-paying contracts. ♪";
    if (has("kaori", "sakura")) return "Kaori coordinates Ward 09 relief. Her chapter 4 opens the local supplier discount, and chapter 7 unlocks Ward Network contracts. *beep*";
    if (has("rin")) return "Rin needs speed to be impressed — train SPD to 15 for ch3 and 30 for ch4. Her perks make your energy regen way faster. Never ask her to slow down! ♪";
    if (has("hana")) return "Hana's clinic route asks for 70 happiness at chapter 3 and 25 DEF at chapter 4. Her perks improve HP regeneration and hospital recovery. *beep*";
    if (has("yumi")) return "Yumi's community stage route needs 3 arcade wins for chapter 3 and ¥12,000 for the fair-contract chapter. Her perks protect morale and slightly improve arcade luck.";
    if (has("aya", "ayame")) return "Aya's investigation route uses your ward knowledge: 15 completed contracts for chapter 3 and level 8 for chapter 4. Her perks reduce jail time and false busts.";
    if (has("ally", "allies", "trust", "support", "bond", "romance", "girl", "date", "partner", "affection")) return "Open Hearts to date Sakura, Rin, Hana, Yumi or Ayame. Hangouts and gifts raise affection; chapter six makes the relationship choice, and other active romances can trigger jealousy. ♪";
    if (has("evolve", "prestige", "rebirth", "reset run")) return `Evolve unlocks at level ${EVOLVE_LEVEL} on the Home screen, senpai! Reset the run, keep your gear/ally trust/bank, and gain +10% XP, +10% yen and +5 max energy forever per evolution. *beep*`;
    if (has("uno", "ichi", "card game")) return "ICHI now follows classic UNO rules: match color, number or symbol; no stacking; +4 only when you hold no active-color card; call UNO at one card or draw 2. First out takes the in-game yen pot. *beep*";
    if (has("stat", "point", "train", "gym", "build", "respec")) return "Stats come from level-ups now — +5 points per level, spent freely on the Stats screen. STR = damage, DEF = tanking, SPD = first strike + move speed, DEX = dodge + crit. Respec anytime for level×1000 yen. *beep*";
    if (has("fight", "combat", "enemy", "lose", "hospital")) return "Fights cost 8 energy. STR = damage, DEF = tanking, SPD = striking first, DEX = dodging. If Kenji beats you up, buy a Bokken and Jacket first! Losing means the hospital, but Hana can halve that. *beep*";
    if (has("jail", "police", "bust", "arrest")) return "Busted crimes have a 50% jail chance. Ayame's perks shrink sentences and can void busts entirely at ch7. Or just... commit better crimes, senpai. ♪";
    if (has("grid", "pin", "login", "handle", "save")) return "Your progress is tied to the Google account you used to sign in, senpai. No extra PIN is needed — cloud save follows that account automatically!";
    if (has("chat", "player", "rank", "leader")) return "World Chat and City Rankings are in the nav — real players, live! Claim a handle first. Be nice out there or I'll *beep* disapprovingly.";
    if (has("hi", "hello", "hey", "who are you", "simi")) return "*happy beep* I'm Simi! Guide unit, morale officer, and the only resident of this city who won't rob you. Ask me 'what now?' anytime, senpai! ♪";
    return "*processing whirr* Try asking about contracts, fights, the Forge, money, allies, UNO, or just 'what should I do now?' ♪";
  };

  const askSimi = async (text) => {
    const t = (text || simiInput).trim();
    if (!t || simiBusy) return;
    setSimiInput("");
    const msgs = [...simiMsgs, { role: "user", content: t }];
    setSimiMsgs(msgs);
    setSimiBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    setSimiMsgs((m) => [...m, { role: "assistant", content: simiFallback(t) }]);
    setSimiBusy(false);
  };

  useEffect(() => {
    if (simiOpen && simiEndRef.current) simiEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [simiMsgs, simiBusy, simiOpen]);

  const useItem = (id) => {
    const item = itemById(id);
    if (!item || !p.inventory[id]) return;
    setP((pl) => {
      const q = { ...pl, inventory: { ...pl.inventory } };
      q.inventory[id] -= 1; if (q.inventory[id] <= 0) delete q.inventory[id];
      if (item.effect === "hp") q.hp = clamp(q.hp + item.amount, 0, maxHp(q));
      if (item.effect === "energy") q.energy = clamp(q.energy + item.amount, 0, maxEnergy(q) + 20);
      if (item.effect === "happy") q.happy = clamp(q.happy + item.amount, 0, 100);
      if (item.effect === "nerve") q.nerve = clamp(q.nerve + item.amount, 0, maxNerve(q) + 5);
      pushLog(`Used ${item.name} (${item.desc}).`, "good");
      return q;
    });
  };

  const workShift = () => {
    const job = JOBS.find((j) => j.id === p.job);
    if (!job || job.id === "none" || locked) return;
    if (p.energy < job.energy) { pushLog(`A shift needs ${job.energy} energy.`, "bad"); return; }
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      q.energy -= job.energy; q.money += Math.round(job.pay * evoMult(q)); q.counters.shifts += 1; bumpDaily(q, "shifts");
      q.happy = clamp(q.happy - 3, 0, 100);
      gainXp(q, job.xp);
      pushLog(`Worked a shift as ${job.name}: ${fmt(job.pay)}.`, "good");
      float(`+${fmt(job.pay)}`, "#00A377");
      return q;
    });
  };

  const addFame = (q, winAmt) => {
    const before = fameTierIdx(q);
    q.fame = (q.fame || 0) + Math.max(1, Math.floor(winAmt / 500));
    const after = fameTierIdx(q);
    if (after > before) {
      pushLog(`Your name travels — the ward now knows you as 「${FAME_TIERS[after].n}」. Syndicates pay +${after * 5}% on crimes; hearts warm faster.`, "system");
      float(`RENOWN UP — ${FAME_TIERS[after].n}`, "#D98600");
    }
  };

  const tryApproach = (q, net) => {
    if (net < 1500 || Math.random() > 0.3) return;
    const eligible = GIRLS.filter((g) => !hasFlag(q, `heartbroken_${g.id}`));
    if (!eligible.length) return;
    const g = eligible[rnd(0, eligible.length - 1)];
    const gs = girlState(q, g.id);
    const gain = rnd(2, 5) + fameTierIdx(q);
    setGirl(q, g.id, { aff: gs.aff + gain });
    const lines = {
      sakura: `Sakura's people report your winnings before you've even cashed out. She pretends not to be impressed. Affection +${gain}.`,
      rin: `Rin pulls up outside the casino. "Big winner needs a fast exit?" Affection +${gain}.`,
      hana: `Hana texts: "Gambling is bad for your health. ...how much did you win though?" Affection +${gain}.`,
      yumi: `Yumi materializes at your elbow. "Rich AND lucky?! Buy me a crepe, high roller!" Affection +${gain}.`,
      ayame: `Ayame watches from the bar. "Legally acquired for once. I'm almost proud." Affection +${gain}.`,
    };
    pushLog(lines[g.id], "good");
    float(`♥ ${shortName(g.id)} +${gain}`, "#E23A6B");
  };

  const bjBroadcast = async (net) => {
    if (net < 1000 || !sharedOK.current || !p.handle) return;
    try {
      await sSet(`bjfeed:${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        JSON.stringify({ h: p.handle, amt: net, t: Date.now() }), true);
    } catch (e) { /* fine */ }
  };

  const bjDraw = (st) => st.deck.pop();

  const applyBjSettle = (step) => {
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      if (step.payout > 0) q.money += step.payout;
      if (step.net > 0) {
        q.counters.gambleWins += 1; bumpDaily(q, "wins");
        addFame(q, step.net);
        tryApproach(q, step.net);
        pushLog(`Blackjack — ${step.outcome}: +${fmt(step.net)}.`, "good");
      } else if (step.net === 0) pushLog("Blackjack — push. Stake returned.", "info");
      else pushLog(`Blackjack — ${step.outcome}: -${fmt(-step.net)}.`, "bad");
      return q;
    });
    if (step.net > 0) { float(`+${fmt(step.net)}`, "#00A377"); bjBroadcast(step.net); }
    else if (step.net < 0) float(`-${fmt(-step.net)}`, "#E23A6B");
  };

  const bjResolve = (stIn) => {
    /* simulate the rest of the round, but emit it as a timed script */
    const sim = {
      deck: [...stIn.deck],
      you: { ...stIn.you, cards: [...stIn.you.cards] },
      bots: stIn.bots.map((b) => ({ ...b, cards: [...b.cards] })),
      dealer: { ...stIn.dealer, cards: [...stIn.dealer.cards] },
    };
    const draw = () => sim.deck.pop();
    const script = [];
    sim.bots.forEach((bt, bi) => {
      script.push({ t: "turn", who: `bot${bi}`, name: bt.name });
      while (handValue(bt.cards) < bt.style) {
        const c = draw();
        bt.cards.push(c);
        script.push({ t: "botcard", bi, c });
      }
      if (handValue(bt.cards) > 21) script.push({ t: "bust", bi });
      else script.push({ t: "stand", bi });
    });
    script.push({ t: "reveal" });
    while (handValue(sim.dealer.cards) < 17) {
      const c = draw();
      sim.dealer.cards.push(c);
      script.push({ t: "dealercard", c });
    }
    const dv = handValue(sim.dealer.cards);
    const v = handValue(sim.you.cards);
    const stake = sim.you.bet * (sim.you.doubled ? 2 : 1);
    const natural = v === 21 && sim.you.cards.length === 2 && !sim.you.doubled;
    const dealerNatural = handValue(sim.dealer.cards.slice(0, 2)) === 21;
    let payout = 0, outcome = "";
    if (v > 21) { payout = 0; outcome = "BUST"; }
    else if (natural && dealerNatural) { payout = stake; outcome = "PUSH"; }
    else if (natural) { payout = Math.round(sim.you.bet * 2.5); outcome = "BLACKJACK!"; }
    else if (dv > 21) { payout = stake * 2; outcome = "DEALER BUSTS"; }
    else if (v > dv) { payout = stake * 2; outcome = "YOU WIN"; }
    else if (v === dv) { payout = stake; outcome = "PUSH"; }
    else { payout = 0; outcome = "HOUSE WINS"; }
    script.push({ t: "result", outcome, net: payout - stake, payout });
    setBj({
      ...stIn,
      you: { ...stIn.you, cards: [...stIn.you.cards] },
      bots: stIn.bots.map((b) => ({ ...b, cards: [...b.cards] })),
      dealer: { ...stIn.dealer, cards: [...stIn.dealer.cards] },
      phase: "acting", turn: null, script, cursor: 0,
      talk: handValue(stIn.you.cards) > 21 ? "You bust. The table winces in sympathy." : "You stand. The table plays on…",
    });
  };

  /* timed playback of the round script — one action at a time */
  useEffect(() => {
    if (!bj || bj.phase !== "acting") return;
    const step = bj.script && bj.script[bj.cursor];
    if (!step) return;
    const delay = step.t === "turn" ? 600 : step.t === "reveal" ? 750 : step.t === "result" ? 800 : 620;
    const id = setTimeout(() => {
      if (step.t === "result") applyBjSettle(step);
      setBj((cur) => {
        if (!cur || cur.phase !== "acting") return cur;
        const st = {
          ...cur, cursor: cur.cursor + 1,
          bots: cur.bots.map((b) => ({ ...b, cards: [...b.cards] })),
          dealer: { ...cur.dealer, cards: [...cur.dealer.cards] },
        };
        if (step.t === "turn") { st.turn = step.who; st.talk = `${step.name} plays…`; }
        if (step.t === "botcard") st.bots[step.bi].cards.push(step.c);
        if (step.t === "bust") {
          st.bots[step.bi].bust = true; st.turn = null;
          st.talk = BJ_TALK.bust[rnd(0, BJ_TALK.bust.length - 1)];
        }
        if (step.t === "stand") {
          st.turn = null;
          st.talk = `${st.bots[step.bi].name} stands on ${handValue(st.bots[step.bi].cards)}.`;
        }
        if (step.t === "reveal") { st.dealer.revealed = true; st.turn = "dealer"; st.talk = "Madam Koi turns her hole card…"; }
        if (step.t === "dealercard") st.talk = "Madam Koi draws.";
        if (step.t === "result") {
          st.phase = "result"; st.turn = null;
          st.outcome = step.outcome; st.net = step.net;
          st.talk = step.net > 0 ? BJ_TALK.win[rnd(0, BJ_TALK.win.length - 1)] : BJ_TALK.lose[rnd(0, BJ_TALK.lose.length - 1)];
        }
        return st;
      });
    }, delay);
    return () => clearTimeout(id);
  }, [bj]);


  const ichiStart = () => {
    if (locked) return;
    const b = clamp(bet, 10, Math.floor(p.money));
    if (p.money < 10) { pushLog("You need at least ¥10 to sit down for ICHI.", "bad"); return; }
    setP((pl) => ({ ...pl, money: pl.money - b }));
    setIchi({ bet: b, id: Date.now() });
  };

  const ichiEnd = ({ win, winnerName }) => {
    const b = ichi ? ichi.bet : 0;
    setIchi(null);
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      if (win) {
        const payout = b * 3;
        q.money += payout;
        q.counters.gambleWins += 1; bumpDaily(q, "wins");
        addFame(q, payout - b); tryApproach(q, payout - b);
        pushLog(`ICHI! You shed your last card and take the pot: +${fmt(payout - b)}.`, "good");
      } else {
        pushLog(`${winnerName} sheds last and takes the pot. -${fmt(b)}.`, "bad");
      }
      return q;
    });
    if (win) float(`一 ICHI! +${fmt(b * 2)}`, "#D98600");
    else float(`-${fmt(b)}`, "#E23A6B");
  };

  const cricketStart = () => {
    if (locked) return;
    const b = clamp(bet, 10, Math.floor(p.money));
    if (p.money < 10) { pushLog("You need at least ¥10 for the cricket bookies.", "bad"); return; }
    setP((pl) => ({ ...pl, money: pl.money - b }));
    setCricket({ bet: b, id: Date.now() });
  };

  const cricketEnd = ({ runs, mult }) => {
    const b = cricket ? cricket.bet : 0;
    setCricket(null);
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      const payout = b * mult;
      if (payout > 0) q.money += payout;
      const net = payout - b;
      if (net > 0) {
        q.counters.gambleWins += 1; bumpDaily(q, "wins");
        addFame(q, net); tryApproach(q, net);
        pushLog(`Street cricket — ${runs} runs: +${fmt(net)}.`, "good");
      } else if (net === 0) pushLog(`Street cricket — ${runs} runs. Stake returned.`, "info");
      else pushLog(`Street cricket — out for ${runs}. -${fmt(-net)}.`, "bad");
      return q;
    });
    const netF = b * mult - b;
    if (netF > 0) float(`+${fmt(netF)}`, "#00A377");
    else if (netF < 0) float(`-${fmt(-netF)}`, "#E23A6B");
  };

  const bjStart = () => {
    if (locked) return;
    const b = clamp(bet, 10, Math.floor(p.money));
    if (p.money < 10) { pushLog("You need at least ¥10 to sit at the table.", "bad"); return; }
    setP((pl) => ({ ...pl, money: pl.money - b }));
    const st = {
      phase: "player", deck: newDeck(),
      you: { cards: [], bet: b, doubled: false },
      bots: BJ_BOTS.map((bt) => ({ ...bt, cards: [] })),
      dealer: { cards: [], revealed: false },
      talk: BJ_TALK.deal[rnd(0, BJ_TALK.deal.length - 1)],
    };
    st.you.cards = [bjDraw(st), bjDraw(st)];
    st.bots.forEach((bt) => { bt.cards = [bjDraw(st), bjDraw(st)]; });
    st.dealer.cards = [bjDraw(st), bjDraw(st)];
    setBj({ ...st, phase: "deal", talk: "Madam Koi deals…" });
    setTimeout(() => {
      if (handValue(st.you.cards) === 21) { bjResolve({ ...st, talk: "Natural 21!" }); return; }
      setBj((cur) => (cur && cur.phase === "deal" ? { ...cur, phase: "player", talk: "Your move." } : cur));
    }, 1100);
  };

  const bjHit = () => {
    if (!bj || bj.phase !== "player") return;
    const st = { ...bj, you: { ...bj.you, cards: [...bj.you.cards, bjDraw(bj)] } };
    if (handValue(st.you.cards) > 21) { bjResolve(st); return; }
    if (handValue(st.you.cards) === 21) { bjResolve(st); return; }
    setBj(st);
  };

  const bjStand = () => { if (bj && bj.phase === "player") bjResolve({ ...bj, you: { ...bj.you } }); };

  const bjDouble = () => {
    if (!bj || bj.phase !== "player" || bj.you.cards.length !== 2) return;
    if (p.money < bj.you.bet) { pushLog("Not enough yen to double down.", "bad"); return; }
    setP((pl) => ({ ...pl, money: pl.money - bj.you.bet }));
    const st = { ...bj, you: { ...bj.you, doubled: true, cards: [...bj.you.cards, bjDraw(bj)] } };
    bjResolve(st);
  };

  /* live table feed of real players' wins */
  useEffect(() => {
    if (screen !== "casino" || bjMode !== "blackjack" || sharedOK.current !== true) return;
    const poll = async () => {
      try {
        const res = await sList("bjfeed:", true);
        const keys = (res && res.keys ? res.keys : []).map(keyName).filter(Boolean).sort().slice(-5);
        const rows = [];
        for (const k of keys) {
          if (!(k in bjFeedCache.current)) {
            try { const r = await sGet(k, true); bjFeedCache.current[k] = r && r.value ? JSON.parse(r.value) : null; }
            catch (e) { bjFeedCache.current[k] = null; }
          }
          if (bjFeedCache.current[k]) rows.push(bjFeedCache.current[k]);
        }
        setBjFeed(rows.sort((a, b) => b.t - a.t));
      } catch (e) { /* keep last */ }
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [screen, bjMode]);

  const gamble = (kind) => {
    if (locked) return;
    const b = clamp(bet, 10, p.money);
    if (p.money < 10) { pushLog("You need at least ¥10 to gamble.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      const lucky = hasPerk(q, "lucky");
      if (kind === "coin") {
        if (Math.random() < (lucky ? 0.53 : 0.48)) { q.money += b; q.counters.gambleWins += 1; bumpDaily(q, "wins"); addFame(q, b); tryApproach(q, b); pushLog(`Coin flip WON — +${fmt(b)}.`, "good"); float(`+${fmt(b)}`, "#00A377"); }
        else { q.money -= b; pushLog(`Coin flip lost — -${fmt(b)}.`, "bad"); }
      } else {
        const roll = Math.random();
        if (roll < (lucky ? 0.07 : 0.05)) { q.money += b * 10; q.counters.gambleWins += 1; bumpDaily(q, "wins"); addFame(q, b * 10); tryApproach(q, b * 10); addItem(q, "star", 1); pushLog(`JACKPOT 七七七 — +${fmt(b * 10)} and a 星 Star Shard!`, "good"); float(`七七七 +${fmt(b * 10)}`, "#D98600"); float("+ 星", "#D98600"); }
        else if (roll < (lucky ? 0.36 : 0.3)) { q.money += b * 2; q.counters.gambleWins += 1; bumpDaily(q, "wins"); addFame(q, b * 2); tryApproach(q, b * 2); pushLog(`Slots paid double — +${fmt(b * 2)}.`, "good"); float(`+${fmt(b * 2)}`, "#00A377"); }
        else { q.money -= b; pushLog(`Slots ate your bet — -${fmt(b)}.`, "bad"); }
      }
      return q;
    });
  };

  const claimMission = (m) => {
    if (p.claimed.includes(m.id) || p.counters[m.stat] < m.goal) return;
    setP((pl) => {
      const q = { ...pl, claimed: [...pl.claimed, m.id] };
      q.money += m.reward; gainXp(q, m.xp);
      pushLog(`Mission complete — ${m.name}: ${fmt(m.reward)}.`, "good");
      return q;
    });
  };

  /* ---------- branching romance ---------- */
  const setGirl = (q, id, patch) => {
    q.romance = { ...(q.romance || {}) };
    q.romance[id] = { ...girlState(q, id), ...patch };
  };

  const hangOut = (g) => {
    if (locked) return;
    if (p.energy < 6 || p.money < 200) { pushLog("A hangout takes 6 energy and ¥200 for snacks.", "bad"); return; }
    setP((pl) => {
      const q = { ...pl };
      q.energy -= 6; q.money -= 200;
      q.happy = clamp(q.happy + 3, 0, 100);
      const gs = girlState(q, g.id);
      const gain = rnd(3, 6) + fameTierIdx(q);
      bumpDaily(q, "dates");
      setGirl(q, g.id, { aff: gs.aff + gain });
      pushLog(`Date with ${g.name.split(" ")[0]} — affection +${gain}.`, "good");
      return q;
    });
  };

  const giveGift = (g, itemId) => {
    if (!p.inventory[itemId] || !GIFTS[itemId]) return;
    setP((pl) => {
      const q = { ...pl, inventory: { ...pl.inventory } };
      q.inventory[itemId] -= 1; if (q.inventory[itemId] <= 0) delete q.inventory[itemId];
      const gs = girlState(q, g.id);
      setGirl(q, g.id, { aff: gs.aff + GIFTS[itemId] });
      const it = itemById(itemId);
      pushLog(`Gave ${it.name} to ${g.name.split(" ")[0]} — affection +${GIFTS[itemId]}.`, "good");
      return q;
    });
  };

  const stageReqCheck = (g, stage) => {
    const gs = girlState(p, g.id);
    const r = stage.req; const miss = [];
    if (gs.aff < r.aff) miss.push(`${r.aff} affection (${gs.aff}/${r.aff})`);
    if (hasFlag(p, `heartbroken_${g.id}`)) miss.push("relationship ended");
    if (r.partner && p.partner !== g.id && !(p.poly || []).includes(g.id)) miss.push(`a relationship with ${shortName(g.id)}`);
    if (r.lvl && p.level < r.lvl) miss.push(`level ${r.lvl}`);
    if (r.spd && p.stats.spd < r.spd) miss.push(`${r.spd} speed`);
    if (r.def && p.stats.def < r.def) miss.push(`${r.def} defense`);
    if (r.happy && p.happy < r.happy) miss.push(`${r.happy} happiness`);
    if (r.money && p.money < r.money) miss.push(`${fmt(r.money)} to your name`);
    if (r.fightsWon && p.counters.fightsWon < r.fightsWon) miss.push(`${r.fightsWon} fight wins`);
    if (r.gambleWins && p.counters.gambleWins < r.gambleWins) miss.push(`${r.gambleWins} casino wins`);
    if (r.crimesDone && p.counters.crimesDone < r.crimesDone) miss.push(`${r.crimesDone} crimes on record`);
    const c = stage.cost || {};
    if (c.energy && p.energy < c.energy) miss.push(`${c.energy} energy`);
    if (c.money && p.money < c.money) miss.push(`${fmt(c.money)} for the occasion`);
    if (c.nerve && p.nerve < c.nerve) miss.push(`${c.nerve} nerve`);
    return miss;
  };

  const commitStage = (g, stage, option) => {
    const flag = option && option.flag;
    setP((pl) => {
      const q = { ...pl };
      const c = stage.cost || {};
      if (c.energy) q.energy -= c.energy;
      if (c.money) q.money -= c.money;
      if (c.nerve) q.nerve -= c.nerve;
      if (stage.reward) q.money += stage.reward;
      const cur = girlState(q, g.id);
      setGirl(q, g.id, { aff: cur.aff + 8 + (option && option.aff ? option.aff : 0), stage: cur.stage + 1 });
      if (cur.stage === 5 && !(q.poly || []).includes(g.id)) q.partner = g.id;
      if (flag) q.flags = Array.from(new Set([...(q.flags || []), flag]));
      gainXp(q, stage.xp);
      const perk = g.perks[cur.stage + 1];
      if (perk) pushLog(`New romance perk from ${shortName(g.id)}: ${g.perkDesc[cur.stage + 1]}.`, "system");
      pushLog(`Romance chapter: "${stage.t}" — ${shortName(g.id)} is closer to you.`, "good");
      return q;
    });
    const flags = [...(p.flags || []), flag].filter(Boolean);
    const shown = option ? option.scene : resolveScene(stage, flags);
    setPendingChoice(null);
    setScene({ girl: g, title: stage.t, kanji: g.kanji, scene: shown });
  };

  const advanceStory = (g) => {
    if (locked) return;
    const gs = girlState(p, g.id);
    const stage = g.stages[gs.stage];
    if (!stage) return;
    const miss = stageReqCheck(g, stage);
    if (miss.length) { pushLog(`Not yet — you still need: ${miss.join(", ")}.`, "bad"); return; }
    if (stage.choice) {
      if (gs.stage === 5 && !(p.poly || []).includes(g.id)) {
        const other = GIRLS.find((candidate) => candidate.id !== g.id && girlState(p, candidate.id).stage >= CONFESS && !hasFlag(p, `heartbroken_${candidate.id}`));
        if (other) { setJealousy({ girl: g, other }); return; }
      }
      setPendingChoice({ girl: g, stage }); return;
    }
    commitStage(g, stage, null);
  };

  const resolveJealousy = (kind) => {
    if (!jealousy) return;
    const g = jealousy.girl, other = jealousy.other;
    if (kind === "new" || kind === "other") {
      const keep = kind === "new" ? g : other;
      const drop = kind === "new" ? other : g;
      setP((pl) => {
        const q = { ...pl };
        if (kind === "new") {
          const os = girlState(q, drop.id);
          setGirl(q, drop.id, { stage: Math.min(os.stage, 5) });
          if (q.partner === drop.id) q.partner = null;
          if (q.poly) q.poly = q.poly.filter((id) => id !== drop.id);
        }
        q.flags = Array.from(new Set([...(q.flags || []), `heartbroken_${drop.id}`]));
        return q;
      });
      pushLog(`You chose ${shortName(keep.id)}. ${shortName(drop.id)} walks away, heartbroken.`, "bad");
      setJealousy(null);
      setScene({ girl: drop, title: "Heartbreak", kanji: "傷", scene: [
        `${shortName(drop.id)} doesn't shout. That's the worst part. "${kind === "new" ? "I should have known" : "So that's your answer"}," ${drop.id === "ayame" ? "she says, already reaching for her notebook to have something to do with her hands." : "she says quietly, and turns away."}`,
        `Whatever was building between you is over. In this city, some doors only open once.`,
      ] });
      if (kind === "new") {
        const stage = g.stages[5];
        if (stage.choice) setPendingChoice({ girl: g, stage });
      }
      return;
    }
    // honesty
    const gAff = girlState(p, g.id).aff, oAff = girlState(p, other.id).aff;
    if (polyOK(g.id, other.id) && gAff >= 100 && oAff >= 100) {
      setP((pl) => ({
        ...pl, poly: [g.id, other.id],
        flags: Array.from(new Set([...(pl.flags || []), `poly_${pairKey(g.id, other.id)}`])),
      }));
      pushLog(`${shortName(g.id)} and ${shortName(other.id)} sit down together — and choose to share you.`, "good");
      setJealousy(null);
      setScene({ girl: g, title: "An Unusual Arrangement", kanji: "縁", scene: [
        `You lay it all out — no spin, no hedging. Then you do the hardest thing: you leave ${shortName(g.id)} and ${shortName(other.id)} in a room together and let them decide your fate over a pot of tea that goes cold.`,
        `They talk for two hours. You are not invited. When the door finally opens, they're... not enemies. ${shortName(other.id)} looks you dead in the eye: "We like each other more than we like being jealous of each other. That surprised us too."`,
        `${shortName(g.id)} crosses her arms. "Rules. There will be many rules, and you will follow all of them. But yes." A glance between the two of them, something wry and warm. "We talked. We're keeping you. Both of us."`,
        `It shouldn't work. In Neo-Tokyo, plenty of things that shouldn't work are the only things that do. Continue both their stories — you can now reach each of their final chapters.`,
      ] });
    } else {
      const reason = !polyOK(g.id, other.id)
        ? `${shortName(g.id)} and ${shortName(other.id)} are not the kind of people who share — and they both know it.`
        : `It's too soon. Neither of them trusts it enough yet to share anything this fragile.`;
      setP((pl) => {
        const q = { ...pl };
        [g.id, other.id].forEach((id) => {
          const s = girlState(q, id);
          setGirl(q, id, { stage: Math.min(s.stage, 5) });
          if (q.partner === id) q.partner = null;
        });
        q.flags = Array.from(new Set([...(q.flags || []), `heartbroken_${g.id}`, `heartbroken_${other.id}`]));
        return q;
      });
      pushLog(`Honesty backfired — ${shortName(g.id)} and ${shortName(other.id)} both walk away.`, "bad");
      setJealousy(null);
      setScene({ girl: g, title: "Two Doors Close", kanji: "終", scene: [
        `You tell them both the truth. You hope for grace.`, reason,
        `They leave separately, and neither looks back. You gambled two hearts on one honest sentence and the house took both. ${polyOK(g.id, other.id) ? "Maybe with deeper trust it could have gone differently." : ""}`,
      ] });
    }
  };

  const playJointChapter = () => {
    if (!p.poly || p.poly.length < 2) return;
    const [aId, bId] = p.poly;
    if (girlState(p, aId).stage < 7 || girlState(p, bId).stage < 7) {
      pushLog("Finish both partners' final chapters first.", "bad"); return;
    }
    if (hasFlag(p, "joint_done")) { pushLog("You've already lived this one.", "info"); return; }
    setP((pl) => {
      const q = { ...pl };
      q.happy = clamp(q.happy + 40, 0, 100);
      q.flags = Array.from(new Set([...(q.flags || []), "joint_done"]));
      gainXp(q, 300);
      pushLog("Joint chapter complete — an impossible little family, held together.", "system");
      return q;
    });
    setScene({ girl: GIRLS.find((g) => g.id === aId), title: "Three of a Kind", kanji: "三", scene: [
      `${shortName(aId)} claims the arrangement is "logistically efficient." ${shortName(bId)} claims she only agreed "for the entertainment value." Both claims collapse the first evening the three of you spend crammed onto one too-small couch, arguing about which movie, laughing too hard to start any of them.`,
      `It is loud. It is complicated. There are two of everything and a color-coded schedule ${aId === "ayame" || bId === "ayame" ? "that a certain detective laminated" : "nobody fully obeys"}. Somehow it is also the calmest you have ever been — a home with two front doors and no locked ones.`,
      `Later, the city lights low and the three of you finally quiet, no one bothers going home. Some math only works when you stop trying to make it come out even. (Fade to black.)`,
      `You've unlocked the throuple ending. Both partners' perks are active, and your happiness will run high for a long, long time.`,
    ] });
  };

  const doContract = (c) => {
    if (locked || !hasPerk(p, "syndicate")) return;
    if (p.nerve < c.nerve || p.energy < c.energy) { pushLog(`Contracts need ${c.nerve} nerve and ${c.energy} energy.`, "bad"); return; }
    setP((pl) => {
      const q = { ...pl, counters: { ...pl.counters } };
      q.nerve -= c.nerve; q.energy -= c.energy;
      if (Math.random() < c.chance + Math.min(0.1, q.stats.dex * 0.001)) {
        const pay = Math.round(rnd(c.pay[0], c.pay[1]) * evoMult(q));
        q.money += pay; q.counters.crimesDone += 1;
        gainXp(q, c.xp);
        addItem(q, "scrap", rnd(2, 4)); addItem(q, "cell", rnd(1, 2));
        if (Math.random() < 0.15) addItem(q, "star", 1);
        pushLog(`Contract complete — ${c.name}. The family wires ${fmt(pay)} plus materials.`, "good");
        float(`+${fmt(pay)}`, "#00A377"); float("+ 鉄 電 materials", "#D98600");
      } else {
        q.hp = Math.max(1, Math.floor(q.hp * 0.5));
        pushLog(`Contract failed — ${c.name}. You escape by the skin of your teeth, badly hurt. Sakura covers for you.`, "bad");
      }
      return q;
    });
  };

  /* ---------- achievements watcher ---------- */
  useEffect(() => {
    if (!loaded) return;
    const news = ACHIEVEMENTS.filter((a) => !(p.achv || []).includes(a.id) && a.check(p));
    if (!news.length) return;
    setP((pl) => ({ ...pl, achv: [...(pl.achv || []), ...news.map((a) => a.id)], title: pl.title || news[0].title }));
    news.forEach((a) => {
      pushLog(`ACHIEVEMENT — "${a.name}". Title unlocked: 「${a.title}」`, "system");
      float(`🏆 ${a.name}`, "#D98600");
    });
  }, [p, loaded, pushLog, float]);

  const claimDaily = (dq) => {
    if (!p.daily || p.daily.claimed.includes(dq.id) || (p.daily.prog[dq.key] || 0) < dq.goal) return;
    setP((pl) => {
      const q = { ...pl, daily: { ...pl.daily, claimed: [...pl.daily.claimed, dq.id] } };
      q.money += dq.reward;
      gainXp(q, dq.xp);
      pushLog(`Daily quest complete — ${dq.desc}: ${fmt(dq.reward)}.`, "good");
      return q;
    });
    float(`+${fmt(dq.reward)}`, "#00A377");
  };

  const quickHeal = () => {
    const missing = maxHp(p) - p.hp;
    if (missing <= 0) { pushLog("HP is already full.", "info"); return; }
    const heals = ["onigiri", "ramen", "medkit"].filter((id) => p.inventory[id]);
    if (!heals.length) { pushLog("No food in the bag — the shop sells onigiri and ramen.", "bad"); return; }
    const pick = heals.find((id) => itemById(id).amount >= missing) || heals.sort((a, b) => itemById(b).amount - itemById(a).amount)[0];
    useItem(pick);
  };

  const claimAll = () => {
    setP((pl) => {
      const q = { ...pl, claimed: [...pl.claimed], daily: pl.daily ? { ...pl.daily, claimed: [...pl.daily.claimed] } : pl.daily };
      let got = 0;
      MISSIONS.forEach((m) => {
        if (!q.claimed.includes(m.id) && q.counters[m.stat] >= m.goal) { q.claimed.push(m.id); q.money += m.reward; gainXp(q, m.xp); got += m.reward; }
      });
      if (q.daily) DAILY_POOL.forEach((dq) => {
        if (q.daily.quests.includes(dq.id) && !q.daily.claimed.includes(dq.id) && (q.daily.prog[dq.key] || 0) >= dq.goal) {
          q.daily.claimed.push(dq.id); q.money += dq.reward; gainXp(q, dq.xp); got += dq.reward;
        }
      });
      pushLog(got > 0 ? `Claimed everything ready — ${fmt(got)} total.` : "Nothing ready to claim yet.", got > 0 ? "good" : "info");
      return q;
    });
  };

  const evolve = () => {
    if (p.level < EVOLVE_LEVEL) return;
    setEvoConfirm(false);
    setP((pl) => {
      const q = { ...pl };
      q.evo = (q.evo || 0) + 1;
      q.level = 1; q.xp = 0;
      q.stats = { str: 5, def: 5, spd: 5, dex: 5 };
      q.statPoints = 0;
      q.money = 500;
      q.job = "none";
      q.counters = { fightsWon: 0, crimesDone: 0, trains: 0, shifts: 0, gambleWins: 0, crafts: 0 };
      q.claimed = [];
      q.jailUntil = 0; q.hospitalUntil = 0;
      q.happy = 100;
      q.energy = maxEnergy(q); q.nerve = maxNerve(q); q.hp = maxHp(q);
      addItem(q, "star", 1);
      pushLog(`EVOLUTION ${q.evo} — you shed the old life like a chrysalis. Permanent: +${q.evo * 10}% XP, +${q.evo * 10}% yen, +${q.evo * 5} max energy. The city starts over. You don't.`, "system");
      return q;
    });
    float(`★ EVOLVED ★`, "#D98600");
    setScreen("home");
  };

  const bankMove = (kind) => {
    setP((pl) => {
      const q = { ...pl };
      if (kind === "all" && q.money > 0) { q.bank += Math.floor(q.money); q.money -= Math.floor(q.money); }
      else if (kind === "half" && q.money > 1) { const h = Math.floor(q.money / 2); q.bank += h; q.money -= h; }
      else if (kind === "out" && q.bank > 0) { q.money += q.bank; q.bank = 0; }
      q.bankAt = now();
      return q;
    });
  };

  /* ---------- multiplayer ---------- */
  const validPin = (pin) => /^\d{4,8}$/.test(pin);

  const enableCloud = async (h, pin, basePlayer) => {
    const key = await passKey(h, pin);
    const payload = JSON.stringify({ ...basePlayer, handle: h, name: h, cloudKey: key });
    if (await probeShared()) await sSet(`acct:${key}`, payload, true);
    else await localPassSave(key, { ...basePlayer, handle: h, name: h, cloudKey: key });
    return key;
  };

  const claimHandle = async () => {
    const h = handleInput.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(h)) { setHandleErr("Handle: 3-16 characters - letters, numbers, underscore."); return; }
    if (!validPin(pinInput)) { setHandleErr("PIN: 4-8 digits. You'll use it to log in anywhere."); return; }
    if (!window.storage || !window.storage.set) { setHandleErr("Storage isn't available in this view. Try refreshing the page."); return; }
    setHandleErr("Checking the grid...");

    const online = await probeShared();

    if (!online) {
      /* Solo mode: shared storage is blocked here, so register the handle locally. */
      try {
        const key = await passKey(h, pinInput);
        await localPassSave(key, { ...p, handle: h, name: h, cloudKey: key });
        setP((pl) => ({ ...pl, handle: h, name: h, cloudKey: key }));
        setHandleErr(""); setPinInput("");
        pushLog(`Grid Pass created for ${h} in SOLO MODE. World Chat and City Rankings need shared storage, which this view doesn't allow - but your handle, PIN and save all work.`, "system");
      } catch (e) {
        setHandleErr(`Couldn't save locally (${(e && e.message) || "error"}). Try refreshing.`);
      }
      return;
    }

    let taken = false;
    try {
      const r = await sGet(`players:${h.toLowerCase()}`, true);
      if (r && r.value) taken = true;
    } catch (e) { /* not found = available */ }
    if (taken) { setHandleErr("That handle is already claimed. Pick another, or log in if it's yours."); return; }

    try {
      await sSet(`players:${h.toLowerCase()}`, JSON.stringify({ h, since: now() }), true);
    } catch (e) {
      setHandleErr(`Couldn't reach the grid (${(e && e.message) || "storage error"}) - try again in a moment.`);
      return;
    }
    try {
      const key = await enableCloud(h, pinInput, p);
      setP((pl) => ({ ...pl, handle: h, name: h, cloudKey: key }));
      setHandleErr(""); setPinInput("");
      pushLog(`Grid Pass created for ${h}. Log in from any device with handle + PIN.`, "system");
    } catch (e) {
      setP((pl) => ({ ...pl, handle: h, name: h }));
      setHandleErr(""); setPinInput("");
      pushLog(`Handle ${h} claimed! Cloud sync hit a snag - you can set your PIN from the Home screen anytime.`, "system");
    }
    try {
      await sSet(`lb:${h.toLowerCase()}`, JSON.stringify({
        h, lvl: p.level, money: p.money, wins: p.counters.fightsWon, title: p.title || null, evo: p.evo || 0, seen: now(),
      }), true);
    } catch (e) { /* retries on autosave */ }
  };

  const loginWithPin = async () => {
    const h = handleInput.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(h) || !validPin(pinInput)) { setHandleErr("Enter your handle and 4-8 digit PIN."); return; }
    setHandleErr("Searching the grid...");
    try {
      const key = await passKey(h, pinInput);
      let r = null;
      if (await probeShared()) {
        try { r = await sGet(`acct:${key}`, true); } catch (e) { /* not found */ }
      }
      if (!r || !r.value) {
        try { r = await localPassLoad(key); } catch (e) { /* not found */ }
      }
      if (!r || !r.value) { setHandleErr("No account matches that handle + PIN."); return; }
      const s2 = JSON.parse(r.value);
      const base = newPlayer();
      setP({ ...base, ...s2, cloudKey: key, stats: { ...base.stats, ...s2.stats }, counters: { ...base.counters, ...s2.counters } });
      setHandleErr(""); setPinInput(""); setHandleInput("");
      pushLog(`Grid Pass accepted. Welcome back, ${s2.handle || h}.`, "system");
    } catch (e) { setHandleErr(`Couldn't reach the grid (${(e && e.message) || "error"}) - try again in a moment.`); }
  };

  const keyName = (k) => (typeof k === "string" ? k : (k && (k.key || k.name)) || "");

  const pollChat = useCallback(async () => {
    try {
      const res = await sList("chat:", true);
      const keys = (res && res.keys ? res.keys : []).map(keyName).filter(Boolean).sort().slice(-30);
      const msgs = [];
      for (const key of keys) {
        if (!(key in chatCache.current)) {
          try {
            const r = await sGet(key, true);
            chatCache.current[key] = r && r.value ? JSON.parse(r.value) : null;
          } catch (e) { chatCache.current[key] = null; }
        }
        if (chatCache.current[key]) msgs.push({ key, ...chatCache.current[key] });
      }
      msgs.sort((a, b) => (a.t || 0) - (b.t || 0));
      setChatMsgs(msgs);
    } catch (e) { /* keep last known messages */ }
  }, []);

  const sendChat = async () => {
    const m = chatInput.trim().slice(0, 200);
    if (!m || !p.handle || chatBusy) return;
    setChatBusy(true);
    const key = `chat:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const msg = { h: p.handle, m, t: Date.now() };
    try {
      await sSet(key, JSON.stringify(msg), true);
      chatCache.current[key] = msg;
      setChatMsgs((prev) => [...prev, { key, ...msg }]);
      setChatInput("");
    } catch (e) { pushLog("Message failed to send — the grid flickered.", "bad"); }
    setChatBusy(false);
  };

  const loadBoard = useCallback(async () => {
    setBoard("loading");
    try {
      const res = await sList("lb:", true);
      const keys = (res && res.keys ? res.keys : []).map(keyName).filter(Boolean).slice(0, 40);
      const rows = [];
      for (const key of keys) {
        try {
          const r = await sGet(key, true);
          if (r && r.value) rows.push(JSON.parse(r.value));
        } catch (e) { /* skip */ }
      }
      rows.sort((a, b) => (b.lvl - a.lvl) || (b.money - a.money));
      setBoard(rows.slice(0, 20));
    } catch (e) { setBoard([]); }
  }, []);

  /* chat polling while the chat screen is open */
  useEffect(() => {
    if (screen !== "chat" || !p.handle) return;
    pollChat();
    const iv = setInterval(pollChat, 8000);
    return () => clearInterval(iv);
  }, [screen, p.handle, pollChat]);

  /* leaderboard load on screen open */
  useEffect(() => {
    if (screen === "board") loadBoard();
  }, [screen, loadBoard]);

  /* ---------- UI bits ---------- */


  const NAV = [
    ["home", "City", "都"], ["fights", "Battle", "斬"], ["loadout", "Loadout", "装"],
    ["arcade", "Arcade", "遊"], ["economy", "Economy", "商"], ["social", "Social", "網"],
  ];

  const screenBody = () => {
    if (jailed) return (
      <Panel title="Neo-Tokyo Precinct 9" kanji="牢">
        <p className="flavor">Fluorescent lights hum. A bored officer sips canned coffee and ignores you.</p>
        <div className="big-timer">{secsLeft(p.jailUntil)}s</div>
        <p className="muted">You're in jail. All actions are locked until release.</p>
      </Panel>
    );
    if (hospitalized) return (
      <Panel title="Kannon General Hospital" kanji="病">
        <p className="flavor">Sakura petals drift past the window. A nurse changes your IV without a word.</p>
        <div className="big-timer">{secsLeft(p.hospitalUntil)}s</div>
        <p className="muted">You're recovering. HP restores on release.</p>
      </Panel>
    );

    switch (screen) {
      case "arcade": return (
        <Panel title="Neon Arcade" kanji="遊">
          <div className="arcade-hero"><small>WARD 09 // PLAY + TRADE</small><b>Games and market simulation.</b><span>Quick-launch every minigame plus the XAU/USD terminal. Player trading and professions now live in Economy.</span></div>
          <div className="arcade-launch-grid">
            <button className="arcade-launch blackjack" onClick={() => { setBjMode("blackjack"); setScreen("casino"); }}><i>♠</i><span><small>TABLE GAME</small><b>Blackjack</b><em>Hit · stand · double</em></span></button>
            <button className="arcade-launch ichi" onClick={() => { setBjMode("ichi"); setScreen("casino"); }}><i>一</i><span><small>CARD ARENA</small><b>ICHI</b><em>Four-seat shedding game</em></span></button>
            <button className="arcade-launch cricket" onClick={() => { setBjMode("cricket"); setScreen("casino"); }}><i>🏏</i><span><small>SKILL GAME</small><b>Street Cricket</b><em>One-over showdown</em></span></button>
            <button className="arcade-launch slots" onClick={() => { setBjMode("classic"); setScreen("casino"); }}><i>777</i><span><small>ARCADE CLASSICS</small><b>Slots + Coin</b><em>Fast optional games</em></span></button>
            <button className="arcade-launch exchange featured" onClick={() => onOpenTrading?.()}><i>金</i><span><small>MARKET TERMINAL</small><b>XAU/USD SIM</b><em>Trade with your game yen</em></span><strong>OPEN</strong></button>
          </div>
        </Panel>
      );
      case "economy": return (
        <Panel title="Neo Economy" kanji="商">
          <div className="arcade-hero"><small>PLAYER ECONOMY // SECURE NETWORK</small><b>Trade. Craft. Gather.</b><span>A dedicated home for server-owned items, recipes, materials and Life Skill progression.</span></div>
          <div className="arcade-launch-grid economy-launch-grid">
            <button className="arcade-launch auction" onClick={() => onOpenEconomy?.("auction")}><i>競</i><span><small>PLAYER MARKET</small><b>Auction House</b><em>Buy and list equipment</em></span></button>
            <button className="arcade-launch crafting" onClick={() => onOpenEconomy?.("crafting")}><i>鍛</i><span><small>WORKSHOP</small><b>Crafting</b><em>Build gear and Megachips</em></span></button>
            <button className="arcade-launch lifeskills" onClick={() => onOpenEconomy?.("lifeskills")}><i>技</i><span><small>PROFESSIONS</small><b>Life Skills</b><em>Gather crafting materials</em></span></button>
          </div>
        </Panel>
      );
      case "activities": return (
        <Panel title="Choose Your Night" kanji="路">
          <p className="flavor">Build your runner through training, work, contracts, relationships and city events. Equipment lives only in Loadout.</p>
          <div className="activity-grid">
            {[
              ["gym", "Train", "力", "Spend energy to shape your base stats."],
              ["crimes", "Contracts", "罪", "Risk nerve for money and reputation."],
              ["job", "Work", "職", "Earn steady income and unlock careers."],
              ["missions", "Story", "命", "Long-term objectives and city progression."],
              ["hearts", "Romance", "恋", "Date five women through branching stories, choices and relationship consequences."],
              ["shop", "Supplies", "店", "Buy recovery items and gifts."],
              ["items", "Bag", "袋", "Manage consumables and crafting materials."],
              ["forge", "Workshop", "鍛", "Craft field supplies; gear is enhanced in Loadout."],
              ["exchange", "Neo Exchange", "金", "Trade a realistic server-run gold simulation with the same yen earned across the city."],
              ["casino", "Arcade", "遊", "Optional side games and high-risk rewards."],
            ].map(([id, label, kanji, desc]) => <button key={id} className="activity-card" onClick={() => id === "exchange" ? onOpenTrading?.() : id === "forge" ? onOpenEconomy?.("crafting") : setScreen(id)}><span>{kanji}</span><b>{label}</b><small>{desc}</small></button>)}
          </div>
        </Panel>
      );
      case "home": return (
        <Panel title={`${p.name}${(p.evo || 0) > 0 ? " " + "★".repeat(Math.min(p.evo, 5)) : ""} — Level ${p.level}`} kanji="家">
          <div className="city-brief"><small>NEO-TOKYO // WARD 09</small><b>The city remembers</b><span>Rain over Shinjuku. Syndicate traffic is rising beneath the mag-rail.</span></div>
          <div className="city-home-actions">
            <button className="btn city-activity-cta" onClick={() => setScreen("activities")}>Open City Activities</button>
            {p.title && <p className="flavor city-home-status"><span>「{p.title}」</span><i aria-hidden="true">·</i><b>🔥 {p.streak || 1}-day streak</b></p>}
          </div>
          {armoryProgress < 3 && <div className="progression-callout"><small>RUNNER INITIATION · {armoryProgress + 1}/3</small><b>{armoryProgress === 0 ? "Secure District One" : armoryProgress === 1 ? "Choose and equip your first weapon" : "Calibrate that weapon to +1"}</b><span>{armoryProgress === 0 ? "Read danger lanes, use your role skill, and protect the ward supply convoy." : armoryProgress === 1 ? "Your first clear grants one of three Green weapons and at least 12 Nano Shards." : "Calibration permanently strengthens the weapon; later gear can reach +20."}</span><button className="chip" onClick={onOpenArmory}>Continue initiation</button></div>}
          {(p.statPoints || 0) > 0 && (
            <p className="flavor" style={{ color: "#D98600" }}>You have {p.statPoints} unspent stat points — visit the Stats screen to grow stronger.</p>
          )}
          <div className="grid2">
            <div className="stat-card"><span className="k">力</span><div><b>Strength</b><em>{p.stats.str}</em></div></div>
            <div className="stat-card"><span className="k">守</span><div><b>Defense</b><em>{p.stats.def}</em></div></div>
            <div className="stat-card"><span className="k">速</span><div><b>Speed</b><em>{p.stats.spd}</em></div></div>
            <div className="stat-card"><span className="k">技</span><div><b>Dexterity</b><em>{p.stats.dex}</em></div></div>
          </div>
          <div className="kv"><span>Loadout power</span><b style={{ color: "#0C93CC" }}>{p.armoryBonuses?.score || 0} gear score</b></div>
          <div className="kv"><span>Armory</span><button className="chip" onClick={onOpenArmory}>Open equipment</button></div>
          <div className="kv"><span>Job</span><b>{JOBS.find((j) => j.id === p.job).name}</b></div>
          <div className="kv"><span>Trusted allies</span><b style={{ color: "#0C93CC" }}>{GIRLS.filter((g) => girlState(p, g.id).stage > 0).length}/{GIRLS.length} active</b></div>
          <div className="kv"><span>Record</span><b>{p.counters.fightsWon} wins · {p.counters.crimesDone} crimes</b></div>
          <div className="kv"><span>Renown 名声</span><b style={{ color: "#D98600" }}>{p.fame || 0} — 「{fameTierName(p)}」</b></div>
          <div className="kv"><span>Bank <small style={{ color: "#00A377" }}>+2%/hr</small></span><b style={{ color: "#D98600" }}>{fmt(p.bank || 0)}</b></div>
          <div className="bet-row">
            <button className="chip" onClick={() => bankMove("half")}>Deposit half</button>
            <button className="chip" onClick={() => bankMove("all")}>Deposit all</button>
            <button className="chip" onClick={() => bankMove("out")}>Withdraw</button>
          </div>
          <h3 className="sub">Evolution ★{p.evo || 0}</h3>
          {(p.evo || 0) > 0 && (
            <p className="muted">Permanent: +{(p.evo || 0) * 10}% XP · +{(p.evo || 0) * 10}% yen · +{(p.evo || 0) * 5} max energy.</p>
          )}
          {p.level >= EVOLVE_LEVEL ? (
            evoConfirm ? (
              <div>
                <p className="flavor" style={{ color: "#E23A6B" }}>
                  Evolving resets: level, XP, stats & points, cash (to ¥500), job, records, and story missions.
                  It keeps: gear, bag & materials, bank, ally trust, renown, titles, streak, and your online account save.
                  You gain forever: +10% XP, +10% yen, +5 max energy, a 星 Star Shard, and a ★ by your name.
                </p>
                <div className="grid2">
                  <button className="btn big" onClick={evolve}>★ Shed this life</button>
                  <button className="btn big ghost" style={{ margin: 0 }} onClick={() => setEvoConfirm(false)}>Not yet</button>
                </div>
              </div>
            ) : (
              <button className="btn ghost" style={{ borderColor: "#D98600", color: "#D98600" }} onClick={() => setEvoConfirm(true)}>★ EVOLVE — begin again, permanently stronger</button>
            )
          ) : (
            <p className="muted">Reach level {EVOLVE_LEVEL} to Evolve — reset your run for permanent, stacking power.</p>
          )}
          {(p.achv || []).length > 0 && (
            <div>
              <h3 className="sub">Your titles</h3>
              <div className="bet-row">
                {(p.achv || []).map((id) => {
                  const a = ACHIEVEMENTS.find((x) => x.id === id);
                  return <button key={id} className={`chip ${p.title === a.title ? "on" : ""}`} onClick={() => setP((pl) => ({ ...pl, title: a.title }))}>{a.title}</button>;
                })}
              </div>
            </div>
          )}
          <Bar label="XP to next level" val={p.xp} max={xpNeed(p)} color="linear-gradient(90deg,#FFAB00,#FF4D82)" />
          <p className="online-save-note"><span>●</span><b>ONLINE SAVE ACTIVE</b> Progress is secured to your signed-in Google account.</p>
        </Panel>
      );
      case "gym": {
        const gbS = gearBonuses(p);
        return (
        <Panel title="Character Build" kanji="育成">
          <p className="flavor">Every level-up grants <b style={{ color: "#D98600" }}>+5 stat points</b>. Spend them however you want — your build, your rules. No grinding, no energy.</p>
          <div className="kv"><span>Stat points available</span><b style={{ color: p.statPoints > 0 ? "#D98600" : "#7C7096", fontSize: 17 }}>{p.statPoints || 0}</b></div>
          {GYM_STATS.map((g) => (
            <div className="row" key={g.key}>
              <span className="k">{g.kanji}</span>
              <div className="row-mid">
                <b>{g.name} — {p.stats[g.key]}{gbS[g.key] > 0 ? <span style={{ color: "#0C93CC" }}> (+{gbS[g.key]} gear)</span> : null}</b>
                <small>{g.desc}</small>
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <button className="btn" disabled={!p.statPoints} onClick={() => allocateStat(g.key, 1)}>+1</button>
                <button className="btn" disabled={(p.statPoints || 0) < 5} onClick={() => allocateStat(g.key, 5)}>+5</button>
              </div>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 10 }}>Morale: keep happiness at 70+ for a permanent +10% XP bonus from everything.</p>
          <button className="btn ghost" onClick={respecStats}>Full respec — refund all points ({fmt(p.level * 1000)})</button>
        </Panel>
        );
      }
      case "crimes": return (
        <Panel title="Back-Alley Crimes" kanji="犯罪">
          <p className="flavor">Spend nerve, earn yen. Fail and the keisatsu might grab you.</p>
          {CRIMES.map((c) => (
            <div className="row" key={c.id}>
              <span className="k">{c.kanji}</span>
              <div className="row-mid"><b>{c.name}</b><small>{c.nerve} nerve · ~{Math.round(c.chance * 100)}% · {fmt(c.pay[0])}–{fmt(c.pay[1])}</small></div>
              <button className="btn" disabled={p.nerve < c.nerve} onClick={() => doCrime(c)}>Commit</button>
            </div>
          ))}
          {hasPerk(p, "syndicate") && (
            <div>
              <h3 className="sub">Kurosawa Contracts — from Sakura</h3>
              {CONTRACTS.map((c) => (
                <div className="row" key={c.id}>
                  <span className="k">{c.kanji}</span>
                  <div className="row-mid"><b>{c.name}</b><small>{c.nerve} nerve + {c.energy} energy · ~{Math.round(c.chance * 100)}% · {fmt(c.pay[0])}–{fmt(c.pay[1])}</small></div>
                  <button className="btn" disabled={p.nerve < c.nerve || p.energy < c.energy} onClick={() => doContract(c)}>Accept</button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      );
      case "fights": {
        if (brawl) {
          const gb = gearBonuses(p);
          const wPow = equipPower(p, "weapon");
          const aPow = equipPower(p, "armor");
          return (
            <Panel title={`Arena — ${brawl.enemy.name}`} kanji="斬">
              <Brawl
                stats={{ hp: p.hp, maxHp: maxHp(p), str: p.stats.str + gb.str, def: p.stats.def + gb.def, spd: p.stats.spd + gb.spd, dex: p.stats.dex + gb.dex, crit: gb.crit, wPow, aPow }}
                enemy={brawl.enemy}
                onEnd={({ win, hpFrac }) => applyBrawlResult(brawl.enemy, win, hpFrac)}
              />
              <button className="btn ghost" onClick={() => { setBrawl(null); pushLog("You slipped out of the arena. Energy spent, pride intact.", "info"); }}>Flee (forfeit)</button>
            </Panel>
          );
        }
        return (
        <Panel title="Street Fights" kanji="喧嘩">
          <p className="flavor">8 energy per fight. Your equipped Armory pieces, enhancement levels, role and set bonuses determine your real combat power.</p>
          <div className="bet-row">
            <button className={`chip ${combatMode === "brawl" ? "on" : ""}`} onClick={() => setCombatMode("brawl")}>⚔ Live brawl (+25% pay)</button>
            <button className={`chip ${combatMode === "quick" ? "on" : ""}`} onClick={() => setCombatMode("quick")}>Quick fight (auto)</button>
            <button className="chip" disabled={p.hp >= maxHp(p)} onClick={quickHeal}>♥ Quick heal</button>
          </div>
          {ENEMIES.map((e) => {
            const lockedBoss = e.minLvl && p.level < e.minLvl;
            const gbF = gearBonuses(p);
            const myPow = p.stats.str + gbF.str + equipPower(p, "weapon") + p.stats.def + gbF.def + equipPower(p, "armor") + p.level * 3;
            const foePow = e.atk * 2 + e.def + e.lvl * 3;
            const ratio = myPow / foePow;
            const dcol = ratio > 1.5 ? "#00A377" : ratio > 0.9 ? "#D98600" : "#E23A6B";
            return (
              <div className="row" key={e.id}>
                <span className={`slot mini ${e.boss ? "r-epic" : "r-common"}`}><PixIcon id={e.id} size={26} /></span>
                <div className="row-mid">
                  <b style={e.boss ? { color: "#D98600" } : undefined}>{e.name}</b>
                  <small>{lockedBoss ? `Unlocks at level ${e.minLvl}` : (<><span style={{ color: dcol }}>●</span> Lv {e.lvl} · {e.hp} HP · pays {fmt(e.pay[0])}–{fmt(e.pay[1])}{e.drop ? " · rare drop ✦" : ""}</>)}</small>
                </div>
                <button className="btn" disabled={p.energy < 8 || lockedBoss} onClick={() => (combatMode === "brawl" ? startBrawl(e) : fight(e))}>{combatMode === "brawl" ? "Enter" : "Attack"}</button>
              </div>
            );
          })}
          {fightLog && (() => {
            const shown = fightLog.lines.slice(0, revealIdx);
            const cur = shown[shown.length - 1] || fightLog.lines[0];
            const done = revealIdx >= fightLog.lines.length;
            const last = fightLog.lines[fightLog.lines.length - 1];
            return (
              <div className={`battle ${cur.kind === "foe" ? "fx-shake" : ""}`}>
                <div className="battle-head">
                  <div className="fighter">
                    <span className="avatar"><PixIcon id="player" size={40} /></span>
                    <div className="fighter-bar">
                      <small>YOU</small>
                      <div className="hp-track"><div className="hp-fill me" style={{ width: `${(cur.myHp / fightLog.pMax) * 100}%` }} /></div>
                    </div>
                  </div>
                  <span className="vs">VS</span>
                  <div className="fighter right">
                    <div className="fighter-bar">
                      <small>{fightLog.enemy.name.split(" ").slice(-1)[0].toUpperCase()}</small>
                      <div className="hp-track"><div className="hp-fill foe" style={{ width: `${(cur.foeHp / fightLog.eMax) * 100}%` }} /></div>
                    </div>
                    <span className={`avatar ${cur.kind === "me" || cur.kind === "crit" ? "fx-hit" : ""}`}><PixIcon id={fightLog.enemy.id} size={40} /></span>
                  </div>
                </div>
                <div className="fight-log">
                  {shown.map((l, i) => (
                    <div key={i} className={`fl-line fl-${l.kind}`}>{l.t}</div>
                  ))}
                  {!done && <div className="fl-line fl-info">…</div>}
                </div>
                {done && <div className={`battle-banner ${last.kind === "win" ? "win" : "lose"}`}>{last.kind === "win" ? "勝利 VICTORY" : "敗北 DEFEAT"}</div>}
                <div className="grid2" style={{ marginTop: 8 }}>
                  {!done && <button className="btn ghost" style={{ margin: 0 }} onClick={() => setRevealIdx(fightLog.lines.length)}>Skip</button>}
                  {done && <button className="btn ghost" style={{ margin: 0 }} onClick={() => setFightLog(null)}>Close</button>}
                </div>
              </div>
            );
          })()}
        </Panel>
        );
      }
      case "shop": return (
        <Panel title="Don Quixote After Dark" kanji="商店">
          {["consume"].map((t) => (
            <div key={t}>
              <h3 className="sub">{t === "weapon" ? "Weapons" : t === "armor" ? "Armor" : "Consumables"}</h3>
              {SHOP.filter((s) => s.type === t).map((s) => (
                <div className="row" key={s.id}>
                  <span className={`slot mini r-${s.rarity}`}><PixIcon id={s.id} size={22} /></span>
                  <div className="row-mid"><b style={{ color: RARITY_COLOR[s.rarity] }}>{s.name}</b><small>{s.type === "consume" ? s.desc : `+${s.power} ${s.type === "weapon" ? "attack" : "defense"}`} · {fmt(priceOf(s))}{hasPerk(p, "discount") ? " (family rate)" : ""}{GIFTS[s.id] ? " · giftable" : ""}</small></div>
                  <button className="btn" disabled={p.money < priceOf(s) || ((s.type === "weapon" || s.type === "armor") && p.inventory[s.id])}
                    onClick={() => buy(s)}>{(s.type === "weapon" || s.type === "armor") && p.inventory[s.id] ? "Owned" : "Buy"}</button>
                </div>
              ))}
            </div>
          ))}
        </Panel>
      );
      case "items": {
        const inv = Object.entries(p.inventory).filter(([id]) => !["weapon", "armor"].includes(itemById(id)?.type));
        const det = selItem && !isGearId(selItem) && p.inventory[selItem] ? itemById(selItem) : null;
        const gdet = selItem && isGearId(selItem) ? gearOf(p, selItem) : null;
        const EquipSlot = ({ slot, label }) => {
          const info = equipInfo(p, slot);
          return (
            <div className={`equip-slot ${info ? `r-${info.rarity}` : ""}`} onClick={() => info && setSelItem(p[slot])}>
              <span className="slot-icon">
                {info ? (info.gear
                  ? <span className="gear-glyph" style={{ color: RARITY_COLOR[info.rarity] }}>{slot === "weapon" ? "刃" : "鎧"}</span>
                  : <PixIcon id={p[slot]} size={30} />)
                  : <PixIcon id={slot === "weapon" ? "fist" : "shirt"} size={30} />}
              </span>
              <div><small>{label}</small><b>{info ? `${info.name} (+${info.power})` : "Empty"}</b></div>
            </div>
          );
        };
        return (
          <Panel title="Equipment & Bag" kanji="装備">
            <div className="bag-intro"><b>Supplies only</b><span>Weapons, armor, sets and +20 enhancement now live in one place.</span><button className="chip" onClick={onOpenArmory}>Open Loadout</button></div>
            <h3 className="sub">Bag — {inv.length} kinds</h3>
            {inv.length === 0 && <p className="muted">Empty. The shop sells supplies; crimes and fights drop crafting materials.</p>}
            <div className="inv-grid">
              {inv.map(([id, n]) => {
                const it = itemById(id);
                if (!it) return null;
                const equipped = p.weapon === id || p.armor === id;
                return (
                  <div key={id} className={`slot r-${it.rarity} ${selItem === id ? "sel" : ""} ${equipped ? "eq" : ""}`}
                    onClick={() => setSelItem(selItem === id ? null : id)}>
                    <span className="slot-icon"><PixIcon id={id} size={30} /></span>
                    {n > 1 && <span className="qty">{n}</span>}
                    {equipped && <span className="eq-mark">E</span>}
                  </div>
                );
              })}
            </div>
            {false && <div className="inv-grid">
              {[...(p.gear || [])].sort((a, b) => (RAR_IDX[b.rarity] - RAR_IDX[a.rarity]) || (gearPower(b) - gearPower(a))).map((g) => {
                const eq = p.weapon === g.uid || p.armor === g.uid;
                return (
                  <div key={g.uid} className={`slot r-${g.rarity} ${selItem === g.uid ? "sel" : ""} ${eq ? "eq" : ""}`}
                    onClick={() => setSelItem(selItem === g.uid ? null : g.uid)}>
                    <span className="gear-glyph" style={{ color: RARITY_COLOR[g.rarity] }}>{g.type === "weapon" ? "刃" : "鎧"}</span>
                    {g.plus > 0 && <span className="plus-badge">+{g.plus}</span>}
                    {eq && <span className="eq-mark">E</span>}
                  </div>
                );
              })}
            </div>}
            {false && gdet && (() => {
              const ri = RAR_IDX[gdet.rarity];
              const sc = (gdet.plus + 1) * (ri + 1), yen = (gdet.plus + 1) * 400 * (ri + 1);
              const canEnh = gdet.plus < 10 && (p.inventory.scrap || 0) >= sc && p.money >= yen;
              return (
                <div className={`item-detail r-${gdet.rarity}`}>
                  <div className="id-head">
                    <span className="gear-glyph big" style={{ color: RARITY_COLOR[gdet.rarity] }}>{gdet.type === "weapon" ? "刃" : "鎧"}</span>
                    <div>
                      <b style={{ color: RARITY_COLOR[gdet.rarity] }}>{gdet.name} +{gdet.plus}</b>
                      <small style={{ display: "block", color: "#7C7096", textTransform: "capitalize" }}>{gdet.rarity} {gdet.type} · item level {gdet.lvl}</small>
                    </div>
                  </div>
                  <div className="kv"><span>{gdet.type === "weapon" ? "Attack" : "Defense"}</span><b style={{ color: RARITY_COLOR[gdet.rarity] }}>{gearPower(gdet)}</b></div>
                  {gdet.subs.map((sub) => (
                    <div className="kv" key={sub.k}><span>◈ {SUB_LABEL[sub.k]}</span><b style={{ color: "#0C93CC" }}>+{sub.v}</b></div>
                  ))}
                  {gdet.subs.length === 0 && <p className="muted" style={{ margin: "6px 0" }}>No substats — common gear is just metal.</p>}
                  <div className="grid2" style={{ marginTop: 10 }}>
                    <button className="btn big" onClick={() => equipItem(gdet.uid)}>{p[gdet.type] === gdet.uid ? "Unequip" : "Equip"}</button>
                    <button className="btn big" disabled={!canEnh} onClick={() => enhanceGear(gdet.uid)}>
                      {gdet.plus >= 10 ? "MAX +10" : `Enhance (鉄×${sc} · ${fmt(yen)})`}
                    </button>
                  </div>
                  <button className="btn ghost" onClick={() => salvageGear(gdet.uid)}>Salvage → 鉄×{[2, 4, 8, 16, 40][ri]}</button>
                </div>
              );
            })()}
            {det && (
              <div className={`item-detail r-${det.rarity}`}>
                <div className="id-head">
                  <span className="slot-icon big"><PixIcon id={det.id} size={44} /></span>
                  <div>
                    <b style={{ color: RARITY_COLOR[det.rarity] }}>{det.name}</b>
                    <small style={{ display: "block", color: "#7C7096", textTransform: "capitalize" }}>{det.rarity} {det.type} ×{p.inventory[det.id]}</small>
                  </div>
                </div>
                <p className="muted" style={{ margin: "6px 0" }}>
                  {det.type === "weapon" ? `+${det.power} attack.` : det.type === "armor" ? `+${det.power} defense.` : det.desc}
                </p>
                <div className="grid2">
                  {(det.type === "weapon" || det.type === "armor") && (
                    <button className="btn big" onClick={() => equipItem(det.id)}>
                      {p[det.type] === det.id ? "Unequip" : "Equip"}
                    </button>
                  )}
                  {det.type === "consume" && (
                    <button className="btn big" onClick={() => useItem(det.id)}>Use</button>
                  )}
                  {(GIFTS[det.id] || det.type === "gift") && (
                    <button className="btn big ghost" style={{ margin: 0 }} onClick={() => { setScreen("hearts"); }}>
                      Gift it (Hearts +{GIFTS[det.id] || 0})
                    </button>
                  )}
                  {det.type === "material" && (
                    <button className="btn big ghost" style={{ margin: 0 }} onClick={() => setScreen("forge")}>To the Forge</button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        );
      }
      case "forge": return (
        <Panel title="The Night Forge" kanji="鍛冶">
          <p className="flavor">An old smith who asks no questions and a furnace that never sleeps. Materials drop from fights (鉄・鬼), crimes (電・糸), contracts, and jackpots (星).</p>
          <div className="mat-row">
            {MATERIALS.map((m) => (
              <div key={m.id} className={`slot r-${m.rarity}`} title={m.name}>
                <span className="slot-icon"><PixIcon id={m.id} size={26} /></span>
                <span className="qty">{p.inventory[m.id] || 0}</span>
              </div>
            ))}
          </div>
          {RECIPES.filter((r) => !["weapon", "armor"].includes(itemById(r.out)?.type)).map((r) => {
            const out = itemById(r.out);
            const canMats = Object.entries(r.mats).every(([m, n]) => (p.inventory[m] || 0) >= n);
            const can = canMats && p.money >= r.money;
            return (
              <div className={`row ${forging === r.out ? "fx-forge" : ""}`} key={r.out}>
                <span className={`slot mini r-${out.rarity}`}><PixIcon id={out.out || out.id} size={22} /></span>
                <div className="row-mid">
                  <b style={{ color: RARITY_COLOR[out.rarity] }}>{out.name}</b>
                  <small>
                    {Object.entries(r.mats).map(([m, n]) => {
                      const have = p.inventory[m] || 0;
                      return <span key={m} style={{ color: have >= n ? "#00A377" : "#E23A6B", marginRight: 8 }}>{itemById(m).kanji} {have}/{n}</span>;
                    })}
                    · {fmt(r.money)} · {out.type === "consume" || out.type === "gift" ? out.desc : `+${out.power} ${out.type === "weapon" ? "atk" : "def"}`}
                  </small>
                </div>
                <button className="btn" disabled={!can} onClick={() => craft(r)}>Forge</button>
              </div>
            );
          })}
        </Panel>
      );
      case "job": return (
        <Panel title="Employment Office" kanji="仕事">
          <p className="flavor">Pick a job, then work shifts for steady yen and XP.</p>
          {JOBS.filter((j) => j.id !== "none").map((j) => (
            <div className="row" key={j.id}>
              <span className="k">{j.kanji}</span>
              <div className="row-mid"><b>{j.name}</b><small>Lv {j.req}+ · {fmt(j.pay)}/shift · {j.energy} energy</small></div>
              {p.job === j.id
                ? <button className="btn" disabled={p.energy < j.energy} onClick={workShift}>Work</button>
                : <button className="btn ghost" disabled={p.level < j.req} onClick={() => setP((pl) => ({ ...pl, job: j.id }))}>Take job</button>}
            </div>
          ))}
        </Panel>
      );
      case "casino": {
        return (
        <Panel title="Golden Koi Casino" kanji="賭博">
          <div className="kv"><span>Renown 名声</span><b style={{ color: "#D98600" }}>{p.fame || 0} — 「{fameTierName(p)}」</b></div>
          <p className="muted" style={{ marginBottom: 10 }}>Casino wins build renown: syndicates pay +{fameTierIdx(p) * 5}% on crimes, and word of big wins... travels. ♥</p>
          <div className="bet-row">
            <button className={`chip ${bjMode === "blackjack" ? "on" : ""}`} onClick={() => setBjMode("blackjack")}>♠ Blackjack table</button>
            <button className={`chip ${bjMode === "ichi" ? "on" : ""}`} onClick={() => setBjMode("ichi")}>一 ICHI</button>
            <button className={`chip ${bjMode === "cricket" ? "on" : ""}`} onClick={() => setBjMode("cricket")}>🏏 Street cricket</button>
            <button className={`chip ${bjMode === "classic" ? "on" : ""}`} onClick={() => setBjMode("classic")}>Slots & coin</button>
          </div>
          {bjMode === "ichi" && (
            <div>
              {ichi ? (
                <IchiGame key={ichi.id} bet={ichi.bet} playerName={p.handle || "You"} onEnd={ichiEnd} />
              ) : (
                <div>
                  <p className="flavor">The ward's beloved shedding game — four seats, one shout. Goro hoards wilds, Mika counts cards, Tetsu just vibes. Winner takes triple.</p>
                  <div className="bet-row">
                    {[100, 500, 2000, 10000].map((b) => (
                      <button key={b} className={`chip ${bet === b ? "on" : ""}`} onClick={() => setBet(b)}>{fmt(b)}</button>
                    ))}
                    <button className={`chip ${bet === Math.floor(p.money) && p.money >= 10 ? "on" : ""}`} onClick={() => setBet(Math.max(10, Math.floor(p.money)))}>ALL IN</button>
                  </div>
                  <button className="btn big" disabled={p.money < 10} onClick={ichiStart}>Deal me in — bet {fmt(clamp(bet, 10, Math.max(10, Math.floor(p.money))))}</button>
                </div>
              )}
            </div>
          )}
          {bjMode === "cricket" && (
            <div>
              {cricket ? (
                <CricketGame key={cricket.id} bet={cricket.bet} onEnd={cricketEnd} />
              ) : (
                <div>
                  <p className="flavor">A taped tennis ball, a bat older than the ward, and bookies who never lose twice. One over — six balls — against Tetsu the Yorker King.</p>
                  <div className="bet-row">
                    {[100, 500, 2000, 10000].map((b) => (
                      <button key={b} className={`chip ${bet === b ? "on" : ""}`} onClick={() => setBet(b)}>{fmt(b)}</button>
                    ))}
                    <button className={`chip ${bet === Math.floor(p.money) && p.money >= 10 ? "on" : ""}`} onClick={() => setBet(Math.max(10, Math.floor(p.money)))}>ALL IN</button>
                  </div>
                  <button className="btn big" disabled={p.money < 10} onClick={cricketStart}>Take guard — bet {fmt(clamp(bet, 10, Math.max(10, Math.floor(p.money))))}</button>
                </div>
              )}
            </div>
          )}
          {bjMode === "blackjack" ? (
            <div>
              <div className="bj-table">
                <div className="bj-dealer">
                  <div className="dealer-avatar">鯉</div>
                  <BjSeat label="Madam Koi" k="" cards={bj ? bj.dealer.cards : []}
                    bust={!!(bj && bj.dealer.revealed && handValue(bj.dealer.cards) > 21)}
                    hideHole={!!(bj && !bj.dealer.revealed)}
                    active={!!(bj && bj.turn === "dealer")} />
                </div>
                <div className="bj-row">
                  {bj ? <BjSeat label={BJ_BOTS[0].name} k={BJ_BOTS[0].k} cards={bj.bots[0].cards} bust={!!bj.bots[0].bust} active={bj.turn === "bot0"} /> : <div className="bj-seat"><span className="bj-name">熊 Goro</span></div>}
                  {bj ? <BjSeat you label={p.handle || "You"} k="貴" cards={bj.you.cards} bust={handValue(bj.you.cards) > 21} active={bj.phase === "player"} /> : <div className="bj-seat you"><span className="bj-name">貴 {p.handle || "You"}</span></div>}
                  {bj ? <BjSeat label={BJ_BOTS[1].name} k={BJ_BOTS[1].k} cards={bj.bots[1].cards} bust={!!bj.bots[1].bust} active={bj.turn === "bot1"} /> : <div className="bj-seat"><span className="bj-name">猫 Mika</span></div>}
                </div>
                {bj && bj.phase === "result" && (
                  <div className={`bj-banner ${bj.net > 0 ? "win" : bj.net === 0 ? "" : "lose"}`}>
                    {bj.outcome} {bj.net !== 0 ? (bj.net > 0 ? `+${fmt(bj.net)}` : `-${fmt(-bj.net)}`) : ""}
                  </div>
                )}
                <p className="bj-talk">{bj ? bj.talk : "Goro and Mika hold seats at the eternal table. Madam Koi waits."}</p>
              </div>
              {(!bj || bj.phase === "result") && (
                <div>
                  <div className="bet-row">
                    {[100, 500, 2000, 10000].map((b) => (
                      <button key={b} className={`chip ${bet === b ? "on" : ""}`} onClick={() => setBet(b)}>{fmt(b)}</button>
                    ))}
                    <button className={`chip ${bet === Math.floor(p.money) && p.money >= 10 ? "on" : ""}`} onClick={() => setBet(Math.max(10, Math.floor(p.money)))}>ALL IN</button>
                  </div>
                  <button className="btn big" disabled={p.money < 10} onClick={bjStart}>Deal — bet {fmt(clamp(bet, 10, Math.max(10, Math.floor(p.money))))}</button>
                </div>
              )}
              {bj && bj.phase === "player" && (
                <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <button className="btn big" onClick={bjHit}>Hit</button>
                  <button className="btn big" onClick={bjStand}>Stand</button>
                  <button className="btn big" disabled={bj.you.cards.length !== 2 || p.money < bj.you.bet} onClick={bjDouble}>Double</button>
                </div>
              )}
              {sharedOK.current === true && bjFeed.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <h3 className="sub">Tonight at the Golden Koi — real players</h3>
                  {bjFeed.map((f, i) => (
                    <p className="muted" key={i} style={{ margin: "3px 0" }}>♠ <b style={{ color: "#D98600" }}>{f.h}</b> walked away with {fmt(f.amt)}</p>
                  ))}
                </div>
              )}
              {sharedOK.current === false && (
                <p className="muted" style={{ marginTop: 8 }}>Goro and Mika are house regulars (bots). Live tables against real players light up when the game is published or run as the website build.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="flavor">The house always wins. Probably. Bet:</p>
              <div className="bet-row">
                {[100, 500, 2000, 10000].map((b) => (
                  <button key={b} className={`chip ${bet === b ? "on" : ""}`} onClick={() => setBet(b)}>{fmt(b)}</button>
                ))}
                <button className={`chip ${bet === Math.floor(p.money) && p.money >= 10 ? "on" : ""}`} onClick={() => setBet(Math.max(10, Math.floor(p.money)))}>ALL IN</button>
              </div>
              <div className="grid2">
                <button className="btn big" onClick={() => gamble("coin")}>Coin flip — 2× (48%)</button>
                <button className="btn big" onClick={() => gamble("slots")}>Slots 七七七 — up to 10×</button>
              </div>
            </div>
          )}
        </Panel>
        );
      }
      case "missions": return (
        <Panel title="Missions" kanji="任務">
          <div className="bet-row" style={{ marginTop: 0 }}>
            <button className="chip" onClick={claimAll}>⇓ Claim all ready rewards</button>
          </div>
          <h3 className="sub" style={{ marginTop: 0 }}>Today's quests — reset daily</h3>
          {p.daily && p.daily.quests.map((qid) => {
            const dq = DAILY_POOL.find((x) => x.id === qid);
            const prog = Math.min(p.daily.prog[dq.key] || 0, dq.goal);
            const done = prog >= dq.goal; const claimed = p.daily.claimed.includes(dq.id);
            return (
              <div className="row" key={qid}>
                <span className="k">{claimed ? "済" : done ? "完" : "日"}</span>
                <div className="row-mid"><b>{dq.desc}</b><small>{prog}/{dq.goal} · {fmt(dq.reward)} + {dq.xp} XP</small></div>
                <button className="btn" disabled={!done || claimed} onClick={() => claimDaily(dq)}>{claimed ? "Claimed" : "Claim"}</button>
              </div>
            );
          })}
          <h3 className="sub">Story missions</h3>
          {MISSIONS.map((m) => {
            const prog = Math.min(p.counters[m.stat], m.goal);
            const done = prog >= m.goal; const claimed = p.claimed.includes(m.id);
            return (
              <div className="row" key={m.id}>
                <span className="k">{claimed ? "済" : done ? "完" : "未"}</span>
                <div className="row-mid"><b>{m.name}</b><small>{m.desc} — {prog}/{m.goal} · {fmt(m.reward)} + {m.xp} XP</small></div>
                <button className="btn" disabled={!done || claimed} onClick={() => claimMission(m)}>{claimed ? "Claimed" : "Claim"}</button>
              </div>
            );
          })}
          <h3 className="sub">Achievements & titles</h3>
          {ACHIEVEMENTS.map((a) => {
            const got = (p.achv || []).includes(a.id);
            return (
              <div className="row" key={a.id}>
                <span className="k" style={{ color: got ? "#D98600" : "#B0A6C8" }}>{got ? "勲" : "未"}</span>
                <div className="row-mid">
                  <b style={{ color: got ? "#D98600" : "#7C7096" }}>{a.name}</b>
                  <small>{a.desc} → title 「{a.title}」</small>
                </div>
              </div>
            );
          })}
        </Panel>
      );
      case "hearts": {
        if (jealousy) {
          const g = jealousy.girl, other = jealousy.other;
          const canPoly = polyOK(g.id, other.id);
          const gAff = girlState(p, g.id).aff, oAff = girlState(p, other.id).aff;
          const polyReady = canPoly && gAff >= 100 && oAff >= 100;
          return (
            <Panel title="Two Hearts, One You" kanji="修羅">
              <p className="story-p">Word travels fast in this ward. As you move to open your heart to {shortName(g.id)}, you both know the truth already hangs in the air: {shortName(other.id)} is still waiting for you too.</p>
              <p className="story-p">{shortName(g.id)} folds her arms. "I'm not going to share you by accident. So decide. Her, or me — or say something braver than both."</p>
              <div className="row"><span className="k">{g.kanji}</span><div className="row-mid"><b>Choose {shortName(g.id)}</b><small>{shortName(other.id)} is let go — heartbroken, gone for good.</small></div>
                <button className="btn" onClick={() => resolveJealousy("new")}>Choose</button></div>
              <div className="row"><span className="k">{other.kanji}</span><div className="row-mid"><b>Choose {shortName(other.id)}</b><small>You stop here with {shortName(g.id)}. This door closes.</small></div>
                <button className="btn" onClick={() => resolveJealousy("other")}>Choose</button></div>
              <div className="row"><span className="k">縁</span><div className="row-mid"><b>Be honest with both</b>
                <small>{polyReady ? "They just might agree to share you — the personalities fit and the trust is deep." : canPoly ? "Risky — you'll need max affection (100+) with BOTH before they'd consider it." : `${shortName(g.id)} and ${shortName(other.id)} aren't the sharing type. This will likely lose you both.`}</small></div>
                <button className="btn" onClick={() => resolveJealousy("honest")}>Risk it</button></div>
              <button className="btn ghost" onClick={() => setJealousy(null)}>Not now — walk away</button>
            </Panel>
          );
        }
        if (pendingChoice) {
          const { girl: g, stage } = pendingChoice;
          return (
            <Panel title={`${g.name} — "${stage.t}"`} kanji={g.kanji}>
              {stage.scene.map((para, i) => <p className="story-p" key={i}>{para}</p>)}
              <h3 className="sub">{stage.choice.prompt}</h3>
              {stage.choice.options.map((opt, i) => (
                <div className="row" key={i}>
                  <span className="k">{i === 0 ? "甲" : "乙"}</span>
                  <div className="row-mid"><b>{opt.label}</b></div>
                  <button className="btn" onClick={() => commitStage(g, stage, opt)}>Choose</button>
                </div>
              ))}
              <button className="btn ghost" onClick={() => setPendingChoice(null)}>Step back</button>
            </Panel>
          );
        }
        if (scene) return (
          <Panel title={`${scene.girl.name.split(" ")[0]} — "${scene.title}"`} kanji={scene.kanji || scene.girl.kanji}>
            {scene.scene.map((para, i) => <p className="story-p" key={i}>{para}</p>)}
            <button className="btn" onClick={() => setScene(null)}>Continue</button>
          </Panel>
        );
        if (selGirl) {
          const g = GIRLS.find((x) => x.id === selGirl);
          const gs = girlState(p, g.id);
          const next = g.stages[gs.stage];
          const miss = next ? stageReqCheck(g, next) : [];
          const giftables = Object.keys(p.inventory).filter((id) => GIFTS[id]);
          return (
            <Panel title={g.name} kanji={g.kanji}>
              <p className="flavor"><b style={{ color: "#0C93CC" }}>{g.tag}</b></p>
              <p className="flavor">{g.bio}</p>
              <Bar label={`Affection — Chapter ${gs.stage}/${g.stages.length}`} val={gs.aff} max={next ? next.req.aff : gs.aff || 1}
                color="linear-gradient(90deg,#00AEEF,#00C08A)" />
              {Object.entries(g.perks).map(([s, pid]) => (
                <div className="kv" key={pid}><span>Ch.{s} perk {gs.stage >= Number(s) ? "— ACTIVE" : "— locked"}</span><b style={{ color: gs.stage >= Number(s) ? "#0C93CC" : "#7C7096" }}>{g.perkDesc[s]}</b></div>
              ))}
              {g.stages.slice(0, gs.stage).map((st, i) => (
                <div className="row" key={i}>
                  <span className="k">済</span>
                  <div className="row-mid"><b>Ch.{i + 1} — {st.t}</b></div>
                  <button className="btn ghost" style={{ margin: 0 }} onClick={() => setScene({ girl: g, title: st.t, kanji: g.kanji, scene: resolveScene(st, p.flags || []) })}>Reread</button>
                </div>
              ))}
              {next ? (
                <div className="row">
                  <span className="k">未</span>
                  <div className="row-mid">
                    <b>Ch.{gs.stage + 1} — {next.t}</b>
                    <small>{miss.length ? `Needs: ${miss.join(", ")}`
                      : `Ready. Costs ${next.cost.energy || 0} energy${next.cost.money ? ` + ${fmt(next.cost.money)}` : ""}${next.cost.nerve ? ` + ${next.cost.nerve} nerve` : ""}.`}</small>
                  </div>
                  <button className="btn" disabled={miss.length > 0} onClick={() => advanceStory(g)}>Live it</button>
                </div>
              ) : (
                <p className="flavor" style={{ marginTop: 10 }}>This romance route is complete. Its relationship perks remain active.</p>
              )}
              <div className="grid2" style={{ marginTop: 12 }}>
                <button className="btn big" disabled={p.energy < 6 || p.money < 200} onClick={() => hangOut(g)}>Go on a date (6⚡ · ¥200)</button>
                <button className="btn big ghost" style={{ margin: 0 }} onClick={() => setSelGirl(null)}>Back to the city</button>
              </div>
              {giftables.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <h3 className="sub">Give a gift</h3>
                  {giftables.map((id) => {
                    const it = itemById(id);
                    return (
                      <div className="row" key={id}>
                        <span className={`slot mini r-${it.rarity}`}><PixIcon id={it.id} size={22} /></span>
                        <div className="row-mid"><b>{it.name} ×{p.inventory[id]}</b><small>+{GIFTS[id]} affection</small></div>
                        <button className="btn" onClick={() => giveGift(g, id)}>Give</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          );
        }
        return (
          <Panel title="Hearts — Romance Routes" kanji="恋愛">
            <p className="flavor">Five original seven-chapter romances with choices, confessions, jealousy, breakups and compatible shared endings. Your decisions persist in the account save.</p>
            {p.partner && <p className="story-p">Current partner: <b>{GIRLS.find((g)=>g.id===p.partner)?.name || p.partner}</b></p>}
            {(p.poly || []).length > 1 && <button className="btn big" disabled={(p.poly || []).some((id)=>girlState(p,id).stage<7)||hasFlag(p,"joint_done")} onClick={playJointChapter}>{hasFlag(p,"joint_done")?"Shared ending complete":"Play shared ending"}</button>}
            {GIRLS.map((g) => {
              const gs = girlState(p, g.id);
              return (
                <div className="row" key={g.id}>
                  <span className="k">{g.kanji}</span>
                  <div className="row-mid">
                    <b>{g.name}</b>
                    <small>{g.tag} · Ch.{gs.stage}/{g.stages.length} · {gs.aff} affection{p.partner===g.id?" · PARTNER":(p.poly||[]).includes(g.id)?" · SHARED PARTNER":hasFlag(p,`heartbroken_${g.id}`)?" · ENDED":""}</small>
                  </div>
                  <button className="btn" onClick={() => setSelGirl(g.id)}>Visit</button>
                </div>
              );
            })}
            <p className="muted" style={{ marginTop: 10 }}>Dates and gifts raise affection. Confessing while another relationship is active forces a choice; honesty only works for compatible partners with 100+ affection each.</p>
          </Panel>
        );
      }
      case "chat": {
        if (sharedOK.current === false) return (
          <Panel title="World Chat" kanji="通信">
            <p className="flavor">This view doesn't allow shared storage, so live chat with other players is unavailable here.</p>
            <p className="muted">Everything else works normally. To play with real people, publish the game (share button) or run the standalone website build - both support the full multiplayer grid.</p>
          </Panel>
        );
        if (!p.handle) return HandleGate();
        return (
          <Panel title="World Chat — Shibuya Frequency" kanji="通信">
            <p className="muted">Live channel shared with every player. Anything you post here is public. Refreshes every 8s.</p>
            <div className="chat-box">
              {chatMsgs.length === 0 && <p className="muted">Static on the line… no messages yet. Say something.</p>}
              {chatMsgs.map((m) => (
                <div key={m.key} className={`chat-msg ${m.h === p.handle ? "mine" : ""}`}>
                  <span className="chat-h">{m.h}</span>
                  <span className="chat-t">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="chat-m">{m.m}</div>
                </div>
              ))}
            </div>
            <div className="chat-row">
              <input className="chat-input" value={chatInput} maxLength={200}
                placeholder={`Broadcasting as ${p.handle}…`}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} />
              <button className="btn" disabled={chatBusy || !chatInput.trim()} onClick={sendChat}>Send</button>
            </div>
          </Panel>
        );
      }
      case "board": {
        if (sharedOK.current === false) return (
          <Panel title="City Rankings" kanji="番付">
            <p className="flavor">Rankings need shared storage, which this view doesn't allow.</p>
            <p className="muted">Your solo progress, titles and Grid Pass all still work. Publish the game or use the website build to compete with real players.</p>
          </Panel>
        );
        if (!p.handle) return HandleGate();
        const online = Array.isArray(board) ? board.filter((r) => now() - (r.seen || 0) < 180000).length : 0;
        return (
          <Panel title="City Rankings" kanji="番付">
            <p className="muted">Top players across all of Neo-Tokyo. {Array.isArray(board) ? `${online} seen in the last 3 min.` : ""}</p>
            {board === "loading" && <p className="flavor">Pulling records from the grid…</p>}
            {Array.isArray(board) && board.length === 0 && <p className="muted">No players ranked yet. You could be the first name on this board.</p>}
            {Array.isArray(board) && board.map((r, i) => (
              <div className="row" key={r.h + i}>
                <span className="k">{i === 0 ? "壱" : i === 1 ? "弐" : i === 2 ? "参" : i + 1}</span>
                <div className="row-mid">
                  <b>{r.h}{(r.evo || 0) > 0 ? <span style={{ color: "#D98600" }}> {"★".repeat(Math.min(r.evo, 5))}</span> : ""}{r.title ? <span style={{ color: "#D98600" }}> 「{r.title}」</span> : ""}{r.h === p.handle ? " (you)" : ""}{now() - (r.seen || 0) < 180000 ? " ●" : ""}</b>
                  <small>Level {r.lvl} · {fmt(r.money)} · {r.wins} fight wins</small>
                </div>
              </div>
            ))}
            <button className="btn ghost" onClick={loadBoard}>Refresh rankings</button>
          </Panel>
        );
      }
      default: return null;
    }
  };

  const HandleGate = () => (
    <Panel title={gateMode === "new" ? "Join the Grid" : "Grid Pass Login"} kanji="登録">
      <div className="bet-row">
        <button className={`chip ${gateMode === "new" ? "on" : ""}`} onClick={() => { setGateMode("new"); setHandleErr(""); }}>New player</button>
        <button className={`chip ${gateMode === "login" ? "on" : ""}`} onClick={() => { setGateMode("login"); setHandleErr(""); }}>Log in</button>
      </div>
      <p className="flavor">
        {gateMode === "new"
          ? "Claim a unique street handle and set a PIN. Together they're your Grid Pass - log in from any device, anywhere, and your character follows you."
          : "Already have a character? Enter your handle and PIN to pull your save onto this device. This replaces any local progress here."}
      </p>
      {sharedOK.current === false && (
        <p className="muted" style={{ color: "#D98600" }}>
          Note: this view blocks shared storage, so you'll be set up in SOLO MODE - handle, PIN and save all work, but World Chat and Rankings stay offline until the game is published or run as the website build.
        </p>
      )}
      <div className="chat-row" style={{ marginBottom: 8 }}>
        <input className="chat-input" value={handleInput} maxLength={16}
          placeholder="Handle — e.g. NightRunner_99"
          onChange={(e) => { setHandleInput(e.target.value); setHandleErr(""); }} />
      </div>
      <div className="chat-row">
        <input className="chat-input" value={pinInput} maxLength={8} inputMode="numeric" type="password"
          placeholder="PIN — 4 to 8 digits"
          onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setHandleErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") (gateMode === "new" ? claimHandle() : loginWithPin()); }} />
        <button className="btn" onClick={gateMode === "new" ? claimHandle : loginWithPin}>
          {gateMode === "new" ? "Create" : "Log in"}
        </button>
      </div>
      {handleErr && <p className="muted" style={{ marginTop: 8, color: "#E23A6B" }}>{handleErr}</p>}
      <p className="muted" style={{ marginTop: 10 }}>
        {gateMode === "new"
          ? "Remember your PIN — there's no reset. Only a scrambled fingerprint of it is stored, so no one (including us) can recover it."
          : "Wrong PIN just means no account is found — nothing gets locked out. Take another shot."}
      </p>
    </Panel>
  );

  return (
    <div className="ntu">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DotGothic16&family=Baloo+2:wght@500;700;800&family=Nunito:wght@400;600;700;800;900&display=swap');
        :root{
          --paper:#FFF6EA; --card:#FFFFFF;
          --ink:#2C2240; --ink-soft:#7C7096; --ink-faint:#B0A6C8;
          --coral:#FF4D82; --coral-deep:#E23A6B;
          --sky:#00AEEF; --sky-deep:#0C93CC;
          --grape:#8C5CF7; --gold:#FFAB00; --gold-deep:#D98600;
          --mint:#00C08A; --mint-deep:#00A377; --red:#F1385C;
        }
        .ntu{min-height:100vh;padding-bottom:calc(86px + env(safe-area-inset-bottom));background:
          radial-gradient(900px 460px at 85% -8%, rgba(255,77,130,.10), transparent 62%),
          radial-gradient(800px 460px at -5% 15%, rgba(0,174,239,.10), transparent 60%),
          radial-gradient(700px 400px at 50% 115%, rgba(140,92,247,.08), transparent 60%),
          var(--paper);
          color:var(--ink);font-family:'Nunito',sans-serif;padding-bottom:90px;position:relative}
        .ntu::after{content:"";position:fixed;inset:0;pointer-events:none;
          background:repeating-linear-gradient(0deg,rgba(44,34,64,.012) 0 1px,transparent 1px 3px)}
        .top{position:sticky;top:0;z-index:5;background:rgba(255,246,234,.9);backdrop-filter:blur(8px);
          border-bottom:3px solid var(--ink);padding:10px 14px 12px;box-shadow:0 4px 0 rgba(44,34,64,.05)}
        .brand{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:16px;letter-spacing:.5px;color:var(--coral);
          display:flex;justify-content:space-between;align-items:baseline}
        .brand .money{color:var(--gold-deep);font-size:16px;font-weight:800}
        .bars{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}
        .bar-head{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.5px;
          text-transform:uppercase;color:var(--ink-soft);margin-bottom:3px;font-weight:800}
        .bar-track{height:9px;background:#EFE6F4;border-radius:99px;border:1px solid rgba(44,34,64,.08);overflow:hidden}
        .bar-fill{height:100%;border-radius:99px;transition:width .4s}
        .ntu main{max-width:680px;margin:0 auto;padding:14px}
        .activity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.activity-card{min-height:118px;display:grid;grid-template-columns:50px 1fr;grid-template-rows:auto 1fr;gap:2px 10px;padding:13px;border:2px solid rgba(44,34,64,.12);border-radius:16px;background:#fff;color:var(--ink);text-align:left;box-shadow:2px 3px 0 rgba(44,34,64,.12)}.activity-card>span{grid-row:1/3;display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,var(--coral),var(--grape));color:#fff;font:24px 'DotGothic16'}.activity-card>b{font:800 16px 'Baloo 2'}.activity-card>small{color:var(--ink-soft);line-height:1.35}
        .progression-callout{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;padding:14px;border:2px solid var(--sky);border-radius:16px;background:linear-gradient(135deg,#effbff,#fff);box-shadow:3px 4px 0 rgba(0,174,239,.16)}.progression-callout>small{color:var(--sky-deep);font-weight:900;letter-spacing:.1em}.progression-callout>b{font:800 19px 'Baloo 2'}.progression-callout>span{color:var(--ink-soft);font-size:12px;line-height:1.4}.progression-callout>button{align-self:flex-start;margin:3px 0 0}
        /* ---- sticker-card panel system (the signature device) ---- */
        .panel{position:relative;background:var(--card);border:3px solid var(--ink);border-radius:22px;
          padding:20px 16px 16px;margin-bottom:16px;overflow:visible;
          box-shadow:5px 5px 0 rgba(44,34,64,.14)}
        .panel-kanji{position:absolute;left:14px;top:-17px;width:36px;height:36px;border-radius:12px;
          background:linear-gradient(150deg,var(--coral),var(--grape));
          font-family:'DotGothic16',monospace;font-size:19px;color:#fff;line-height:1;
          display:flex;align-items:center;justify-content:center;border:3px solid var(--ink);
          box-shadow:2px 3px 0 rgba(44,34,64,.2);pointer-events:none}
        .panel-title{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:18px;color:var(--ink);
          margin:2px 0 12px 30px;letter-spacing:.2px}
        .sub{font-family:'Baloo 2',sans-serif;font-weight:700;font-size:13px;color:var(--coral);
          margin:16px 0 8px;letter-spacing:.8px;text-transform:uppercase}
        .flavor{color:var(--ink-soft);font-size:13.5px;margin:0 0 12px;line-height:1.5}
        .muted{color:var(--ink-soft);font-size:13px}
        .row{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:2px dashed rgba(44,34,64,.12)}
        .row:last-of-type{border-bottom:none}
        .k{font-family:'DotGothic16',monospace;font-size:20px;color:#fff;width:34px;height:34px;text-align:center;
          line-height:34px;flex:none;background:var(--grape);border-radius:11px;border:2px solid var(--ink);
          box-shadow:2px 2px 0 rgba(44,34,64,.15)}
        .row-mid{flex:1;min-width:0}
        .row-mid b{display:block;font-size:14.5px;color:var(--ink);font-weight:800}
        .row-mid small{color:var(--ink-soft);font-size:12px}
        .btn{font-family:'Baloo 2',sans-serif;font-weight:700;letter-spacing:.3px;font-size:13px;
          background:var(--coral);color:#fff;border:3px solid var(--ink);border-radius:99px;
          padding:9px 16px;cursor:pointer;flex:none;box-shadow:3px 3px 0 rgba(44,34,64,.9);
          transition:transform .1s,box-shadow .1s}
        .btn:disabled{background:#E9E2F0;color:var(--ink-faint);border-color:#D9CFE4;box-shadow:3px 3px 0 rgba(44,34,64,.12);cursor:not-allowed}
        .btn.ghost{background:var(--card);border:3px solid var(--ink);color:var(--ink);margin-top:12px}
        .btn.big{width:100%;padding:14px;font-size:14px}
        .btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 rgba(44,34,64,.9)}
        .btn:disabled:active{transform:none;box-shadow:3px 3px 0 rgba(44,34,64,.12)}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
        .stat-card{display:flex;gap:10px;align-items:center;background:#FBF3E3;border-radius:16px;
          padding:10px 12px;border:2px solid rgba(44,34,64,.14)}
        .stat-card b{display:block;font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.5px;font-weight:800}
        .stat-card em{font-style:normal;font-size:21px;color:var(--sky-deep);font-weight:800;font-family:'Baloo 2',sans-serif}
        .kv{display:flex;justify-content:space-between;align-items:baseline;font-size:13.5px;padding:6px 0;border-bottom:2px dashed rgba(44,34,64,.1)}
        .kv span{color:var(--ink-soft);font-weight:600}
        .big-timer{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:52px;color:var(--coral);
          text-align:center;margin:14px 0}
        .fight-log{margin-top:12px;background:#FBF3E3;border:2px solid rgba(44,34,64,.14);border-radius:16px;
          padding:12px;font-size:12.5px;color:var(--ink-soft)}
        .fight-log b{color:var(--sky-deep);display:block;margin-bottom:6px;font-family:'Baloo 2',sans-serif}
        .story-p{font-size:14.5px;line-height:1.7;color:var(--ink);margin:0 0 14px;text-indent:1em}
        /* ---- screen transition ---- */
        .screen-in{animation:screenIn .35s ease both}
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        /* ---- floating combat text ---- */
        .floaters{position:fixed;top:128px;left:0;right:0;z-index:40;pointer-events:none;max-width:680px;margin:0 auto;height:0}
        .floater{position:absolute;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:17px;color:var(--ink);
          text-shadow:0 2px 0 rgba(255,255,255,.7);animation:floatUp 1.5s ease-out forwards;white-space:nowrap}
        @keyframes floatUp{0%{opacity:0;transform:translateY(8px) scale(.8)}15%{opacity:1;transform:translateY(0) scale(1.15)}
          30%{transform:translateY(-6px) scale(1)}100%{opacity:0;transform:translateY(-46px)}}
        /* ---- sakura petals ---- */
        .petals{position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden}
        .petal{position:absolute;top:-30px;font-size:14px;opacity:.55;animation:petalFall linear infinite}
        @keyframes petalFall{0%{transform:translateY(-30px) translateX(0) rotate(0)}
          50%{transform:translateY(55vh) translateX(34px) rotate(200deg)}
          100%{transform:translateY(108vh) translateX(-16px) rotate(420deg)}}
        .top,main,.log,nav{position:relative;z-index:2}
        /* ---- battle scene: kept as a moody rooftop diorama on purpose, framed like a shelf display ---- */
        .battle{margin-top:12px;background:#171225;border-radius:18px;border:3px solid var(--ink);padding:12px;
          box-shadow:4px 4px 0 rgba(44,34,64,.16)}
        .battle-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
        .fighter{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
        .fighter.right{flex-direction:row}
        .avatar{font-size:34px;filter:drop-shadow(0 0 8px rgba(255,77,130,.5))}
        .fighter-bar{flex:1;min-width:0}
        .fighter-bar small{font-family:'Baloo 2',sans-serif;font-size:9px;color:#B8AFD2;letter-spacing:1px}
        .hp-track{height:8px;background:#2B2444;border-radius:99px;overflow:hidden}
        .hp-fill{height:100%;border-radius:99px;transition:width .35s ease}
        .hp-fill.me{background:linear-gradient(90deg,var(--mint),var(--mint-deep))}
        .hp-fill.foe{background:linear-gradient(90deg,var(--coral),var(--red))}
        .vs{font-family:'Baloo 2',sans-serif;font-weight:800;color:var(--gold);font-size:13px;flex:none}
        .fl-line{font-size:12.5px;padding:2px 6px;color:#C9C0E0;animation:lineIn .25s ease both}
        @keyframes lineIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
        .fl-me{color:#8FE0FF}.fl-crit{color:var(--gold);font-weight:700}
        .fl-foe{color:#FFB3CC}.fl-dodge{color:var(--mint);font-style:italic}
        .fl-win{color:var(--mint);font-weight:700}.fl-lose{color:var(--coral);font-weight:700}
        .battle-banner{font-family:'Baloo 2',sans-serif;font-weight:800;text-align:center;font-size:24px;margin-top:8px;
          letter-spacing:1px;animation:bannerIn .5s cubic-bezier(.2,1.6,.4,1) both}
        .battle-banner.win{color:var(--gold);text-shadow:0 0 20px rgba(255,171,0,.5)}
        .battle-banner.lose{color:var(--coral);text-shadow:0 0 20px rgba(255,77,130,.5)}
        @keyframes bannerIn{from{opacity:0;transform:scale(2.2)}to{opacity:1;transform:scale(1)}}
        .fx-shake{animation:shake .3s ease}
        @keyframes shake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
        .fx-hit{animation:hitFlash .3s ease}
        @keyframes hitFlash{0%{filter:brightness(3) drop-shadow(0 0 14px #FFAB00)}100%{filter:none}}
        .fx-forge{animation:forgeGlow .9s ease}
        @keyframes forgeGlow{0%,100%{background:transparent}40%{background:rgba(255,171,0,.14);box-shadow:0 0 20px rgba(255,171,0,.25)}}
        /* ---- MMO inventory ---- */
        .inv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:8px;margin:8px 0}
        .slot{position:relative;aspect-ratio:1;background:#FBF3E3;border-radius:14px;border:3px solid var(--ink);
          display:flex;align-items:center;justify-content:center;cursor:pointer;
          box-shadow:2px 2px 0 rgba(44,34,64,.14);transition:transform .12s,box-shadow .12s}
        .slot:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(44,34,64,.14)}
        .slot.sel{box-shadow:0 0 0 3px var(--sky),2px 2px 0 rgba(44,34,64,.14)}
        .slot.r-common{border-color:#B0A6C8}
        .slot.r-uncommon{border-color:var(--sky);box-shadow:2px 2px 0 rgba(0,174,239,.25)}
        .slot.r-rare{border-color:var(--coral);box-shadow:2px 2px 0 rgba(255,77,130,.25)}
        .slot.r-epic{border-color:var(--gold);box-shadow:2px 2px 0 rgba(255,171,0,.28)}
        .slot.r-golden,.equip-slot.r-golden,.item-detail.r-golden{border-color:var(--gold);box-shadow:2px 2px 0 rgba(255,171,0,.3)}
        .slot.r-legendary,.equip-slot.r-legendary,.item-detail.r-legendary{border-color:#FF7A00;animation:legPulse 1.6s ease-in-out infinite}
        @keyframes legPulse{0%,100%{box-shadow:2px 2px 0 rgba(255,122,0,.3),0 0 10px rgba(255,122,0,.25)}
          50%{box-shadow:2px 2px 0 rgba(255,122,0,.3),0 0 20px rgba(255,171,0,.6)}}
        .gear-glyph{font-family:'DotGothic16',monospace;font-size:24px;line-height:1}
        .gear-glyph.big{font-size:38px}
        .plus-badge{position:absolute;top:-6px;right:-6px;font-size:10px;color:#fff;background:var(--gold-deep);
          border-radius:99px;padding:1px 5px;font-family:'Baloo 2',sans-serif;font-weight:800;border:2px solid var(--ink)}
        /* ---- loot reveal ceremony: kept as a dramatic dark spotlight on purpose ---- */
        .loot-ov{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
          background:rgba(20,14,32,.88);animation:lootFade .3s ease both;overflow:hidden}
        .loot-ov.leg{animation:lootFade .3s ease both,legFlash .7s ease .1s}
        @keyframes lootFade{from{opacity:0}to{opacity:1}}
        @keyframes legFlash{0%{background:rgba(20,14,32,.88)}18%{background:rgba(255,171,0,.5)}100%{background:rgba(20,14,32,.88)}}
        .loot-rays{position:absolute;width:640px;height:640px;border-radius:50%;animation:lootSpin 9s linear infinite;
          mask-image:radial-gradient(circle,black 0%,transparent 70%);-webkit-mask-image:radial-gradient(circle,black 0%,transparent 70%)}
        @keyframes lootSpin{to{transform:rotate(360deg)}}
        .loot-card{position:relative;text-align:center;max-width:330px;width:88%;padding:28px 20px;
          background:var(--card);border:4px solid var(--ink);border-radius:26px;
          box-shadow:6px 6px 0 rgba(0,0,0,.35);
          animation:lootPop .55s cubic-bezier(.2,1.9,.4,1) both}
        .loot-card.lc-leg{animation:lootPop .55s cubic-bezier(.2,1.9,.4,1) both,lootShake .45s ease .5s}
        @keyframes lootPop{from{opacity:0;transform:scale(.3) rotate(-6deg)}to{opacity:1;transform:scale(1) rotate(0)}}
        @keyframes lootShake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        .loot-rar{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:18px;letter-spacing:2px;margin-bottom:6px}
        .loot-glyph{font-family:'DotGothic16',monospace;font-size:88px;line-height:1.1;animation:glyphFloat 2.4s ease-in-out infinite}
        @keyframes glyphFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        .loot-name{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:19px;margin-top:6px;color:var(--ink)}
        .loot-main{color:var(--ink);font-size:15px;margin-top:4px;font-family:'Nunito';font-weight:700}
        .loot-sub{color:var(--sky-deep);font-size:13px;margin-top:3px;font-weight:700}
        .loot-spark{position:absolute;font-size:15px;animation:sparkPop 1.4s ease-out infinite}
        @keyframes sparkPop{0%{opacity:0;transform:scale(.3) translateY(6px)}25%{opacity:1;transform:scale(1.25)}60%{opacity:.7}100%{opacity:0;transform:scale(.6) translateY(-16px)}}
        /* ---- blackjack table: felt-green diorama, kept richly colored on purpose ---- */
        .bj-table{background:radial-gradient(ellipse at 50% -10%,#1F8F6E 0%,#0F6E52 55%,#0A4E3B 100%);
          border:4px solid var(--ink);border-radius:22px 22px 110px 110px / 22px 22px 60px 60px;
          padding:14px 10px 18px;position:relative;box-shadow:5px 5px 0 rgba(44,34,64,.18)}
        .bj-dealer{display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:6px}
        .dealer-avatar{width:42px;height:42px;border-radius:50%;background:#fff;
          border:3px solid var(--gold);color:var(--gold-deep);font-family:'DotGothic16',monospace;font-size:20px;
          display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 rgba(0,0,0,.25)}
        .bj-row{display:flex;justify-content:space-around;align-items:flex-start;gap:6px;margin-top:8px}
        .bj-seat{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
        .bj-seat.you .bj-name{color:#BDF3FF}
        .bj-seat.turn .bj-name{color:var(--gold);text-shadow:0 0 8px rgba(255,171,0,.7)}
        .bj-seat.turn .bj-cards{filter:drop-shadow(0 0 6px rgba(255,171,0,.55))}
        .bj-cards{display:flex;gap:3px;min-height:60px;flex-wrap:wrap;justify-content:center;max-width:150px}
        .bj-name{font-family:'Baloo 2',sans-serif;font-size:10.5px;color:#DCEFE8;letter-spacing:.5px;white-space:nowrap}
        .bj-val{font-size:11px;font-family:'Nunito';font-weight:800}
        .pcard{width:40px;height:58px;background:#fff;border-radius:8px;position:relative;flex:none;
          box-shadow:0 3px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;
          font-family:'Nunito',sans-serif;font-weight:800;animation:cardIn .4s cubic-bezier(.2,1.5,.4,1) both}
        .pcard .cr{position:absolute;top:2px;left:4px;font-size:10px;line-height:1}
        .pcard .cs{font-size:20px}
        .pcard.red{color:var(--red)}.pcard.blk{color:var(--ink)}
        .pcard.back{background:repeating-linear-gradient(45deg,var(--sky) 0 5px,var(--sky-deep) 5px 10px);border:2px solid #fff}
        .pcard.back .koi{color:#fff;font-family:'DotGothic16',monospace;font-size:17px}
        @keyframes cardIn{from{opacity:0;transform:translateY(-20px) rotate(-8deg) scale(.6)}to{opacity:1;transform:none}}
        .bj-banner{font-family:'Baloo 2',sans-serif;font-weight:800;text-align:center;font-size:19px;letter-spacing:1px;
          margin-top:8px;color:#EAF7F1;animation:bannerIn .45s cubic-bezier(.2,1.6,.4,1) both}
        .bj-banner.win{color:var(--gold);text-shadow:0 0 16px rgba(255,171,0,.55)}
        .bj-banner.lose{color:#FF8FAE;text-shadow:0 0 16px rgba(255,77,130,.4)}
        .bj-talk{font-size:11.5px;color:#B8E4D6;font-style:italic;text-align:center;margin:8px 0 0;min-height:15px}
        /* ---- ICHI table: violet diorama, kept richly colored on purpose ---- */
        .ichi-table{position:relative;background:radial-gradient(ellipse at 50% -10%,#8156E8 0%,#5B34B8 55%,#3E1F8C 100%);
          border:4px solid var(--ink);border-radius:22px;padding:12px 10px 14px;margin-bottom:10px;
          box-shadow:5px 5px 0 rgba(44,34,64,.18)}
        .ichi-opps{display:flex;justify-content:space-around;margin-bottom:10px}
        .ichi-opp{display:flex;flex-direction:column;align-items:center;gap:3px;opacity:.85;transition:all .3s}
        .ichi-opp.turn{opacity:1;transform:translateY(-3px)}
        .ichi-opp.turn .ichi-ava{border-color:var(--gold);box-shadow:0 0 14px rgba(255,171,0,.6)}
        .ichi-opp.won .ichi-ava{border-color:var(--mint);box-shadow:0 0 14px rgba(0,192,138,.6)}
        .ichi-ava{width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid var(--sky);
          color:var(--ink);font-family:'DotGothic16',monospace;font-size:15px;display:flex;align-items:center;justify-content:center;transition:all .3s}
        .ichi-mini{display:flex;align-items:center;gap:2px}
        .ichi-mini i{width:9px;height:14px;border-radius:2px;background:repeating-linear-gradient(45deg,#fff 0 3px,#E4D6FF 3px 6px);border:1px solid rgba(255,255,255,.4)}
        .ichi-mini b{font-size:10px;color:#E4D6FF;font-family:'Nunito';margin-left:2px;font-weight:700}
        .ichi-center{display:flex;justify-content:center;align-items:center;gap:18px;margin:6px 0}
        .ichi-drawpile{position:relative;cursor:pointer}
        .ichi-drawpile:active{transform:scale(.93)}
        .ichi-count{position:absolute;bottom:-6px;right:-6px;background:var(--ink);border:2px solid #fff;
          color:#fff;font-size:9px;font-family:'Nunito';font-weight:800;padding:1px 5px;border-radius:8px}
        .ichi-discard{border-radius:12px;transition:box-shadow .4s}
        .ichi-dir{font-size:26px;color:var(--gold);text-shadow:0 0 10px rgba(255,171,0,.6);animation:dirSpin 4s linear infinite}
        @keyframes dirSpin{to{transform:rotate(360deg)}}
        .icard{position:relative;width:44px;height:64px;border-radius:9px;border:3px solid #fff;flex:none;
          box-shadow:0 3px 8px rgba(0,0,0,.35);cursor:default;padding:0;overflow:hidden;
          animation:cardIn .35s cubic-bezier(.2,1.5,.4,1) both;transition:transform .18s,filter .18s}
        .icard::before{content:"";position:absolute;inset:5px 2px;background:rgba(255,255,255,.28);
          border-radius:50%;transform:rotate(-32deg)}
        .icard .iv{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%;
          font-family:'Nunito',sans-serif;font-weight:800;font-size:24px;color:#fff;
          text-shadow:0 2px 0 rgba(0,0,0,.3)}
        .icard .ic{position:absolute;z-index:1;font-size:9px;font-weight:800;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.35)}
        .icard .ic.tl{top:2px;left:4px}
        .icard .ic.br{bottom:2px;right:4px;transform:rotate(180deg)}
        .icard.big{width:64px;height:92px;border-radius:12px}
        .icard.big .iv{font-size:36px}
        .icard.back{background:var(--ink);display:flex;align-items:center;justify-content:center}
        .icard.back::before{background:rgba(255,255,255,.06)}
        .icard.back .ik{position:relative;z-index:1;font-family:'DotGothic16',monospace;font-size:24px;color:var(--gold)}
        .icard.playable{cursor:pointer;transform:translateY(-9px);filter:drop-shadow(0 0 8px rgba(255,255,255,.7))}
        .icard.playable:active{transform:translateY(-9px) scale(.93)}
        .icard.dim{opacity:.5}
        .icard.slam{animation:icardSlam .4s cubic-bezier(.2,1.7,.4,1) both}
        @keyframes icardSlam{from{opacity:0;transform:scale(1.7) rotate(10deg)}to{opacity:1;transform:scale(1) rotate(0)}}
        .ichi-hand{display:flex;overflow-x:auto;padding:12px 6px 6px;gap:0;margin-bottom:8px}
        .ichi-hand .icard{margin-left:-13px}
        .ichi-hand .icard:first-child{margin-left:0}
        .ichi-shout{position:absolute;left:0;right:0;top:42%;z-index:3;font-size:26px}
        .ichi-wildpick{position:absolute;inset:0;z-index:4;background:rgba(20,14,32,.82);border-radius:19px;display:flex;
          flex-direction:column;align-items:center;justify-content:center;gap:10px;animation:lootFade .2s both}
        .ichi-swatches{display:flex;gap:12px}
        .ichi-swatches button{width:46px;height:46px;border-radius:14px;border:3px solid #fff;cursor:pointer;
          box-shadow:0 0 14px rgba(255,255,255,.3);transition:transform .15s}
        .ichi-swatches button:active{transform:scale(.88)}
        .uno-call{width:100%;margin:0;background:linear-gradient(135deg,#FFAB00,#FF4D82);color:#fff;
          border-color:var(--ink);font-size:22px;letter-spacing:.16em;animation:unoPulse .55s ease-in-out infinite alternate}
        @keyframes unoPulse{from{transform:scale(1);box-shadow:3px 3px 0 var(--ink)}to{transform:scale(1.025);box-shadow:5px 5px 0 var(--ink),0 0 20px rgba(255,77,130,.45)}}
        /* ---- street cricket: dusk pitch diorama, kept atmospheric on purpose ---- */
        .ck-pitch{position:relative;height:300px;border-radius:19px;overflow:hidden;cursor:pointer;touch-action:none;
          background:linear-gradient(180deg,#2E2350 0%,#4A3470 34%,#8A6B4A 62%,#C9A46B 100%);
          border:4px solid var(--ink);box-shadow:5px 5px 0 rgba(44,34,64,.18);margin-bottom:10px}
        .ck-strip{position:absolute;left:50%;top:8%;bottom:4%;width:74px;transform:translateX(-50%);
          background:linear-gradient(180deg,#D9BE94,#E8D2A8);border-left:2px solid rgba(255,255,255,.3);border-right:2px solid rgba(255,255,255,.3)}
        .ck-bowler{position:absolute;top:4%;left:50%;transform:translateX(-50%);width:36px;height:36px;border-radius:50%;
          background:#fff;border:3px solid var(--sky);color:var(--sky-deep);font-family:'DotGothic16',monospace;font-size:17px;
          display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 rgba(0,0,0,.2)}
        .ck-batter{position:absolute;bottom:11%;left:50%;transform:translateX(-50%);width:36px;height:36px;border-radius:50%;
          background:#fff;border:3px solid var(--coral);color:var(--coral-deep);font-family:'DotGothic16',monospace;font-size:17px;
          display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 rgba(0,0,0,.2)}
        .ck-ball{position:absolute;width:15px;height:15px;border-radius:50%;left:50%;top:10%;
          transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 30%,#FF8A8A,#D92B45 60%,#8F1428);
          box-shadow:0 3px 8px rgba(0,0,0,.5);pointer-events:none}
        .ck-stumps{position:absolute;bottom:4.5%;left:50%;transform:translateX(-50%);display:flex;gap:5px}
        .ck-stumps span{width:5px;height:26px;background:linear-gradient(var(--gold),var(--gold-deep));border-radius:2px}
        .ck-score{display:flex;justify-content:space-between;align-items:center;font-family:'Nunito';font-weight:800;
          font-size:13px;color:var(--ink-soft);margin-bottom:8px}
        .ck-overdots{display:flex;gap:5px}
        .ck-overdots i{width:20px;height:20px;border-radius:50%;font-style:normal;font-size:11px;color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:800;border:2px solid var(--ink)}
        .slot-icon{font-size:26px;line-height:1;display:flex;align-items:center;justify-content:center}
        .slot-icon.big{font-size:38px}
        .slot .qty{position:absolute;bottom:1px;right:3px;font-size:10px;font-weight:800;color:#fff;
          background:var(--ink);border-radius:6px;padding:0 3px;font-family:'Nunito'}
        .slot .eq-mark{position:absolute;top:-6px;left:-6px;font-size:9px;color:#fff;background:var(--mint-deep);
          border-radius:99px;padding:1px 4px;font-weight:800;font-family:'Nunito';border:2px solid var(--ink)}
        .slot.eq{box-shadow:2px 2px 0 rgba(0,192,138,.3),0 0 0 2px var(--mint)}
        .slot.mini{width:40px;aspect-ratio:1;flex:none}
        .slot.mini .slot-icon{font-size:20px}
        .mat-row{display:flex;gap:8px;margin:8px 0 14px}
        .mat-row .slot{width:52px;flex:none;cursor:default}
        .equip-slot{display:flex;align-items:center;gap:10px;background:#FBF3E3;border-radius:16px;border:3px solid var(--ink);
          padding:10px 12px;cursor:pointer;box-shadow:2px 2px 0 rgba(44,34,64,.14)}
        .equip-slot.r-uncommon{border-color:var(--sky)}.equip-slot.r-rare{border-color:var(--coral)}
        .equip-slot.r-epic{border-color:var(--gold)}.equip-slot.r-common{border-color:#B0A6C8}
        .equip-slot small{display:block;font-size:9px;letter-spacing:.5px;color:var(--ink-soft);font-family:'Baloo 2',sans-serif;text-transform:uppercase}
        .equip-slot b{font-size:12.5px;color:var(--ink)}
        .item-detail{margin-top:10px;background:#FBF3E3;border-radius:18px;padding:14px;border:3px solid var(--ink);animation:screenIn .25s ease both}
        .item-detail.r-rare{border-color:var(--coral)}.item-detail.r-epic{border-color:var(--gold)}
        .item-detail.r-uncommon{border-color:var(--sky)}
        .id-head{display:flex;gap:12px;align-items:center}
        .pix{display:block;filter:drop-shadow(0 1px 1px rgba(44,34,64,.18))}
        .brawl-wrap{position:relative}
        .brawl-canvas{width:100%;aspect-ratio:8/5;display:block;touch-action:none;background:#171225;
          border-radius:18px;border:4px solid var(--ink);box-shadow:5px 5px 0 rgba(44,34,64,.18);cursor:crosshair}
        .brawl-btn{position:absolute;bottom:52px;width:58px;height:58px;border-radius:50%;
          font-family:'DotGothic16',monospace;font-size:22px;cursor:pointer;user-select:none;touch-action:none;
          border:3px solid var(--ink);background:#fff;box-shadow:3px 3px 0 rgba(44,34,64,.4)}
        .brawl-btn.atk{right:12px;color:var(--gold-deep);background:var(--gold)}
        .brawl-btn.dash{right:82px;bottom:44px;width:48px;height:48px;font-size:17px;color:#fff;background:var(--sky)}
        .brawl-skill-dock{position:absolute;z-index:3;top:44px;right:10px;display:flex;gap:6px}
        .brawl-skill-dock button{width:62px;min-height:48px;border:2px solid var(--skill);border-radius:10px;background:rgba(8,14,30,.9);color:#fff;box-shadow:0 0 14px color-mix(in srgb,var(--skill) 45%,transparent);padding:4px;touch-action:none}
        .brawl-skill-dock b,.brawl-skill-dock span{display:block}.brawl-skill-dock b{color:var(--skill);font:900 18px 'DotGothic16',monospace}.brawl-skill-dock span{overflow:hidden;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.brawl-skill-dock button:disabled{filter:grayscale(.65);opacity:.65}
        .brawl-btn:active{transform:scale(.9) translate(1px,1px);box-shadow:1px 1px 0 rgba(44,34,64,.4)}
        @media(hover:hover) and (pointer:fine){.brawl-btn{display:none}}
        /* ---- Simi the guide robot: friendly light chat ---- */
        .simi-fab{position:fixed;right:14px;bottom:78px;z-index:45;width:58px;height:58px;
          background:linear-gradient(160deg,#fff,#FFF0DC);border:3px solid var(--ink);border-radius:20px;
          cursor:pointer;box-shadow:3px 4px 0 rgba(44,34,64,.35);display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:3px;animation:simiBob 3.2s ease-in-out infinite;padding:0}
        .simi-fab:active{transform:scale(.92) translate(1px,2px);box-shadow:2px 2px 0 rgba(44,34,64,.35)}
        .simi-antenna{width:4px;height:7px;background:var(--coral);border-radius:2px;position:relative}
        .simi-antenna::after{content:"";position:absolute;top:-5px;left:-2px;width:8px;height:8px;border-radius:50%;
          background:var(--gold);box-shadow:0 0 8px var(--gold);animation:antennaPulse 2s infinite}
        .simi-face{display:flex;gap:8px}
        .simi-eye{width:9px;height:9px;border-radius:50%;background:var(--sky);box-shadow:0 0 6px rgba(0,174,239,.6);
          animation:simiBlink 4.5s infinite}
        .simi-mouth{width:12px;height:4px;border-radius:0 0 6px 6px;border:2px solid var(--sky);border-top:none}
        @keyframes simiBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes simiBlink{0%,91%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}
        @keyframes antennaPulse{0%,100%{opacity:.6}50%{opacity:1}}
        .simi-panel{position:fixed;right:10px;bottom:146px;z-index:46;width:min(370px,calc(100vw - 20px));
          max-height:62vh;display:flex;flex-direction:column;background:var(--card);
          border:4px solid var(--ink);border-radius:24px;box-shadow:5px 6px 0 rgba(44,34,64,.28);
          overflow:hidden;animation:screenIn .25s ease both}
        .simi-head{display:flex;justify-content:space-between;align-items:baseline;padding:12px 14px;
          border-bottom:3px solid var(--ink);background:#FFF0DC}
        .simi-head b{font-family:'Baloo 2',sans-serif;font-weight:800;color:var(--coral);letter-spacing:1px;font-size:15px}
        .simi-sub{color:var(--ink-soft);font-size:11px}
        .simi-status{color:var(--mint-deep);font-size:10.5px;font-family:'Nunito';font-weight:800;letter-spacing:.3px}
        .simi-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-height:120px}
        .simi-msg{max-width:88%;padding:9px 12px;font-size:13px;line-height:1.55;animation:lineIn .2s ease both;border-radius:16px}
        .simi-msg.bot{align-self:flex-start;background:#FBF3E3;border:2px solid rgba(44,34,64,.1);color:var(--ink);border-bottom-left-radius:4px}
        .simi-msg.user{align-self:flex-end;background:var(--sky);color:#fff;border-bottom-right-radius:4px;font-weight:600}
        .simi-dots span{display:inline-block;animation:dotPulse 1.2s infinite;font-size:8px;color:var(--coral);margin-right:3px}
        .simi-dots span:nth-child(2){animation-delay:.2s}.simi-dots span:nth-child(3){animation-delay:.4s}
        @keyframes dotPulse{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
        .simi-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px}
        .simi-chip{background:#fff;border:2px solid var(--sky);border-radius:99px;color:var(--sky-deep);
          font-family:'Nunito';font-size:11.5px;font-weight:700;padding:6px 11px;cursor:pointer}
        .simi-chip:active{background:#E6F7FF}
        .chat-box{max-height:340px;overflow-y:auto;background:#FBF3E3;border:2px solid rgba(44,34,64,.12);
          border-radius:16px;padding:10px;margin:10px 0;display:flex;flex-direction:column;gap:8px}
        .chat-msg{border-left:3px solid var(--gold);padding:4px 10px;background:#fff;border-radius:0 10px 10px 0}
        .chat-msg.mine{border-left-color:var(--sky)}
        .chat-h{font-family:'Baloo 2',sans-serif;font-weight:700;font-size:12px;color:var(--gold-deep);margin-right:8px}
        .chat-msg.mine .chat-h{color:var(--sky-deep)}
        .chat-t{font-size:10px;color:var(--ink-faint)}
        .chat-m{font-size:13.5px;color:var(--ink);word-break:break-word}
        .chat-row{display:flex;gap:8px}
        .chat-input{flex:1;min-width:0;background:#fff;border:2px solid rgba(44,34,64,.18);border-radius:99px;color:var(--ink);
          font-family:'Nunito',sans-serif;font-size:14px;padding:9px 15px;outline:none}
        .chat-input:focus{border-color:var(--coral);box-shadow:0 0 0 3px rgba(255,77,130,.15)}
        .bet-row{display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap}
        .chip{background:#fff;border:2px solid var(--gold);border-radius:99px;color:var(--gold-deep);padding:7px 13px;
          cursor:pointer;font-family:'Nunito';font-weight:800;font-size:12.5px}
        .chip.on{background:var(--gold);color:#fff;border-color:var(--gold-deep)}
        .log{max-width:680px;margin:0 auto;padding:0 14px}
        .log-line{font-size:12.5px;padding:6px 10px;border-left:3px solid var(--ink-faint);border-radius:0 10px 10px 0;
          margin-bottom:5px;color:var(--ink-soft);background:var(--card)}
        .log-line.good{border-color:var(--mint-deep);color:var(--mint-deep);background:#EAFAF3}
        .log-line.bad{border-color:var(--coral);color:var(--coral-deep);background:#FFF0F4}
        .log-line.system{border-color:var(--gold-deep);color:var(--gold-deep);background:#FFF8E8}
        .ntu>nav{position:fixed;bottom:0;left:0;right:0;z-index:60;background:var(--card);border-top:3px solid var(--ink);
          display:grid;grid-template-columns:repeat(6,1fr);padding:6px max(4px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left));box-shadow:0 -3px 0 rgba(44,34,64,.05)}
        .ntu>nav button{min-height:58px;background:none;border:none;color:var(--ink-faint);font-family:'Nunito';font-size:9.5px;font-weight:800;letter-spacing:.3px;
          text-transform:uppercase;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 2px;touch-action:manipulation}
        .ntu>nav button .nk{font-family:'DotGothic16',monospace;font-size:18px;width:30px;height:30px;line-height:30px;
          border-radius:10px;transition:all .15s}
        .ntu>nav button.on{color:var(--coral)}
        .ntu>nav button.on .nk{background:var(--coral);color:#fff}
        @media(prefers-reduced-motion:reduce){.bar-fill,.hp-fill{transition:none}.petal,.floater,.screen-in,.fl-line,.battle-banner,.loot-rays,.loot-spark,.loot-glyph,.loot-card,.loot-ov{animation:none}.floater,.loot-ov,.loot-card{opacity:1}}
        @media(max-width:520px){.bars{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}.activity-grid{grid-template-columns:1fr}.ntu>nav button{font-size:8px}}
      `}</style>

      <header className="top">
        <div className="brand">
          <span>ネオ東京 UNDERWORLD</span>
          <span className="money">{fmt(p.money)} · Lv {p.level}</span>
        </div>
        <div className="bars">
          <Bar label="Energy" val={p.energy} max={maxEnergy(p)} color="linear-gradient(90deg,#4de3ff,#2fa8c9)" />
          <Bar label="Nerve" val={p.nerve} max={maxNerve(p)} color="linear-gradient(90deg,#ff6fae,#c94b8f)" />
          <Bar label="HP" val={p.hp} max={maxHp(p)} color="linear-gradient(90deg,#7CFF9B,#3fbf68)" />
          <Bar label="Happy" val={p.happy} max={100} color="linear-gradient(90deg,#ffd166,#e0a83a)" />
        </div>
      </header>

      <div className="petals" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="petal" style={{ left: `${8 + i * 14}%`, animationDelay: `${i * 1.7}s`, animationDuration: `${9 + (i % 3) * 3}s` }}>🌸</span>)}
      </div>
      <div className="floaters">
        {floaters.map((f) => <div key={f.id} className="floater" style={{ left: `${f.x}%`, color: f.color }}>{f.text}</div>)}
      </div>
      <main><div className="screen-in" key={screen}>{screenBody()}</div></main>

      <div className="log">
        {log.slice(0, 8).map((l, i) => <div key={i} className={`log-line ${l.t}`}>{l.msg}</div>)}
      </div>

      {lootQueue.length > 0 && (() => {
        const g = lootQueue[0];
        const cur = equipPower(p, g.type);
        const np = gearPower(g);
        const diff = np - cur;
        const col = RARITY_COLOR[g.rarity];
        return (
          <div className={`loot-ov ${g.rarity === "legendary" ? "leg" : ""}`}>
            <div className="loot-rays" style={{ background: `repeating-conic-gradient(${col}26 0 14deg, transparent 14deg 28deg)` }} />
            <div className={`loot-card ${g.rarity === "legendary" ? "lc-leg" : ""}`}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span key={i} className="loot-spark" style={{ left: `${6 + i * 12}%`, top: `${(i % 3) * 30}%`, animationDelay: `${i * 0.13}s`, color: col }}>✦</span>
              ))}
              <div className="loot-rar" style={{ color: col }}>
                {g.rarity === "legendary" ? "⟡ LEGENDARY ⟡" : g.rarity === "golden" ? "✦ GOLDEN ✦" : g.rarity.toUpperCase() + " DROP"}
              </div>
              <div className="loot-glyph" style={{ color: col }}>{g.type === "weapon" ? "刃" : "鎧"}</div>
              <div className="loot-name" style={{ color: col }}>{g.name}</div>
              <div className="loot-main">
                {g.type === "weapon" ? "ATK" : "DEF"} {np}{" "}
                <span style={{ color: diff >= 0 ? "#7CFF9B" : "#ff6fae" }}>({diff >= 0 ? "▲" : "▼"}{Math.abs(diff)} vs equipped)</span>
              </div>
              {g.subs.map((sb) => <div key={sb.k} className="loot-sub">◈ {SUB_LABEL[sb.k]} +{sb.v}</div>)}
              <div className="grid2" style={{ marginTop: 16 }}>
                <button className="btn big" onClick={() => { equipItem(g.uid); setLootQueue((l) => l.slice(1)); }}>Equip now</button>
                <button className="btn big ghost" style={{ margin: 0 }} onClick={() => setLootQueue((l) => l.slice(1))}>Stash it</button>
              </div>
            </div>
          </div>
        );
      })()}
      {!brawl && <button className="simi-fab" onClick={() => setSimiOpen((o) => !o)} aria-label="Chat with Simi">
        <img src="/assets/companions/simi-v2.webp" alt="" />
        <span className="simi-ping" />
      </button>}

      {simiOpen && (
        <div className="simi-panel">
          <div className="simi-head">
            <img src="/assets/companions/simi-v2.webp" alt="" />
            <div className="simi-title">
              <b>SIMI</b> <span className="simi-sub">シミ · guide unit</span>
            </div>
            <span className="simi-status">{simiBusy ? "processing…" : "● online"}</span>
            <button className="simi-close" onClick={() => setSimiOpen(false)} aria-label="Close Simi">×</button>
          </div>
          <div className="simi-msgs">
            {simiMsgs.map((m, i) => (
              <div key={i} className={`simi-msg ${m.role === "assistant" ? "bot" : "user"}`}>{m.content}</div>
            ))}
            {simiBusy && <div className="simi-msg bot simi-dots"><span>●</span><span>●</span><span>●</span></div>}
            <div ref={simiEndRef} />
          </div>
          {simiMsgs.length < 3 && (
            <div className="simi-chips">
              {["What should I do now?", "How do I get rich?", "Explain the Forge", "Explain ally trust"].map((c) => (
                <button key={c} className="simi-chip" onClick={() => askSimi(c)}>{c}</button>
              ))}
            </div>
          )}
          <div className="chat-row" style={{ padding: "0 10px 10px" }}>
            <input className="chat-input" value={simiInput} maxLength={300}
              placeholder="Ask Simi anything…"
              onChange={(e) => setSimiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") askSimi(); }} />
            <button className="btn" disabled={simiBusy || !simiInput.trim()} onClick={() => askSimi()}>Send</button>
          </div>
        </div>
      )}

      <nav>
        {NAV.map(([id, label, kanji]) => (
          <button key={id} className={screen === id || (id === "arcade" && screen === "casino") ? "on" : ""} onClick={() => { onNavigate?.(id); if (id === "fights" && onOpenBattle) { onOpenBattle(); return; } if (id === "loadout") { onOpenArmory?.(); return; } if (id === "economy") { setScreen("economy"); onOpenEconomy?.("auction"); return; } if (id === "social") { onOpenSocial?.(); return; } setScreen(id); setFightLog(null); setScene(null); setJealousy(null); setPendingChoice(null); setSelItem(null); if (brawl) { setBrawl(null); pushLog("You slipped out of the arena.", "info"); } }}>
            <span className="nk">{kanji}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  );
}
