import { useMemo, useState } from "react";
import "./character-creator.css";

const SKINS = ["#f2c7a5", "#d99a73", "#ad6f52", "#754735", "#432d2a"];
const EYES = ["#79f7ff", "#ff5a9d", "#b6ff58", "#ffc857"];
const JACKETS = ["#e73768", "#6857ff", "#00a8a8", "#d17b18", "#252b42"];
const HAIR = ["Razor", "Shag", "Crown", "Fade", "Ronin"];
const AUGMENTS = ["None", "Temple Jack", "Optic Line", "Chrome Jaw"];
const ROLES = [
  { id: "ghost", name: "Ghost", text: "Speed · stealth · precision" },
  { id: "samurai", name: "Street Samurai", text: "Power · nerve · combat" },
  { id: "netrunner", name: "Net Runner", text: "Tech · hacks · intelligence" },
  { id: "fixer", name: "Fixer", text: "Charm · deals · influence" },
];

const defaults = {
  codename: "", frame: "neutral", skin: 1, eyes: 0, jacket: 0,
  hair: 0, augment: 1, role: "ghost",
};

export function RunnerPortrait({ profile = defaults, compact = false }) {
  const skin = SKINS[profile.skin] || SKINS[1];
  const eye = EYES[profile.eyes] || EYES[0];
  const jacket = JACKETS[profile.jacket] || JACKETS[0];
  const hair = Number(profile.hair) || 0;
  const augment = Number(profile.augment) || 0;
  return (
    <div className={`runner-portrait ${compact ? "compact" : ""}`} style={{ "--skin": skin, "--eye": eye, "--jacket": jacket }}>
      <svg viewBox="0 0 300 380" role="img" aria-label={`${profile.codename || "Runner"} portrait`}>
        <defs>
          <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stopColor={jacket} /><stop offset="1" stopColor="#101321" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path className="portrait-grid" d="M20 335h260M36 300h228M58 265h184M75 230h150M92 195h116" />
        <ellipse cx="150" cy="353" rx="105" ry="18" fill="#000" opacity=".45" />
        <path d={profile.frame === "broad" ? "M58 352Q64 260 108 238H192Q236 260 242 352Z" : profile.frame === "slim" ? "M76 352Q82 264 117 239H183Q218 264 224 352Z" : "M67 352Q73 262 112 238H188Q227 262 233 352Z"} fill="url(#coat)" stroke={jacket} strokeWidth="3" />
        <path d="M108 240l42 50 42-50-18-12h-48z" fill="#0b0d16" />
        <path d="M124 205h52v55l-26 28-26-28z" fill={skin} />
        <path d="M91 108Q100 47 150 46q60 2 64 72l-10 94q-12 38-54 42-42-4-54-42z" fill={skin} stroke="#21151a" strokeWidth="4" />
        {hair === 0 && <path d="M91 130q2-83 64-87 48 6 60 68l-38-25-36 22-28-11z" fill="#101324" stroke={eye} strokeWidth="3" />}
        {hair === 1 && <path d="M90 143q-2-93 62-100 57 8 64 81l-22-23-17 32-24-38-29 30-14-25z" fill="#24121f" stroke={jacket} strokeWidth="4" />}
        {hair === 2 && <path d="M95 117l17-63 24 32 18-51 18 49 25-28 18 63-35-27-32 10-26-12z" fill="#17162a" stroke={eye} strokeWidth="3" />}
        {hair === 3 && <path d="M91 122q10-73 62-76 42 2 58 54-43-27-87 4l-30 42z" fill="#12131b" stroke={jacket} strokeWidth="4" />}
        {hair === 4 && <><path d="M95 121q7-72 56-77 51 5 61 69l-31-19-31 7-30-12z" fill="#151527" stroke={eye} strokeWidth="3"/><path d="M203 99q33 52 5 122" fill="none" stroke="#151527" strokeWidth="18"/></>}
        <path d="M111 159q18-10 31 1M159 160q16-11 31-1" fill="none" stroke="#39232a" strokeWidth="5" />
        <path d="M116 171h25M160 171h25" stroke={eye} strokeWidth="5" filter="url(#glow)" />
        <path d="M137 211q13 7 26 0" fill="none" stroke="#6d3843" strokeWidth="4" />
        {augment === 1 && <><circle cx="199" cy="164" r="8" fill={eye} filter="url(#glow)"/><path d="M199 172l-8 41" stroke={eye} strokeWidth="3" /></>}
        {augment === 2 && <path d="M104 176q46 19 92 0" fill="none" stroke={eye} strokeWidth="4" filter="url(#glow)" />}
        {augment === 3 && <path d="M103 205l18 35 29 14 29-14 18-35-10 45-37 20-37-20z" fill="#9aa4bc" opacity=".65" stroke={eye} strokeWidth="2" />}
        <path d="M70 350l43-74 37 34 37-34 43 74" fill="none" stroke={jacket} strokeWidth="7" />
      </svg>
      {!compact && <div className="portrait-tag"><span>{profile.codename || "UNNAMED"}</span><small>{ROLES.find((r) => r.id === profile.role)?.name || "Runner"}</small></div>}
    </div>
  );
}

function Swatches({ values, active, onChange, label }) {
  return <div className="creator-field"><label>{label}</label><div className="swatches">{values.map((color, i) => <button key={color} type="button" className={active === i ? "active" : ""} style={{ "--swatch": color }} onClick={() => onChange(i)} aria-label={`${label} ${i + 1}`} />)}</div></div>;
}

export default function CharacterCreator({ initial, onSave, onCancel, saving = false }) {
  const [draft, setDraft] = useState({ ...defaults, ...(initial || {}) });
  const [step, setStep] = useState(0);
  const validName = useMemo(() => /^[A-Za-z0-9_]{3,14}$/.test(draft.codename), [draft.codename]);
  const patch = (next) => setDraft((current) => ({ ...current, ...next }));
  return (
    <main className="character-creator">
      <div className="creator-atmosphere" />
      <header className="creator-top"><div><small>NEO GRID // ID FORGE</small><h1>Build your runner</h1></div>{onCancel && <button onClick={onCancel}>Close</button>}</header>
      <section className="creator-layout">
        <div className="creator-preview"><RunnerPortrait profile={draft} /><div className="scan-line" /></div>
        <div className="creator-console">
          <nav>{["Identity", "Appearance", "Discipline"].map((name, i) => <button key={name} className={step === i ? "active" : ""} onClick={() => setStep(i)}><i>{i + 1}</i>{name}</button>)}</nav>
          {step === 0 && <div className="creator-pane">
            <div className="creator-field"><label>Codename</label><input value={draft.codename} maxLength={14} placeholder="3–14 letters or numbers" onChange={(e) => patch({ codename: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })}/><small className={validName ? "valid" : ""}>{validName ? "Identity available" : "Letters, numbers and underscore only"}</small></div>
            <div className="creator-field"><label>Frame</label><div className="segmented">{[["slim","Swift"],["neutral","Balanced"],["broad","Power"]].map(([id,name]) => <button key={id} className={draft.frame === id ? "active" : ""} onClick={() => patch({ frame: id })}>{name}</button>)}</div></div>
            <Swatches label="Skin tone" values={SKINS} active={draft.skin} onChange={(skin) => patch({ skin })}/>
          </div>}
          {step === 1 && <div className="creator-pane">
            <div className="creator-field"><label>Hair system</label><div className="choice-grid">{HAIR.map((name, i) => <button key={name} className={draft.hair === i ? "active" : ""} onClick={() => patch({ hair: i })}>{name}</button>)}</div></div>
            <Swatches label="Optic glow" values={EYES} active={draft.eyes} onChange={(eyes) => patch({ eyes })}/>
            <Swatches label="Jacket signal" values={JACKETS} active={draft.jacket} onChange={(jacket) => patch({ jacket })}/>
            <div className="creator-field"><label>Cyberware</label><div className="choice-grid">{AUGMENTS.map((name, i) => <button key={name} className={draft.augment === i ? "active" : ""} onClick={() => patch({ augment: i })}>{name}</button>)}</div></div>
          </div>}
          {step === 2 && <div className="creator-pane role-list">{ROLES.map((role) => <button key={role.id} className={draft.role === role.id ? "active" : ""} onClick={() => patch({ role: role.id })}><b>{role.name}</b><span>{role.text}</span></button>)}</div>}
          <footer><button className="back" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>{step < 2 ? <button className="continue" onClick={() => setStep((s) => s + 1)} disabled={!validName}>Continue</button> : <button className="continue forge" onClick={() => onSave(draft)} disabled={!validName || saving}>{saving ? "Forging identity…" : "Enter Neo-Tokyo"}</button>}</footer>
        </div>
      </section>
    </main>
  );
}
