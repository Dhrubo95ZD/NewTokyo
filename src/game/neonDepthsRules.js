export const DEPTHS_ROOM_TYPES = ["combat", "shootout", "breach", "salvage"];

const hashSeed = (value) => {
  let hash = 2166136261;
  for (const char of String(value || "neon-depths")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const rngFor = (seed) => {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

export const depthsRecommendedCp = (tier = 1) => Math.round(420 * Math.pow(Math.max(1, Number(tier) || 1), 1.48));

export function generateDepthsRoute(seed, tier = 1) {
  const random = rngFor(`${seed}:${tier}`);
  const length = Math.min(12, 7 + Math.floor(Math.max(1, tier) / 3));
  const route = Array.from({ length }, (_, index) => {
    const type = index === length - 1 ? "boss" : index === 0 ? "combat" : DEPTHS_ROOM_TYPES[Math.floor(random() * DEPTHS_ROOM_TYPES.length)];
    const elite = type !== "boss" && index > 1 && random() > .76;
    return {
      index,
      type,
      elite,
      canExtract: index > 0 && (index % 3 === 2 || index === length - 1),
      accent: ["cyan", "magenta", "amber", "violet"][Math.floor(random() * 4)],
      branch: random() > .5 ? "Freight Spine" : "Flooded Relay",
    };
  });
  return route;
}

export const DEPTHS_OBJECTIVES = {
  combat: { label: "Clear the chamber", detail: "Close-range raiders are converging.", enemies: 3 },
  shootout: { label: "Break the firing line", detail: "Use pulse fire and cover movement.", enemies: 4 },
  breach: { label: "Solve the circuit breach", detail: "Activate the three relays in sequence.", enemies: 0 },
  salvage: { label: "Recover deep salvage", detail: "Secure every glowing cache before moving on.", enemies: 0 },
  boss: { label: "Defeat the Depths Warden", detail: "Read the telegraph, shield, then counterattack.", enemies: 1 },
};

export const normalizeDepthsState = (raw) => {
  const source = raw?.state || raw || {};
  const tier = Math.max(1, Number(source.tier) || 1);
  const seed = source.seed || source.runSeed || "preview-091";
  const route = Array.isArray(source.route) && source.route.length ? source.route : generateDepthsRoute(seed, tier);
  const roomIndex = Math.max(0, Math.min(route.length - 1, Number(source.roomIndex ?? source.room_index) || 0));
  return {
    authority: Boolean(source.authority),
    active: Boolean(source.active || source.status === "active"),
    id: source.id || source.runId || null,
    status: source.status || "idle",
    seed,
    tier,
    route,
    roomIndex,
    currentRoom: route[roomIndex],
    backpack: Array.isArray(source.backpack) ? source.backpack : [],
    partyMode: source.partyMode || source.party_mode || "solo",
    bots: Math.max(0, Number(source.bots) || 0),
    highestTier: Math.max(1, Number(source.highestTier ?? source.highest_tier) || 1),
    extractions: Math.max(0, Number(source.extractions) || 0),
    recommendedCp: Number(source.recommendedCp) || depthsRecommendedCp(tier),
  };
};

export const roomRewardPreview = (room, tier = 1) => {
  const rarity = room?.type === "boss" ? "apex" : room?.elite ? "legendary" : room?.type === "breach" ? "rare" : "uncommon";
  return {
    id: `${room?.type || "cache"}-${room?.index || 0}`,
    name: room?.type === "boss" ? "Warden Apex Cache" : room?.type === "breach" ? "Encrypted Circuit" : room?.type === "salvage" ? "Depths Salvage" : room?.elite ? "Elite Equipment Cache" : "Recovered Equipment",
    rarity,
    quantity: Math.max(1, Math.ceil(Number(tier) / 3)),
  };
};
