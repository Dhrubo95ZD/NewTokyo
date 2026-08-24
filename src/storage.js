const ROOT = "ntu:user:";

export function createStorageBridge({ client } = {}) {
  let userId = null;
  let saveTimer = null;
  const sharedCache = new Map();
  const prefix = () => `${ROOT}${userId || "locked"}:`;
  const localKey = (key) => prefix() + key;

  const requireUser = () => {
    if (!client || !userId) throw new Error("Google authentication required");
  };

  const local = {
    async get(key) {
      const cached = localStorage.getItem(localKey(key));
      if (cached != null) return { key, value: cached };
      if (key === "ntu-save-v1" && client && userId) {
        const { data } = await client.from("player_saves").select("save_data").eq("user_id", userId).maybeSingle();
        if (data?.save_data) {
          const value = JSON.stringify(data.save_data);
          localStorage.setItem(localKey(key), value);
          return { key, value };
        }
      }
      return null;
    },
    async set(key, value) {
      localStorage.setItem(localKey(key), String(value));
      if (key === "ntu-save-v1" && client && userId) {
        const owner = userId;
        const saveData = JSON.parse(value);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          if (userId !== owner) return;
          try {
            await client.from("player_saves").upsert({ user_id: owner, save_data: saveData });
          } catch { /* the local authenticated cache remains available for retry */ }
        }, 1800);
      }
      return { key, value: String(value) };
    },
    async delete(key) {
      localStorage.removeItem(localKey(key));
      if (key === "ntu-save-v1" && client && userId) {
        await client.from("player_saves").delete().eq("user_id", userId);
      }
      return { key };
    },
    async list(search = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const raw = localStorage.key(i);
        if (raw?.startsWith(prefix() + search)) keys.push(raw.slice(prefix().length));
      }
      return { keys };
    },
  };

  const chatRows = async () => {
    requireUser();
    const { data, error } = await client.from("chat_messages")
      .select("id,body,created_at,user_id,profiles(display_name)")
      .is("deleted_at", null).order("created_at", { ascending: true }).limit(60);
    if (error) throw error;
    const keys = [];
    for (const row of data || []) {
      const key = `chat:${String(row.id).padStart(16, "0")}`;
      keys.push(key);
      sharedCache.set(key, JSON.stringify({
        h: row.profiles?.display_name || "Runner",
        m: row.body,
        t: new Date(row.created_at).getTime(),
      }));
    }
    return { keys };
  };

  const rankRows = async () => {
    requireUser();
    const { data, error } = await client.from("leaderboard_entries")
      .select("user_id,display_name,level,money,wins,title,evolution,updated_at")
      .order("level", { ascending: false }).order("money", { ascending: false }).limit(40);
    if (error) throw error;
    const keys = [];
    for (const row of data || []) {
      const key = `lb:${row.user_id}`;
      keys.push(key);
      sharedCache.set(key, JSON.stringify({
        h: row.display_name, lvl: row.level, money: Number(row.money), wins: row.wins,
        title: row.title, evo: row.evolution, seen: new Date(row.updated_at).getTime(),
      }));
    }
    return { keys };
  };

  const shared = {
    async get(key) {
      requireUser();
      if (sharedCache.has(key)) return { key, value: sharedCache.get(key) };
      if (key.startsWith("chat:")) { await chatRows(); return sharedCache.has(key) ? { key, value: sharedCache.get(key) } : null; }
      if (key.startsWith("lb:")) { await rankRows(); return sharedCache.has(key) ? { key, value: sharedCache.get(key) } : null; }
      return null;
    },
    async set(key, value) {
      requireUser();
      if (key.startsWith("probe:")) return { key, value };
      const payload = JSON.parse(value);
      if (key.startsWith("chat:")) {
        const { error } = await client.from("chat_messages").insert({ user_id: userId, body: String(payload.m || "").slice(0, 240) });
        if (error) throw error;
      } else if (key.startsWith("lb:")) {
        const { error } = await client.from("leaderboard_entries").upsert({
          user_id: userId,
          display_name: String(payload.h || "Runner").slice(0, 32),
          level: payload.lvl || 1,
          money: Math.max(0, Math.floor(payload.money || 0)),
          wins: Math.max(0, Math.floor(payload.wins || 0)),
          title: payload.title || null,
          evolution: Math.max(0, Math.floor(payload.evo || 0)),
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      sharedCache.set(key, value);
      return { key, value };
    },
    async delete(key) {
      requireUser();
      sharedCache.delete(key);
      return { key };
    },
    async list(search = "") {
      if (search.startsWith("chat:")) return chatRows();
      if (search.startsWith("lb:")) return rankRows();
      if (search.startsWith("bjfeed:")) return { keys: [] };
      if (search.startsWith("probe:")) return { keys: [] };
      return { keys: [] };
    },
  };

  return {
    online: Boolean(client),
    setUser(nextUserId) {
      clearTimeout(saveTimer);
      saveTimer = null;
      userId = nextUserId || null;
      sharedCache.clear();
    },
    getUser: () => userId,
    get: (key, useShared = false) => useShared ? shared.get(key) : local.get(key),
    set: (key, value, useShared = false) => useShared ? shared.set(key, value) : local.set(key, value),
    delete: (key, useShared = false) => useShared ? shared.delete(key) : local.delete(key),
    list: (search, useShared = false) => useShared ? shared.list(search) : local.list(search),
  };
}
