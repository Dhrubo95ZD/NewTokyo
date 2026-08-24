export const ARENA_WIDTH = 900;
export const ARENA_HEIGHT = 720;
const PLAY_MIN_Y = 72;
const PLAY_MAX_Y = ARENA_HEIGHT - 150;

const ROLE_STATS = {
  striker: { hp: 108, speed: 255, damage: 17, attackDelay: 0.26 },
  guardian: { hp: 128, speed: 205, damage: 13, attackDelay: 0.34 },
  technician: { hp: 98, speed: 225, damage: 14, attackDelay: 0.3 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const length = (x, y) => Math.hypot(x, y) || 1;

export function createReactiveCombat({ role = "striker", boss = false, weapon = null } = {}) {
  const stats = ROLE_STATS[role] || ROLE_STATS.striker;
  const bonusHp = Number(weapon?.stats?.defense || 0) * 3;
  const enemyHp = boss ? 270 : 128;
  return {
    role, boss, elapsed: 0, status: "active", events: [], fx: [],
    player: {
      x: 190, y: ARENA_HEIGHT / 2, r: 25, hp: stats.hp + bonusHp,
      maxHp: stats.hp + bonusHp, speed: stats.speed, damage: stats.damage + Number(weapon?.stats?.attack || 0),
      attackDelay: stats.attackDelay, attackCooldown: 0, dashCooldown: 0, dashTime: 0,
      invulnerable: 0, focus: 0, combo: 0, comboTime: 0, facingX: 1, facingY: 0,
    },
    enemy: {
      x: 735, y: ARENA_HEIGHT / 2, r: boss ? 48 : 38, hp: enemyHp, maxHp: enemyHp,
      speed: boss ? 112 : 132, attackCooldown: 0.8, windup: 0, windupMax: 0,
      targetX: 0, targetY: 0, attackRadius: boss ? 105 : 82, attackCount: 0,
      stunned: 0, flash: 0,
    },
  };
}

function addFx(state, fx) {
  state.fx.push({ life: 0.24, maxLife: 0.24, ...fx });
}

function damageEnemy(state, amount, kind = "hit") {
  const enemy = state.enemy;
  enemy.hp = Math.max(0, enemy.hp - amount);
  enemy.flash = 0.12;
  state.events.push({ type: "enemy-hit", amount, kind });
  addFx(state, { type: kind, x: enemy.x, y: enemy.y, amount });
  if (enemy.hp <= 0) {
    state.status = "victory";
    state.events.push({ type: "victory" });
  }
}

function damagePlayer(state, amount) {
  const player = state.player;
  if (player.invulnerable > 0 || player.dashTime > 0) {
    state.events.push({ type: "evade" });
    player.focus = Math.min(100, player.focus + 18);
    addFx(state, { type: "evade", x: player.x, y: player.y });
    return;
  }
  player.hp = Math.max(0, player.hp - amount);
  player.combo = 0;
  player.comboTime = 0;
  player.invulnerable = 0.42;
  state.events.push({ type: "player-hit", amount });
  addFx(state, { type: "hurt", x: player.x, y: player.y, amount });
  if (player.hp <= 0) {
    state.status = "defeat";
    state.events.push({ type: "defeat" });
  }
}

function playerAttack(state) {
  const player = state.player;
  const enemy = state.enemy;
  if (player.attackCooldown > 0 || state.status !== "active") return;
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const dist = length(dx, dy);
  if (dist < 220) {
    player.facingX = dx / dist;
    player.facingY = dy / dist;
  }
  player.attackCooldown = player.attackDelay;
  addFx(state, { type: "slash", x: player.x + player.facingX * 55, y: player.y + player.facingY * 55, angle: Math.atan2(player.facingY, player.facingX) });
  const facing = (dx / dist) * player.facingX + (dy / dist) * player.facingY;
  if (dist <= 104 + enemy.r && facing > 0.1) {
    player.combo = player.comboTime > 0 ? player.combo + 1 : 1;
    player.comboTime = 1.15;
    const comboBonus = Math.min(12, Math.max(0, player.combo - 1) * 2);
    const damage = player.damage + comboBonus;
    player.focus = Math.min(100, player.focus + 17);
    damageEnemy(state, damage, player.combo >= 4 ? "heavy" : "hit");
    const push = state.boss ? 4 : 10;
    enemy.x = clamp(enemy.x + (dx / dist) * push, 50, ARENA_WIDTH - 50);
    enemy.y = clamp(enemy.y + (dy / dist) * push, PLAY_MIN_Y, PLAY_MAX_Y);
  } else {
    state.events.push({ type: "miss" });
  }
}

function useSkill(state) {
  const player = state.player;
  const enemy = state.enemy;
  if (player.focus < 100 || state.status !== "active") return;
  player.focus = 0;
  if (state.role === "guardian") {
    player.hp = Math.min(player.maxHp, player.hp + 32);
    player.invulnerable = Math.max(player.invulnerable, 1.45);
    addFx(state, { type: "barrier", x: player.x, y: player.y });
    state.events.push({ type: "skill", skill: "barrier" });
    return;
  }
  if (state.role === "technician") {
    enemy.stunned = 2.4;
    enemy.windup = 0;
    enemy.attackCooldown = 1.1;
    damageEnemy(state, 22, "jam");
    state.events.push({ type: "skill", skill: "jam" });
    return;
  }
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const dist = length(dx, dy);
  if (dist > 80) {
    player.x = clamp(player.x + (dx / dist) * Math.min(125, dist - 65), 35, ARENA_WIDTH - 35);
    player.y = clamp(player.y + (dy / dist) * Math.min(125, dist - 65), PLAY_MIN_Y, PLAY_MAX_Y);
  }
  player.invulnerable = 0.35;
  damageEnemy(state, 46, "break");
  state.events.push({ type: "skill", skill: "break" });
}

function updateEnemy(state, dt) {
  const enemy = state.enemy;
  const player = state.player;
  if (enemy.stunned > 0) return;

  if (enemy.windup > 0) {
    const before = enemy.windup;
    enemy.windup = Math.max(0, enemy.windup - dt);
    if (before > 0 && enemy.windup === 0) {
      const distanceToTarget = length(player.x - enemy.targetX, player.y - enemy.targetY);
      if (distanceToTarget <= enemy.attackRadius + player.r) damagePlayer(state, state.boss ? 25 : 17);
      else {
        player.focus = Math.min(100, player.focus + 13);
        state.events.push({ type: "clean-evade" });
        addFx(state, { type: "evade", x: player.x, y: player.y });
      }
      enemy.attackCooldown = state.boss ? 0.72 : 0.9;
    }
    return;
  }

  if (enemy.attackCooldown > 0) return;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = length(dx, dy);
  if (dist <= (state.boss ? 150 : 128)) {
    enemy.windupMax = state.boss ? 0.66 : 0.78;
    enemy.windup = enemy.windupMax;
    enemy.targetX = player.x;
    enemy.targetY = player.y;
    enemy.attackCount += 1;
    state.events.push({ type: "enemy-windup" });
    return;
  }
  const enraged = enemy.hp / enemy.maxHp < 0.4 ? 1.28 : 1;
  const step = enemy.speed * enraged * dt;
  enemy.x = clamp(enemy.x + (dx / dist) * step, 45, ARENA_WIDTH - 45);
  enemy.y = clamp(enemy.y + (dy / dist) * step, PLAY_MIN_Y, PLAY_MAX_Y);
}

export function stepReactiveCombat(previous, input = {}, rawDt = 1 / 60) {
  const dt = clamp(rawDt, 0, 1 / 20);
  const state = {
    ...previous,
    elapsed: previous.elapsed + dt,
    events: [],
    fx: previous.fx.map((fx) => ({ ...fx, life: fx.life - dt })).filter((fx) => fx.life > 0),
    player: { ...previous.player },
    enemy: { ...previous.enemy },
  };
  if (state.status !== "active") return state;

  const player = state.player;
  const enemy = state.enemy;
  player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.dashTime = Math.max(0, player.dashTime - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.comboTime = Math.max(0, player.comboTime - dt);
  if (player.comboTime === 0) player.combo = 0;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.stunned = Math.max(0, enemy.stunned - dt);
  enemy.flash = Math.max(0, enemy.flash - dt);

  let moveX = Number(input.moveX || 0);
  let moveY = Number(input.moveY || 0);
  const magnitude = Math.hypot(moveX, moveY);
  if (magnitude > 1) { moveX /= magnitude; moveY /= magnitude; }
  if (Math.abs(moveX) + Math.abs(moveY) > 0.03) {
    player.facingX = moveX;
    player.facingY = moveY;
  }
  if (input.dashPressed && player.dashCooldown <= 0 && magnitude > 0.05) {
    player.dashTime = 0.2;
    player.invulnerable = 0.28;
    player.dashCooldown = state.role === "striker" ? 1.35 : 1.8;
    state.events.push({ type: "dash" });
    addFx(state, { type: "dash", x: player.x, y: player.y });
  }
  const moveSpeed = player.speed * (player.dashTime > 0 ? 3.15 : 1);
  player.x = clamp(player.x + moveX * moveSpeed * dt, 32, ARENA_WIDTH - 32);
  player.y = clamp(player.y + moveY * moveSpeed * dt, PLAY_MIN_Y, PLAY_MAX_Y);

  if (input.attackPressed) playerAttack(state);
  if (input.skillPressed) useSkill(state);
  updateEnemy(state, dt);
  return state;
}

export function reactiveCombatSnapshot(state) {
  return {
    status: state.status,
    hp: Math.round(state.player.hp), maxHp: state.player.maxHp,
    enemyHp: Math.round(state.enemy.hp), enemyMaxHp: state.enemy.maxHp,
    focus: Math.round(state.player.focus), combo: state.player.combo,
    dashCooldown: Math.max(0, state.player.dashCooldown),
    enemyWindup: state.enemy.windup, enemyWindupMax: state.enemy.windupMax,
  };
}
