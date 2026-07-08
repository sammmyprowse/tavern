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
