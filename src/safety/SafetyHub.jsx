import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { supabase } from "../online/supabase.js";
import "./safety.css";

const PUBLIC_ROOT="https://dhrubo95zd.github.io/NewTokyo";
const open=url=>Browser.open({url});

export default function SafetyHub({ onDeleteAccount }) {
  const [state,setState]=useState({mutes:[],isModerator:false,reportsSubmitted:0}),[queue,setQueue]=useState([]),[confirm,setConfirm]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const load=async()=>{const {data,error}=await supabase.rpc("bw_safety_snapshot");if(error)setNotice(`Safety database upgrade required · ${error.message}`);else{setState(data||state);if(data?.isModerator){const result=await supabase.rpc("bw_moderation_queue",{p_status:"open"});if(!result.error)setQueue(result.data||[])}}};
  useEffect(()=>{load()},[]);
  const unmute=async id=>{await supabase.rpc("bw_set_mute",{p_target:id,p_muted:false});load()};
  const resolve=async(id,status)=>{const {error}=await supabase.rpc("bw_resolve_report",{p_report:id,p_status:status,p_notes:"Reviewed in the in-game moderation console."});setNotice(error?error.message:"Report updated.");load()};
  const removeAccount=async()=>{if(confirm!=="DELETE")return;setBusy(true);const result=await onDeleteAccount?.();setBusy(false);if(result?.error)setNotice(result.error)};
  return <div className="safety-page"><header className="page-head"><div><small>TRUST · CONTROL · TRANSPARENCY</small><h1>Help & Safety</h1><p>Manage your account, control who you hear from, and report behaviour that harms the community.</p></div></header>
    <div className="safety-grid"><section><header><small>COMMUNITY</small><h2>Rules and reporting</h2></header><p>Harassment, hate, sexual content, scams, cheating, doxxing, and real-money trading are prohibited. Use Report beside a player or message; reports go to a private moderation queue.</p><button onClick={()=>open(`${PUBLIC_ROOT}/support.html`)}>Support & community rules ↗</button><p className="fine">You have submitted {state.reportsSubmitted||0} report(s).</p></section>
      <section><header><small>PLAYER CONTROL</small><h2>Muted players</h2></header>{!state.mutes?.length?<p>No players are muted. Muting hides their world-chat messages.</p>:<div className="mute-list">{state.mutes.map(item=><div key={item.id}><b>{item.name}</b><button onClick={()=>unmute(item.id)}>Unmute</button></div>)}</div>}</section>
      <section><header><small>VIRTUAL ECONOMY</small><h2>No cash-out</h2></header><p>Ledger Credits used for casino and trading gameplay are virtual, cannot be bought with real money, transferred outside the game, redeemed, or cashed out. Market prices may be delayed and are not financial advice.</p><button onClick={()=>open(`${PUBLIC_ROOT}/privacy.html`)}>Privacy policy ↗</button></section>
      <section className="danger-zone"><header><small>ACCOUNT CONTROL</small><h2>Delete account and data</h2></header><p>This permanently deletes your Google-linked Blackwood account, character, progress, social content and gameplay records. This cannot be undone.</p><label>Type <b>DELETE</b> to confirm<input value={confirm} onChange={e=>setConfirm(e.target.value)} autoCapitalize="characters"/></label>{notice&&<div className="safety-notice">{notice}</div>}<button className="danger" disabled={confirm!=="DELETE"||busy} onClick={removeAccount}>{busy?"Deleting…":"Permanently delete my account"}</button><button onClick={()=>open(`${PUBLIC_ROOT}/delete-account.html`)}>Open web deletion page ↗</button></section>
    </div>{state.isModerator&&<section className="moderation"><header><small>STAFF ONLY</small><h2>Open moderation queue</h2></header>{!queue.length?<p>No open reports.</p>:queue.map(item=><article key={item.id}><div><b>{item.reason.replaceAll("_"," ")}</b><small>{item.type} · {item.target||"Unknown player"} · {new Date(item.createdAt).toLocaleString()}</small><p>{item.detail||"No additional detail."}</p></div><footer><button onClick={()=>resolve(item.id,"dismissed")}>Dismiss</button><button className="danger" onClick={()=>resolve(item.id,"resolved")}>Resolve</button></footer></article>)}</section>}</div>;
}

