import { useEffect, useRef, useState } from "react";
import { DROP_BEAMS, endlessStageRequirement, normalizeEndlessState, normalizeGroundDrops } from "./endlessRules.js";
import "./endless-circuit.css";

export default function EndlessCircuit({ combatPower = 0, state, busy, onStart, onStop, onResolve, onRefresh }) {
  const grind = normalizeEndlessState(state);
  const [target, setTarget] = useState(grind.stage);
  const [drops, setDrops] = useState([]);
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState("");
  const resolving = useRef(false);

  useEffect(() => { if (!grind.active) setTarget(grind.stage); }, [grind.active, grind.stage]);
  useEffect(() => {
    if (!grind.active || !onResolve) return undefined;
    const resolve = async () => {
      if (resolving.current) return;
      resolving.current = true;
      try {
        const result = await onResolve();
        if (result?.drops?.length) setDrops(normalizeGroundDrops(result.drops));
        if (result?.events?.length) setEvents(result.events.slice(-5));
      } catch (error) { setNotice(error.message || "Circuit sync paused"); }
      finally { resolving.current = false; }
    };
    resolve();
    const timer = setInterval(resolve, 15000);
    return () => clearInterval(timer);
  }, [grind.active, onResolve]);

  useEffect(() => {
    if (!drops.length) return undefined;
    const timer = setTimeout(() => setDrops([]), 9000);
    return () => clearTimeout(timer);
  }, [drops]);

  const requirement = endlessStageRequirement(target);
  const overreach = Number(combatPower) < requirement;
  const run = async (work, success) => {
    if (busy) return;
    setNotice("");
    try { const result = await work(); setNotice(success); return result; }
    catch (error) { setNotice(error.message || "Circuit command failed"); }
  };

  return <section className="endless-circuit" aria-label="Endless Circuit auto battle">
    <header>
      <div><small>FOREVER GRIND // SERVER AUTOPILOT</small><h2>Endless Circuit</h2><p>Win to advance. Fail and the runner drops one stage, then keeps farming automatically.</p></div>
      <div className={`circuit-live ${grind.active ? "on" : ""}`}><i/>{grind.active ? "LIVE" : "STANDBY"}</div>
    </header>
    {notice && <button className="circuit-notice" onClick={() => setNotice("")}>{notice} ×</button>}
    <div className="endless-arena">
      <div className="endless-sky"/><div className="endless-grid"/>
      <div className="endless-hud"><span>CURRENT STAGE <b>{grind.stage}</b></span><span>REQUIRED CP <b>{grind.requiredCp.toLocaleString()}</b></span><span>YOUR CP <b>{Number(combatPower).toLocaleString()}</b></span></div>
      <div className="endless-runner"><i/><b>ANDROID RUNNER</b></div>
      <div className="endless-horde">{[0,1,2,3,4].map((unit)=><i key={unit} style={{"--unit":unit}}><span>{unit===4?"ELITE":"HOSTILE"}</span></i>)}</div>
      <div className="endless-slash"/><div className="endless-impact"/>
      <div className="ground-loot" aria-live="polite">{drops.map((drop,index)=><article key={drop.id} style={{"--beam":DROP_BEAMS[drop.rarity]||DROP_BEAMS.common,"--drop":index}}><i/><b>{drop.name}</b><span>{drop.duplicate?`DUPLICATE · +${drop.shards} SHARDS`:drop.rarity.toUpperCase()}</span></article>)}</div>
      {!drops.length && grind.active && <div className="circuit-callout">AUTO-COMBAT ACTIVE</div>}
    </div>
    <div className="circuit-readout">
      <span><small>HIGHEST</small><b>STAGE {grind.highestStage}</b></span><span><small>CLEARS</small><b>{grind.totalClears.toLocaleString()}</b></span><span><small>RECOVERIES</small><b>{grind.totalFailures.toLocaleString()}</b></span><span><small>RULE</small><b>FAIL → −1 STAGE</b></span>
    </div>
    {events.length > 0 && <div className="circuit-events">{events.map((event,index)=><span key={`${event.stage}-${index}`} className={event.win?"win":"loss"}><b>{event.win?"CLEARED":"FAILED"} STAGE {event.stage}</b>{event.win?`Advanced to ${event.nextStage}`:`Farming resumed at ${event.nextStage}`}</span>)}</div>}
    <footer>
      {!grind.active ? <>
        <label>STARTING STAGE<input type="number" min="1" max="999" value={target} onChange={(event)=>setTarget(Math.max(1,Math.min(999,Number(event.target.value)||1)))}/></label>
        <div className={overreach?"stage-risk dangerous":"stage-risk safe"}><small>STAGE {target} CHECK</small><b>{requirement.toLocaleString()} CP</b><span>{overreach?"Overreach allowed · defeat will send you back one stage":"Stable clear range"}</span></div>
        <button disabled={busy||!onStart} onClick={()=>run(()=>onStart(target),`Endless Circuit started at stage ${target}`)}>Start forever grind</button>
      </> : <>
        <p>You can leave this screen or close the app. Time, results, stage changes, and drops are resolved by the server.</p>
        <button className="secondary" disabled={busy} onClick={()=>run(onRefresh,"Circuit synced")}>Sync now</button>
        <button className="danger" disabled={busy||!onStop} onClick={()=>run(onStop,"Forever grind stopped")}>Stop grind</button>
      </>}
    </footer>
  </section>;
}
