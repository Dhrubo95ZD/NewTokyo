import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { onlineConfigured, supabase } from "./supabase.js";
import CharacterCreator, { RunnerPortrait } from "./CharacterCreator.jsx";
import Inventory, { getArmoryBonuses, normalizeInventory } from "./Inventory.jsx";
import { migrateAccountSave, SAVE_KEY, serializeAccountSave } from "./accountSave.js";
import "./online-hub.css";
import "./account-gate.css";

const LEGACY_OWNER_KEY = "ntu:legacy-save-owner";
const nativeRedirect = "com.neotokyo.underworld://auth/callback";

export default function OnlineHub({ children }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [accountReady, setAccountReady] = useState(false);
  const [characterProfile, setCharacterProfile] = useState(null);
  const [editingCharacter, setEditingCharacter] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryState, setInventoryState] = useState(null);
  const [accountSave, setAccountSave] = useState(null);
  const [armoryAuthority, setArmoryAuthority] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(onlineConfigured ? "Connecting…" : "Online mode needs configuration");
  const listEnd = useRef(null);
  const accountRef = useRef(null);
  const saveQueue = useRef(Promise.resolve());

  const user = session?.user;
  const userId = user?.id;

  const loadMessages = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,body,created_at,user_id,profiles(display_name,avatar_url)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error) setMessages((data || []).reverse());
  }, [userId]);

  const persistAccount = useCallback(async (next) => {
    if (!userId) return;
    const clean = { ...next, core: { ...(next.core || {}), onlineUserId: userId } };
    accountRef.current = clean;
    setAccountSave(clean);
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      await window.storage.set(SAVE_KEY, serializeAccountSave(clean));
      const { error } = await supabase.from("player_saves").upsert({ user_id: userId, save_data: clean });
      if (error) throw error;
    });
    await saveQueue.current;
  }, [userId]);

  const commitSections = useCallback(async (patch) => {
    if (!accountRef.current) return;
    await persistAccount({ ...accountRef.current, ...patch, meta: { ...(accountRef.current.meta || {}), updatedAt: Date.now() } });
  }, [persistAccount]);

  useEffect(() => {
    if (!supabase) return undefined;
    let appUrlListener;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next?.user) { window.storage.setUser(null); accountRef.current = null; setAccountSave(null); setArmoryAuthority(false); setAccountReady(false); setCharacterProfile(null); setEditingCharacter(false); setInventoryOpen(false); setInventoryState(null); }
      setSession(next); setBooting(false);
    });
    if (Capacitor.isNativePlatform()) {
      App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith(nativeRedirect)) return;
        setStatus("Finishing Google sign-in…");
        const callback = new URL(url);
        const code = callback.searchParams.get("code");
        const { error } = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : { error: new Error("Google did not return an authorization code") };
        await Browser.close();
        setStatus(error ? error.message : "Online");
      }).then((listener) => { appUrlListener = listener; });
    }
    return () => { auth.subscription.unsubscribe(); appUrlListener?.remove(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    const metadata = user.user_metadata || {};
    const displayName = metadata.full_name || metadata.name || user.email?.split("@")[0] || "Runner";
    const base = displayName.replace(/[^A-Za-z0-9_]/g, "").slice(0, 10) || "Runner";
    const handle = `${base}_${user.id.slice(0, 4)}`.slice(0, 16);
    let cancelled = false;
    setAccountReady(false);
    (async () => {
      window.storage.setUser(user.id);
      const { data: remoteSave, error: remoteError } = await supabase.from("player_saves").select("save_data").eq("user_id", user.id).maybeSingle();
      const existing = remoteSave?.save_data ? null : await window.storage.get(SAVE_KEY);
      let raw = remoteSave?.save_data || (existing?.value ? JSON.parse(existing.value) : {});
      if (raw.onlineUserId && raw.onlineUserId !== user.id) raw = {};
      if (!raw.onlineUserId && !raw.schemaVersion && Object.keys(raw).length) {
        const legacyOwner = localStorage.getItem(LEGACY_OWNER_KEY);
        if (legacyOwner && legacyOwner !== user.id) raw = {};
        else localStorage.setItem(LEGACY_OWNER_KEY, user.id);
      }
      if (remoteError && !existing?.value) setStatus(`Cloud save unavailable: ${remoteError.message}`);
      const nextSave = migrateAccountSave(raw, user, displayName);
      const { data: serverArmory, error: armoryError } = await supabase.rpc("get_armory_state");
      if (!armoryError && serverArmory) { nextSave.armory = normalizeInventory(serverArmory); setArmoryAuthority(true); }
      else setArmoryAuthority(false);
      const identityName = nextSave.character?.codename || nextSave.core?.name || displayName;
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id, display_name: identityName.slice(0, 32),
        avatar_url: metadata.avatar_url || metadata.picture || null,
        last_seen_at: new Date().toISOString(),
      });
      if (profileError) { setStatus(profileError.message); return; }
      nextSave.core = { ...nextSave.core, handle: nextSave.character?.codename || nextSave.core?.handle || handle, name: identityName.slice(0, 24), onlineUserId: user.id };
      await persistAccount(nextSave);
      if (!cancelled) { setCharacterProfile(nextSave.character || null); setInventoryState(nextSave.armory); setAccountReady(true); setStatus("Online · account save synced"); }
    })();
    return () => { cancelled = true; };
  }, [userId, persistAccount]);

  useEffect(() => {
    if (!supabase || !user || !accountReady) return undefined;
    loadMessages();
    const channel = supabase.channel("world-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, loadMessages)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, loadMessages)
      .subscribe((state) => setStatus(state === "SUBSCRIBED" ? "Live · Shibuya channel" : "Connecting…"));
    return () => { supabase.removeChannel(channel); };
  }, [accountReady, loadMessages, user]);

  useEffect(() => { if (open) listEnd.current?.scrollIntoView({ block: "end" }); }, [messages, open]);

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true);
    const redirectTo = Capacitor.isNativePlatform() ? nativeRedirect : `${location.origin}${location.pathname}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: Capacitor.isNativePlatform() },
    });
    if (data?.url && Capacitor.isNativePlatform()) await Browser.open({ url: data.url, presentationStyle: "popover" });
    setStatus(error?.message || "Complete sign-in in Google");
    setBusy(false);
  };

  const send = async () => {
    const body = message.trim();
    if (!body || !supabase || !user || busy) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, body });
    if (error) { setStatus(error.message); setMessage(body); }
    setBusy(false);
  };

  const saveCharacter = async (profile) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await commitSections({ character: profile, core: { ...(accountRef.current?.core || {}), handle: profile.codename, name: profile.codename, onlineUserId: user.id } });
      const { error } = await supabase.from("profiles").update({ display_name: profile.codename, last_seen_at: new Date().toISOString() }).eq("id", user.id);
      if (error) throw error;
      setCharacterProfile(profile);
      setEditingCharacter(false);
      setStatus("Runner identity forged");
    } catch (error) { setStatus(error.message || "Could not save runner"); }
    setBusy(false);
  };

  const saveInventory = async (inventory) => {
    if (!user) return;
    setInventoryState(inventory);
    try {
      await commitSections({ armory: normalizeInventory(inventory) });
      setStatus("Loadout synced");
    } catch (error) { setStatus(error.message || "Loadout sync paused"); }
  };

  const saveCore = useCallback(async (core) => {
    if (!accountRef.current) return;
    const { armoryBonuses: _derived, ...persistedCore } = core;
    try { await commitSections({ core: { ...persistedCore, onlineUserId: user.id } }); }
    catch (error) { setStatus(error.message || "Progress sync paused"); }
  }, [commitSections, user]);

  const startDistrictRun = useCallback(async () => {
    if (!armoryAuthority) return null;
    const { data, error } = await supabase.rpc("start_district_run");
    if (error) throw error;
    return data;
  }, [armoryAuthority]);

  const completeDistrictRun = useCallback(async (token) => {
    if (!armoryAuthority) return null;
    const { data, error } = await supabase.rpc("complete_district_run", { p_token: token });
    if (error) throw error;
    return data;
  }, [armoryAuthority]);

  const saveArmoryLoadout = useCallback(async (equipped, tutorialStep) => {
    if (!armoryAuthority) return null;
    const { data, error } = await supabase.rpc("save_armory_loadout", { p_equipped: equipped, p_tutorial_step: tutorialStep || 0 });
    if (error) throw error;
    return normalizeInventory(data);
  }, [armoryAuthority]);

  const enhanceArmoryItem = useCallback(async (itemId) => {
    if (!armoryAuthority) return null;
    const { data, error } = await supabase.rpc("enhance_armory_item", { p_item_id: itemId });
    if (error) throw error;
    return data;
  }, [armoryAuthority]);

  const armoryBonuses = useMemo(() => getArmoryBonuses(inventoryState, characterProfile), [inventoryState, characterProfile]);

  if (!onlineConfigured) return (
    <main className="account-gate gate-error">
      <div className="gate-card"><span className="gate-mark">網</span><small>NEO GRID</small><h1>Online setup required</h1><p>This release requires a Google account. Online services have not been connected to this build yet.</p></div>
    </main>
  );

  if (booting) return <main className="account-gate"><div className="gate-card"><span className="gate-mark pulse">東</span><small>NEO GRID</small><h1>Connecting to Neo-Tokyo…</h1></div></main>;

  if (!user) return (
    <main className="account-gate">
      <div className="gate-card">
        <span className="gate-mark">新</span><small>NEO-TOKYO UNDERWORLD</small>
        <h1>Your identity opens the city.</h1>
        <p>Sign in to create your runner, protect your progress, enter live chat and compete in city events.</p>
        <button className="google-login" onClick={signIn} disabled={busy}><b>G</b>{busy ? "Opening Google…" : "Continue with Google"}</button>
        <em>Google account required · One identity per save</em>
      </div>
    </main>
  );

  if (!accountReady) return <main className="account-gate"><div className="gate-card"><span className="gate-mark pulse">雲</span><small>NEO GRID</small><h1>Loading your cloud identity…</h1></div></main>;

  if (!characterProfile || editingCharacter) return <CharacterCreator initial={characterProfile} onSave={saveCharacter} onCancel={characterProfile ? () => setEditingCharacter(false) : null} saving={busy} />;

  return (
    <>
      {isValidElement(children) ? cloneElement(children, {
        initialPlayer: accountSave?.core || null,
        armoryBonuses,
        armoryProgress: inventoryState?.tutorialStep || 0,
        onPlayerChange: saveCore,
        onOpenArmory: () => { setOpen(false); setInventoryOpen(true); },
        onOpenSocial: () => { setInventoryOpen(false); setOpen(true); },
      }) : children}
      {inventoryOpen && <Inventory profile={characterProfile} value={inventoryState} onChange={saveInventory} onClose={() => setInventoryOpen(false)} onStartRun={armoryAuthority ? startDistrictRun : null} onCompleteRun={armoryAuthority ? completeDistrictRun : null} onSaveLoadout={armoryAuthority ? saveArmoryLoadout : null} onEnhanceItem={armoryAuthority ? enhanceArmoryItem : null} />}
      <button className="online-orb" onClick={() => setOpen((v) => !v)} aria-label="Open online hub">
        <RunnerPortrait profile={characterProfile} compact />
        <i className={user ? "online" : ""} />
      </button>
      {open && <aside className="online-hub" aria-label="Neo-Tokyo online hub">
        <header><div><b>NEO GRID</b><small>{status}</small></div><button onClick={() => setOpen(false)}>×</button></header>
        <>
            <div className="hub-profile"><RunnerPortrait profile={characterProfile} compact /><div><b>{characterProfile.codename}</b><small>{user.email}</small></div><button onClick={() => { setOpen(false); setInventoryOpen(true); }}>Loadout</button><button onClick={() => setEditingCharacter(true)}>Edit</button><button onClick={() => supabase.auth.signOut()}>Exit</button></div>
            <div className="hub-channel"><b>SHIBUYA FREQUENCY</b><span>PUBLIC · LIVE</span></div>
            <div className="hub-messages">{messages.length === 0 && <p className="hub-static">No voices on the frequency yet.</p>}{messages.map((m) => <article key={m.id} className={m.user_id === user.id ? "mine" : ""}><img src={m.profiles?.avatar_url || ""} alt="" /><div><b>{m.profiles?.display_name || "Runner"}</b><p>{m.body}</p></div></article>)}<div ref={listEnd} /></div>
            <div className="hub-compose"><input value={message} maxLength={240} placeholder="Broadcast…" onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} /><button onClick={send} disabled={!message.trim() || busy}>送</button></div>
          </>
      </aside>}
    </>
  );
}
