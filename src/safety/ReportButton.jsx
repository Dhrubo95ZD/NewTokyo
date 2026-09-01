import { useState } from "react";
import { supabase } from "../online/supabase.js";
import "./safety.css";

const reasons = [
  ["harassment", "Harassment or threats"], ["hate_abuse", "Hate or abusive content"],
  ["spam_scam", "Spam or scam"], ["sexual_inappropriate", "Sexual or inappropriate content"],
  ["real_money_trading", "Real-money trading"], ["cheating", "Cheating or exploitation"],
  ["personal_information", "Personal information"], ["other", "Something else"],
];

export default function ReportButton({ targetUser, contentType="player", contentId="", label="Report", allowMute=true }) {
  const [open,setOpen]=useState(false), [reason,setReason]=useState("harassment"), [detail,setDetail]=useState(""), [busy,setBusy]=useState(false), [notice,setNotice]=useState("");
  const report=async()=>{setBusy(true);const {error}=await supabase.rpc("bw_submit_report",{p_target_user:targetUser,p_content_type:contentType,p_content_id:String(contentId||""),p_reason:reason,p_detail:detail.trim()});setBusy(false);if(error)setNotice(error.message);else{setNotice("Report sent to the moderation queue.");setTimeout(()=>setOpen(false),800)}};
  const mute=async()=>{setBusy(true);const {error}=await supabase.rpc("bw_set_mute",{p_target:targetUser,p_muted:true});setBusy(false);setNotice(error?error.message:"Player muted. Their world-chat messages are now hidden.")};
  return <><button className="report-trigger" onClick={()=>setOpen(true)}>{label}</button>{open&&<div className="safety-modal" role="dialog" aria-modal="true" aria-label="Report player"><button className="safety-scrim" aria-label="Close report" onClick={()=>setOpen(false)}/><section><header><div><small>PLAYER SAFETY</small><h2>Report content</h2></div><button onClick={()=>setOpen(false)} aria-label="Close">×</button></header><p>Reports are reviewed by a human moderator. False or abusive reports may lead to action.</p><label>Reason<select value={reason} onChange={event=>setReason(event.target.value)}>{reasons.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><label>Details (optional)<textarea maxLength={1000} value={detail} onChange={event=>setDetail(event.target.value)} placeholder="Tell the moderator what happened."/></label>{notice&&<div className="safety-notice">{notice}</div>}<footer>{allowMute&&<button className="secondary" disabled={busy} onClick={mute}>Mute player</button>}<button className="danger" disabled={busy} onClick={report}>{busy?"Sending…":"Submit report"}</button></footer></section></div>}</>;
}

