import { useEffect, useState } from "react";
import { supabase } from "../online/supabase.js";
import "./jobs.css";
import "./jobs-expansion.css";

const money=value=>`$${Number(value||0).toLocaleString()}`;

export default function JobCenter({onState}) {
  const [data,setData]=useState(null),[answers,setAnswers]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=async()=>{const{data:value,error:problem}=await supabase.rpc("bw_job_snapshot");if(problem)setError(problem.message);else setData(value)};
  useEffect(()=>{load()},[]);
  const act=async(rpc,params={})=>{setBusy(true);setError("");const{data:value,error:problem}=await supabase.rpc(rpc,params);setBusy(false);if(problem)setError(problem.message);else{setData(value);if(value?.player)onState?.(value.player)}};
  if(!data)return <div className="jobs-loading">Opening employment records…</div>;
  const career=data.career;
  return <div className="jobs-page">
    {error&&<div className="jobs-error">{error}</div>}
    {career?<>
      <header className="career-head"><div><small>CURRENT PROFESSION</small><h2>{career.profession_name}</h2><p>{career.position_name} · {career.job_points} profession points</p></div><div className="career-actions"><button disabled={busy||!career.shift_ready} onClick={()=>act("bw_job_work")}>{career.shift_ready?"Complete shift":"Shift already worked"}</button><button className="resign" disabled={busy} onClick={()=>confirm("Leave this profession and interview elsewhere?")&&act("bw_job_resign")}>Resign</button></div></header>
      <aside className="career-bridge"><b>Career influence</b><span>Every completed shift can be converted into faction reputation from Campaign. Higher career tiers also increase permanent city standing.</span></aside>
      <section className="work-stats">{[["MANUAL",data.stats.manual],["INTELLIGENCE",data.stats.intelligence],["ENDURANCE",data.stats.endurance]].map(item=><span key={item[0]}><small>{item[0]}</small><b>{Number(item[1]).toFixed(1)}</b></span>)}</section>
      <div className="career-ladder">{data.positions.map(position=><article className={position.id===career.position_id?"current":""} key={position.id}><i>{position.tier}</i><div><small>{position.company}</small><b>{position.name}</b><p>{money(position.daily_pay)} per shift · {position.point_gain} points</p></div><span><small>REQUIRES</small><b>M {position.manual_required} · I {position.intelligence_required} · E {position.endurance_required}</b></span>{position.id!==career.position_id&&<button disabled={busy||!position.can_promote} onClick={()=>act("bw_job_promote",{p_position_id:position.id})}>{position.can_promote?`Promote · ${position.promotion_cost} pts`:"Locked"}</button>}</article>)}</div>
      <button className="job-special" disabled={busy||!career.special_ready} onClick={()=>act("bw_job_special")}>Use profession special · {career.special_name}</button>
    </>:<>
      <header className="jobs-intro"><small>BLACKWOOD EMPLOYMENT OFFICE</small><h2>Choose a profession</h2><p>Every employer begins with a three-question interview. A failed interview can be retried tomorrow.</p></header>
      <div className="profession-grid">{data.professions.map(profession=><article key={profession.id}><small>{profession.company}</small><h3>{profession.name}</h3><p>{profession.description}</p>{profession.offer_only&&!profession.available?<em>Invitation only · build your Forex trader record</em>:<button disabled={busy||!profession.available} onClick={()=>act("bw_job_begin_interview",{p_profession_id:profession.id})}>Interview</button>}</article>)}</div>
      {data.interview&&<div className="interview"><h3>{data.interview.profession_name} interview</h3>{data.interview.questions.map(question=><fieldset key={question.id}><legend>{question.question}</legend>{question.options.map((option,index)=><label key={option}><input type="radio" name={question.id} onChange={()=>setAnswers(value=>({...value,[question.id]:index}))}/>{option}</label>)}</fieldset>)}<button disabled={busy||Object.keys(answers).length<3} onClick={()=>act("bw_job_submit_interview",{p_interview_id:data.interview.id,p_answers:answers})}>Submit answers</button></div>}
    </>}
  </div>;
}
