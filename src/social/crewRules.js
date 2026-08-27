export const CRISIS_TRACKS = Object.freeze([
  { id: "logistics", name: "Supply Grid", glyph: "補", color: "#4ce0bd", detail: "Move crafted parts, medicine and power cells into the response zone." },
  { id: "intel", name: "Signal Recon", glyph: "索", color: "#5edfff", detail: "Survey routes, decode hostile signals and expose weak points." },
  { id: "security", name: "Ward Defense", glyph: "衛", color: "#ff6f9f", detail: "Clear enemy patrols and hold evacuation corridors." },
]);

export const normalizeCrewState = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const crew = raw.crew && typeof raw.crew === "object" ? raw.crew : null;
  const crisis = raw.crisis && typeof raw.crisis === "object" ? raw.crisis : null;
  return {
    authority: Boolean(raw.authority),
    crew: crew ? { ...crew, members: Array.isArray(crew.members) ? crew.members : [] } : null,
    crisis: crisis ? {
      ...crisis,
      prep: { logistics: 0, intel: 0, security: 0, ...(crisis.prep || {}) },
      threshold: Math.max(1, Number(crisis.threshold) || 300),
      bossHp: Math.max(0, Number(crisis.bossHp) || 0),
      bossMax: Math.max(1, Number(crisis.bossMax) || 5000),
    } : null,
    publicCrews: Array.isArray(raw.publicCrews) ? raw.publicCrews : [],
    rankings: Array.isArray(raw.rankings) ? raw.rankings : [],
    activity: Array.isArray(raw.activity) ? raw.activity : [],
  };
};

export const crisisPrepReady = (crisis) => Boolean(crisis && CRISIS_TRACKS.every((track) => Number(crisis.prep?.[track.id] || 0) >= Number(crisis.threshold || 300)));
export const crisisProgress = (crisis) => crisis ? Math.max(0, Math.min(100, Math.round((1 - Number(crisis.bossHp || 0) / Math.max(1, Number(crisis.bossMax || 1))) * 100))) : 0;
