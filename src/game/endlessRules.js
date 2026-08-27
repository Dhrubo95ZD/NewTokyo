export const ENDLESS_TICK_SECONDS = 30;

export const endlessStageRequirement = (stage = 1) => Math.round(90 * Math.pow(Math.max(1, Number(stage) || 1), 1.42));

export const normalizeEndlessState = (raw) => ({
  authority: Boolean(raw?.authority),
  active: Boolean(raw?.active),
  stage: Math.max(1, Number(raw?.stage) || 1),
  highestStage: Math.max(1, Number(raw?.highestStage ?? raw?.highest_stage) || 1),
  totalClears: Math.max(0, Number(raw?.totalClears ?? raw?.total_clears) || 0),
  totalFailures: Math.max(0, Number(raw?.totalFailures ?? raw?.total_failures) || 0),
  lastResolvedAt: raw?.lastResolvedAt ?? raw?.last_resolved_at ?? null,
  nextResolveAt: raw?.nextResolveAt ?? null,
  requiredCp: Math.max(1, Number(raw?.requiredCp) || endlessStageRequirement(raw?.stage)),
});

export const DROP_BEAMS = {
  common: "#9ed0e5", uncommon: "#42e6a4", rare: "#35bfff",
  epic: "#b476ff", legendary: "#ffbd38", mythic: "#ff4e8e", apex: "#ffffff",
  green: "#42e6a4", blue: "#35bfff", yellow: "#ffe06a", orange: "#ff9b38", prismatic: "#ffffff",
};

const itemLabel = (id) => String(id || "recovered-equipment").split(":")[0].split("-").map((part)=>part ? part[0].toUpperCase()+part.slice(1) : "").join(" ");

export const normalizeGroundDrops = (drops = []) => drops.slice(-8).map((drop, index) => ({
  id: drop.receipt || `${drop.id || drop.itemId || "loot"}-${index}-${Date.now()}`,
  itemId: drop.id || drop.itemId || null,
  name: drop.name || drop.itemName || itemLabel(drop.id || drop.itemId),
  rarity: String(drop.rarity || "common").toLowerCase(),
  duplicate: Boolean(drop.duplicate),
  shards: Math.max(0, Number(drop.shards) || 0),
}));
