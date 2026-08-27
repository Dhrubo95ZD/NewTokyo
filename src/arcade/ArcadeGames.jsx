import { useEffect, useRef, useState } from "react";
import { cricketDeliveryDuration, resolveCricketSwing, swipeCricketShot } from "./arcadeRules.js";
import "./arcade-games.css";

const lanes=["leg","straight","off"];
const deliveries=[
  {name:"Neon Yorker",speed:115,bias:"straight"},{name:"Pulse Bouncer",speed:145,bias:"leg"},
  {name:"Arc Cutter",speed:165,bias:"off"},{name:"Slow Orb",speed:205,bias:"straight"},
];
const later=(fn,ms)=>setTimeout(fn,ms);

export function CricketGameV2({bet,onEnd}){
  const [state,setState]=useState("brief");
  const [lane,setLane]=useState("straight");
  const [intent,setIntent]=useState("drive");
  const [ball,setBall]=useState(null);
  const [progress,setProgress]=useState(0);
  const [score,setScore]=useState({runs:0,wickets:0,balls:[]});
  const [callout,setCallout]=useState("Choose a lane and shot, then read the delivery.");
  const raf=useRef(0);const flight=useRef(null);const gesture=useRef(null);const ended=useRef(false);

  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  const finish=(next)=>{
    if(ended.current)return;ended.current=true;setState("done");
    const mult=next.runs>=44?5:next.runs>=32?3:next.runs>=22?2:next.runs>=14?1:0;
    setCallout(mult>1?`${next.runs} RUNS · ${mult}× PAYOUT`:mult===1?`${next.runs} RUNS · STAKE RETURNED`:`${next.runs} RUNS · INNINGS LOST`);
    later(()=>onEnd({runs:next.runs,mult}),1500);
  };
  const record=(symbol,runs,text,wicket=false)=>{
    const next={runs:score.runs+runs,wickets:score.wickets+(wicket?1:0),balls:[...score.balls,symbol]};
    setScore(next);setCallout(text);setBall(null);setProgress(0);
    if(next.balls.length>=12||next.wickets>=3){finish(next);return;}
    setState("setup");
  };
  const bowl=()=>{
    if(state!=="setup"&&state!=="brief")return;
    const kind=deliveries[Math.floor(Math.random()*deliveries.length)];
    const delivery={...kind,lane:Math.random()<.62?kind.bias:lanes[Math.floor(Math.random()*lanes.length)]};
    setBall(delivery);setCallout(`${delivery.name} · ${delivery.lane.toUpperCase()} LINE`);setState("flight");
    const started=performance.now();flight.current={started,duration:cricketDeliveryDuration(delivery.speed),delivery};
    const tick=(now)=>{const f=flight.current;if(!f)return;const p=Math.min(1.18,(now-f.started)/f.duration);setProgress(p);if(p>=1.12){flight.current=null;record("W",0,"BEATEN · STUMPS LIT",true);return;}raf.current=requestAnimationFrame(tick);};
    raf.current=requestAnimationFrame(tick);
  };
  const swing=(shot={lane,intent})=>{
    if(state!=="flight"||!flight.current)return;cancelAnimationFrame(raf.current);const f=flight.current;flight.current=null;
    const tapProgress=Math.min(1.18,(performance.now()-f.started)/f.duration);
    const result=resolveCricketSwing({progress:tapProgress,laneMatch:shot.lane===f.delivery.lane,intent:shot.intent,random:Math.random()});
    setLane(shot.lane);setIntent(shot.intent);setProgress(tapProgress);
    record(result.symbol,result.runs,result.text,result.wicket);
  };
  const beginSwipe=(event)=>{if(state!=="flight")return;event.currentTarget.setPointerCapture?.(event.pointerId);gesture.current={x:event.clientX,y:event.clientY,at:performance.now()};};
  const finishSwipe=(event)=>{const start=gesture.current;gesture.current=null;if(!start||state!=="flight")return;const shot=swipeCricketShot({dx:event.clientX-start.x,dy:event.clientY-start.y,duration:performance.now()-start.at});if(!shot){setCallout("SWIPE UP, LEFT OR RIGHT TO PLAY");return;}swing(shot);};
  return <section className="arcade-game cricket-v2">
    <header><div><small>ROOFTOP LEAGUE // 12 BALL CHASE</small><b>{score.runs}/{score.wickets}</b></div><span>{score.balls.length}.0 / 2 OVERS</span></header>
    <div className="cricket-field" style={{"--ball-y":`${8+progress*77}%`,"--ball-x":ball?.lane==="leg"?"38%":ball?.lane==="off"?"62%":"50%"}} onPointerDown={beginSwipe} onPointerUp={finishSwipe}>
      <div className="cricket-hud"><span>{callout}</span><b>{ball?"SWIPE TO SWING":"READY"}</b></div>
      {ball&&<i className="cricket-ball"/>}<div className={`cricket-swing ${state==="flight"?"armed":""}`}/>
      <div className="swipe-guide"><i>↖<small>LEG</small></i><i>↑<small>STRAIGHT</small></i><i>↗<small>OFF</small></i></div>
      <div className="timing-rail"><i style={{left:`${Math.min(100,progress*100)}%`}}/><em/></div>
    </div>
    <div className="cricket-scorecard">{Array.from({length:12},(_,i)=><i key={i} className={score.balls[i]==="W"?"wicket":score.balls[i]?"scored":""}>{score.balls[i]||i+1}</i>)}</div>
    {state!=="done"&&state!=="flight"&&<button className="arcade-primary" onClick={bowl}>{state==="brief"?"ENTER THE CREASE":"FACE NEXT BALL"}</button>}
    <p>Swipe up for straight, up-left for leg, or up-right for off. A fast, long swipe plays a power shot. Release inside the cyan timing window. Stake: ¥{Number(bet||0).toLocaleString()}.</p>
  </section>;
}

export function NeonReflex({onFinish}){
  const [round,setRound]=useState(0),[target,setTarget]=useState(-1),[score,setScore]=useState(0),[combo,setCombo]=useState(0),[live,setLive]=useState(false);
  const timer=useRef(),scoreRef=useRef(0);useEffect(()=>()=>clearTimeout(timer.current),[]);
  const spawn=(nextRound)=>{if(nextRound>=20){setLive(false);onFinish?.({score:scoreRef.current,reward:Math.max(50,scoreRef.current*4)});return;}setRound(nextRound);setTarget(Math.floor(Math.random()*9));timer.current=later(()=>{setCombo(0);spawn(nextRound+1);},Math.max(430,850-nextRound*18));};
  const start=()=>{scoreRef.current=0;setScore(0);setCombo(0);setRound(0);setLive(true);spawn(0);};
  const hit=(index)=>{if(!live||index!==target)return;clearTimeout(timer.current);const nextCombo=combo+1,gain=10+nextCombo*2;scoreRef.current+=gain;setCombo(nextCombo);setScore(scoreRef.current);setTarget(-1);later(()=>spawn(round+1),120);};
  return <section className="arcade-game reflex-game"><header><div><small>REACTION GRID</small><b>{score}</b></div><span>COMBO ×{combo}</span></header><div className="reflex-grid">{Array.from({length:9},(_,i)=><button key={i} className={i===target?"target":""} onPointerDown={()=>hit(i)}><i/></button>)}</div>{!live&&<button className="arcade-primary" onClick={start}>{round?"RUN AGAIN":"START REFLEX RUN"}</button>}<p>Hit only the illuminated drone ports. The response window contracts across twenty signals.</p></section>;
}

export function CircuitMemory({onFinish}){
  const [sequence,setSequence]=useState([]),[input,setInput]=useState(0),[lit,setLit]=useState(-1),[state,setState]=useState("ready"),[level,setLevel]=useState(0);
  const timers=useRef([]);useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
  const flash=(seq)=>{setState("showing");seq.forEach((value,i)=>{timers.current.push(later(()=>setLit(value),i*520));timers.current.push(later(()=>setLit(-1),i*520+300));});timers.current.push(later(()=>{setState("input");setInput(0);},seq.length*520+100));};
  const start=()=>{setLevel(1);const seq=[Math.floor(Math.random()*4)];setSequence(seq);flash(seq);};
  const press=(value)=>{if(state!=="input")return;setLit(value);timers.current.push(later(()=>setLit(-1),180));if(sequence[input]!==value){setState("done");onFinish?.({score:level*100,reward:level*45});return;}if(input+1===sequence.length){if(level>=8){setState("won");onFinish?.({score:800,reward:500});return;}const next=[...sequence,Math.floor(Math.random()*4)];setLevel((v)=>v+1);setSequence(next);timers.current.push(later(()=>flash(next),600));}else setInput((v)=>v+1);};
  return <section className="arcade-game memory-game"><header><div><small>CIRCUIT MEMORY</small><b>LEVEL {level}</b></div><span>{state.toUpperCase()}</span></header><div className="memory-pads">{["CYAN","MAGENTA","AMBER","MINT"].map((name,i)=><button key={name} className={lit===i?"lit":""} onPointerDown={()=>press(i)}><i/>{name}</button>)}</div>{state==="ready"&&<button className="arcade-primary" onClick={start}>BOOT SEQUENCE</button>}{(state==="done"||state==="won")&&<button className="arcade-primary" onClick={start}>{state==="won"?"PERFECT · RESTART":"SIGNAL LOST · RETRY"}</button>}<p>Watch the circuit pulse, then repeat it. Each cleared layer adds one signal.</p></section>;
}
