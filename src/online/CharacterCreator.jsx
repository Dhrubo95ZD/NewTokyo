import { useMemo, useState } from "react";
import { AndroidRunnerModel, AndroidRunnerSprite, ANDROID_FINISHES, ANDROID_HELMETS, ANDROID_MODELS, ANDROID_OPTICS, normalizeAndroidProfile } from "../game/AndroidRunner.jsx";
import "./character-creator.css";

const ROLES=[{id:"striker",name:"Striker",text:"Power · timing · pressure"},{id:"guardian",name:"Guardian",text:"Defense · recovery · control"},{id:"technician",name:"Technician",text:"Tech · tools · preparation"}];
const defaults={codename:"",frame:"neutral",role:"striker",archetype:"striker",androidModel:0,helmet:0,optic:0,finish:0,creationVersion:2};

export function RunnerPortrait({profile=defaults,compact=false}) {
  const resolved=normalizeAndroidProfile(profile);
  return <div className={`runner-portrait android-identity ${compact?"compact":""}`} style={{"--eye":ANDROID_OPTICS[resolved.optic],"--jacket":ANDROID_FINISHES[resolved.finish]}}>{compact?<AndroidRunnerSprite profile={resolved} action="idle"/>:<AndroidRunnerModel profile={resolved}/>} {!compact&&<div className="portrait-tag"><span>{resolved.codename||"UNNAMED"}</span><small>{ANDROID_MODELS[resolved.androidModel].name} · {ROLES.find((r)=>r.id===(resolved.archetype||resolved.role))?.name||"Runner"}</small></div>}</div>;
}

function Swatches({values,active,onChange,label}){return <div className="creator-field"><label>{label}</label><div className="swatches">{values.map((color,i)=><button key={color} type="button" className={active===i?"active":""} style={{"--swatch":color}} onClick={()=>onChange(i)} aria-label={`${label} ${i+1}`}/>)}</div></div>}

export default function CharacterCreator({initial,onSave,onCancel,saving=false}) {
  const [draft,setDraft]=useState(()=>normalizeAndroidProfile({...defaults,...(initial||{})}));
  const [step,setStep]=useState(0);const validName=useMemo(()=>/^[A-Za-z0-9_]{3,14}$/.test(draft.codename),[draft.codename]);
  const patch=(next)=>setDraft((current)=>normalizeAndroidProfile({...current,...next}));
  const chooseModel=(model)=>patch({androidModel:model.id,helmet:model.helmet,frame:model.frame==="heavy"?"broad":"slim"});
  return <main className="character-creator"><div className="creator-atmosphere"/><header className="creator-top"><div><small>NEO GRID // ANDROID ID FORGE</small><h1>Synthesize your runner</h1></div>{onCancel&&<button onClick={onCancel}>Close</button>}</header><section className="creator-layout">
    <div className="creator-preview"><RunnerPortrait profile={draft}/><div className="scan-line"/><span className="android-seal">FULLY ENCLOSED // UNIT {String(draft.androidModel+1).padStart(2,"0")}</span></div>
    <div className="creator-console"><nav>{["Identity","Chassis","Discipline"].map((name,i)=><button key={name} className={step===i?"active":""} onClick={()=>setStep(i)}><i>{i+1}</i>{name}</button>)}</nav>
      {step===0&&<div className="creator-pane"><div className="creator-field"><label>Codename</label><input value={draft.codename} maxLength={14} placeholder="3–14 letters or numbers" onChange={(e)=>patch({codename:e.target.value.replace(/[^A-Za-z0-9_]/g,"")})}/><small className={validName?"valid":""}>{validName?"Identity available":"Letters, numbers and underscore only"}</small></div><Swatches label="Optic glow" values={ANDROID_OPTICS} active={draft.optic} onChange={(optic)=>patch({optic})}/><Swatches label="Armor signal" values={ANDROID_FINISHES} active={draft.finish} onChange={(finish)=>patch({finish})}/></div>}
      {step===1&&<div className="creator-pane android-model-picker"><div className="creator-field"><label>Chassis + helmet configuration</label><div className="android-model-grid">{ANDROID_MODELS.map((model)=><button key={model.id} className={draft.androidModel===model.id?"active":""} onClick={()=>chooseModel(model)}><AndroidRunnerModel profile={{...draft,androidModel:model.id}} compact/><span><b>{model.name}</b><small>{model.frame} · {ANDROID_HELMETS[model.helmet]}</small></span></button>)}</div></div><p className="android-model-note">Every configuration is a fully enclosed android. Your selected helmet is preserved in combat animations.</p></div>}
      {step===2&&<div className="creator-pane role-list">{ROLES.map((role)=><button key={role.id} className={(draft.archetype||draft.role)===role.id?"active":""} onClick={()=>patch({role:role.id,archetype:role.id})}><b>{role.name}</b><span>{role.text}</span></button>)}</div>}
      <footer><button className="back" onClick={()=>setStep((s)=>Math.max(0,s-1))} disabled={step===0}>Back</button>{step<2?<button className="continue" onClick={()=>setStep((s)=>s+1)} disabled={!validName}>Continue</button>:<button className="continue forge" onClick={()=>onSave({...draft,creationVersion:2})} disabled={!validName||saving}>{saving?"Forging android…":"Save android identity"}</button>}</footer>
    </div></section></main>;
}
