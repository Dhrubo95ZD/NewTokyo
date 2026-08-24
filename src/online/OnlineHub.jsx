import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { onlineConfigured, supabase } from "./supabase.js";
import CharacterCreator, { RunnerPortrait } from "./CharacterCreator.jsx";
import Inventory, { ItemArt, LOOT, normalizeInventory } from "./Inventory.jsx";
import "./online-hub.css";
import "./account-gate.css";

const SAVE_KEY = "ntu-save-v1";
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
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(onlineConfigured ? "Connecting…" : "Online mode needs configuration");
  const listEnd = useRef(null);

  const user = session?.user;

  const loadMessages = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,body,created_at,user_id,profiles(display_name,avatar_url)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error) setMessages((data || []).reverse());
  }, [user]);

  const syncSave = useCallback(async () => {
    if (!user || window.storage.getUser() !== user.id) return;
    const save = await window.storage.get(SAVE_KEY);
    if (save?.value) await window.storage.set(SAVE_KEY, save.value);
  }, [user]);

  useEffect(() => {
    if (!supabase) return undefined;
    let appUrlListener;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next?.user) { window.storage.setUser(null); setAccountReady(false); setCharacterProfile(null); setEditingCharacter(false); setInventoryOpen(false); setInventoryState(null); }
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
      const existing = await window.storage.get(SAVE_KEY);
      let player = existing?.value ? JSON.parse(existing.value) : {};
      if (player.onlineUserId && player.onlineUserId !== user.id) player = {};
      if (!player.onlineUserId && Object.keys(player).length) {
        const legacyOwner = localStorage.getItem(LEGACY_OWNER_KEY);
        if (legacyOwner && legacyOwner !== user.id) player = {};
        else localStorage.setItem(LEGACY_OWNER_KEY, user.id);
      }
      const identityName = player.characterProfile?.codename || displayName;
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id, display_name: identityName.slice(0, 32),
        avatar_url: metadata.avatar_url || metadata.picture || null,
        last_seen_at: new Date().toISOString(),
      });
      if (profileError) { setStatus(profileError.message); return; }
      player.handle = player.characterProfile?.codename || handle;
      player.name = identityName.slice(0, 24);
      player.onlineUserId = user.id;
      player.inventory = normalizeInventory(player.inventory);
      delete player.cloudKey;
      await window.storage.set(SAVE_KEY, JSON.stringify(player));
      if (!cancelled) { setCharacterProfile(player.characterProfile || null); setInventoryState(player.inventory); setAccountReady(true); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!supabase || !user || !accountReady) return undefined;
    loadMessages();
    syncSave();
    const channel = supabase.channel("world-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, loadMessages)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, loadMessages)
      .subscribe((state) => setStatus(state === "SUBSCRIBED" ? "Live · Shibuya channel" : "Connecting…"));
    return () => { supabase.removeChannel(channel); };
  }, [accountReady, loadMessages, syncSave, user]);

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
      const existing = await window.storage.get(SAVE_KEY);
      const player = existing?.value ? JSON.parse(existing.value) : {};
      const next = { ...player, handle: profile.codename, name: profile.codename, onlineUserId: user.id, characterProfile: profile };
      await window.storage.set(SAVE_KEY, JSON.stringify(next));
      const { error: saveError } = await supabase.from("player_saves").upsert({ user_id: user.id, save_data: next });
      if (saveError) throw saveError;
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
      const existing = await window.storage.get(SAVE_KEY);
      const player = existing?.value ? JSON.parse(existing.value) : {};
      const next = { ...player, inventory, onlineUserId: user.id };
      await window.storage.set(SAVE_KEY, JSON.stringify(next));
      const { error } = await supabase.from("player_saves").upsert({ user_id: user.id, save_data: next });
      if (error) throw error;
      setStatus("Loadout synced");
    } catch (error) { setStatus(error.message || "Loadout sync paused"); }
  };

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
      {children}
      {inventoryOpen && <Inventory profile={characterProfile} value={inventoryState} onChange={saveInventory} onClose={() => setInventoryOpen(false)} />}
      <button className="online-orb" onClick={() => setOpen((v) => !v)} aria-label="Open online hub">
        <RunnerPortrait profile={characterProfile} compact />
        <i className={user ? "online" : ""} />
      </button>
      <button className="inventory-orb" onClick={() => { setOpen(false); setInventoryOpen(true); }} aria-label="Open runner loadout">
        <ItemArt item={LOOT.find((item) => item.id === inventoryState?.equipped?.weapon)} level={inventoryState?.enhancement?.[inventoryState?.equipped?.weapon] || 0} small/><span>LOADOUT</span>
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
