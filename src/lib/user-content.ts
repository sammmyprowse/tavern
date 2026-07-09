// Shared constants/types for user-created homebrew content. Kept out of the
// "use server" actions file, which may only export async functions.

// A character records chosen custom content as `user-<kind>:{id}` so it never
// collides with a real SRD slug. One prefix per content kind.
export const USER_FEAT_PREFIX = "user-feat:";
export const USER_SUBCLASS_PREFIX = "user-subclass:";
export const USER_BACKGROUND_PREFIX = "user-background:";
export const USER_SPECIES_PREFIX = "user-species:";

export interface UserContentResult {
  success: boolean;
  error?: string;
}

// The 12 SRD classes, for the custom-subclass class picker. Fixed set.
export const CLASS_OPTIONS: { index: string; name: string }[] = [
  { index: "barbarian", name: "Barbarian" },
  { index: "bard", name: "Bard" },
  { index: "cleric", name: "Cleric" },
  { index: "druid", name: "Druid" },
  { index: "fighter", name: "Fighter" },
  { index: "monk", name: "Monk" },
  { index: "paladin", name: "Paladin" },
  { index: "ranger", name: "Ranger" },
  { index: "rogue", name: "Rogue" },
  { index: "sorcerer", name: "Sorcerer" },
  { index: "warlock", name: "Warlock" },
  { index: "wizard", name: "Wizard" },
];

// A homebrew subclass feature, as stored in user_content.data.features.
export interface UserSubclassFeature {
  name: string;
  level: number;
  description: string;
}

// A homebrew species trait (name + full rules text), stored in
// user_content.data.traits for kind='species'.
export interface UserSpeciesTrait {
  name: string;
  description: string;
}

// The six abilities, for the custom-background ability-choice picker.
export const ABILITY_OPTIONS: { index: string; name: string }[] = [
  { index: "str", name: "Strength" },
  { index: "dex", name: "Dexterity" },
  { index: "con", name: "Constitution" },
  { index: "int", name: "Intelligence" },
  { index: "wis", name: "Wisdom" },
  { index: "cha", name: "Charisma" },
];

// The SRD Origin feats a background can grant (real feats in the `feats`
// table). A background grants exactly one.
export const ORIGIN_FEAT_OPTIONS: { index: string; name: string }[] = [
  { index: "alert", name: "Alert" },
  { index: "crafter", name: "Crafter" },
  { index: "healer", name: "Healer" },
  { index: "lucky", name: "Lucky" },
  { index: "magic-initiate", name: "Magic Initiate" },
  { index: "musician", name: "Musician" },
  { index: "savage-attacker", name: "Savage Attacker" },
  { index: "skilled", name: "Skilled" },
  { index: "tavern-brawler", name: "Tavern Brawler" },
  { index: "tough", name: "Tough" },
];
