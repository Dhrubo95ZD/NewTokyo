import { useState } from "react";
import { supabase } from "../online/supabase.js";

const STEPS = [
  { page: "home", eyebrow: "WELCOME TO BLACKWOOD", title: "Build your name", text: "This is a persistent online city. Your cash, stats, items, messages and reputation are saved to your account." },
  { page: "home", eyebrow: "YOUR DAILY RESOURCES", title: "Watch the four meters", text: "Energy powers training and fights. Nerve pays for crimes. Health keeps you on the street. Happiness improves gym gains." },
  { page: "crimes", eyebrow: "MAKE YOUR FIRST SCORE", title: "Crimes build skill", text: "Start with an unlocked crime. The city server rolls every outcome and can award cash—or send you to jail." },
  { page: "gym", eyebrow: "PREPARE FOR A FIGHT", title: "Train all four stats", text: "Strength, defense, speed and dexterity decide combat. Training costs energy and benefits from high happiness." },
  { page: "shop", eyebrow: "SOUTHSIDE ARMS", title: "Buy real equipment", text: "Browse more than 200 items. Each purchase goes into your server-owned inventory and stronger collections require higher levels." },
  { page: "inventory", eyebrow: "YOUR LOADOUT", title: "Fill eight equipment slots", text: "Equip weapons, armor and accessories. Their attack, defense, speed and dexterity bonuses strengthen your loadout." },
  { page: "chat", eyebrow: "THE CITY IS ONLINE", title: "Meet the other players", text: "World Chat, families, forums, mail and rankings only show authenticated players—never fake accounts." },
];

export default function GuidedTutorial({ step = 0, done = false, onNavigate, onState }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (done || step >= STEPS.length) return null;
  const current = STEPS[Math.max(0, step)];
  const save = async dismiss => { if (busy) return; setBusy(true); setError(""); const next = dismiss ? step : step + 1; const { data, error: saveError } = await supabase.rpc("bw_advance_tutorial", { p_step: next, p_dismiss: dismiss }); if (saveError) setError(saveError.message); else { onState?.(data?.player); if (!dismiss && next < STEPS.length) onNavigate(STEPS[next].page); } setBusy(false); };
  return <div className="tutorial-layer" role="dialog" aria-modal="false" aria-label="Guided tutorial"><section className="tutorial-card"><header><small>{current.eyebrow}</small><span>{step + 1} / {STEPS.length}</span></header><div className="tutorial-progress"><i style={{ width: `${(step + 1) / STEPS.length * 100}%` }} /></div><h2>{current.title}</h2><p>{current.text}</p>{error && <em>{error}</em>}<footer><button className="tutorial-skip" disabled={busy} onClick={() => save(true)}>Skip tutorial</button><button className="tutorial-next" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : step === STEPS.length - 1 ? "Finish" : "Next"} <b>→</b></button></footer></section></div>;
}
