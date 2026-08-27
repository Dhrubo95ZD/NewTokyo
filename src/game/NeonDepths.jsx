import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEPTHS_OBJECTIVES, depthsRecommendedCp, normalizeDepthsState, roomRewardPreview } from "./neonDepthsRules.js";
import { androidSpriteFrame } from "./AndroidRunner.jsx";
import "./neon-depths.css";

const ACTORS = "/assets/neon-depths/depths-actors-v1.webp";
const ENVIRONMENT = "/assets/neon-depths/depths-environment-v1.webp";
const ABILITIES = "/assets/neon-depths/depths-abilities-v1.webp";
const RUNNER = "/assets/characters/android-v1/android-combat-atlas-v1.webp";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const loadImage = (src) => new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.src = src; });

function createRoomSimulation(room, tier, combatPower) {
  const objective = DEPTHS_OBJECTIVES[room.type] || DEPTHS_OBJECTIVES.combat;
  const count = room.elite ? Math.max(2, objective.enemies) : objective.enemies;
  const enemies = Array.from({ length: count }, (_, index) => ({
    id: index, x: 25 + ((index * 23 + 17) % 68), y: 23 + ((index * 31 + 11) % 52),
    hp: room.type === "boss" ? 620 + tier * 70 : (room.elite ? 210 : 115) + tier * 18,
    maxHp: room.type === "boss" ? 620 + tier * 70 : (room.elite ? 210 : 115) + tier * 18,
    frame: room.type === "boss" ? 7 : room.type === "shootout" ? 5 : room.elite ? 6 : 4,
  }));
  const nodes = Array.from({ length: 3 }, (_, index) => ({ id: index, x: 28 + index * 23, y: index === 1 ? 31 : 66, active: false }));
  return { player: { x: 50, y: 66, hp: 100, maxHp: 100 }, enemies, nodes, objective, tier, combatPower, shieldUntil: 0, dashUntil: 0, lastAttack: 0, lastDamage: 0, startedAt: performance.now() };
}

function ExpeditionCanvas({ room, tier, combatPower, profile, phase, onPhase, onLoot }) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const imagesRef = useRef(null);
  const rafRef = useRef(0);
  const [cooldowns, setCooldowns] = useState({ slash: 0, pulse: 0, dash: 0, shield: 0 });

  useEffect(() => { simRef.current = createRoomSimulation(room, tier, combatPower); onPhase("playing"); }, [room.index, tier, combatPower, onPhase]);
  useEffect(() => { Promise.all([loadImage(ENVIRONMENT), loadImage(ACTORS), loadImage(ABILITIES),loadImage(RUNNER)]).then(([environment, actors, abilities,runner]) => { imagesRef.current = { environment, actors, abilities,runner }; }); }, []);

  const complete = useCallback(() => {
    if (phase !== "playing" || simRef.current?.completed) return;
    simRef.current.completed = true;
    onLoot(roomRewardPreview(room, tier));
    onPhase("cleared");
  }, [onLoot, onPhase, phase, room, tier]);

  const useAbility = useCallback((ability) => {
    const sim = simRef.current; if (!sim || phase !== "playing" || cooldowns[ability] > Date.now()) return;
    const durations = { slash: 1900, pulse: 2600, dash: 4200, shield: 7000 };
    setCooldowns((current) => ({ ...current, [ability]: Date.now() + durations[ability] }));
    sim.action=ability==="pulse"?"shoot":ability==="slash"?"slash":ability==="dash"?"run":"idle";sim.actionUntil=performance.now()+520;
    if (ability === "shield") { sim.shieldUntil = performance.now() + 2400; return; }
    if (ability === "dash") { sim.player.x = clamp(sim.player.x + 18, 10, 90); sim.dashUntil = performance.now() + 420; return; }
    const living = sim.enemies.filter((enemy) => enemy.hp > 0).sort((a,b) => Math.hypot(a.x-sim.player.x,a.y-sim.player.y)-Math.hypot(b.x-sim.player.x,b.y-sim.player.y));
    if (!living.length && (room.type === "breach" || room.type === "salvage")) return;
    const damage = ability === "slash" ? 105 + combatPower / 90 : 78 + combatPower / 120;
    (ability === "slash" ? living.slice(0, 2) : living.slice(0, 1)).forEach((enemy) => { enemy.hp = Math.max(0, enemy.hp - damage); });
    if (sim.enemies.length && sim.enemies.every((enemy) => enemy.hp <= 0)) setTimeout(complete, 500);
  }, [combatPower, complete, cooldowns, phase, room.type]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let last = performance.now(); let cooldownTick = 0;
    const drawAtlas = (image, frame, cols, rows, x, y, width, height, alpha = 1) => {
      const sw = image.width / cols, sh = image.height / rows, sx = (frame % cols) * sw, sy = Math.floor(frame / cols) * sh;
      context.save(); context.globalAlpha = alpha; context.drawImage(image, sx, sy, sw, sh, x - width / 2, y - height * .76, width, height); context.restore();
    };
    const frame = (now) => {
      const rect = canvas.getBoundingClientRect(); const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
      context.setTransform(ratio,0,0,ratio,0,0); const width = rect.width, height = rect.height;
      const sim = simRef.current, images = imagesRef.current; const dt = Math.min(.05, (now-last)/1000); last=now;
      context.clearRect(0,0,width,height);
      if (images) {
        const scale = Math.max(width/images.environment.width,height/images.environment.height); const iw=images.environment.width*scale, ih=images.environment.height*scale;
        context.drawImage(images.environment,(width-iw)/2,(height-ih)/2,iw,ih);
      } else { context.fillStyle="#061422"; context.fillRect(0,0,width,height); }
      const vignette=context.createRadialGradient(width*.5,height*.48,20,width*.5,height*.5,width*.68); vignette.addColorStop(0,"transparent"); vignette.addColorStop(1,"rgba(1,7,17,.72)"); context.fillStyle=vignette; context.fillRect(0,0,width,height);
      if (sim && phase === "playing") {
        const px=sim.player.x/100*width, py=sim.player.y/100*height;
        if (room.type === "breach" || room.type === "salvage") sim.nodes.forEach((node) => {
          const x=node.x/100*width,y=node.y/100*height; if (images) drawAtlas(images.abilities,room.type==="breach"?6:5,4,2,x,y,Math.min(120,width*.18),Math.min(120,width*.18),node.active?.35:1);
          if (!node.active) { context.fillStyle="#fff"; context.font="700 12px system-ui"; context.textAlign="center"; context.fillText(room.type==="breach"?`RELAY ${node.id+1}`:"SALVAGE",x,y+36); }
        });
        sim.enemies.forEach((enemy) => {
          if (enemy.hp<=0) return; const ex=enemy.x/100*width, ey=enemy.y/100*height;
          const dx=sim.player.x-enemy.x,dy=sim.player.y-enemy.y,d=Math.max(1,Math.hypot(dx,dy)); const speed=room.type==="boss"?2.2:3.1;
          enemy.x+=dx/d*speed*dt;enemy.y+=dy/d*speed*dt;
          if (d<14 && now-sim.lastDamage>850) { sim.lastDamage=now; if(now>sim.shieldUntil) sim.player.hp=Math.max(0,sim.player.hp-(room.type==="boss"?16:7)); }
          if(images) drawAtlas(images.actors,enemy.frame,4,2,ex,ey,room.type==="boss"?150:100,room.type==="boss"?190:130);
          context.fillStyle="rgba(2,8,16,.85)";context.fillRect(ex-32,ey-62,64,5);context.fillStyle=room.type==="boss"?"#ff4ea1":"#ff716c";context.fillRect(ex-32,ey-62,64*(enemy.hp/enemy.maxHp),5);
        });
        if (sim.enemies.length && sim.enemies.every((enemy)=>enemy.hp<=0)) complete();
        if (sim.player.hp<=0) onPhase("defeat");
        if(images) {
          if(now<sim.dashUntil) drawAtlas(images.abilities,2,4,2,px-24,py,140,100,.75);
          const playerAction=now<Number(sim.actionUntil||0)?sim.action:(now<sim.dashUntil?"run":"idle");drawAtlas(images.runner,androidSpriteFrame(profile,playerAction),4,4,px,py,108,108);
          if(now<sim.shieldUntil) drawAtlas(images.abilities,3,4,2,px,py+8,150,150,.72);
        }
        context.fillStyle="rgba(2,8,16,.9)";context.fillRect(20,height-25,width-40,9);context.fillStyle="#35e7d2";context.fillRect(20,height-25,(width-40)*(sim.player.hp/sim.player.maxHp),9);
      }
      if (++cooldownTick%12===0) setCooldowns((current)=>({...current}));
      rafRef.current=requestAnimationFrame(frame);
    };
    rafRef.current=requestAnimationFrame(frame); return()=>cancelAnimationFrame(rafRef.current);
  }, [complete, onPhase, phase, room.type]);

  const interact = (event) => {
    const sim=simRef.current,canvas=canvasRef.current;if(!sim||phase!=="playing")return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*100,y=(event.clientY-rect.top)/rect.height*100;
    if(room.type==="breach"||room.type==="salvage") { const next=sim.nodes.find((node)=>!node.active&&Math.hypot(node.x-x,node.y-y)<16); if(next){next.active=true;if(sim.nodes.every((node)=>node.active))setTimeout(complete,450);} }
    else {sim.player.x=clamp(x,8,92);sim.player.y=clamp(y,18,88);}
  };
  const cd=(key)=>Math.max(0,(cooldowns[key]-Date.now())/1000);
  return <div className="depths-playfield"><canvas ref={canvasRef} onPointerDown={interact}/><div className="depths-abilities" aria-label="Expedition abilities">{[["slash","斬","Blade",0],["pulse","撃","Pulse",1],["dash","避","Dash",2],["shield","盾","Guard",3]].map(([id,glyph,label,frame])=><button key={id} disabled={cd(id)>0||phase!=="playing"} onClick={()=>useAbility(id)} style={{"--ability-frame":frame}}><i>{glyph}</i><span>{label}</span>{cd(id)>0&&<em>{cd(id).toFixed(1)}</em>}</button>)}</div></div>;
}

export default function NeonDepths({ combatPower=0, profile, state, busy, onStart, onAdvance, onExtract, onAbandon, onRefresh }) {
  const normalized=useMemo(()=>normalizeDepthsState(state),[state]);
  const [tier,setTier]=useState(Math.max(1,normalized.highestTier)); const [partyMode,setPartyMode]=useState("solo");
  const [phase,setPhase]=useState("playing"); const [localLoot,setLocalLoot]=useState(null); const [notice,setNotice]=useState("");
  const room=normalized.currentRoom; const objective=DEPTHS_OBJECTIVES[room?.type]||DEPTHS_OBJECTIVES.combat;
  useEffect(()=>{if(normalized.active){setPhase("playing");setLocalLoot(null);}},[normalized.roomIndex,normalized.active]);
  const act=async(work)=>{try{setNotice("");await work();await onRefresh?.();}catch(error){setNotice(error.message||"Expedition command failed");}};
  if(!normalized.active) return <section className="depths-deployment">
    <div className="depths-hero"><div><small>PROCEDURAL EXPEDITION</small><h2>Neon Depths</h2><p>Every descent generates a new route of combat, shooting, circuit breaches, salvage rooms and bosses. Extract to secure the backpack; defeat destroys only unsecured loot.</p></div><div className="depths-record"><span>DEEPEST TIER <b>{normalized.highestTier}</b></span><span>EXTRACTIONS <b>{normalized.extractions}</b></span></div></div>
    <div className="depths-deploy-grid"><article><small>DEPTH TIER</small><div className="tier-stepper"><button onClick={()=>setTier(Math.max(1,tier-1))}>−</button><b>{tier}</b><button onClick={()=>setTier(tier+1)}>＋</button></div><p>Recommended <b>{depthsRecommendedCp(tier).toLocaleString()} CP</b></p><em className={combatPower>=depthsRecommendedCp(tier)?"ready":"danger"}>{combatPower>=depthsRecommendedCp(tier)?"Power ready":"Overreach allowed · defeat likely"}</em></article><article><small>SQUAD</small>{[["solo","Solo descent","100% control"],["bots","Android support","2 companion bots"],["public","Public co-op","Match with runners"]].map(([id,label,detail])=><button className={partyMode===id?"selected":""} key={id} onClick={()=>setPartyMode(id)}><b>{label}</b><span>{detail}</span></button>)}</article></div>
    {notice&&<p className="depths-notice">{notice}</p>}<button className="depths-launch" disabled={busy||!onStart} onClick={()=>act(()=>onStart(tier,partyMode))}>DESCEND INTO NEON DEPTHS</button>
  </section>;
  const advance=(choice="direct")=>act(()=>onAdvance(normalized.id,normalized.roomIndex,"clear",choice));
  const extract=()=>act(async()=>{await onAdvance(normalized.id,normalized.roomIndex,"clear","extract");await onExtract(normalized.id);});
  const fail=()=>act(()=>onAdvance(normalized.id,normalized.roomIndex,"defeat","none"));
  return <section className={`neon-depths-run accent-${room.accent}`}>
    <header className="depths-hud"><div><small>NEON DEPTHS · TIER {normalized.tier}</small><b>ROOM {normalized.roomIndex+1}/{normalized.route.length} · {objective.label}</b></div><div className="depths-backpack"><small>UNSECURED BACKPACK</small><b>{normalized.backpack.length+(localLoot?1:0)} DROPS</b></div><button onClick={()=>act(()=>onAbandon(normalized.id))}>Exit</button></header>
    <ExpeditionCanvas room={room} tier={normalized.tier} combatPower={combatPower} profile={profile} phase={phase} onPhase={setPhase} onLoot={setLocalLoot}/>
    <aside className="depths-objective"><small>{room.elite?"ELITE CHAMBER":room.type.toUpperCase()}</small><b>{objective.label}</b><span>{objective.detail}</span></aside>
    {phase==="cleared"&&<div className="depths-result"><small>ROOM SECURED</small><h2>{localLoot?.name}</h2><div className={`depths-loot rarity-${localLoot?.rarity}`}><span/><b>{localLoot?.rarity?.toUpperCase()} DROP</b><em>Unsecured until extraction</em></div><div className="depths-route-actions">{room.canExtract&&<button className="extract" disabled={busy} onClick={extract}>Extract safely</button>}<button disabled={busy} onClick={()=>advance("freight")}>Freight Spine <small>Combat route</small></button><button disabled={busy} onClick={()=>advance("relay")}>Flooded Relay <small>Tech route</small></button></div></div>}
    {phase==="defeat"&&<div className="depths-result defeat"><small>SIGNAL LOST</small><h2>Unsecured loot lost</h2><p>Your extracted equipment is safe. Return to deployment and choose the same tier or regroup.</p><button disabled={busy} onClick={fail}>Return to command</button></div>}
    {notice&&<p className="depths-notice floating">{notice}</p>}
  </section>;
}
