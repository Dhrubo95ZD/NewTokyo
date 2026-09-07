import { useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import "./casino.css";

const arcadeMoney = value => "$" + Number(value || 0).toLocaleString();
const arcadeMessage = value => String(value || "").split("LC").join("$");
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const slotGlyph = symbol => symbol === "●" ? "🍒" : symbol;
const Card = ({ card }) => <i className={/[HD]/.test(card) ? "red" : ""}>{card?.replace("H","♥").replace("D","♦").replace("C","♣").replace("S","♠")}</i>;

export default function CasinoHub({ onLedgerChange = null, onCashChange = null }) {
  const [tab,setTab]=useState("blackjack"),[bet,setBet]=useState(100),[redeemAmount,setRedeemAmount]=useState(100),[state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[motion,setMotion]=useState(null),[challenge,setChallenge]=useState(null),[challengePhase,setChallengePhase]=useState("idle"),[challengeAnswer,setChallengeAnswer]=useState(""),[miniEvent,setMiniEvent]=useState(null);
  const accept=value=>{if(!value||typeof value!=="object")return;setState(previous=>({...previous,...value}));if(value?.balance!=null)onLedgerChange?.(value.balance);if(value?.cashBalance!=null)onCashChange?.(value.cashBalance)};
  const refreshSnapshot=async()=>{const{data,error:problem}=await supabase.rpc("bw_casino_snapshot");if(!problem)accept(data);return data};
  const settle=async(rpc,data)=>{accept(data);if(rpc!=="bw_casino_snapshot")await refreshSnapshot();};
  const call=async(rpc,params={})=>{if(busy)return null;setBusy(true);setError("");const{data,error:problem}=await supabase.rpc(rpc,params);if(problem)setError(problem.message);else await settle(rpc,data);setBusy(false);return problem?null:data};
  const animatedCall=async(kind,rpc,params,duration)=>{if(busy)return null;setBusy(true);setError("");setMotion({kind,key:Date.now()});const started=Date.now();const{data,error:problem}=await supabase.rpc(rpc,params);await wait(Math.max(0,duration-(Date.now()-started)));if(problem)setError(problem.message);else await settle(rpc,data);setMotion(null);setBusy(false);return problem?null:data};
  useEffect(()=>{call("bw_casino_snapshot")},[]);
  const play=()=>tab==="slots"
    ? animatedCall("slots","bw_slots_spin",{p_bet:bet,p_request_id:crypto.randomUUID()},1700)
    : call("bw_blackjack_start",{p_bet:bet,p_request_id:crypto.randomUUID()});
  const changeTab=id=>{if(busy)return;setTab(id);setMotion(null);setChallenge(null);setChallengePhase("idle");setChallengeAnswer("");setMiniEvent(null);call("bw_casino_snapshot")};
  const game=state?.blackjack;
  const redeemable=Number(state?.redeemable || 0);
  const redeem=()=>call("bw_redeem_arcade_winnings",{p_credits:Math.max(100,redeemAmount),p_request_id:crypto.randomUUID()});
  const startChallenge=async gameId=>{setMiniEvent(null);const value=await call("bw_arcade_minigame_start",{p_game:gameId,p_request_id:crypto.randomUUID()});if(value?.challenge){setChallenge(value.challenge);setChallengeAnswer("");setChallengePhase("show")}};
  const submitChallenge=async()=>{if(!challenge||!challengeAnswer)return;const value=await call("bw_arcade_minigame_submit",{p_challenge_id:challenge.id,p_answer:challengeAnswer,p_request_id:crypto.randomUUID()});if(value?.event){setMiniEvent(value.event);setChallenge(null);setChallengeAnswer("");setChallengePhase("idle")}};
  useEffect(()=>{if(!challenge||challengePhase!=="show")return;const timer=setTimeout(()=>setChallengePhase("input"),1800);return()=>clearTimeout(timer)},[challenge,challengePhase]);

  return <div className="casino-page"><header><small>ROSSI'S RECREATION HALL</small><h1>The Arcade</h1><p>Blackjack, slots, roulette and two skill rooms use a separate play-earned Arcade Dollar wallet. Every result is recorded by the city server.</p><div className="virtual-currency-notice"><b>ARCADE DOLLARS · $</b><span>Formerly LEDGER CREDITS · separate wallet · cannot be bought with city cash or real money · verified net wins may redeem one-way into ordinary in-game cash</span></div></header>{error&&<div className="casino-error">{error}</div>}
    <nav>{[["blackjack","Blackjack","♠"],["slots","Slots","7"],["roulette","Roulette","●"],["signal_lock","Signal Lock","✦"],["courier_grid","Courier Grid","▦"]].map(([id,label,icon])=><button className={tab===id?"active":""} disabled={busy} onClick={()=>{changeTab(id);if(id!=="signal_lock"&&id!=="courier_grid"){setChallenge(null);setChallengePhase("idle");setMiniEvent(null)}}} key={id}><i>{icon}</i><span>{label}</span></button>)}</nav>
    <section className={`casino-table ${tab}-room`}><div className="casino-balance"><small>AVAILABLE ARCADE DOLLARS</small><b>{arcadeMoney(state?.balance)}</b><small className="arcade-redeemable">Redeemable winnings: {arcadeMoney(redeemable)}</small><small className="arcade-rate">100 Arcade Dollars = $50 city cash · verified net wins only · no cash-to-Arcade conversion</small><div className="arcade-redemption"><label><span>REDEEM ARCADE WINNINGS</span><input type="number" min="100" max={Math.max(100,redeemable)} step="100" value={redeemAmount} onChange={event=>setRedeemAmount(Math.max(100,Number(event.target.value)))} /></label><button disabled={busy||redeemable<100||redeemAmount>redeemable} onClick={redeem}>{busy?"Settling…":"Redeem to city cash"}</button></div></div>
      {(tab==="blackjack"||tab==="slots")&&(!game||game.status!=="active")&&<BetControls bet={bet} setBet={setBet} busy={busy} play={play} label={tab==="slots"?"Pull lever":"Start hand"}/>}
      {tab==="blackjack"&&<div className="blackjack"><h2>Blackwood Blackjack</h2>{game?<>{game.status==="active"&&<footer className="blackjack-actions"><button disabled={busy} onClick={()=>call("bw_blackjack_action",{p_action:"hit"})}>Hit</button><button disabled={busy} onClick={()=>call("bw_blackjack_action",{p_action:"stand"})}>Stand</button></footer>}<div className="hand"><small>DEALER</small><div>{game.dealer.map((card,index)=><Card card={card} key={index}/>)}</div></div><div className="hand"><small>YOUR HAND · {game.player_value}</small><div>{game.player.map((card,index)=><Card card={card} key={index}/>)}</div></div><p>{game.message}</p></>:<p>Dealer stands on 17. Blackjack pays 3:2.</p>}</div>}
      {tab==="slots"&&<Slots state={state} spinning={motion?.kind==="slots"}/>}
      {tab==="roulette"&&<Roulette state={state} busy={busy} spinning={motion?.kind==="roulette"} bet={bet} setBet={setBet} spin={(type,number)=>animatedCall("roulette","bw_roulette_spin",{p_bet:bet,p_bet_type:type,p_number:type==="straight"?number:null,p_request_id:crypto.randomUUID()},2600)}/>}
      {(tab==="signal_lock"||tab==="courier_grid")&&<SkillArcadeRoom game={tab} challenge={challenge} phase={challengePhase} answer={challengeAnswer} setAnswer={setChallengeAnswer} event={miniEvent} busy={busy} start={()=>startChallenge(tab)} submit={submitChallenge}/>}
    </section>
  </div>;
}

function BetControls({bet,setBet,busy,play,label}) {
  return <div className="bet-controls"><label><span>Arcade Dollar play amount</span><input type="number" min="10" max="10000" step="10" value={bet} onChange={event=>setBet(Number(event.target.value))}/></label><button disabled={busy||bet<10} onClick={play}>{busy?"In play…":`${label} · ${arcadeMoney(bet)}`}</button></div>;
}

function Slots({state,spinning}) {
  const result=state?.result;
  const symbols=result?.reels||["♛","7","◆"];
  return <div className={`slots ${spinning?"spinning":""}`}><div className="slot-cabinet"><header><small>ROSSI'S ORIGINAL</small><h2>The Three Kings</h2><div className="jackpot-lights" aria-hidden="true">{Array.from({length:11},(_,index)=><i key={index}/>)}</div></header><div className="reels">{symbols.map((symbol,index)=><div className="reel-window" key={index}><div className="reel-strip" style={{"--reel":index}}>{[symbol,"BAR","◆","7","🍒",symbol].map((entry,item)=><i key={item}>{slotGlyph(entry)}</i>)}</div><span className="payline"/></div>)}</div><footer><span>🍒 🍒 awards 2×</span><b>♛ 7 ◆ BAR</b><span>Three match wins</span></footer></div><p className={result?.payout>0?"casino-win":""}>{spinning?"Reels in motion…":arcadeMessage(result?.message)||"Match three symbols on the gold line. Three sevens award the top credit prize."}</p></div>;
}

function Roulette({state,busy,spinning,bet,setBet,spin}) {
  const [type,setType]=useState("red"),[number,setNumber]=useState(0);
  const result=state?.result;
  const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  return <div className={`roulette ${spinning?"spinning":""}`}><div className="roulette-felt"><header><small>EUROPEAN SINGLE ZERO</small><h2>Rossi Wheel</h2></header><div className="roulette-stage"><div className="roulette-wheel"><div className="wheel-numbers" aria-hidden="true">{wheel.map((value,index)=><i className={value===0?"zero":""} style={{"--index":index}} key={value}>{value}</i>)}</div><div className="wheel-bowl"><div className="roulette-ball"/></div><strong>{spinning?"":result?.number??0}</strong></div></div><p className={result?.payout>0?"casino-win":""}>{spinning?"Selection locked…":arcadeMessage(result?.message)||"Single-zero number wheel. Straight selections award 35:1; group selections award 1:1."}</p><div className="roulette-picks"><label><span>ARCADE DOLLAR PLAY AMOUNT</span><input aria-label="Wheel play amount" type="number" min="10" max="10000" step="10" value={bet} onChange={event=>setBet(Number(event.target.value))}/></label><label><span>SELECTION</span><select value={type} onChange={event=>setType(event.target.value)}><option value="red">Red</option><option value="black">Black</option><option value="odd">Odd</option><option value="even">Even</option><option value="low">1–18</option><option value="high">19–36</option><option value="straight">Straight number</option></select></label>{type==="straight"&&<label><span>NUMBER</span><input type="number" min="0" max="36" value={number} onChange={event=>setNumber(Number(event.target.value))}/></label>}<button disabled={busy||bet<10} onClick={()=>spin(type,number)}>{spinning?"Wheel spinning…":`Spin · ${arcadeMoney(bet)}`}</button></div></div></div>;
}

function SkillArcadeRoom({game,challenge,phase,answer,setAnswer,event,busy,start,submit}) {
  const prompt=challenge?.prompt||{};
  const selected=answer?answer.split(game==="signal_lock"?"-":",").filter(Boolean):[];
  const add=value=>{if(selected.includes(String(value)))return;setAnswer(answer?`${answer}${game==="signal_lock"?"-":","}${value}`:String(value))};
  const symbols=prompt.symbols||[];
  const cells=prompt.cells||[];
  return <div className="skill-arcade-room"><header><small>{game==="signal_lock"?"MEMORY ROOM":"PATTERN ROOM"}</small><h2>{game==="signal_lock"?"Signal Lock":"Courier Grid"}</h2><p>{game==="signal_lock"?"Read the signal, wait for the lock to clear, then repeat it in order.":"Memorise the courier route, wait for the grid to clear, then tap every cell in order."}</p></header>{event&&<div className={`skill-event ${event.success?"win":"miss"}`}><b>{event.success?"Clean run":"Route missed"}</b><span>{event.message}</span>{event.success&&<em>+{arcadeMoney(event.payout)} Arcade Dollars</em>}</div>}{!challenge&&<div className="skill-start"><p>Entry is <b>$100 Arcade Dollars</b>. A correct run returns {game==="signal_lock"?"$200":"$300"}; a miss costs the entry. Eight server-checked attempts per UTC day.</p><button disabled={busy} onClick={start}>{busy?"Opening room…":"Start challenge · $100"}</button></div>}{challenge&&<div className="skill-challenge"><div className={`challenge-display ${phase==="show"?"revealing":"hidden"}`}>{game==="signal_lock"?symbols.map((symbol,index)=><i key={`${symbol}-${index}`}>{phase==="show"?symbol:"?"}</i>):<div className="memory-grid">{Array.from({length:9},(_,index)=><i className={phase==="show"&&cells.includes(String(index+1))?"lit":""} key={index}>{phase==="show"&&cells.includes(String(index+1))?index+1:""}</i>)}</div>}</div>{phase==="show"?<p className="challenge-status">Memorise it…</p>:<>{game==="signal_lock"?<div className="signal-keypad">{["A","B","C","D","E","F"].map(symbol=><button disabled={busy} className={selected.includes(symbol)?"picked":""} onClick={()=>add(symbol)} key={symbol}>{symbol}</button>)}</div>:<div className="courier-keypad">{Array.from({length:9},(_,index)=><button disabled={busy} className={selected.includes(String(index+1))?"picked":""} onClick={()=>add(index+1)} key={index}>{index+1}</button>)}</div>}<p className="challenge-status">Your route: <b>{answer||"—"}</b></p><button className="challenge-submit" disabled={busy||!answer} onClick={submit}>{busy?"Checking route…":"Submit route"}</button></>}</div>}</div>;
}
