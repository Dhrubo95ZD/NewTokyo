import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import CharacterCreation from "../game/CharacterCreation.jsx";
import { onlineConfigured, supabase } from "./supabase.js";
import AppearanceEditor, { RunnerPortrait } from "./CharacterCreator.jsx";
import Inventory, { getArmoryBonuses, normalizeInventory } from "./ProgressionHub.jsx";
import MasteryBoard from "./MasteryBoard.jsx";
import { masteryBonuses, normalizeMastery, upgradeMastery } from "./masteryRules.js";
import TradingTerminal from "../trading/TradingTerminal.jsx";
import EconomyHub from "../economy/EconomyHub.jsx";
import { normalizeEconomyState } from "../economy/economyRules.js";
import { migrateAccountSave, SAVE_KEY, serializeAccountSave } from "./accountSave.js";
import { validateRunnerIdentity } from "./progressionRules.js";
import { normalizeCombatSkills } from "../game/combatSkills.js";
import { normalizeRaidState } from "../game/raidRules.js";
import { normalizeEndlessState } from "../game/endlessRules.js";
import { normalizeDepthsState } from "../game/neonDepthsRules.js";
import CrewCommand from "../social/CrewCommand.jsx";
import { normalizeCrewState } from "../social/crewRules.js";
import "./online-hub.css";
import "./account-gate.css";
import "./visual-v3-overlays.css";
import "../social/social-tabs.css";

const LEGACY_OWNER_KEY = "ntu:legacy-save-owner";
const nativeRedirect = "com.neotokyo.underworld://auth/callback";
const CHAT_EMOJI = ["😀", "😄", "😂", "🔥", "⚡", "✨", "💯", "👏", "👍", "🤝", "💪", "🎉", "🏆", "🛡️", "⚔️", "💎", "🚀", "❤️"];
const makeUuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
  const value = Math.floor(Math.random() * 16);
  return (char === "x" ? value : (value & 3) | 8).toString(16);
});

export default function OnlineHub({ children }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [accountReady, setAccountReady] = useState(false);
  const [characterProfile, setCharacterProfile] = useState(null);
  const [editingCharacter, setEditingCharacter] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [progressionTab, setProgressionTab] = useState("character");
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [economyOpen, setEconomyOpen] = useState(false);
  const [economyTab, setEconomyTab] = useState("auction");
  const [economyState, setEconomyState] = useState(() => normalizeEconomyState(null));
  const [economyAuthority, setEconomyAuthority] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletAuthority, setWalletAuthority] = useState(false);
  const [inventoryState, setInventoryState] = useState(null);
  const [accountSave, setAccountSave] = useState(null);
  const [armoryAuthority, setArmoryAuthority] = useState(false);
  const [progressionAuthority, setProgressionAuthority] = useState(false);
  const [progressionState, setProgressionState] = useState(null);
  const [raidAuthority, setRaidAuthority] = useState(false);
  const [raidState, setRaidState] = useState(() => normalizeRaidState(null));
  const [endlessAuthority, setEndlessAuthority] = useState(false);
  const [endlessState, setEndlessState] = useState(() => normalizeEndlessState(null));
  const [depthsAuthority, setDepthsAuthority] = useState(false);
  const [depthsState, setDepthsState] = useState(() => normalizeDepthsState(null));
  const [crewAuthority, setCrewAuthority] = useState(false);
  const [crewState, setCrewState] = useState(() => normalizeCrewState(null));
  const [socialTab, setSocialTab] = useState("crew");
  const [campaignAuthority, setCampaignAuthority] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ serverState: "not_started", serverStage: 0 });
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
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
    await persistAccount({ ...accountRef.current, ...patch, meta: { ...(accountRef.current.meta || {}), ...(patch.meta || {}), updatedAt: Date.now() } });
  }, [persistAccount]);

  const saveCombatSkills = useCallback(async (next) => {
    const normalized = normalizeCombatSkills(next, accountRef.current?.core?.level || 1);
    await commitSections({ meta: { combatSkills: normalized } });
    return normalized;
  }, [commitSections]);

  useEffect(() => {
    if (!supabase) return undefined;
    let appUrlListener;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next?.user) { window.storage.setUser(null); accountRef.current = null; setAccountSave(null); setArmoryAuthority(false); setProgressionAuthority(false); setProgressionState(null); setRaidAuthority(false); setRaidState(normalizeRaidState(null)); setEndlessAuthority(false); setEndlessState(normalizeEndlessState(null)); setDepthsAuthority(false); setDepthsState(normalizeDepthsState(null)); setCrewAuthority(false); setCrewState(normalizeCrewState(null)); setCampaignAuthority(false); setWalletAuthority(false); setWalletBalance(null); setCampaignProgress({ serverState: "not_started", serverStage: 0 }); setAccountReady(false); setCharacterProfile(null); setEditingCharacter(false); setInventoryOpen(false); setMasteryOpen(false); setExchangeOpen(false); setEconomyOpen(false); setEconomyAuthority(false); setEconomyState(normalizeEconomyState(null)); setInventoryState(null); }
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
      const { data: serverProgression, error: progressionError } = await supabase.rpc("get_my_progression_state");
      if (!progressionError && serverProgression) { setProgressionState(serverProgression); setProgressionAuthority(true); }
      else { setProgressionState(null); setProgressionAuthority(false); }
      const { data: serverRaid, error: raidError } = await supabase.rpc("get_my_raid_state");
      if (!raidError && serverRaid) { setRaidState(normalizeRaidState(serverRaid)); setRaidAuthority(true); }
      else { setRaidState(normalizeRaidState(null)); setRaidAuthority(false); }
      const { data: serverEndless, error: endlessError } = await supabase.rpc("get_my_endless_state");
      if (!endlessError && serverEndless) { setEndlessState(normalizeEndlessState(serverEndless)); setEndlessAuthority(true); }
      else { setEndlessState(normalizeEndlessState(null)); setEndlessAuthority(false); }
      const { data: serverDepths, error: depthsError } = await supabase.rpc("get_my_neon_depths_state");
      if (!depthsError && serverDepths) { setDepthsState(normalizeDepthsState(serverDepths)); setDepthsAuthority(true); }
      else { setDepthsState(normalizeDepthsState(null)); setDepthsAuthority(false); }
      const { data: serverCrew, error: crewError } = await supabase.rpc("get_my_crew_state");
      if (!crewError && serverCrew) { setCrewState(normalizeCrewState(serverCrew)); setCrewAuthority(true); }
      else { setCrewState(normalizeCrewState(null)); setCrewAuthority(false); }
      const { data: serverEconomy, error: economyError } = await supabase.rpc("get_my_economy_state");
      if (!economyError && serverEconomy) { setEconomyState(normalizeEconomyState(serverEconomy)); setEconomyAuthority(true); }
      else { setEconomyState(normalizeEconomyState(null)); setEconomyAuthority(false); }
      const localCampaign = nextSave.meta?.districtOne || {};
      let nextCampaign = { ...localCampaign, serverState: localCampaign.serverState || "not_started", serverStage: localCampaign.serverStage || 0 };
      const { data: serverCampaign, error: campaignError } = await supabase.rpc("get_my_campaign_progress");
      if (!campaignError) {
        setCampaignAuthority(true);
        if (serverCampaign) nextCampaign = { ...localCampaign, serverState: serverCampaign.state, serverStage: serverCampaign.stage, completedAt: serverCampaign.completedAt, rewardClaimedAt: serverCampaign.rewardClaimedAt, receipt: serverCampaign.receipt };
        else if (nextSave.character) {
          const role = nextSave.character.archetype || nextSave.character.role || "striker";
          const identity = validateRunnerIdentity({ codename: nextSave.character.codename, role });
          if (identity.ok) {
            const { error: identityError } = await supabase.rpc("set_my_runner_identity", {
              p_codename: identity.value.codename, p_role: identity.value.role,
            });
            if (!identityError) nextCampaign = { ...localCampaign, serverState: "not_started", serverStage: 0 };
          }
        }
      } else setCampaignAuthority(false);
      const { data: walletState, error: walletError } = await supabase.rpc("get_my_exchange_state");
      if (!walletError && walletState) {
        const authoritativeBalance = Math.max(0, Number(walletState.balance) || 0);
        nextSave.core = { ...(nextSave.core || {}), money: authoritativeBalance };
        setWalletBalance(authoritativeBalance);
        setWalletAuthority(true);
      } else {
        setWalletBalance(Math.max(0, Number(nextSave.core?.money) || 0));
        setWalletAuthority(false);
      }
      const identityName = nextSave.character?.codename || nextSave.core?.name || displayName;
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id, display_name: identityName.slice(0, 32),
        avatar_url: metadata.avatar_url || metadata.picture || null,
        last_seen_at: new Date().toISOString(),
      });
      if (profileError) { setStatus(profileError.message); return; }
      nextSave.core = { ...nextSave.core, handle: nextSave.character?.codename || nextSave.core?.handle || handle, name: identityName.slice(0, 24), onlineUserId: user.id };
      await persistAccount(nextSave);
      if (!cancelled) { setCharacterProfile(nextSave.character || null); setInventoryState(nextSave.armory); setCampaignProgress(nextCampaign); setAccountReady(true); setStatus("Online · account save synced"); }
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

  const addEmoji = (emoji) => {
    setMessage((current) => `${current}${emoji}`.slice(0, 240));
    setEmojiOpen(false);
  };

  const saveCharacter = async (profile) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const role = profile.archetype || profile.role || "striker";
      const identity = validateRunnerIdentity({ codename: profile.codename, role });
      if (!identity.ok) throw new Error(identity.error);
      if (campaignAuthority) {
        const { error: identityError } = await supabase.rpc("set_my_runner_identity", {
          p_codename: identity.value.codename, p_role: identity.value.role,
        });
        if (identityError) throw identityError;
      }
      const existingCore = accountRef.current?.core || {};
      const starterStats = {
        striker: { str: 8, def: 5, spd: 7, dex: 3 },
        guardian: { str: 5, def: 9, spd: 4, dex: 5 },
        technician: { str: 4, def: 5, spd: 6, dex: 9 },
      }[role] || { str: 5, def: 5, spd: 5, dex: 5 };
      const core = {
        ...existingCore,
        ...(!characterProfile && !existingCore.stats ? { stats: starterStats } : {}),
        handle: profile.codename, name: profile.codename, onlineUserId: user.id,
      };
      await commitSections({ character: profile, core, meta: { districtOne: campaignProgress } });
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

  const saveCampaign = useCallback(async (next) => {
    setCampaignProgress(next);
    try { await commitSections({ meta: { districtOne: next } }); }
    catch (error) { setStatus(error.message || "Campaign sync paused"); }
  }, [commitSections]);

  const completeCampaign = useCallback(async (next, reward) => {
    const current = accountRef.current;
    if (!current || current.meta?.districtOneGranted) return;
    const core = { ...(current.core || {}) };
    core.money = Math.max(0, Number(core.money) || 0) + Math.max(0, Number(reward?.credits) || 0);
    core.xp = Math.max(0, Number(core.xp) || 0) + Math.max(0, Number(reward?.xp) || 0);
    core.level = Math.max(1, Number(core.level) || 1);
    core.statPoints = Math.max(0, Number(core.statPoints) || 0);
    while (core.xp >= core.level * 100) {
      core.xp -= core.level * 100; core.level += 1; core.statPoints += 5;
    }
    await commitSections({ core, meta: { districtOne: next, districtOneGranted: true } });
    setStatus("District One complete · city progression unlocked");
  }, [commitSections]);

  const saveCore = useCallback(async (core) => {
    if (!accountRef.current) return;
    const { armoryBonuses: _derived, ...persistedCore } = core;
    try {
      let nextCore = { ...persistedCore, onlineUserId: user.id };
      if (walletAuthority) {
        const previousMoney = Math.max(0, Number(accountRef.current.core?.money) || 0);
        const requestedMoney = Math.max(0, Number(persistedCore.money) || 0);
        const delta = Math.round(requestedMoney - previousMoney);
        if (delta !== 0) {
          const { data, error } = await supabase.rpc("apply_game_wallet_delta", {
            p_delta: delta,
            p_event: "core_progress",
            p_idempotency: makeUuid(),
          });
          if (error) throw error;
          nextCore.money = Math.max(0, Number(data?.balance) || 0);
          setWalletBalance(nextCore.money);
        } else nextCore.money = previousMoney;
      }
      await commitSections({ core: nextCore });
    }
    catch (error) { setStatus(error.message || "Progress sync paused"); }
  }, [commitSections, user, walletAuthority]);

  const acceptExchangeBalance = useCallback(async (nextBalance) => {
    const amount = Math.max(0, Number(nextBalance) || 0);
    setWalletBalance(amount);
    if (!accountRef.current) return;
    await commitSections({ core: { ...(accountRef.current.core || {}), money: amount, onlineUserId: user.id } });
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

  const startDistrictOne = useCallback(async () => {
    if (campaignAuthority) {
      const { data, error } = await supabase.rpc("start_district_one");
      if (error) throw error;
      const next = { ...campaignProgress, serverState: data?.state || "active", serverStage: data?.stage || 0, serverToken: data?.token || campaignProgress.serverToken || null };
      setCampaignProgress(next);
      return next;
    }
    const legacy = await startDistrictRun();
    const next = { ...campaignProgress, serverState: "active", serverStage: 0, serverToken: legacy?.token || null, compatibilityMode: true };
    setCampaignProgress(next);
    await commitSections({ meta: { districtOne: next } });
    return next;
  }, [campaignAuthority, campaignProgress, commitSections, startDistrictRun]);

  const advanceDistrictOne = useCallback(async (token, checkpoint) => {
    if (campaignAuthority) {
      const { data, error } = await supabase.rpc("advance_district_one", { p_token: token, p_checkpoint: checkpoint });
      if (error) throw error;
      const next = { ...campaignProgress, serverState: data?.state || "active", serverStage: data?.stage || 0, serverToken: token };
      setCampaignProgress(next);
      return next;
    }
    const stage = { arrival: 1, skirmish: 2, boss: 3 }[checkpoint] || 0;
    if (!stage || stage !== Number(campaignProgress.serverStage || 0) + 1) throw new Error("Campaign checkpoint out of order");
    const next = { ...campaignProgress, serverState: stage === 3 ? "completed" : "active", serverStage: stage, serverToken: token };
    setCampaignProgress(next);
    await commitSections({ meta: { districtOne: next } });
    return next;
  }, [campaignAuthority, campaignProgress, commitSections]);

  const claimDistrictOne = useCallback(async (token, weaponId = null) => {
    if (campaignAuthority) {
      const { data, error } = await supabase.rpc("claim_first_campaign_reward", { p_token: token, p_weapon_id: weaponId });
      if (error) throw error;
      const nextArmory = normalizeInventory(data?.armoryState || inventoryState);
      const next = { ...campaignProgress, serverState: "reward_claimed", serverStage: 3, rewardClaimedAt: Date.now(), receipt: data?.receipt || null };
      setInventoryState(nextArmory); setCampaignProgress(next);
      await commitSections({ armory: nextArmory, meta: { districtOne: next } });
      setStatus("District One secured · reward synced");
      return { ...data, state: next, armoryState: nextArmory };
    }
    const result = await completeDistrictRun(token);
    const rewardItemId = weaponId || result?.drop?.id;
    const compatibilityArmory = normalizeInventory(result?.state || inventoryState);
    const nextArmory = normalizeInventory({
      ...compatibilityArmory,
      equipped: { ...compatibilityArmory.equipped, weapon: rewardItemId },
      tutorialStep: Math.max(Number(compatibilityArmory.tutorialStep || 0), 2),
    });
    const next = { ...campaignProgress, serverState: "reward_claimed", serverStage: 3, rewardClaimedAt: Date.now(), compatibilityMode: true };
    setInventoryState(nextArmory); setCampaignProgress(next);
    await commitSections({ armory: nextArmory, meta: { districtOne: next } });
    setStatus("District One secured · reward synced");
    return { reward: { itemId: rewardItemId }, state: next, armoryState: nextArmory, drop: result?.drop };
  }, [campaignAuthority, campaignProgress, commitSections, completeDistrictRun, inventoryState]);

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

  const refreshProgression = useCallback(async () => {
    if (!progressionAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_progression_state");
    if (error) throw error;
    setProgressionState(data);
    return data;
  }, [progressionAuthority]);

  const manageArmory = useCallback(async (equipped, itemIds = [], mode = "equip") => {
    if (!progressionAuthority) throw new Error("Run the Progression Hub migration in Supabase first");
    const { data, error } = await supabase.rpc("manage_my_armory", { p_equipped: equipped, p_item_ids: itemIds, p_mode: mode });
    if (error) throw error;
    const nextArmory = normalizeInventory(data?.state || inventoryState);
    setInventoryState(nextArmory);
    const patch = { armory: nextArmory };
    if (data?.balance != null && accountRef.current) {
      const balance = Math.max(0, Number(data.balance) || 0);
      patch.core = { ...(accountRef.current.core || {}), money: balance };
      setWalletBalance(balance);
    }
    await commitSections(patch);
    await refreshProgression();
    setStatus(mode === "salvage" ? `Recovered ${data?.shards || 0} Nano Shards` : mode === "sell" ? `Sold gear for ¥${Number(data?.yen || 0).toLocaleString()}` : "Best loadout equipped");
    return { ...data, state: nextArmory };
  }, [commitSections, inventoryState, progressionAuthority, refreshProgression]);

  const runProgressionAction = useCallback(async (rpc, args = {}) => {
    if (!progressionAuthority) throw new Error("Run the Progression Hub migration in Supabase first");
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (data?.state) {
      const nextArmory = normalizeInventory(data.state);
      setInventoryState(nextArmory);
      await commitSections({ armory: nextArmory });
    }
    await refreshProgression();
    return data;
  }, [commitSections, progressionAuthority, refreshProgression]);

  const startAfkDungeon = useCallback((dungeonId) => runProgressionAction("start_afk_dungeon", { p_dungeon_id: dungeonId }), [runProgressionAction]);
  const claimAfkDungeon = useCallback(() => runProgressionAction("claim_afk_dungeon"), [runProgressionAction]);
  const queueCoopDungeon = useCallback((dungeonId) => runProgressionAction("queue_coop_dungeon", { p_dungeon_id: dungeonId }), [runProgressionAction]);
  const createCoopRoom = useCallback((dungeonId, visibility = "public") => runProgressionAction("create_coop_room", { p_dungeon_id: dungeonId, p_visibility: visibility }), [runProgressionAction]);
  const joinCoopRoom = useCallback((roomCode) => runProgressionAction("join_coop_room", { p_room_code: roomCode }), [runProgressionAction]);
  const listCoopRooms = useCallback(async (dungeonId) => {
    if (!progressionAuthority) throw new Error("Run the co-op rooms migration in Supabase first");
    const { data, error } = await supabase.rpc("list_coop_rooms", { p_dungeon_id: dungeonId });
    if (error) throw error;
    return data || [];
  }, [progressionAuthority]);
  const leaveCoopDungeon = useCallback(() => runProgressionAction("leave_coop_dungeon"), [runProgressionAction]);
  const claimCoopDungeon = useCallback(() => runProgressionAction("claim_coop_dungeon"), [runProgressionAction]);

  const refreshRaid = useCallback(async () => {
    if (!raidAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_raid_state");
    if (error) throw error;
    const next = normalizeRaidState(data);
    setRaidState(next);
    return next;
  }, [raidAuthority]);

  const runRaidAction = useCallback(async (rpc, args = {}) => {
    if (!raidAuthority) throw new Error("Run the Raid Specializations migration in Supabase first");
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (data?.armory) {
      const nextArmory = normalizeInventory(data.armory);
      setInventoryState(nextArmory);
      await commitSections({ armory: nextArmory });
    }
    await refreshRaid();
    await refreshProgression();
    return data;
  }, [commitSections, raidAuthority, refreshProgression, refreshRaid]);

  const setRaidSpecialization = useCallback((specialization) => runRaidAction("set_my_raid_specialization", { p_specialization: specialization }), [runRaidAction]);
  const queueRaid = useCallback((raidId, allowBots = false) => runRaidAction("queue_raid", { p_raid_id: raidId, p_allow_bots: allowBots }), [runRaidAction]);
  const joinRaid = useCallback((roomCode) => runRaidAction("join_raid_room", { p_room_code: roomCode }), [runRaidAction]);
  const fillRaidBots = useCallback(() => runRaidAction("fill_raid_with_bots"), [runRaidAction]);
  const advanceRaid = useCallback((action) => runRaidAction("advance_raid_phase", { p_action: action }), [runRaidAction]);
  const claimRaid = useCallback(() => runRaidAction("claim_raid_rewards"), [runRaidAction]);
  const leaveRaid = useCallback(() => runRaidAction("leave_raid_room"), [runRaidAction]);

  const refreshEndless = useCallback(async () => {
    if (!endlessAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_endless_state");
    if (error) throw error;
    const next = normalizeEndlessState(data); setEndlessState(next); return next;
  }, [endlessAuthority]);
  const runEndlessAction = useCallback(async (rpc, args = {}) => {
    if (!endlessAuthority) throw new Error("Run the Runner Crews + Endless SQL migration first");
    const { data, error } = await supabase.rpc(rpc, args); if (error) throw error;
    if (data?.armory) { const armory = normalizeInventory(data.armory); setInventoryState(armory); await commitSections({ armory }); }
    const rawState = data?.state || data; if (rawState) setEndlessState(normalizeEndlessState(rawState));
    return data;
  }, [commitSections, endlessAuthority]);
  const startEndless = useCallback((stage) => runEndlessAction("start_endless_grind", { p_stage: stage }), [runEndlessAction]);
  const stopEndless = useCallback(() => runEndlessAction("stop_endless_grind"), [runEndlessAction]);
  const resolveEndless = useCallback(() => runEndlessAction("resolve_endless_grind"), [runEndlessAction]);

  const refreshDepths = useCallback(async () => {
    if (!depthsAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_neon_depths_state");
    if (error) throw error;
    const next = normalizeDepthsState(data); setDepthsState(next); return next;
  }, [depthsAuthority]);
  const runDepthsAction = useCallback(async (rpc, args = {}) => {
    if (!depthsAuthority) throw new Error("Run the Neon Depths SQL migration first");
    const { data, error } = await supabase.rpc(rpc, args); if (error) throw error;
    if (data?.armory) { const armory = normalizeInventory(data.armory); setInventoryState(armory); await commitSections({ armory }); }
    const rawState = data?.state || data; if (rawState) setDepthsState(normalizeDepthsState(rawState));
    return data;
  }, [commitSections, depthsAuthority]);
  const startDepths = useCallback((tier, partyMode) => runDepthsAction("start_neon_depths", { p_tier: tier, p_party_mode: partyMode }), [runDepthsAction]);
  const advanceDepths = useCallback((runId, roomIndex, outcome, choice) => runDepthsAction("advance_neon_depths", { p_run_id: runId, p_room_index: roomIndex, p_outcome: outcome, p_choice: choice }), [runDepthsAction]);
  const extractDepths = useCallback((runId) => runDepthsAction("extract_neon_depths", { p_run_id: runId }), [runDepthsAction]);
  const abandonDepths = useCallback((runId) => runDepthsAction("abandon_neon_depths", { p_run_id: runId }), [runDepthsAction]);

  const refreshCrew = useCallback(async () => {
    if (!crewAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_crew_state"); if (error) throw error;
    const next = normalizeCrewState(data); setCrewState(next); return next;
  }, [crewAuthority]);
  const runCrewAction = useCallback(async (rpc, args = {}) => {
    if (!crewAuthority) throw new Error("Run the Runner Crews + Endless SQL migration first");
    const { data, error } = await supabase.rpc(rpc, args); if (error) throw error;
    if (data?.armory) { const armory = normalizeInventory(data.armory); setInventoryState(armory); await commitSections({ armory }); }
    if (data?.balance != null && accountRef.current) { const balance = Number(data.balance) || 0; setWalletBalance(balance); await commitSections({ core: { ...accountRef.current.core, money: balance } }); }
    const rawState = data?.crewState || data; if (rawState) setCrewState(normalizeCrewState(rawState));
    return data;
  }, [commitSections, crewAuthority]);
  const createCrew = useCallback((name, tag, color) => runCrewAction("create_runner_crew", { p_name: name, p_tag: tag, p_color: color }), [runCrewAction]);
  const joinCrew = useCallback((crewId) => runCrewAction("join_runner_crew", { p_crew_id: crewId }), [runCrewAction]);
  const leaveCrew = useCallback(() => runCrewAction("leave_runner_crew"), [runCrewAction]);
  const contributeCrisis = useCallback((track) => runCrewAction("contribute_city_crisis", { p_track: track }), [runCrewAction]);
  const strikeCrisis = useCallback(() => runCrewAction("strike_city_crisis"), [runCrewAction]);
  const claimCrisis = useCallback(() => runCrewAction("claim_city_crisis_reward"), [runCrewAction]);

  const refreshEconomy = useCallback(async () => {
    if (!economyAuthority) return null;
    const { data, error } = await supabase.rpc("get_my_economy_state");
    if (error) throw error;
    const next = normalizeEconomyState(data);
    setEconomyState(next);
    return next;
  }, [economyAuthority]);

  const runEconomyAction = useCallback(async (rpc, args = {}) => {
    if (!economyAuthority) throw new Error("Run the Neo Economy migration in Supabase first");
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (data?.armory) {
      const nextArmory = normalizeInventory(data.armory);
      setInventoryState(nextArmory);
      await commitSections({ armory: nextArmory });
    }
    if (data?.balance != null && accountRef.current) {
      const nextBalance = Math.max(0, Number(data.balance) || 0);
      setWalletBalance(nextBalance);
      await commitSections({ core: { ...(accountRef.current.core || {}), money: nextBalance } });
    }
    await refreshEconomy();
    return data;
  }, [commitSections, economyAuthority, refreshEconomy]);
  const startLifeSkill = useCallback((skill) => runEconomyAction("start_life_skill_job", { p_skill: skill }), [runEconomyAction]);
  const claimLifeSkill = useCallback((jobId) => runEconomyAction("claim_life_skill_job", { p_job_id: jobId }), [runEconomyAction]);
  const craftRecipe = useCallback((recipeId) => runEconomyAction("craft_economy_recipe", { p_recipe_id: recipeId }), [runEconomyAction]);
  const listAuction = useCallback((itemId, price) => runEconomyAction("create_auction_listing", { p_item_id: itemId, p_price: price, p_hours: 24 }), [runEconomyAction]);
  const buyAuction = useCallback((listingId) => runEconomyAction("buy_auction_listing", { p_listing_id: listingId }), [runEconomyAction]);
  const cancelAuction = useCallback((listingId) => runEconomyAction("cancel_auction_listing", { p_listing_id: listingId }), [runEconomyAction]);

  const investMastery = useCallback(async (nodeId) => {
    if (!accountRef.current) return;
    const current = normalizeMastery(accountRef.current.meta?.mastery);
    const next = upgradeMastery(current, nodeId, accountRef.current.core?.level || 1);
    if (JSON.stringify(next) === JSON.stringify(current)) throw new Error("That mastery is locked or already complete");
    await commitSections({ meta: { mastery: next } });
    setStatus("Mastery upgraded · combat profile refreshed");
  }, [commitSections]);

  useEffect(() => {
    if (!supabase || !user || !progressionAuthority) return undefined;
    const channel = supabase.channel(`progression-${user.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"dungeon_parties" }, refreshProgression)
      .on("postgres_changes", { event:"*", schema:"public", table:"dungeon_party_members" }, refreshProgression)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, progressionAuthority, refreshProgression]);

  useEffect(() => {
    if (!supabase || !user || !raidAuthority) return undefined;
    const channel = supabase.channel(`raids-${user.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"raid_parties" }, refreshRaid)
      .on("postgres_changes", { event:"*", schema:"public", table:"raid_party_members" }, refreshRaid)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, raidAuthority, refreshRaid]);

  useEffect(() => {
    if (!supabase || !user || !economyAuthority) return undefined;
    const channel = supabase.channel(`economy-${user.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"auction_listings" }, refreshEconomy)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, economyAuthority, refreshEconomy]);

  useEffect(() => {
    if (!supabase || !user || !crewAuthority) return undefined;
    const channel = supabase.channel(`crew-${user.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"runner_crew_members" }, refreshCrew)
      .on("postgres_changes", { event:"*", schema:"public", table:"crew_crisis_progress" }, refreshCrew)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, crewAuthority, refreshCrew]);

  const armoryBonuses = useMemo(() => {
    const gear = getArmoryBonuses(inventoryState, characterProfile);
    const mastery = masteryBonuses(accountSave?.meta?.mastery);
    return { ...gear, ...Object.fromEntries(Object.keys(mastery).map((key)=>[key,Number(gear[key]||0)+Number(mastery[key]||0)])), score:Number(gear.score||0)+mastery.str+mastery.def+mastery.spd+mastery.dex };
  }, [inventoryState, characterProfile, accountSave?.meta?.mastery]);

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

  if (!characterProfile) return <CharacterCreation initial={null} onComplete={saveCharacter} busy={busy} />;
  if (editingCharacter) return <AppearanceEditor initial={characterProfile} onSave={saveCharacter} onCancel={() => setEditingCharacter(false)} saving={busy} />;

  return (
    <>
      {isValidElement(children) ? cloneElement(children, {
        initialPlayer: accountSave?.core || null,
        armoryBonuses,
        armoryProgress: inventoryState?.tutorialStep || 0,
        onPlayerChange: saveCore,
        onOpenBattle: () => { setOpen(false); setMasteryOpen(false); setExchangeOpen(false); setProgressionTab("journey"); setInventoryOpen(true); },
        onOpenArmory: () => { setOpen(false); setMasteryOpen(false); setExchangeOpen(false); setProgressionTab("character"); setInventoryOpen(true); },
        onOpenMastery: () => { setOpen(false); setInventoryOpen(false); setExchangeOpen(false); setMasteryOpen(true); },
        onOpenSocial: () => { setInventoryOpen(false); setSocialTab("crew"); setOpen(true); },
        onOpenTrading: () => { setOpen(false); setInventoryOpen(false); setExchangeOpen(true); },
        onOpenEconomy: (tab = "auction") => { setOpen(false); setInventoryOpen(false); setMasteryOpen(false); setExchangeOpen(false); setEconomyTab(tab); setEconomyOpen(true); },
        onNavigate: (destination) => {
          setOpen(false); setEmojiOpen(false);
          if (destination !== "fights" && destination !== "loadout") setInventoryOpen(false);
          if (destination !== "economy") setEconomyOpen(false);
          setMasteryOpen(false); setExchangeOpen(false);
        },
        walletBalance,
      }) : children}
      <TradingTerminal open={exchangeOpen} balance={walletBalance ?? accountSave?.core?.money ?? 0} onClose={() => setExchangeOpen(false)} onWalletChange={acceptExchangeBalance} />
      <EconomyHub key={economyTab} open={economyOpen} initialTab={economyTab} state={economyAuthority ? economyState : null} inventory={inventoryState} balance={walletBalance ?? accountSave?.core?.money ?? 0} busy={busy} onClose={() => setEconomyOpen(false)} onRefresh={refreshEconomy} onStartSkill={startLifeSkill} onClaimSkill={claimLifeSkill} onCraft={craftRecipe} onList={listAuction} onBuy={buyAuction} onCancel={cancelAuction} />
      {masteryOpen && <div className="mastery-overlay"><MasteryBoard value={accountSave?.meta?.mastery} level={accountSave?.core?.level || 1} busy={busy} onUpgrade={investMastery} onClose={() => setMasteryOpen(false)} /></div>}
      {inventoryOpen && <Inventory initialTab={progressionTab} profile={characterProfile} player={accountSave?.core || {}} value={inventoryState} masteryStats={masteryBonuses(accountSave?.meta?.mastery)} combatSkills={accountSave?.meta?.combatSkills} onCombatSkillsChange={saveCombatSkills} onChange={saveInventory} onPlayerChange={saveCore} onClose={() => setInventoryOpen(false)} onStartRun={armoryAuthority ? startDistrictRun : null} onCompleteRun={armoryAuthority ? completeDistrictRun : null} onSaveLoadout={armoryAuthority ? saveArmoryLoadout : null} onEnhanceItem={armoryAuthority ? enhanceArmoryItem : null} progressionState={progressionState} onManageArmory={progressionAuthority ? manageArmory : null} onStartAfk={progressionAuthority ? startAfkDungeon : null} onClaimAfk={progressionAuthority ? claimAfkDungeon : null} onQueueCoop={progressionAuthority ? queueCoopDungeon : null} onCreateCoopRoom={progressionAuthority ? createCoopRoom : null} onJoinCoopRoom={progressionAuthority ? joinCoopRoom : null} onListCoopRooms={progressionAuthority ? listCoopRooms : null} onLeaveCoop={progressionAuthority ? leaveCoopDungeon : null} onClaimCoop={progressionAuthority ? claimCoopDungeon : null} onRefreshProgression={progressionAuthority ? refreshProgression : null} raidState={raidState} onSetRaidSpecialization={raidAuthority ? setRaidSpecialization : null} onQueueRaid={raidAuthority ? queueRaid : null} onJoinRaid={raidAuthority ? joinRaid : null} onFillRaidBots={raidAuthority ? fillRaidBots : null} onAdvanceRaid={raidAuthority ? advanceRaid : null} onClaimRaid={raidAuthority ? claimRaid : null} onLeaveRaid={raidAuthority ? leaveRaid : null} onRefreshRaid={raidAuthority ? refreshRaid : null} endlessState={endlessAuthority ? endlessState : null} onStartEndless={endlessAuthority ? startEndless : null} onStopEndless={endlessAuthority ? stopEndless : null} onResolveEndless={endlessAuthority ? resolveEndless : null} onRefreshEndless={endlessAuthority ? refreshEndless : null} depthsState={depthsAuthority ? depthsState : null} onStartDepths={depthsAuthority ? startDepths : null} onAdvanceDepths={depthsAuthority ? advanceDepths : null} onExtractDepths={depthsAuthority ? extractDepths : null} onAbandonDepths={depthsAuthority ? abandonDepths : null} onRefreshDepths={depthsAuthority ? refreshDepths : null} campaignValue={campaignProgress} onCampaignChange={saveCampaign} onStartCampaign={startDistrictOne} onCampaignCheckpoint={advanceDistrictOne} onClaimCampaign={claimDistrictOne} onCalibrateCampaign={armoryAuthority ? enhanceArmoryItem : null} onCampaignComplete={completeCampaign} />}
      <button className="online-orb" onClick={() => { setEmojiOpen(false); setOpen((v) => !v); }} aria-label="Open online hub">
        <RunnerPortrait profile={characterProfile} compact />
        <i className={user ? "online" : ""} />
      </button>
      {open && <aside className={`online-hub ${socialTab === "crew" ? "crew-view" : "chat-view"}`} aria-label="Neo-Tokyo online hub">
        <header><div><b>NEO GRID</b><small>{status}</small></div><button onClick={() => { setEmojiOpen(false); setOpen(false); }}>×</button></header>
        <>
            <div className="hub-profile"><RunnerPortrait profile={characterProfile} compact /><div><b>{characterProfile.codename}</b><small>{user.email}</small></div><button onClick={() => { setOpen(false); setProgressionTab("character"); setInventoryOpen(true); }}>Loadout</button><button onClick={() => { setOpen(false); setMasteryOpen(true); }}>Mastery</button><button onClick={() => setEditingCharacter(true)}>Edit</button><button onClick={() => supabase.auth.signOut()}>Exit</button></div>
            <nav className="social-mode-tabs" aria-label="Social sections"><button className={socialTab==="crew"?"active":""} onClick={()=>{setEmojiOpen(false);setSocialTab("crew")}}>隊 <span>Crew</span></button><button className={socialTab==="chat"?"active":""} onClick={()=>setSocialTab("chat")}>網 <span>Chat</span></button></nav>
            {socialTab === "crew" ? <CrewCommand state={crewAuthority ? crewState : null} busy={busy} onCreate={createCrew} onJoin={joinCrew} onLeave={leaveCrew} onContribute={contributeCrisis} onStrike={strikeCrisis} onClaim={claimCrisis} onRefresh={refreshCrew}/> : <>
              <div className="hub-channel"><b>SHIBUYA FREQUENCY</b><span>PUBLIC · LIVE</span></div>
              <div className="hub-messages">{messages.length === 0 && <p className="hub-static">No voices on the frequency yet.</p>}{messages.map((m) => <article key={m.id} className={m.user_id === user.id ? "mine" : ""}><img src={m.profiles?.avatar_url || ""} alt="" /><div><b>{m.profiles?.display_name || "Runner"}</b><p>{m.body}</p></div></article>)}<div ref={listEnd} /></div>
              <div className="hub-compose-wrap">{emojiOpen && <div className="emoji-tray" role="listbox" aria-label="Chat emoticons">{CHAT_EMOJI.map((emoji) => <button key={emoji} type="button" onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>)}</div>}<div className="hub-compose"><button className="emoji-toggle" type="button" onClick={() => setEmojiOpen((value) => !value)} aria-expanded={emojiOpen} aria-label="Choose emoticon">☺</button><input value={message} maxLength={240} placeholder="Broadcast…" onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} /><button className="chat-send" onClick={send} disabled={!message.trim() || busy}>送</button></div></div>
            </>}
          </>
      </aside>}
    </>
  );
}
