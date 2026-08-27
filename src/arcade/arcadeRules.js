export const CRICKET_PERFECT_PROGRESS = 0.84;

export function cricketDeliveryDuration(speed = 145) {
  return 1050 + Math.max(0, Number(speed) || 0);
}

export function swipeCricketShot({ dx = 0, dy = 0, duration = 1 }) {
  const distance = Math.hypot(dx, dy);
  if (distance < 24 || dy > 12) return null;
  const lane = dx < -24 ? "leg" : dx > 24 ? "off" : "straight";
  const velocity = distance / Math.max(1, duration);
  return { lane, intent: distance >= 92 || velocity >= 0.75 ? "power" : "drive", distance, velocity };
}

export function resolveCricketSwing({ progress, laneMatch, intent = "drive", random = Math.random() }) {
  if (!laneMatch) return { symbol: "·", runs: 0, text: "WRONG LINE · BEATEN", wicket: false, tier: "miss" };
  const timing = Math.abs(Number(progress) - CRICKET_PERFECT_PROGRESS);
  if (timing < 0.055) {
    const runs = intent === "power" ? 6 : 4;
    return { symbol: String(runs), runs, text: intent === "power" ? "PERFECT ARC · SIX" : "PURE TIMING · FOUR", wicket: false, tier: "perfect" };
  }
  if (timing < 0.12) {
    const runs = intent === "power" ? 4 : 3;
    return { symbol: String(runs), runs, text: `${runs} RUNS · CLEAN CONTACT`, wicket: false, tier: "clean" };
  }
  if (timing < 0.22) {
    const runs = intent === "power" ? 1 : 2;
    return { symbol: String(runs), runs, text: "MISTIMED · SCRAMBLED RUNS", wicket: false, tier: "edge" };
  }
  const wicket = intent === "power" && random < 0.55;
  return { symbol: wicket ? "W" : "·", runs: 0, text: wicket ? "SKIED · CAUGHT" : "SWING AND MISS", wicket, tier: "miss" };
}
