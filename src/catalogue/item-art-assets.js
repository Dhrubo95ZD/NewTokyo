import revolver from "../assets/item-revolver.webp";
import fedora from "../assets/item-fedora.webp";
import coat from "../assets/item-coat.webp";
import ring from "../assets/item-ring.webp";
import medical from "../assets/item-medical.webp";
import blade from "../assets/item-blade.webp";
import gloves from "../assets/item-gloves.webp";
import shoes from "../assets/item-shoes.webp";

// The catalogue and the character dossier use the same art so an item never
// changes identity when it moves between screens. Generated art is grouped by
// visual family; the server remains the source of truth for item stats.
export const ITEM_ART_ASSETS = Object.freeze({
  weapon: revolver,
  revolver,
  pistol: revolver,
  shotgun: revolver,
  blade,
  fedora,
  coat,
  armor: coat,
  shoes,
  boots: shoes,
  gloves,
  ring,
  watch: ring,
  accessory: ring,
  medical,
  tonic: medical,
  booster: medical,
});

const visualKey = item => String(
  item?.visualKey
  || item?.visual_key
  || item?.slot
  || item?.kind
  || ""
).toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function itemArtAsset(item) {
  const key = visualKey(item);
  if (ITEM_ART_ASSETS[key]) return { src: ITEM_ART_ASSETS[key], key };
  const kind = String(item?.kind || "").toLowerCase();
  if (ITEM_ART_ASSETS[kind]) return { src: ITEM_ART_ASSETS[kind], key: kind };
  return { src: coat, key: "default" };
}
