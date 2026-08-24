const LOCAL_PREFIX = "ntu:";

const local = {
  async get(key) {
    const value = localStorage.getItem(LOCAL_PREFIX + key);
    return value == null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, String(value));
    return { key, value: String(value) };
  },
  async delete(key) {
    localStorage.removeItem(LOCAL_PREFIX + key);
    return { key };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const raw = localStorage.key(i);
      if (raw?.startsWith(LOCAL_PREFIX + prefix)) keys.push(raw.slice(LOCAL_PREFIX.length));
    }
    return { keys };
  },
};

export function createStorageBridge({ url, anonKey } = {}) {
  const online = Boolean(url && anonKey);
  const headers = online ? {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  } : {};

  const request = async (path, options = {}) => {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw new Error(`Online storage error ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const shared = {
    async get(key) {
      const rows = await request(`game_kv?key=eq.${encodeURIComponent(key)}&select=key,value&limit=1`);
      return rows?.[0] || null;
    },
    async set(key, value) {
      const rows = await request("game_kv?on_conflict=key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() }),
      });
      return rows?.[0] || { key, value: String(value) };
    },
    async delete(key) {
      await request(`game_kv?key=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
      return { key };
    },
    async list(prefix = "") {
      const rows = await request(`game_kv?key=like.${encodeURIComponent(prefix)}*&select=key&order=key.asc&limit=250`);
      return { keys: (rows || []).map(({ key }) => key) };
    },
  };

  return {
    online,
    get: (key, useShared = false) => useShared ? (online ? shared.get(key) : Promise.reject(new Error("Online mode is not configured"))) : local.get(key),
    set: (key, value, useShared = false) => useShared ? (online ? shared.set(key, value) : Promise.reject(new Error("Online mode is not configured"))) : local.set(key, value),
    delete: (key, useShared = false) => useShared ? (online ? shared.delete(key) : Promise.reject(new Error("Online mode is not configured"))) : local.delete(key),
    list: (prefix, useShared = false) => useShared ? (online ? shared.list(prefix) : Promise.reject(new Error("Online mode is not configured"))) : local.list(prefix),
  };
}
