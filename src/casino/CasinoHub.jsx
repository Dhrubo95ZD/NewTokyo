import { useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import "./casino.css";

const credits = value => `LC ${Number(value || 0).toLocaleString()}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const slotGlyph = symbol => symbol === "●" ? "🍒" : symbol;
const Card = ({ card }) => <i className={/[HD]/.test(card) ? "red" : ""}>{card?.replace("H","♥").replace("D","♦").replace("C","♣").replace("S","♠")}</i>;

export default function CasinoHub() {
  const [tab,setTab]=useState("blackjack"),[bet,setBet]=useState(100),[state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[motion,setMotion]=useState(null);
  const accept=value=>setState(value);
  const call=async(rpc,params={})=>{if(busy)return null;setBusy(true);setError("");const{data,error:problem}=await supabase.rpc(rpc,params);if(problem)setError(problem.message);else accept(data);setBusy(false);return problem?null:data};
  const animatedCall=async(kind,rpc,params,duration)=>{if(busy)return null;setBusy(true);setError("");setMotion({kind,key:Date.now()});const started=Date.now();const{data,error:problem}=await supabase.rpc(rpc,params);await wait(Math.max(0,duration-(Date.now()-started)));if(problem)setError(problem.message);else accept(data);setMotion(null);setBusy(false);return problem?null:data};
  useEffect(()=>{call("bw_casino_snapshot")},[]);
  const play=()=>tab==="slots"
    ? animatedCall("slots","bw_slots_spin",{p_bet:bet,p_request_id:crypto.randomUUID()},1700)
    : call("bw_blackjack_start",{p_bet:bet,p_request_id:crypto.randomUUID()});
  const changeTab=id=>{if(busy)return;setTab(id);setMotion(null);call("bw_casino_snapshot")};
  const game=state?.blackjack;

  return <div className="casino-page"><header><small>ROSSI'S RECREATION HALL</small><h1>The Arcade</h1><p>Three server-settled games using play-earned Ledger Credits. Results are recorded by the city server.</p><div className="virtual-currency-notice"><b>LC · LEDGER CREDITS</b><span>Gameplay currency only · cannot be bought with dollars · no cash value · no cash-out</span></div></header>{error&&<div className="casino-error">{error}</div>}
    <nav>{[["blackjack","Blackjack","♠"],["slots","Slots","7"],["roulette","Roulette","●"]].map(([id,label,icon])=><button className={tab===id?"active":""} disabled={busy} onClick={()=>changeTab(id)} key={id}><i>{icon}</i><span>{label}</span></button>)}</nav>
    <section className={`casino-table ${tab}-room`}><div className="casino-balance"><small>AVAILABLE LEDGER CREDITS</small><b>{credits(state?.balance)}</b></div>
      {tab==="blackjack"&&<div className="blackjack"><h2>Blackwood Blackjack</h2>{game?<><div className="hand"><small>DEALER</small><div>{game.dealer.map((card,index)=><Card card={card} key={index}/>)}</div></div><div className="hand"><small>YOUR HAND · {game.player_value}</small><div>{game.player.map((card,index)=><Card card={card} key={index}/>)}</div></div><p>{game.message}</p>{game.status==="active"&&<footer><button disabled={busy} onClick={()=>call("bw_blackjack_action",{p_action:"hit"})}>Hit</button><button disabled={busy} onClick={()=>call("bw_blackjack_action",{p_action:"stand"})}>Stand</button></footer>}</>:<p>Dealer stands on 17. Blackjack pays 3:2.</p>}</div>}
      {tab==="slots"&&<Slots state={state} spinning={motion?.kind==="slots"}/>} 
      {tab==="roulette"&&<Roulette state={state} busy={busy} spinning={motion?.kind==="roulette"} bet={bet} setBet={setBet} spin={(type,number)=>animatedCall("roulette","bw_roulette_spin",{p_bet:bet,p_bet_type:type,p_number:type==="straight"?number:null,p_request_id:crypto.randomUUID()},2600)}/>} 
      {tab!=="roulette"&&(!game||game.status!=="active")&&<BetControls bet={bet} setBet={setBet} busy={busy} play={play} label={tab==="slots"?"Pull lever":"Deal hand"}/>} 
    </section>
  </div>;
}

function BetControls({bet,setBet,busy,play,label}) {
  return <div className="bet-controls"><label><span>LC play amount</span><input type="number" min="10" max="10000" step="10" value={bet} onChange={event=>setBet(Number(event.target.value))}/></label><button disabled={busy||bet<10} onClick={play}>{busy?"In play…":`${label} · ${credits(bet)}`}</button></div>;
}

function Slots({state,spinning}) {
  const result=state?.result;
  const symbols=result?.reels||["♛","7","◆"];
  return <div className={`slots ${spinning?"spinning":""}`}><div className="slot-cabinet"><header><small>ROSSI'S ORIGINAL</small><h2>The Three Kings</h2><div className="jackpot-lights" aria-hidden="true">{Array.from({length:11},(_,index)=><i key={index}/>)}</div></header><div className="reels">{symbols.map((symbol,index)=><div className="reel-window" key={index}><div className="reel-strip" style={{"--reel":index}}>{[symbol,"BAR","◆","7","🍒",symbol].map((entry,item)=><i key={item}>{slotGlyph(entry)}</i>)}</div><span className="payline"/></div>)}</div><footer><span>🍒 🍒 awards 2×</span><b>♛ 7 ◆ BAR</b><span>Three match wins</span></footer></div><p className={result?.payout>0?"casino-win":""}>{spinning?"Reels in motion…":result?.message||"Match three symbols on the gold line. Three sevens award the top credit prize."}</p></div>;
}

function Roulette({state,busy,spinning,bet,setBet,spin}) {
  const [type,setType]=useState("red"),[number,setNumber]=useState(0);
  const result=state?.result;
  const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  return <div className={`roulette ${spinning?"spinning":""}`}><div className="roulette-felt"><header><small>EUROPEAN SINGLE ZERO</small><h2>Rossi Wheel</h2></header><div className="roulette-stage"><div className="roulette-wheel"><div className="wheel-numbers" aria-hidden="true">{wheel.map((value,index)=><i className={value===0?"zero":""} style={{"--index":index}} key={value}>{value}</i>)}</div><div className="wheel-bowl"><div className="roulette-ball"/></div><strong>{spinning?"":result?.number??0}</strong></div></div><p className={result?.payout>0?"casino-win":""}>{spinning?"Selection locked…":result?.message||"Single-zero number wheel. Straight selections award 35:1; group selections award 1:1."}</p><div className="roulette-picks"><label><span>LC PLAY AMOUNT</span><input aria-label="Wheel play amount" type="number" min="10" max="10000" step="10" value={bet} onChange={event=>setBet(Number(event.target.value))}/></label><label><span>SELECTION</span><select value={type} onChange={event=>setType(event.target.value)}><option value="red">Red</option><option value="black">Black</option><option value="odd">Odd</option><option value="even">Even</option><option value="low">1–18</option><option value="high">19–36</option><option value="straight">Straight number</option></select></label>{type==="straight"&&<label><span>NUMBER</span><input type="number" min="0" max="36" value={number} onChange={event=>setNumber(Number(event.target.value))}/></label>}<button disabled={busy||bet<10} onClick={()=>spin(type,number)}>{spinning?"Wheel spinning…":`Spin · ${credits(bet)}`}</button></div></div></div>;
}
