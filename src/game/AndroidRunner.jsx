import "./android-runner.css";

export const ANDROID_MODELS = [
  { id:0, name:"Aegis Scout", frame:"agile", helmet:0 }, { id:1, name:"Orbital Sentinel", frame:"agile", helmet:1 },
  { id:2, name:"Vector Command", frame:"agile", helmet:2 }, { id:3, name:"Silent Recon", frame:"agile", helmet:3 },
  { id:4, name:"Aegis Heavy", frame:"heavy", helmet:0 }, { id:5, name:"Sentinel Heavy", frame:"heavy", helmet:1 },
  { id:6, name:"Command Heavy", frame:"heavy", helmet:2 }, { id:7, name:"Recon Heavy", frame:"heavy", helmet:3 },
];
export const ANDROID_HELMETS = ["Scout Visor","Sentinel Shell","Command Helm","Recon Mask"];
export const ANDROID_OPTICS = ["#53f4ff","#ff55a8","#ffbd52","#6dff9b"];
export const ANDROID_FINISHES = ["#f1f5f8","#7587a5","#1d2638","#867143","#804a7e"];

const safeIndex=(value,max,fallback=0)=>{const n=Number(value);return Number.isInteger(n)&&n>=0&&n<max?n:fallback;};
export function normalizeAndroidProfile(profile={}) {
  const legacyFrame=profile.frame==="broad"?4:0;
  const model=safeIndex(profile.androidModel,ANDROID_MODELS.length,legacyFrame+safeIndex(profile.helmet,4,0));
  return {...profile,androidModel:model,helmet:safeIndex(profile.helmet,4,ANDROID_MODELS[model].helmet),optic:safeIndex(profile.optic??profile.eyes,ANDROID_OPTICS.length,0),finish:safeIndex(profile.finish??profile.jacket,ANDROID_FINISHES.length,0),creationVersion:Math.max(2,Number(profile.creationVersion)||0)};
}

const modelStyle=(profile)=>{const p=normalizeAndroidProfile(profile);return {"--android-col":p.androidModel%4,"--android-row":Math.floor(p.androidModel/4),"--android-optic":ANDROID_OPTICS[p.optic],"--android-finish":ANDROID_FINISHES[p.finish],"--android-hue":`${p.finish*22}deg`};};

export function AndroidRunnerModel({profile={},compact=false,className="",label}) {
  const p=normalizeAndroidProfile(profile);
  return <span className={`android-runner-model ${compact?"compact":"full"} ${className}`} style={modelStyle(p)} role="img" aria-label={label||`${p.codename||"Runner"}, fully helmeted android`}><i/><em/></span>;
}

export const androidSpriteFrame=(profile={},action="idle")=>safeIndex(profile?.helmet,4,normalizeAndroidProfile(profile).helmet)*4+({idle:0,run:1,slash:2,shoot:3}[action]??0);

export function AndroidRunnerSprite({profile={},action="idle",className=""}) {
  const frame=androidSpriteFrame(profile,action);
  return <span className={`android-runner-sprite ${className}`} style={{...modelStyle(profile),"--sprite-col":frame%4,"--sprite-row":Math.floor(frame/4)}} role="img" aria-label={`${profile.codename||"Runner"} ${action}`}/>;
}
