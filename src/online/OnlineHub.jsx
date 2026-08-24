import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { onlineConfigured, supabase } from "./supabase.js";
import "./online-hub.css";
import "./account-gate.css";

const SAVE_KEY = "ntu:ntu-save-v1";
const nativeRedirect = "com.neotokyo.underworld://auth/callback";

export default function OnlineHub({ children }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
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
    if (!supabase || !user) return;
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      try {
        await supabase.from("player_saves").upsert({ user_id: user.id, save_data: JSON.parse(raw) });
        setStatus("Cloud save synced");
      } catch { setStatus("Cloud sync paused"); }
      return;
    }
    const { data } = await supabase.from("player_saves").select("save_data").eq("user_id", user.id).maybeSingle();
    if (data?.save_data) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data.save_data));
      setStatus("Cloud save restored — reopen the game");
    }
  }, [user]);

  useEffect(() => {
    if (!supabase) return undefined;
    let appUrlListener;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setBooting(false); });
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
    supabase.from("profiles").upsert({
      id: user.id,
      display_name: metadata.full_name || metadata.name || user.email?.split("@")[0] || "Runner",
      avatar_url: metadata.avatar_url || metadata.picture || null,
      last_seen_at: new Date().toISOString(),
    }).then(() => {});
    loadMessages();
    syncSave();
    const channel = supabase.channel("world-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, loadMessages)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, loadMessages)
      .subscribe((state) => setStatus(state === "SUBSCRIBED" ? "Live · Shibuya channel" : "Connecting…"));
    const timer = setInterval(syncSave, 15000);
    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [loadMessages, syncSave, user]);

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

  const avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

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

  return (
    <>
      {children}
      <button className="online-orb" onClick={() => setOpen((v) => !v)} aria-label="Open online hub">
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span>網</span>}
        <i className={user ? "online" : ""} />
      </button>
      {open && <aside className="online-hub" aria-label="Neo-Tokyo online hub">
        <header><div><b>NEO GRID</b><small>{status}</small></div><button onClick={() => setOpen(false)}>×</button></header>
        <>
            <div className="hub-profile">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span>走</span>}<div><b>{user.user_metadata?.full_name || user.email}</b><small>Cloud identity active</small></div><button onClick={() => supabase.auth.signOut()}>Sign out</button></div>
            <div className="hub-channel"><b>SHIBUYA FREQUENCY</b><span>PUBLIC · LIVE</span></div>
            <div className="hub-messages">{messages.length === 0 && <p className="hub-static">No voices on the frequency yet.</p>}{messages.map((m) => <article key={m.id} className={m.user_id === user.id ? "mine" : ""}><img src={m.profiles?.avatar_url || ""} alt="" /><div><b>{m.profiles?.display_name || "Runner"}</b><p>{m.body}</p></div></article>)}<div ref={listEnd} /></div>
            <div className="hub-compose"><input value={message} maxLength={240} placeholder="Broadcast…" onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} /><button onClick={send} disabled={!message.trim() || busy}>送</button></div>
          </>
      </aside>}
    </>
  );
}
