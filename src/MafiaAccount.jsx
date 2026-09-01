import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import MafiaGame, { INITIAL } from "./MafiaGame.jsx";
import { onlineConfigured, supabase } from "./online/supabase.js";
import "./character-creation.css";

const nativeRedirect = "com.neotokyo.underworld://auth/callback";
const roles = [
  { id: "enforcer", name: "Enforcer", mark: "E", subtitle: "Strength and intimidation", text: "You solve problems face to face and make sure the family is respected.", bonus: { strength: 18, defense: 8 } },
  { id: "operator", name: "Operator", mark: "O", subtitle: "Speed and precision", text: "You plan clean jobs, move quickly, and leave nothing that points home.", bonus: { speed: 16, dexterity: 12 } },
  { id: "fixer", name: "Fixer", mark: "F", subtitle: "Connections and nerve", text: "You know who can be bought, who can be trusted, and where every favor is buried.", bonus: { maxNerve: 8, crimeSkill: 4 } },
];

const cleanName = value => String(value).replace(/[^A-Za-z0-9_ ]/g, "").slice(0, 18);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizeCloudPlayer(save, user) {
  const core = save?.schemaVersion >= 3 && save?.core ? save.core : (save || {});
  const character = save?.character || save?.characterProfile || null;
  const stats = core.stats || {};
  return {
    ...INITIAL,
    name: character?.codename || core.name || user?.user_metadata?.name || INITIAL.name,
    title: core.title || (character ? `${roles.find(r => r.id === character.role)?.name || "Associate"}` : INITIAL.title),
    level: finite(core.level, INITIAL.level), xp: finite(core.xp, INITIAL.xp),
    cash: finite(core.cash ?? core.money, INITIAL.cash), bank: finite(core.bank, INITIAL.bank),
    energy: finite(core.energy, INITIAL.energy), nerve: finite(core.nerve, INITIAL.nerve),
    health: finite(core.health ?? core.hp, INITIAL.health), happy: finite(core.happy, INITIAL.happy),
    maxEnergy: finite(core.maxEnergy, INITIAL.maxEnergy), maxNerve: finite(core.maxNerve, INITIAL.maxNerve),
    maxHealth: finite(core.maxHealth ?? core.maxHp, INITIAL.maxHealth), maxHappy: finite(core.maxHappy, INITIAL.maxHappy),
    strength: finite(core.strength ?? core.str ?? stats.str, INITIAL.strength),
    defense: finite(core.defense ?? core.def ?? stats.def, INITIAL.defense),
    speed: finite(core.speed ?? core.spd ?? stats.spd, INITIAL.speed),
    dexterity: finite(core.dexterity ?? core.dex ?? stats.dex, INITIAL.dexterity),
    crimeSkill: finite(core.crimeSkill, INITIAL.crimeSkill), respect: finite(core.respect, INITIAL.respect),
    merits: finite(core.merits, INITIAL.merits), job: core.job || INITIAL.job,
    jobPoints: finite(core.jobPoints, INITIAL.jobPoints), inventory: Array.isArray(core.inventory) ? core.inventory : INITIAL.inventory,
    log: Array.isArray(core.log) ? core.log : INITIAL.log, jailUntil: finite(core.jailUntil, 0), tutorialStep: finite(core.tutorialStep, INITIAL.tutorialStep), tutorialDone: Boolean(core.tutorialDone),
  };
}

function mergeAuthoritative(player, state) {
  const core = state?.player; if (!core) return player;
  return { ...player, level: core.level, xp: core.xp, cash: core.cash, bank: core.bank, energy: core.energy, maxEnergy: core.max_energy, nerve: core.nerve, maxNerve: core.max_nerve, health: core.health, maxHealth: core.max_health, happy: core.happy, maxHappy: core.max_happy, strength: Number(core.strength), defense: Number(core.defense), speed: Number(core.speed), dexterity: Number(core.dexterity), crimeSkill: core.crime_skill, respect: core.respect, merits: core.merits, jobPoints: core.job_points, tutorialStep: core.tutorial_step ?? player.tutorialStep, tutorialDone: core.tutorial_done ?? player.tutorialDone };
}

function CharacterCreation({ user, busy, onComplete }) {
  const fallback = cleanName(user?.user_metadata?.name || user?.email?.split("@")[0] || "");
  const [codename, setCodename] = useState(fallback), [roleId, setRoleId] = useState("enforcer"), [portrait, setPortrait] = useState(0);
  const role = roles.find(item => item.id === roleId); const valid = /^[A-Za-z0-9_ ]{3,18}$/.test(codename.trim());
  return <main className="creation"><section className="creation-card"><header><span className="creation-seal">M</span><small>BLACKWOOD CITY · NEW INTAKE</small><h1>Make your name.</h1><p>The family needs to know who you are—and what kind of work you're built for.</p></header><div className="creation-layout"><aside><div className={`portrait-choice portrait-${portrait}`}><span>{codename.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2) || "?"}</span><i>{role.mark}</i></div><small>FAMILY RECORD</small><b>{codename || "Unnamed associate"}</b><em>{role.name}</em><div className="portrait-tabs">{[0, 1, 2].map(n => <button className={portrait === n ? "active" : ""} onClick={() => setPortrait(n)} key={n} aria-label={`Portrait style ${n + 1}`} />)}</div></aside><form onSubmit={event => { event.preventDefault(); if (valid && !busy) onComplete({ codename: codename.trim(), role: roleId, portrait, creationVersion: 3 }); }}><label htmlFor="character-name">Your name</label><input id="character-name" value={codename} onChange={e => setCodename(cleanName(e.target.value))} placeholder="3–18 letters or numbers" autoComplete="off" /><small className={valid ? "valid" : ""}>{valid ? "Name available" : "Enter at least three characters"}</small><fieldset><legend>Choose your specialty</legend>{roles.map(item => <button type="button" className={roleId === item.id ? "selected" : ""} onClick={() => setRoleId(item.id)} key={item.id}><i>{item.mark}</i><span><b>{item.name}</b><small>{item.subtitle}</small></span><em>✓</em></button>)}</fieldset><div className="role-copy"><b>{role.name}</b><p>{role.text}</p></div><button className="begin" disabled={!valid || busy}>{busy ? "Saving your record…" : "Enter Blackwood City"}</button></form></div></section></main>;
}

export default function MafiaAccount() {
  const [session, setSession] = useState(null), [booting, setBooting] = useState(true), [loading, setLoading] = useState(false), [save, setSave] = useState(null), [character, setCharacter] = useState(null), [player, setPlayer] = useState(null), [status, setStatus] = useState("Connecting…");
  const saveTimer = useRef(null); const user = session?.user;
  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setBooting(false); if (!next) { setSave(null); setCharacter(null); setPlayer(null); } });
    let listener; if (Capacitor.isNativePlatform()) App.addListener("appUrlOpen", async ({ url }) => { if (!url.startsWith(nativeRedirect)) return; const code = new URL(url).searchParams.get("code"); if (code) { setStatus("Finishing Google sign-in…"); await supabase.auth.exchangeCodeForSession(code); } await Browser.close(); }).then(value => { listener = value; });
    return () => { auth.subscription.unsubscribe(); listener?.remove(); clearTimeout(saveTimer.current); };
  }, []);
  useEffect(() => {
    if (!user) return; let cancelled = false; setLoading(true); setStatus("Loading your family record…");
    (async () => { const { data, error } = await supabase.from("player_saves").select("save_data").eq("user_id", user.id).maybeSingle(); if (cancelled) return; if (error) setStatus(error.message); const remote = data?.save_data || {}; const foundCharacter = remote.character || remote.characterProfile || null; if (foundCharacter) await supabase.from("profiles").upsert({ id: user.id, display_name: foundCharacter.codename || user.user_metadata?.name || "Associate", avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null, last_seen_at: new Date().toISOString() }); const localPlayer = foundCharacter ? normalizeCloudPlayer(remote, user) : null; const { data: authority } = foundCharacter ? await supabase.rpc("bw_get_state") : { data: null }; setSave(remote); setCharacter(foundCharacter); setPlayer(localPlayer ? mergeAuthoritative(localPlayer, authority) : null); setLoading(false); })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const signIn = async () => { setLoading(true); const native = Capacitor.isNativePlatform(); const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: native ? nativeRedirect : window.location.origin, skipBrowserRedirect: native } }); if (error) { setStatus(error.message); setLoading(false); return; } if (native && data?.url) await Browser.open({ url: data.url }); };
  const createCharacter = async profile => { setLoading(true); const role = roles.find(item => item.id === profile.role); const seed = { ...INITIAL, name: profile.codename, title: role.name, ...Object.fromEntries(Object.entries(role.bonus).map(([key, value]) => [key, INITIAL[key] + value])) }; const next = { schemaVersion: 5, core: { ...seed, money: seed.cash }, character: profile, meta: { createdAt: Date.now(), updatedAt: Date.now() } }; const { data: authority, error } = await supabase.rpc("bw_create_character", { p_name: profile.codename, p_role: profile.role, p_avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null }); if (error) { setStatus(`City backend upgrade required: ${error.message}`); setLoading(false); return; } setSave(next); setCharacter(profile); setPlayer(mergeAuthoritative(seed, authority)); setLoading(false); };
  const persistPlayer = useCallback(nextPlayer => { if (!user) return; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(async () => { const next = { schemaVersion: 5, core: { ...nextPlayer, money: nextPlayer.cash, onlineUserId: user.id }, character, meta: { updatedAt: Date.now() } }; await supabase.from("player_saves").upsert({ user_id: user.id, save_data: next }); await supabase.rpc("sync_my_leaderboard"); await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id); }, 650); }, [user?.id, character]);
  const deleteAccount = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirmation: "DELETE" } });
    if (error || !data?.deleted) { setLoading(false); return { error: data?.error || error?.message || "Account deletion failed" }; }
    localStorage.removeItem("blackwood-city-save-v1");
    await supabase.auth.signOut({ scope: "local" });
    setLoading(false);
    return { ok: true };
  };
  if (!onlineConfigured) return <main className="account-gate"><section><span>M</span><small>BLACKWOOD CITY</small><h1>Connection required</h1><p>This Android build needs its existing Supabase configuration.</p></section></main>;
  if (booting || loading && user && !save) return <main className="account-gate"><section><span className="pulse">M</span><small>MORETTI FAMILY</small><h1>{status}</h1></section></main>;
  if (!user) return <main className="account-gate"><section><span>M</span><small>MORETTI · BLACKWOOD CITY</small><h1>Your name opens doors.</h1><p>Sign in to load your character, wallet, and family record from Supabase.</p><button onClick={signIn} disabled={loading}><b>G</b>{loading ? "Opening Google…" : "Continue with Google"}</button><em>One Google account · One cloud save</em></section></main>;
  if (!character && status.startsWith("City backend upgrade required")) return <main className="account-gate"><section><span>!</span><small>BLACKWOOD CITY CORE</small><h1>Database migration required</h1><p>{status}</p><button onClick={() => supabase.auth.signOut()}>Sign out</button></section></main>;
  if (!character) return <CharacterCreation user={user} busy={loading} onComplete={createCharacter} />;
  if (!player) return <main className="account-gate"><section><span className="pulse">M</span><h1>Loading your character…</h1></section></main>;
  return <MafiaGame initialPlayer={player} character={character} user={user} onPlayerChange={persistPlayer} onSignOut={() => supabase.auth.signOut()} onDeleteAccount={deleteAccount} />;
}
