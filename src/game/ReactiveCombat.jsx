import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AndroidRunnerSprite } from "./AndroidRunner.jsx";
import {
  ARENA_HEIGHT, ARENA_WIDTH, createReactiveCombat, reactiveCombatSnapshot, stepReactiveCombat,
} from "./reactiveCombatEngine.js";
import "./reactive-combat.css";

const ROLE_UI = {
  striker: { label: "POWER BREAK", hint: "rush + heavy damage", accent: "#ff665f" },
  guardian: { label: "FIELD BARRIER", hint: "heal + protection", accent: "#26d0b0" },
  technician: { label: "SIGNAL JAM", hint: "stun + tech damage", accent: "#7285ff" },
};

const EVENT_MESSAGES = {
  "enemy-hit": "Direct hit! Keep the combo moving.",
  "player-hit": "Impact taken — dash through the next strike.",
  "clean-evade": "Clean evade! Focus gained.",
  evade: "Invulnerable dash — no damage.",
  miss: "Out of range. Close the distance.",
  dash: "Dash!",
  victory: "Target disabled. Route secured.",
  defeat: "The convoy withdrew safely.",
};

function drawArena(ctx, state, images) {
  ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  const sky = ctx.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
  sky.addColorStop(0, "#7bd5e4"); sky.addColorStop(.46, "#c4eef0"); sky.addColorStop(.47, "#dbc9a9"); sky.addColorStop(1, "#98886f");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.globalAlpha = .26;
  ctx.fillStyle = "#254e66";
  for (let x = -30; x < ARENA_WIDTH + 80; x += 112) {
    const height = 90 + ((x / 112) % 3) * 28;
    ctx.fillRect(x, 175 - height, 82, height);
    ctx.fillStyle = "#3b6c7b"; ctx.fillRect(x + 18, 175 - height - 38, 35, 38); ctx.fillStyle = "#254e66";
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,.32)"; ctx.lineWidth = 2;
  for (let y = 250; y < ARENA_HEIGHT; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
  for (let x = 0; x < ARENA_WIDTH; x += 80) { ctx.beginPath(); ctx.moveTo(ARENA_WIDTH / 2, 205); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
  ctx.strokeStyle = "rgba(30,53,72,.3)"; ctx.lineWidth = 5; ctx.strokeRect(8, 8, ARENA_WIDTH - 16, ARENA_HEIGHT - 16);

  const enemy = state.enemy;
  if (enemy.windup > 0) {
    const progress = 1 - enemy.windup / Math.max(.01, enemy.windupMax);
    ctx.beginPath(); ctx.arc(enemy.targetX, enemy.targetY, enemy.attackRadius * (.72 + progress * .28), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,62,73,${.12 + progress * .24})`; ctx.fill();
    ctx.lineWidth = 5 + progress * 5; ctx.strokeStyle = `rgba(255,62,73,${.5 + progress * .5})`; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.targetX, enemy.targetY);
    ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,75,82,.75)"; ctx.stroke(); ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const pulse = enemy.flash > 0 ? 1.08 : 1;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(18,30,44,.25)"; ctx.beginPath(); ctx.ellipse(0, enemy.r * .82, enemy.r * 1.1, enemy.r * .36, 0, 0, Math.PI * 2); ctx.fill();
  const image = state.boss ? images.boss : images.patrol;
  if (image?.complete) {
    const h = state.boss ? 198 : 164;
    const w = h * (image.naturalWidth / Math.max(1, image.naturalHeight));
    ctx.globalAlpha = enemy.stunned > 0 ? .72 : 1;
    ctx.drawImage(image, -w / 2, -h * .62, w, h);
  } else {
    ctx.fillStyle = state.boss ? "#e95658" : "#2679ca"; ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
  }
  if (enemy.stunned > 0) {
    ctx.globalAlpha = .9; ctx.strokeStyle = "#78f6e0"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, enemy.r + 14 + Math.sin(state.elapsed * 10) * 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  for (const fx of state.fx) {
    const alpha = Math.max(0, fx.life / fx.maxLife);
    ctx.save(); ctx.globalAlpha = alpha;
    if (fx.type === "slash") {
      ctx.translate(fx.x, fx.y); ctx.rotate(fx.angle || 0); ctx.strokeStyle = "#fff"; ctx.lineWidth = 13 * alpha;
      ctx.beginPath(); ctx.arc(0, 0, 48, -.95, .95); ctx.stroke();
      ctx.strokeStyle = "#6ef1ff"; ctx.lineWidth = 5 * alpha; ctx.stroke();
    } else if (["hit", "heavy", "break", "jam"].includes(fx.type)) {
      ctx.strokeStyle = fx.type === "jam" ? "#79f5ff" : "#fff36d"; ctx.lineWidth = 7 * alpha;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(fx.x + Math.cos(a) * 16, fx.y + Math.sin(a) * 16); ctx.lineTo(fx.x + Math.cos(a) * (55 - alpha * 15), fx.y + Math.sin(a) * (55 - alpha * 15)); ctx.stroke(); }
    } else if (["dash", "evade"].includes(fx.type)) {
      ctx.strokeStyle = "#9ffff0"; ctx.lineWidth = 7 * alpha; ctx.beginPath(); ctx.arc(fx.x, fx.y, 34 + (1 - alpha) * 30, 0, Math.PI * 2); ctx.stroke();
    } else if (fx.type === "barrier") {
      ctx.fillStyle = `rgba(86,246,215,${.25 * alpha})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, 50 + (1 - alpha) * 18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export default function ReactiveCombat({ role = "striker", profile = null, weapon = null, boss = false, attempts = 0, onWin, onAttempt }) {
  const resolvedRole = ROLE_UI[role] ? role : "striker";
  const ui = ROLE_UI[resolvedRole];
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const simulation = useRef(createReactiveCombat({ role: resolvedRole, boss, weapon }));
  const input = useRef({ moveX: 0, moveY: 0, attackPressed: false, dashPressed: false, skillPressed: false });
  const joystick = useRef({ active: false, pointerId: null, x: 0, y: 0 });
  const keys = useRef(new Set());
  const images = useRef({ patrol: null, boss: null });
  const [hud, setHud] = useState(() => reactiveCombatSnapshot(simulation.current));
  const [message, setMessage] = useState("Move freely. Attack in range, dash through danger, and keep pressure on the target.");
  const [advancing, setAdvancing] = useState(false);
  const [runnerAction,setRunnerAction]=useState("idle");
  const roleProfile = useMemo(() => ({ ...(profile || {}), role: resolvedRole, archetype: resolvedRole }), [profile, resolvedRole]);

  const reset = useCallback(() => {
    simulation.current = createReactiveCombat({ role: resolvedRole, boss, weapon });
    input.current = { moveX: 0, moveY: 0, attackPressed: false, dashPressed: false, skillPressed: false };
    setHud(reactiveCombatSnapshot(simulation.current));
    setMessage("Back in the arena. Move first and control the distance.");
    setAdvancing(false);
  }, [boss, resolvedRole, weapon]);

  useEffect(() => {
    const patrol = new Image(); patrol.src = "/assets/campaign/roadblock-unit.webp";
    const bossImage = new Image(); bossImage.src = "/assets/campaign/rail-warden-k9.webp";
    images.current = { patrol, boss: bossImage };
  }, []);

  useEffect(() => {
    const down = (event) => {
      const key = event.key.toLowerCase(); keys.current.add(key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "j" || key === " ") input.current.attackPressed = true;
      if (key === "k" || key === "shift") input.current.dashPressed = true;
      if (key === "l" || key === "e") input.current.skillPressed = true;
    };
    const up = (event) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down, { passive: false }); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    let frame = 0; let last = performance.now(); let hudClock = 0;
    const loop = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const pressed = keys.current;
      const keyboardX = Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
      const keyboardY = Number(pressed.has("s") || pressed.has("arrowdown")) - Number(pressed.has("w") || pressed.has("arrowup"));
      input.current.moveX = Math.abs(joystick.current.x) > .02 ? joystick.current.x : keyboardX;
      input.current.moveY = Math.abs(joystick.current.y) > .02 ? joystick.current.y : keyboardY;
      const next = stepReactiveCombat(simulation.current, input.current, dt);
      input.current.attackPressed = false; input.current.dashPressed = false; input.current.skillPressed = false;
      simulation.current = next;

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== ARENA_WIDTH * dpr || canvas.height !== ARENA_HEIGHT * dpr) { canvas.width = ARENA_WIDTH * dpr; canvas.height = ARENA_HEIGHT * dpr; }
        const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawArena(ctx, next, images.current);
      }
      if (playerRef.current) {
        playerRef.current.style.left = `${next.player.x / ARENA_WIDTH * 100}%`;
        playerRef.current.style.top = `${next.player.y / ARENA_HEIGHT * 100}%`;
        playerRef.current.style.setProperty("--face-scale", next.player.facingX < 0 ? "-1" : "1");
      }
      if (next.events.length) {
        const event = next.events[next.events.length - 1];
        setMessage(EVENT_MESSAGES[event.type] || (event.type === "skill" ? `${ui.label} activated!` : "Keep moving."));
      }
      hudClock += dt;
      if (hudClock >= .09) { hudClock = 0; setHud(reactiveCombatSnapshot(next)); }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [ui.label]);

  const queue = (action) => { if (hud.status !== "active") return; input.current[action] = true; const visual=action==="attackPressed"?"slash":action==="dashPressed"?"run":"shoot";setRunnerAction(visual);window.setTimeout(()=>setRunnerAction("idle"),420); };
  const updateStick = (event) => {
    if (!joystick.current.active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * .32);
    let y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * .32);
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    joystick.current.x = x; joystick.current.y = y;
    event.currentTarget.style.setProperty("--stick-x", `${x * 31}px`);
    event.currentTarget.style.setProperty("--stick-y", `${y * 31}px`);
  };
  const stickDown = (event) => { joystick.current.active = true; joystick.current.pointerId = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); updateStick(event); };
  const stickUp = (event) => { joystick.current = { active: false, pointerId: null, x: 0, y: 0 }; event.currentTarget.style.setProperty("--stick-x", "0px"); event.currentTarget.style.setProperty("--stick-y", "0px"); };

  const continueWin = async () => {
    if (advancing) return; setAdvancing(true);
    try { await onWin?.(); } finally { window.setTimeout(() => setAdvancing(false), 700); }
  };
  const retry = () => { onAttempt?.(attempts + 1); reset(); };
  const enemyWindup = hud.enemyWindup > 0;
  const dashReady = hud.dashCooldown <= 0.02;

  return (
    <section className="reactive-combat" style={{ "--rc-accent": ui.accent }}>
      <header className="rc-hud">
        <div><small>{boss ? "DISTRICT COMMANDER" : "LIVE INTERCEPT"}</small><b>{boss ? "Rail Warden K-9" : "Roadblock Unit"}</b></div>
        <div className="rc-health"><label><span>RUNNER</span><i><b style={{ width: `${hud.hp / hud.maxHp * 100}%` }} /></i><em>{hud.hp}</em></label><label className="target"><span>TARGET</span><i><b style={{ width: `${hud.enemyHp / hud.enemyMaxHp * 100}%` }} /></i><em>{hud.enemyHp}</em></label></div>
        <div className="rc-combo"><b>{hud.combo}×</b><small>COMBO</small></div>
      </header>
      <div className={`rc-stage ${enemyWindup ? "danger" : ""}`}>
        <canvas ref={canvasRef} width={ARENA_WIDTH} height={ARENA_HEIGHT} aria-label="Real-time District One combat arena" />
        <div className="rc-player" ref={playerRef}><AndroidRunnerSprite profile={roleProfile} action={runnerAction}/><i /></div>
        <div className="rc-objective">{enemyWindup ? <><b>EVADE!</b><span>Move or dash outside the red impact zone</span></> : <><b>PRESSURE</b><span>Close distance and chain attacks</span></>}</div>
        <div className="rc-joystick" onPointerDown={stickDown} onPointerMove={updateStick} onPointerUp={stickUp} onPointerCancel={stickUp}><i /></div>
        <div className="rc-actions">
          <button className="attack" onPointerDown={(event) => { event.preventDefault(); queue("attackPressed"); }}><b>ATTACK</b><small>J / SPACE</small></button>
          <button className={`dash ${dashReady ? "ready" : ""}`} onPointerDown={(event) => { event.preventDefault(); queue("dashPressed"); }} disabled={!dashReady}><b>DASH</b><small>{dashReady ? "K / SHIFT" : `${hud.dashCooldown.toFixed(1)}s`}</small></button>
          <button className={`skill ${hud.focus >= 100 ? "ready" : ""}`} onPointerDown={(event) => { event.preventDefault(); queue("skillPressed"); }} disabled={hud.focus < 100}><b>{ui.label}</b><small>{hud.focus >= 100 ? ui.hint : `${hud.focus}% FOCUS`}</small><i><b style={{ width: `${hud.focus}%` }} /></i></button>
        </div>
        {hud.status !== "active" && <div className={`rc-result ${hud.status}`}><small>{hud.status === "victory" ? "ENCOUNTER COMPLETE" : "SAFE WITHDRAWAL"}</small><h2>{hud.status === "victory" ? "Route secured" : "Regroup and return"}</h2><p>{hud.status === "victory" ? "The relief convoy has a clear path. Secure this checkpoint to continue." : "The convoy withdrew safely. Use movement and dash invulnerability to control the rematch."}</p><button onClick={hud.status === "victory" ? continueWin : retry} disabled={advancing}>{advancing ? "Securing progress…" : hud.status === "victory" ? "Continue" : "Retry"}</button></div>}
      </div>
      <footer className="rc-status"><span className={enemyWindup ? "warning" : ""}>{enemyWindup ? "INCOMING ATTACK" : message}</span><small>Move: joystick/WASD · Attack: J · Dash: K · Skill: L</small></footer>
    </section>
  );
}
