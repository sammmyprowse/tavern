// Shared constants/types for user-created homebrew content. Kept out of the
// "use server" actions file, which may only export async functions.

// A character records chosen custom content as `user-<kind>:{id}` so it never
// collides with a real SRD slug. One prefix per content kind.
export const USER_FEAT_PREFIX = "user-feat:";
export const USER_SUBCLASS_PREFIX = "user-subclass:";
export const USER_BACKGROUND_PREFIX = "user-background:";
export const USER_SPECIES_PREFIX = "user-species:";
export const USER_SPELL_PREFIX = "user-spell:";
export const USER_CLASS_PREFIX = "user-class:";
export const USER_MONSTER_PREFIX = "user-monster:";

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

// A homebrew class's per-level feature, stored in user_content.data.features
// for kind='class'.
export interface UserClassFeature {
  name: string;
  level: number;
  description: string;
}

// Homebrew class payload (kind='class'). A homebrew class is intentionally
// scoped: hit die + two save proficiencies + optional FULL-caster spellcasting
// (its spell list = homebrew spells assigned to it; no cantrip progression) +
// per-level features (listed, not simulated — no Rage/Second-Wind-style
// interactive resources, no starting equipment or class skill choices).
export interface UserClassData {
  hitDie: number; // 6 | 8 | 10 | 12
  savingThrows: string[]; // exactly 2 ability indexes
  spellcastingAbility: string | null; // an ability index → full caster, or null
  description: string;
  features: UserClassFeature[];
}

export const HIT_DIE_OPTIONS = [6, 8, 10, 12];

// The eight schools of magic, for the custom-spell school picker.
export const SPELL_SCHOOL_OPTIONS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
];

// Homebrew spell payload (kind='spell'). Mirrors the fields the SRD spell
// resolver produces, so a user spell flows through the same class pickers,
// compendium, and roll buttons.
export interface UserSpellData {
  level: number;
  school: string;
  classes: string[]; // class indexes that can prepare it
  castingTime: string;
  range: string;
  duration: string;
  components: string[]; // any of "V" | "S" | "M"
  material: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  higherLevel: string;
  attackType: "melee" | "ranged" | null;
  dcAbility: string | null; // ability index for the save, or null
  damageDice: string | null; // e.g. "2d6" (base; a cantrip scales in the text)
  damageType: string | null;
}

// ── Homebrew monsters (kind='monster') ──────────────────────────────────────
// A homebrew monster mirrors the fields the DM screen's MonsterCard actually
// uses; saves/skills/senses and legendary actions are deliberately out of
// scope (the card tolerates their absence — it derives checks/saves from the
// ability scores).

export const MONSTER_SIZE_OPTIONS = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

export interface UserMonsterTrait {
  name: string;
  description: string;
}

export interface UserMonsterAction {
  name: string;
  description: string;
  // Present when the action is a resolvable attack (drives the DM screen's
  // Attack/Damage roll buttons, same as SRD monster actions).
  attackBonus: number | null;
  damageDice: string | null; // e.g. "2d6+3"
  damageType: string | null;
}

export interface UserMonsterData {
  size: string;
  type: string;
  armorClass: number;
  hitPoints: number;
  speed: string; // freeform, e.g. "30 ft., fly 60 ft."
  challengeRating: number; // XP + proficiency bonus derive from this
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  traits: UserMonsterTrait[];
  actions: UserMonsterAction[];
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
