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
export function Brawl({ stats, enemy, onEnd }) {
  const cvs = useRef(null);
  const wrap = useRef(null);
  const flags = useRef({ atk: false, dash: false });

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
      keys: {}, joy: null, banner: "", bannerT: 0, done: false, raf: 0,
    };
    const nextWave = () => {
      S.wave++;
      if (S.wave >= waves.length) {
        S.done = true; S.banner = "勝利 VICTORY"; S.bannerT = 1.4;
        setTimeout(() => onEnd({ win: true, hpFrac: Math.max(0.02, S.p.hp / stats.maxHp) }), 1200);
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
      p.atkCd = 0.36; p.swing = 0.18;
      const range = 56, arc = 1.25;
      /* auto-face the nearest enemy so taps always connect */
      let nearest = null, nd = 1e9;
      S.mobs.forEach((m) => { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < nd) { nd = d; nearest = m; } });
      if (nearest && nd < 170) p.face = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      S.mobs.forEach((m) => {
        const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
        if (d < range + m.r && Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - p.face), Math.cos(Math.atan2(dy, dx) - p.face))) < arc) {
          const crit = Math.random() < critCh;
          const dmg = Math.round((stats.str + stats.wPow) * (0.9 + Math.random() * 0.4) * (crit ? 1.7 : 1));
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
              setTimeout(() => onEnd({ win: false, hpFrac: 0 }), 1200);
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
        ctx.globalAlpha = q.t / 0.4; ctx.strokeStyle = q.c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r + (0.4 - q.t) * 95, 0, 7); ctx.stroke();
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
  const a