import { normalizeInventory } from "./Inventory.jsx";

export const SAVE_KEY = "ntu-save-v1";
export const SAVE_SCHEMA_VERSION = 3;

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

export function migrateAccountSave(rawValue, user, fallbackName = "Runner") {
  const raw = isObject(rawValue) ? rawValue : {};
  if (raw.schemaVersion === SAVE_SCHEMA_VERSION && isObject(raw.core)) {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      core: { ...raw.core, onlineUserId: user.id },
      character: isObject(raw.character) ? raw.character : null,
      armory: normalizeInventory(raw.armory),
      meta: { ...(isObject(raw.meta) ? raw.meta : {}), updatedAt: Date.now() },
    };
  }

  const legacyArmory = raw.inventory?.version === 2 ? raw.inventory : raw.armory;
  const legacyBag = raw.inventory?.version === 2 ? {} : (isObject(raw.inventory) ? raw.inventory : {});
  const character = isObject(raw.characterProfile) ? raw.characterProfile : (isObject(raw.character) ? raw.character : null);
  const core = { ...raw, inventory: legacyBag, onlineUserId: user.id };
  delete core.schemaVersion;
  delete core.characterProfile;
  delete core.character;
  delete core.armory;
  delete core.meta;
  delete core.cloudKey;
  core.name = character?.codename || core.name || fallbackName;
  core.handle = character?.codename || core.handle || null;

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    core,
    character,
    armory: normalizeInventory(legacyArmory),
    meta: { migratedAt: Date.now(), updatedAt: Date.now() },
  };
}

export function serializeAccountSave(save) {
  return JSON.stringify({ ...save, schemaVersion: SAVE_SCHEMA_VERSION, meta: { ...(save.meta || {}), updatedAt: Date.now() } });
}
