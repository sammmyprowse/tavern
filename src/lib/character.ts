export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITY_ORDER: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export type AbilityScores = Record<AbilityKey, number | null>;

export interface AbilityBonusChoice {
  mode: "two" | "three";
  // "two": one ability gets +2, another gets +1. "three": three abilities each get +1.
  plusTwo?: AbilityKey;
  plusOne: AbilityKey[];
}

export interface CharacterDraft {
  name: string;
  speciesIndex: string | null;
  subspeciesIndex: string | null;
  classIndex: string | null;
  skillChoices: string[];
  baseAbilityScores: AbilityScores;
  backgroundIndex: string | null;
  backgroundAbilityBonus: AbilityBonusChoice | null;
  // Leveling (Phase 0). Characters are always created at level 1; level only
  // ever increases via the play sheet's Level Up action, never set directly.
  level: number;
  // HP gained at each level beyond 1 — hpRolls[0] is the level-2 gain, etc.
  // Level 1 HP itself is always hitDie + conMod, computed fresh, not stored here.
  hpRolls: number[];
  // Leveling (Phase 1). Set via the play sheet's subclass picker once level >= 3.
  subclassIndex: string | null;
  // Cleric's Divine Order / Druid's Primal Order pick (key into ORDER_CHOICES),
  // unrelated to subclass — available at level 1, only for those two classes.
  orderChoice: string | null;
  // Leveling (Phase 2). One entry per resolved ASI_LEVELS milestone.
  featChoices: FeatChoice[];
  // Class resources. Bare skill indexes with doubled proficiency bonus — see
  // EXPERTISE_SCHEDULE for which classes/levels grant picks and how many.
  expertiseChoices: string[];
  // Spellcasting. Spell indexes (2014 ruleset — see srd.ts). Unlike
  // subclass/feat/expertise picks, these are freely re-settable at any time
  // (2024 rules let prepared casters swap their list on every Long Rest), so
  // they're plain overwritable arrays, not an append-only choice log. Slot
  // expenditure itself is play state (PlaySheet's local PlayState), not here —
  // it resets every Long Rest the same way current HP and hit dice used do.
  knownCantrips: string[];
  preparedSpells: string[];
  // Sorcerer's Metamagic (see METAMAGIC_OPTIONS below). Modeled as a freely
  // overwritable list gated by metamagicKnownMax(level), the same shape as
  // knownCantrips/preparedSpells — NOT the real rule's stricter "replace only
  // one option per Sorcerer level gained." That exact retraining cadence
  // would need tracking when each option was learned for little real benefit
  // here, especially since the option list itself is already homebrew (see
  // METAMAGIC_OPTIONS) rather than the official one.
  metamagicChoices: string[];
  // Fighting Style (Fighter level 1+7, Paladin/Ranger level 2) — real SRD
  // feats (type='fighting-style' in the feats table), freely overwritable
  // like metamagicChoices since "Whenever you gain a [Class] level, you can
  // replace the feat you chose with a different Fighting Style feat."
  fightingStyleChoices: string[];
  // Weapon Mastery (Barbarian/Fighter/Paladin/Ranger/Rogue, level 1) — real
  // SRD feature, equipment-table indexes of the chosen weapon kinds. Freely
  // overwritable like fightingStyleChoices/metamagicChoices, since "whenever
  // you finish a Long Rest, you can practice weapon drills and change one
  // of those weapon choices." See WEAPON_MASTERY_KNOWN_BY_CLASS for counts.
  weaponMasteryChoices: string[];
  // Giant Ancestry (Goliath) — key into GIANT_ANCESTRY_OPTIONS. null until chosen
  // on the play sheet (same deferred-choice pattern as orderChoice).
  giantAncestryChoice: string | null;
  // Languages chosen at character creation — 2 picks for every character.
  // Thieves' Cant (Rogue) and Druidic (Druid) are automatic class grants,
  // not counted against these 2, and never in this array.
  languageChoices: string[];
  // 0-based index into the class's startingEquipmentOptions array (Option A
  // = 0, Option B = 1, Option C = 2). Clamped to valid range if the chosen
  // class has fewer options than a previously-selected one.
  classEquipmentChoice: number;
  // 0-based index into the background's equipmentOptions array.
  backgroundEquipmentChoice: number;
  // Index of the chosen tool proficiency for backgrounds that offer a pick
  // (e.g. Soldier: one Gaming Set from dice/dragonchess/playing-cards/
  // three-dragon-ante). null for backgrounds with no such choice.
  toolProficiencyChoice: string | null;
  // Human's Skillful trait grants proficiency in one skill of choice (bare
  // skill index, e.g. "perception"). null for non-Humans / until chosen.
  humanSkillChoice: string | null;
  // The Skilled feat grants proficiency in any 3 skills or tools of choice.
  // Bare skill indexes (tools aren't tracked as proficiencies on the sheet
  // yet, so this is skills-only for now). One array per character regardless
  // of how many times Skilled is taken — the picker caps it at 3 × count.
  skilledChoices: string[];
}

export interface ExpertiseMilestone {
  level: number;
  count: number;
}

// Rogue's Expertise feature ("gain Expertise in two skill proficiencies of your
// choice... at Rogue level 6, two more") names the picks but, like Sneak Attack's
// dice progression below, doesn't give a clean lookup table — it's two prose
// mentions. Modeled as milestones so other classes (e.g. Bard) can extend this
// later without changing the shape.
export const EXPERTISE_SCHEDULE: Record<string, ExpertiseMilestone[]> = {
  rogue: [
    { level: 1, count: 2 },
    { level: 6, count: 2 },
  ],
  // Bard's own Expertise text ("gain Expertise in two of your skill
  // proficiencies... At Bard level 9, you gain Expertise in two more") —
  // different milestone levels from Rogue's, confirmed from Bard's own SRD
  // feature text rather than assumed.
  bard: [
    { level: 2, count: 2 },
    { level: 9, count: 2 },
  ],
  // Ranger's Expertise is split across two separate features: Deft Explorer
  // grants Expertise in one skill at level 2 ("Choose one of your skill
  // proficiencies... You gain Expertise in that skill"), and the standalone
  // "Expertise" feature grants two more at level 9 — confirmed from each
  // feature's own SRD text.
  ranger: [
    { level: 2, count: 1 },
    { level: 9, count: 2 },
  ],
};

// Sneak Attack's damage text ("the extra damage increases as you gain Rogue
// levels, as shown in the Sneak Attack column of the Rogue Features table")
// references a table that isn't in the SRD's structured data — only the
// unstructured mention above. The progression itself (1d6 at level 1, +1d6
// every 2 levels) is unchanged since 2014 and hardcoded the same way
// proficiency bonus's formula is.
export function sneakAttackDice(level: number): number {
  return Math.ceil(level / 2);
}

export interface FeatChoice {
  level: number;
  featIndex: string;
  // Only set when featIndex === "ability-score-improvement" — every other
  // feat is informational/listed only, same as class and subclass features.
  abilityBonus: AbilityBonusChoice | null;
}

// 2024 rules unified every class onto the same General Feat schedule (no more
// of 2014's class-specific bonus ASIs for Fighter/Rogue) — confirmed against
// the SRD feature data, which only tags level 4 explicitly per class but the
// repeating 4/8/12/16/19 pattern itself isn't structured data, so it's
// hardcoded here the same way proficiency bonus's formula is.
export const ASI_LEVELS = [4, 8, 12, 16, 19];

export interface OrderChoiceOption {
  key: string;
  name: string;
  description: string;
}

// Cleric/Druid each get a level-1 binary choice that isn't structured data
// anywhere in the SRD tables — only as prose inside one `features` row
// (cleric-divine-order / druid-primal-order). Text below is verbatim from
// that SRD row, just split into selectable options instead of one paragraph.
export interface GiantAncestryOption {
  key: string;
  name: string;
  description: string;
}

// Giant Ancestry (Goliath, level 1) — choose one of the 6 benefits below; the
// choice is permanent, uses = Proficiency Bonus, all regained on Long Rest.
// Text is verbatim from the traits table row (data.description, trimmed).
export const GIANT_ANCESTRY_OPTIONS: GiantAncestryOption[] = [
  {
    key: "clouds-jaunt",
    name: "Cloud's Jaunt (Cloud Giant)",
    description:
      "As a Bonus Action, you magically teleport up to 30 feet to an unoccupied space you can see.",
  },
  {
    key: "fires-burn",
    name: "Fire's Burn (Fire Giant)",
    description:
      "When you hit a target with an attack roll and deal damage to it, you can also deal 1d10 Fire damage to that target.",
  },
  {
    key: "frosts-chill",
    name: "Frost's Chill (Frost Giant)",
    description:
      "When you hit a target with an attack roll and deal damage to it, you can also deal 1d6 Cold damage to that target and reduce its Speed by 10 feet until the start of your next turn.",
  },
  {
    key: "hills-tumble",
    name: "Hill's Tumble (Hill Giant)",
    description:
      "When you hit a Large or smaller creature with an attack roll and deal damage to it, you can give that target the Prone condition.",
  },
  {
    key: "stones-endurance",
    name: "Stone's Endurance (Stone Giant)",
    description:
      "When you take damage, you can take a Reaction to roll 1d12. Add your Constitution modifier to the number rolled and reduce the damage by that total.",
  },
  {
    key: "storms-thunder",
    name: "Storm's Thunder (Storm Giant)",
    description:
      "When you take damage from a creature within 60 feet of you, you can take a Reaction to deal 1d8 Thunder damage to that creature.",
  },
];

export const ORDER_CHOICES: Record<string, OrderChoiceOption[]> = {
  cleric: [
    {
      key: "protector",
      name: "Protector",
      description:
        "Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.",
    },
    {
      key: "thaumaturge",
      name: "Thaumaturge",
      description:
        "You know one extra cantrip from the Cleric spell list. In addition, your mystical connection to the divine gives you a bonus to your Intelligence (Arcana or Religion) checks. The bonus equals your Wisdom modifier (minimum of +1).",
    },
  ],
  druid: [
    {
      key: "magician",
      name: "Magician",
      description:
        "You know one extra cantrip from the Druid spell list. In addition, your mystical connection to nature gives you a bonus to your Intelligence (Arcana or Nature) checks. The bonus equals your Wisdom modifier (minimum bonus of +1).",
    },
    {
      key: "warden",
      name: "Warden",
      description:
        "Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.",
    },
  ],
};

export type DraftUpdate =
  | Partial<CharacterDraft>
  | ((prev: CharacterDraft) => Partial<CharacterDraft>);
export type UpdateDraftFn = (update: DraftUpdate) => void;

export const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  speciesIndex: null,
  subspeciesIndex: null,
  classIndex: null,
  skillChoices: [],
  baseAbilityScores: { str: null, dex: null, con: null, int: null, wis: null, cha: null },
  backgroundIndex: null,
  backgroundAbilityBonus: null,
  level: 1,
  hpRolls: [],
  subclassIndex: null,
  orderChoice: null,
  featChoices: [],
  expertiseChoices: [],
  knownCantrips: [],
  preparedSpells: [],
  metamagicChoices: [],
  fightingStyleChoices: [],
  weaponMasteryChoices: [],
  giantAncestryChoice: null,
  languageChoices: [],
  classEquipmentChoice: 0,
  backgroundEquipmentChoice: 0,
  toolProficiencyChoice: null,
  humanSkillChoice: null,
  skilledChoices: [],
};

export const MAX_LEVEL = 20;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function proficiencyBonusForLevel(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Accepts every bonus source that applies (background's choice, plus one per
// Ability Score Improvement feat taken) since a character can take ASI more
// than once across its ASI_LEVELS milestones. Each final score is capped at
// 20, the real 5e rule ("can't increase an ability score above 20") — without
// this, stacking background + multiple ASI picks could push a score past it.
export function finalAbilityScores(
  base: AbilityScores,
  bonuses: (AbilityBonusChoice | null)[],
): AbilityScores {
  const result = { ...base };
  for (const bonus of bonuses) {
    if (!bonus) continue;
    if (bonus.mode === "two" && bonus.plusTwo) {
      result[bonus.plusTwo] = (result[bonus.plusTwo] ?? 0) + 2;
    }
    for (const ability of bonus.plusOne) {
      result[ability] = (result[ability] ?? 0) + 1;
    }
  }
  for (const ability of ABILITY_ORDER) {
    if (result[ability] != null) {
      result[ability] = Math.min(20, result[ability]);
    }
  }
  return result;
}

export interface ArmorClassData {
  base: number;
  dex_bonus?: boolean;
  max_bonus?: number;
}

export interface EquipmentItem {
  index: string;
  name: string;
  categories: string[] | null;
  armor_class: ArmorClassData | null;
}

// hasDefenseFightingStyle adds the Defense Fighting Style feat's "+1 bonus
// to Armor Class while wearing Light, Medium, or Heavy armor" — confirmed
// directly from the feat's own SRD text. Only applies when actual body
// armor is equipped (not just a shield, and not unarmored), matching
// `bodyArmor` below exactly. unarmoredDefenseBonus adds an extra ability
// modifier to the UNARMORED base AC instead (Barbarian's Unarmored Defense:
// "your base Armor Class equals 10 plus your Dexterity and Constitution
// modifiers... You can use a Shield and still gain this benefit" —
// confirmed directly; pass sheet.modifiers.con from the call site). Named
// generically (an ability mod, not "conMod") since Monk's own Unarmored
// Defense uses a different ability (WIS) for the same shape of bonus.
// flatUnarmoredAC REPLACES the unarmored base entirely instead of adding to
// it (homebrew Tortle's Natural Armor: "your base Armor Class is 17" — a
// flat number, not 10+something) — a shield still stacks on top either way,
// matching "You can still use a Shield." All new params default to
// 0/false/null so every existing call site (ReviewStep's builder preview,
// which has no class/species-resource data yet) keeps working unchanged.
export function computeArmorClass(
  equipped: EquipmentItem[],
  dexMod: number,
  hasDefenseFightingStyle = false,
  unarmoredDefenseBonus = 0,
  flatUnarmoredAC: number | null = null,
): number {
  // Checked via the real "shields" category tag, not item.index === "shield"
  // — a custom/found shield from the inventory system is keyed by its own
  // generated id (see resolveInventoryEquipment), never the literal SRD
  // index, but it inherits the base item's categories array unchanged, so
  // this check correctly recognizes it either way. The index-string check
  // it replaces silently never matched a custom shield at all (and could
  // even mis-route it into the bodyArmor branch below, since its index is
  // never literally "shield" either) — a real bug, not just a gap.
  const isShield = (item: EquipmentItem) => item.categories?.includes("shields") ?? false;
  const shield = equipped.find(isShield);
  const bodyArmor = equipped.find((item) => item.armor_class && !isShield(item));

  let ac: number;
  if (bodyArmor?.armor_class) {
    const { base, dex_bonus, max_bonus } = bodyArmor.armor_class;
    const dexContribution = dex_bonus
      ? max_bonus != null
        ? Math.min(dexMod, max_bonus)
        : dexMod
      : 0;
    ac = base + dexContribution + (hasDefenseFightingStyle ? 1 : 0);
  } else if (flatUnarmoredAC != null) {
    ac = flatUnarmoredAC;
  } else {
    ac = 10 + dexMod + unarmoredDefenseBonus;
  }

  if (shield?.armor_class) {
    ac += shield.armor_class.base;
  }

  return ac;
}

export function maxHp(hitDie: number, conMod: number, hpRolls: number[]): number {
  const level1Hp = hitDie + conMod;
  const restHp = hpRolls.reduce((sum, roll) => sum + roll, 0);
  return level1Hp + restHp;
}

// Bonus HP from HP-granting feats, summed across every relevant feat choice.
// Tough (homebrew): "+2 for each character level you have attained" → 2 ×
// current level, regardless of when taken. Hardened (homebrew): "+2, and
// increases by 2 again every time you gain a level thereafter" → 2 at the
// level it was taken plus 2 per level since, i.e. 2 × (level − takenLevel + 1).
// Both read straight from each feat's own description text. Other feats grant
// no HP. featChoices carries the level each feat was taken at, which Hardened
// needs and Tough ignores.
export function featHpBonus(
  featChoices: { level: number; featIndex: string }[],
  characterLevel: number,
): number {
  let bonus = 0;
  for (const fc of featChoices) {
    if (fc.featIndex === "tough") bonus += 2 * characterLevel;
    else if (fc.featIndex === "hardened") bonus += 2 * (characterLevel - fc.level + 1);
  }
  return bonus;
}

// HP gained per level-up beyond 1 is never less than 1 (standard 5e rule), even
// for a Sorcerer/Wizard (d6) with a negative or zero CON modifier.
export function hpGainForLevelUp(hitDie: number, conMod: number, roll: number): number {
  return Math.max(1, roll + conMod);
}

export function fixedAverageHpGain(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

// Full-caster spell slot table (1st through 9th-level slots, by character
// level) — shared by every full-caster class (Bard/Cleric/Druid/Sorcerer/
// Wizard). The SRD's own spellcasting text only ever references this as "the
// [Class] Features table," never as structured data, so it's hardcoded here
// the same way proficiency bonus's formula is. Half-casters (Paladin/Ranger)
// and Warlock's Pact Magic use different tables — not modeled yet, only
// needed once one of those classes' pass comes up.
const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Index 0 = 1st-level slots, index 8 = 9th-level slots.
export function fullCasterSlots(level: number): number[] {
  return FULL_CASTER_SLOTS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Half-caster slot table (Paladin/Ranger) — slower than full casters, caps
// at 5th-level spells instead of 9th. Confirmed from the 2014 levels table's
// real per-level spell_slots_level_N data (the SRD's own prose only ever
// references "the [Class] Features table," same as the full-caster table),
// cross-checked against this app's own data for Paladin specifically rather
// than assumed from outside knowledge of the well-known real progression.
// Padded to 9 columns (trailing zeros) to match fullCasterSlots' shape so
// the UI doesn't need to special-case the array length.
const HALF_CASTER_SLOTS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
];

export function halfCasterSlots(level: number): number[] {
  return HALF_CASTER_SLOTS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Classes that use the slower half-caster slot/spell progression instead of
// the standard full-caster one. Checked per-class as each pass confirms it —
// don't assume a class belongs here without checking its own SRD data first.
// Ranger's own 2014-levels data confirms the exact same table as Paladin's.
export const HALF_CASTER_CLASSES = new Set(["paladin", "ranger"]);

// Favored Enemy (Ranger, from level 1): "You always have the Hunter's Mark
// spell prepared. You can cast it twice without expending a spell slot...
// you regain all expended uses of this ability when you finish a Long Rest."
// Higher-level increases are referenced via "the Favored Enemy column of the
// Ranger Features table" without giving those breakpoints in prose — same
// disclosed simplification as channelDivinityMax/wildShapeMax: flat
// confirmed base, not a guessed table for the part that isn't checkable
// anywhere in this app's data pipeline.
export function favoredEnemyMax(level: number): number {
  return level >= 1 ? 2 : 0;
}

// 2024 rules unified prepared-caster spell counts onto "character level +
// spellcasting ability modifier" (minimum 1) for Wizard/Cleric/Druid,
// replacing 2014's separate fixed tables per class. Cross-checked against the
// SRD's own Wizard text ("choose four spells" at level 1, consistent with a
// +3 INT modifier example: 1 + 3 = 4).
export function preparedSpellCount(level: number, abilityMod: number): number {
  return Math.max(1, level + abilityMod);
}

export function spellSaveDC(proficiencyBonus: number, abilityMod: number): number {
  return 8 + proficiencyBonus + abilityMod;
}

export function spellAttackBonus(proficiencyBonus: number, abilityMod: number): number {
  return proficiencyBonus + abilityMod;
}

// Wizard's cantrip-known progression specifically ("you know three Wizard
// cantrips... at Wizard levels 4 and 10, you learn another"). Named for
// Wizard explicitly rather than generically — confirm each other caster's own
// progression from its own spellcasting text when that class's pass comes up,
// don't assume they match this one.
export function wizardCantripsKnown(level: number): number {
  return level >= 10 ? 5 : level >= 4 ? 4 : 3;
}

// Sorcerer's own cantrip-known progression ("you know four Sorcerer
// cantrips... at Sorcerer levels 4 and 10, you learn another") — confirmed
// from Sorcerer's own spellcasting text, NOT assumed from Wizard's (which
// starts at 3, not 4).
export function sorcererCantripsKnown(level: number): number {
  return level >= 10 ? 6 : level >= 4 ? 5 : 4;
}

// Maps each prepared-caster class to its own cantrip-known function — 2024
// rules also moved Sorcerer onto the same "prepared spells" model as Wizard
// (confirmed from Sorcerer's own spellcasting text: "choose two level 1
// Sorcerer spells" at level 1 with a +1 CHA mod example, consistent with
// preparedSpellCount's level+modifier formula), so preparedSpellCount itself
// needs no per-class variant — only cantrips known differs per class.
// Cleric's own cantrip-known progression ("you know three Cleric cantrips...
// When you reach Cleric levels 4 and 10, you learn another cantrip") —
// confirmed from Cleric's own spellcasting text, NOT assumed from Wizard's,
// even though the resulting numbers happen to match (3/4/5 at 1/4/10).
export function clericCantripsKnown(level: number): number {
  return level >= 10 ? 5 : level >= 4 ? 4 : 3;
}

// Bard's own cantrip-known progression ("you know two cantrips... When you
// reach Bard levels 4 and 10, you learn another cantrip") — confirmed from
// Bard's own spellcasting text. Starts at 2, NOT 3 or 4 like the others.
export function bardCantripsKnown(level: number): number {
  return level >= 10 ? 4 : level >= 4 ? 3 : 2;
}

// Druid's own cantrip-known progression ("you know two cantrips... When you
// reach Druid levels 4 and 10, you learn another cantrip") — confirmed from
// Druid's own spellcasting text, same numbers as Bard's but confirmed
// independently rather than assumed.
export function druidCantripsKnown(level: number): number {
  return level >= 10 ? 4 : level >= 4 ? 3 : 2;
}

// Warlock's own cantrip-known progression ("you know two Warlock cantrips...
// at Warlock levels 4 and 10, you learn another") — confirmed from Warlock's
// own spellcasting text, same numbers as Bard/Druid but confirmed
// independently rather than assumed.
export function warlockCantripsKnown(level: number): number {
  return level >= 10 ? 4 : level >= 4 ? 3 : 2;
}

export const CANTRIPS_KNOWN_BY_CLASS: Record<string, (level: number) => number> = {
  wizard: wizardCantripsKnown,
  sorcerer: sorcererCantripsKnown,
  cleric: clericCantripsKnown,
  bard: bardCantripsKnown,
  druid: druidCantripsKnown,
  warlock: warlockCantripsKnown,
};

// Sorcery Points (Font of Magic, gained at Sorcerer level 2): the pool equals
// your Sorcerer level, starting at level 2 ("You have 2 Sorcery Points, and
// you gain more as you reach higher levels" — the SRD text only gives the
// level-2 example, not the full table, but the underlying rule — points
// equal character level once you have the feature — is the real, unchanged
// 5e rule). Used to fuel Metamagic and to convert to/from spell slots.
export function sorceryPointsMax(level: number): number {
  return level >= 2 ? level : 0;
}

// Innate Sorcery (Sorcerer level 1, 2024): "As a Bonus Action, you can ...
// give yourself ... advantage on the spell attack rolls ... You can use this
// feature twice, and you regain all expended uses ... when you finish a Long
// Rest." A flat 2 uses from level 1 — the feature text gives the count
// directly and never references a scaling table, so this is a confirmed
// fixed number, not a disclosed simplification.
export function innateSorceryMax(level: number): number {
  return level >= 1 ? 2 : 0;
}

// Real, confirmed schedule for how many Metamagic options a Sorcerer knows —
// taken directly from the Metamagic feature's own SRD text ("you gain two
// Metamagic options... You gain two more options at Sorcerer level 10 and two
// more at Sorcerer level 17"), cross-checked against the 2014 levels table's
// metamagic_known progression. 0/2/4/6, NOT the 2014 rules' 0/2/3/4 — 2024
// doubled the level-10/17 grants.
export function metamagicKnownMax(level: number): number {
  return level >= 17 ? 6 : level >= 10 ? 4 : level >= 2 ? 2 : 0;
}

export interface MetamagicOption {
  key: string;
  name: string;
  cost: string;
  description: string;
}

// Original homebrew content, NOT the official Metamagic options list — the
// SRD's Metamagic feature explicitly defers to "Metamagic Options" text later
// in the class's official description, but that subsection isn't part of the
// free SRD data anywhere in this app's content pipeline (checked the feats
// table, the features table, and the 5e-bits/5e-database source repo itself —
// the actual option list/effects just aren't published as open content here).
// The schedule above IS real; these specific 9 options are original, written
// at a comparable Sorcery Point cost/power band to the genre-standard "spend
// points to tweak a spell" mechanic. User-authorized homebrew, same spirit as
// the homebrew backgrounds and general feats.
export const METAMAGIC_OPTIONS: MetamagicOption[] = [
  {
    key: "hushed-casting",
    name: "Hushed Casting",
    cost: "1 Sorcery Point",
    description:
      "When you cast a spell, you can spend 1 Sorcery Point to cast it without its verbal component and without any showy gestures, so onlookers must succeed on a Wisdom (Perception) check against your spell save DC to notice you casting at all.",
  },
  {
    key: "snapcast",
    name: "Snapcast",
    cost: "2 Sorcery Points",
    description:
      "When you cast a spell that has a casting time of 1 action, you can spend 2 Sorcery Points to change its casting time to 1 bonus action for this casting.",
  },
  {
    key: "farcast",
    name: "Farcast",
    cost: "1 Sorcery Point",
    description:
      "When you cast a spell that has a range of 5 feet or greater, you can spend 1 Sorcery Point to double that spell's range. If the spell has a range of touch, you can spend 1 Sorcery Point to instead give it a range of 30 feet.",
  },
  {
    key: "splitcast",
    name: "Splitcast",
    cost: "Spell's level (minimum 1)",
    description:
      "When you cast a spell that targets only one creature and doesn't have a range of self, you can spend a number of Sorcery Points equal to the spell's level to also target a second creature within range with the same spell.",
  },
  {
    key: "steadfast-casting",
    name: "Steadfast Casting",
    cost: "1 Sorcery Point",
    description:
      "When you fail a Constitution saving throw to maintain concentration on a spell, you can spend 1 Sorcery Point to reroll the saving throw and use the new result.",
  },
  {
    key: "overpowered-casting",
    name: "Overpowered Casting",
    cost: "2 Sorcery Points",
    description:
      "When you roll damage for a spell, you can spend 2 Sorcery Points to reroll any number of the damage dice once and use the new rolls.",
  },
  {
    key: "lingering-casting",
    name: "Lingering Casting",
    cost: "1 Sorcery Point",
    description:
      "When you cast a spell that has a duration of 1 minute or longer, you can spend 1 Sorcery Point to double its duration, to a maximum of 24 hours.",
  },
  {
    key: "resistant-casting",
    name: "Resistant Casting",
    cost: "1 Sorcery Point",
    description:
      "When a creature succeeds on a saving throw against a damaging spell you cast, you can spend 1 Sorcery Point to deal half that spell's damage to the creature anyway.",
  },
  {
    key: "unseen-casting",
    name: "Unseen Casting",
    cost: "1 Sorcery Point",
    description:
      "When you cast a spell that has a material component costing no gold and not consumed by the spell, you can spend 1 Sorcery Point to ignore that material component, conjuring the magic from yourself instead.",
  },
];

// Channel Divinity (Cleric, from level 2): the feature's own 2024 SRD text
// confirms the BASE directly ("You can use this class's Channel Divinity
// twice"), but only references higher-level increases via "the Channel
// Divinity column of the Cleric Features table" without giving those
// breakpoints in prose — and the only structured table this app has (the
// `levels` table) is 2014-only data with a different base (1, not 2), so it
// can't be trusted for 2024's higher breakpoints either. Modeling only the
// confirmed base (flat 2 from level 2 up) rather than guessing at the real
// table's higher-level increases — a Cleric above roughly level 10 will see
// fewer charges here than the real rules eventually grant. Unlike Metamagic's
// schedule (which the SRD text spelled out in full), this gap is a genuine
// "couldn't confirm" rather than something to homebrew, since the real
// numbers do exist, just not anywhere checkable in this app's data pipeline.
// Named per-class (not just `channelDivinityMax`) once Paladin needed its own
// Channel Divinity schedule too — same feature name, different numbers.
export function clericChannelDivinityMax(level: number): number {
  return level >= 2 ? 2 : 0;
}

// Paladin's own Channel Divinity schedule — fully confirmed in prose, unlike
// Cleric's: "You can use this class's Channel Divinity twice... You gain an
// additional use when you reach Paladin level 11." Base of 2 starts at level
// 3 (when Paladin gets the feature at all), not level 2 like Cleric.
export function paladinChannelDivinityMax(level: number): number {
  return level >= 11 ? 3 : level >= 3 ? 2 : 0;
}

// Lay on Hands (Paladin, from level 1): "you have a pool of healing power...
// you can restore a total number of Hit Points equal to five times your
// Paladin level" — confirmed directly, a single clean formula rather than a
// per-level table.
export function layOnHandsMax(level: number): number {
  return 5 * level;
}

// Divine Spark (one of Channel Divinity's two base effects): "Roll 1d8 and
// add your Wisdom modifier... You roll an additional d8 when you reach Cleric
// levels 7 (2d8), 13 (3d8), and 18 (4d8)" — confirmed directly from the
// Channel Divinity feature's own SRD text, a clean scaling-dice progression
// the same way Sneak Attack's is.
export function divineSparkDice(level: number): number {
  return level >= 18 ? 4 : level >= 13 ? 3 : level >= 7 ? 2 : 1;
}

// Bardic Inspiration's die size — "the die becomes a d8 at level 5, a d10 at
// level 10, and a d12 at level 15" — confirmed directly from the Bardic
// Inspiration feature's own SRD text.
export function bardicInspirationDie(level: number): number {
  return level >= 15 ? 12 : level >= 10 ? 10 : level >= 5 ? 8 : 6;
}

// Bardic Inspiration's use count is keyed by ability modifier, not level —
// "a number of times equal to your Charisma modifier (minimum of once)" —
// confirmed directly from the feature's own SRD text. Unlike every other
// resource-max function so far (level-only), this one genuinely needs the
// final CHA modifier as input.
export function bardicInspirationMax(chaModifier: number): number {
  return Math.max(1, chaModifier);
}

// Wild Shape (Druid, from level 2): the feature's own SRD text confirms the
// base directly ("You can use Wild Shape twice... You regain one expended
// use when you finish a Short Rest, and you regain all expended uses when
// you finish a Long Rest") — the same Short/Long Rest split as Channel
// Divinity. Higher-level increases are referenced via "the Wild Shape column
// of the Druid Features table" without giving those breakpoints in prose —
// the table the feature text DOES give in full ("Beast Shapes": known forms
// and max CR by level) is a different axis entirely, not the use count. Same
// disclosed simplification as channelDivinityMax: flat base, not a guessed
// table for the part that isn't checkable anywhere in this app's pipeline.
export function wildShapeMax(level: number): number {
  return level >= 2 ? 2 : 0;
}

// Pact Magic (Warlock) slot count and slot level by character level — both
// confirmed directly from the feature's own 2024 SRD text via two
// independent worked examples: "when you're a level 5 Warlock, you have two
// level 3 spell slots" (matches index 4 below: count 2, level 3) and "When
// you reach level 6, for example, you learn a new Warlock spell, which can
// be of levels 1–3" (confirms slot level is STILL 3 at level 6, and that the
// Prepared Spells count increases by exactly 1 from level 5 to 6 — see
// WARLOCK_PREPARED_SPELLS below, 6 -> 7). Despite living in the same
// 2014-tagged `levels` table that's been stale/wrong about base values
// elsewhere this session (Channel Divinity, Eldritch Invocations), these two
// cross-checks against the 2024 prose's own worked examples are why this
// table is trusted as real and complete rather than treated as a disclosed
// flat-base-only simplification. All slots are always the same single
// level, unlike every other caster's table — Pact Magic's signature trait.
const WARLOCK_SLOT_COUNT = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
const WARLOCK_SLOT_LEVEL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

// Padded to 9 columns (same shape as fullCasterSlots/halfCasterSlots) so the
// UI's generic "iterate spellSlots, skip zero entries" rendering needs no
// Warlock-specific branch — the array just happens to have only one nonzero
// entry, at whatever level Pact Magic's slots currently sit at.
export function warlockSlots(level: number): number[] {
  const i = Math.max(1, Math.min(MAX_LEVEL, level)) - 1;
  const slots = new Array(9).fill(0);
  slots[WARLOCK_SLOT_LEVEL[i] - 1] = WARLOCK_SLOT_COUNT[i];
  return slots;
}

// Pact Magic's Prepared Spells count — confirmed via the same two worked
// examples as the slot table above (level 1 -> 2 spells from "choose two
// level 1 Warlock spells"; level 5->6 shows a confirmed +1 step). NOT the
// generic "level + ability modifier" formula every other 2024 prepared
// caster uses (preparedSpellCount) — Warlock's own text gives a much
// slower, level-only progression instead, consistent with having far fewer
// slots to cast from.
const WARLOCK_PREPARED_SPELLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];

export function warlockPreparedSpellsMax(level: number): number {
  return WARLOCK_PREPARED_SPELLS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Magical Cunning (Warlock, from level 2): "you can perform an esoteric rite
// for 1 minute. At the end of it, you regain expended Pact Magic spell slots
// but no more than a number equal to half your maximum (round up). Once you
// use this feature, you can't do so again until you finish a Long Rest." —
// confirmed directly. Takes the Warlock's current slot count (not level) so
// the caller doesn't need to re-derive it from the slot tables above.
export function magicalCunningRegain(maxSlots: number): number {
  return Math.ceil(maxSlots / 2);
}

// Fighting Style (Fighter level 1, +1 more at level 7; Paladin/Ranger both
// from level 2) — confirmed real SRD feats, type='fighting-style' in the
// feats table (Archery/Defense/Great Weapon Fighting/Two-Weapon Fighting),
// distinct from the homebrew general-feat pool. Maps each granting class to
// its own known-count-by-level function, same generic-lookup pattern as
// CANTRIPS_KNOWN_BY_CLASS/EXPERTISE_SCHEDULE so any future class that grants
// Fighting Style plugs in for free.
export function fighterFightingStylesKnown(level: number): number {
  return level >= 7 ? 2 : level >= 1 ? 1 : 0;
}

export function paladinFightingStylesKnown(level: number): number {
  return level >= 2 ? 1 : 0;
}

export function rangerFightingStylesKnown(level: number): number {
  return level >= 2 ? 1 : 0;
}

export const FIGHTING_STYLE_KNOWN_BY_CLASS: Record<string, (level: number) => number> = {
  fighter: fighterFightingStylesKnown,
  paladin: paladinFightingStylesKnown,
  ranger: rangerFightingStylesKnown,
};

// Weapon Mastery (level 1): each class's own feature text confirms a base
// count directly ("the mastery properties of two/three kinds of weapons of
// your choice"). Barbarian and Fighter's text additionally references "the
// Weapon Mastery column of the [Class] Features table" for higher-level
// increases — that table isn't in this app's data anywhere (the 2024
// mechanic has no 2014 precedent to cross-check, unlike Action Surge/
// Indomitable), so those two stay a disclosed flat count at their confirmed
// level-1 base, same treatment as Channel Divinity/Wild Shape/Rage. Paladin/
// Ranger/Rogue's own text never references a scaling table at all — their
// counts are genuinely flat forever, not a gap. A plain Record (not a
// per-level function like FIGHTING_STYLE_KNOWN_BY_CLASS) since there's no
// real table to encode for any of the five.
export const WEAPON_MASTERY_KNOWN_BY_CLASS: Record<string, number> = {
  barbarian: 2,
  fighter: 3,
  paladin: 2,
  ranger: 2,
  rogue: 2,
};

// Barbarian's text specifically restricts choices to "Simple or Martial
// Melee weapons" — the other four classes' text just says "weapons of your
// choice with which you have proficiency," no melee restriction.
export const WEAPON_MASTERY_MELEE_ONLY_CLASSES = new Set(["barbarian"]);

// Second Wind (Fighter, from level 1): "As a Bonus Action, you can use it to
// regain Hit Points equal to 1d10 plus your Fighter level. You can use this
// feature twice. You regain one expended use when you finish a Short Rest,
// and you regain all expended uses when you finish a Long Rest." Confirmed
// base of 2; higher-level increases are referenced via "the Second Wind
// column of the Fighter Features table" without giving those breakpoints in
// prose, and (unlike Action Surge/Indomitable below) the 2014 `levels` table
// has no corresponding field to cross-check against either — so this stays a
// disclosed flat simplification, same treatment as clericChannelDivinityMax/
// wildShapeMax/favoredEnemyMax.
export function secondWindMax(level: number): number {
  return level >= 1 ? 2 : 0;
}

// Action Surge (Fighter, from level 2): "Once you use this feature, you
// can't do so again until you finish a Short or Long Rest. Starting at level
// 17, you can use it twice before a rest but only once on a turn." Fully
// confirmed schedule (1 from level 2, 2 from level 17) — cross-validated
// against the 2014 `levels` table's class_specific.action_surges column,
// which matches these exact breakpoints (0/1/2 at 1/2/17), unlike Second
// Wind's missing column above.
export function actionSurgeMax(level: number): number {
  return level >= 17 ? 2 : level >= 2 ? 1 : 0;
}

// Indomitable (Fighter, from level 9): "you can reroll it with a bonus equal
// to your Fighter level... you can't use this feature again until you finish
// a Long Rest. You can use this feature twice before a Long Rest starting at
// level 13 and three times... at level 17." Fully confirmed schedule (1/2/3
// at 9/13/17) — cross-validated against the 2014 levels table's
// class_specific.indomitable_uses column, exact match. Long-Rest-only, no
// Short Rest component (confirmed by omission — the text only mentions Long
// Rest, unlike Second Wind/Action Surge which both explicitly mention Short
// Rest too).
export function indomitableMax(level: number): number {
  return level >= 17 ? 3 : level >= 13 ? 2 : level >= 9 ? 1 : 0;
}

// Rage (Barbarian, from level 1): "You can enter your Rage the number of
// times shown for your Barbarian level in the Rages column of the Barbarian
// Features table" — unlike every other class's resource so far, the 2024
// prose gives NO concrete number anywhere, not even a level-1 example
// (compare Channel Divinity's confirmed "twice," or Pact Magic's confirmed
// level-5 worked example). The only number anywhere in this app's pipeline
// is the 2014 `levels` table's rage_count column, which can't be
// cross-validated against any 2024 text the way Action Surge/Indomitable's
// columns were above. Used here as the best available signal — a small,
// steadily-growing resource pool is a conservative, edition-stable shape
// unlikely to have changed dramatically — rather than falling back to a
// degenerate flat minimum that would make Rage barely functional past
// level 1. ONE explicit override: the 2014 table's level-20 value (9999,
// "unlimited Rage") is deliberately NOT carried over. 2024 demonstrably
// redesigned the level-20 capstone into Primal Champion's flat +4 STR/CON
// instead (a real, confirmed, very different mechanic — see the Primal
// Champion handling in character-sheet.ts's buildCharacterSheet), so
// assuming "unlimited Rage" still exists alongside that redesign would be
// guessing further than the data supports. Level 20 instead continues
// level 19's value rather than jumping to an assumed-dramatic capstone.
const RAGE_MAX = [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6];

export function rageMax(level: number): number {
  return RAGE_MAX[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Rage Damage bonus — same sourcing/confidence caveat as rageMax above (no
// 2024 prose example anywhere, 2014 table used as best-available signal).
// No level-20 capstone risk here, though — this column's progression
// (+2/+3/+4) is untouched by the Primal Champion redesign, unlike rage_count.
const RAGE_DAMAGE_BONUS = [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];

export function rageDamageBonus(level: number): number {
  return RAGE_DAMAGE_BONUS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Brutal Strike (Barbarian, from level 9): "the target takes an extra 1d10
// damage of the same type dealt by the weapon" — confirmed directly.
// Improved Brutal Strike (level 17): "The extra damage of your Brutal
// Strike increases to 2d10" — confirmed directly. Deliberately distinct
// from the 2014 table's brutal_critical_dice column, which is a different,
// older mechanic (2014's "Brutal Critical" added extra weapon damage dice
// only on a confirmed critical hit, not on every hit like 2024's Brutal
// Strike) — not reused here even though the name is similar.
export function brutalStrikeDice(level: number): number {
  return level >= 17 ? 2 : level >= 9 ? 1 : 0;
}

// Level-20 capstone ability score boosts (+4 to two abilities, capped at 25
// instead of the universal 20) — Barbarian's Primal Champion ("Your
// Strength and Constitution scores increase by 4, to a maximum of 25") and
// Monk's Body and Mind ("Your Dexterity and Wisdom scores increase by 4, to
// a maximum of 25"), both confirmed directly in prose. Mapped generically
// (rather than two near-duplicate if-blocks in buildCharacterSheet) so any
// later class with the same capstone shape plugs in for free.
export const LEVEL_20_ABILITY_BOOSTS: Record<string, [AbilityKey, AbilityKey]> = {
  barbarian: ["str", "con"],
  monk: ["dex", "wis"],
};

// Martial Arts die size by level (Monk, from level 1) — d4/d6/d8/d10 at
// 1/5/11/17. Same lower-confidence-tier sourcing as Barbarian's Rage tables:
// the 2024 prose only ever says "as shown in the Martial Arts column of the
// Monk Features table," giving no concrete level-tied example anywhere
// (every OTHER feature that references "your Martial Arts die" — Deflect
// Attacks, Heightened Focus — uses it generically without naming a size at
// any level), so this is the 2014 table's value used as best-available
// signal rather than an independently cross-validated real table. The
// underlying shape (a die that steps up every several levels) is
// conservative and edition-stable, the same reasoning applied to Rage.
const MARTIAL_ARTS_DIE = [4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10];

export function martialArtsDie(level: number): number {
  return MARTIAL_ARTS_DIE[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Focus Points — 2024's renaming of 2014's Ki Points (Monk, from level 2):
// equals Monk level. Same sourcing caveat as martialArtsDie above (no 2024
// prose example; 2014 table's ki_points column used as best-available
// signal), though this specific shape — points equal to class level from a
// given level on — already has real confirmed precedent in this app
// (Sorcery Points' own confirmed level-2 example uses the identical
// formula), making it a lower-risk table to trust than Rage's.
export function focusPointsMax(level: number): number {
  return level >= 2 ? level : 0;
}

// Unarmored Movement bonus by level (Monk, from level 2): "+10 feet while
// you aren't wearing armor or wielding a Shield... increases when you reach
// certain Monk levels." Same sourcing caveat as the two tables above.
const UNARMORED_MOVEMENT_BONUS = [
  0, 10, 10, 10, 10, 15, 15, 15, 15, 20, 20, 20, 20, 25, 25, 25, 25, 30, 30, 30,
];

export function unarmoredMovementBonus(level: number): number {
  return UNARMORED_MOVEMENT_BONUS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}

// Wholeness of Body (Monk, from level 6): "roll your Martial Arts die. You
// regain a number of Hit Points equal to the number rolled plus your Wisdom
// modifier... a number of times equal to your Wisdom modifier (minimum of
// once)." Confirmed directly — same ability-mod-keyed shape as
// bardicInspirationMax, just a different ability.
export function wholenessOfBodyMax(wisModifier: number): number {
  return Math.max(1, wisModifier);
}

// Species traits (Dragonborn's Breath Weapon, from level 1): "a creature
// takes 1d10 [damage type] damage. On a successful save, a creature takes
// half as much damage. This damage increases by 1d10 when you reach
// character levels 5 (2d10), 11 (3d10), and 17 (4d10)." Confirmed directly
// from the trait's own SRD text (same breakpoints for every Draconic
// Ancestor subspecies — only the damage type differs, not the dice). Uses
// = Proficiency Bonus and the save DC (8 + CON mod + Proficiency Bonus) are
// both computed directly at the call site rather than as separate
// functions here, since they're not new formulas — the same proficiency
// bonus and DC-8-plus-mod-plus-prof shape used everywhere else in this app.
export function breathWeaponDice(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

// Species whose traits turn the Unarmed Strike into a natural weapon, surfaced
// as its own row in the Attacks section. Values read straight from each
// (homebrew) trait's own description text — NOT the real published stat
// blocks: Tabaxi/Tortle Claws deal 1d4 Slashing, Satyr's Ram's Headbutt deals
// 1d4 Bludgeoning (plus a 5-ft push, surfaced as a note). All use STR like a
// normal Unarmed Strike (none are Finesse). Damage adds the STR modifier the
// same way resolveWeapons does for equipped weapons.
export const SPECIES_NATURAL_WEAPONS: Record<
  string,
  { name: string; damageDie: number; damageType: string; note: string | null }
> = {
  tabaxi: { name: "Claws", damageDie: 4, damageType: "Slashing", note: null },
  tortle: { name: "Claws", damageDie: 4, damageType: "Slashing", note: null },
  satyr: {
    name: "Ram's Headbutt",
    damageDie: 4,
    damageType: "Bludgeoning",
    note: "On a hit, you can push the target up to 5 ft away.",
  },
};

// Subclasses that grant always-prepared spells at certain class levels.
// 2024 stores these as a table jammed into the subclass feature's prose
// (e.g. "Life Domain Spells"), not structured data — so the lists are
// transcribed here by hand from each subclass's own feature text, keyed by
// subclass index, as {level, spells:[{name, index}]} milestones. `index` is
// the 2014-ruleset spell slug used to look up full details; a few 2024-only
// spells (Chromatic Orb, Dragon's Breath, Charm Monster, Aura of Life,
// Summon Dragon) aren't in the 2014 dataset and resolve to name-only rows.
// Paladin/Cleric/Warlock/Sorcerer subclasses grant these as oath/domain/
// patron spells. Homebrew subclasses (below the official block) grant their
// own thematic lists at full official depth, authored from real SRD spells.
export const SUBCLASS_PREPARED_SPELLS: Record<
  string,
  { level: number; spells: { name: string; index: string }[] }[]
> = {
  "life-domain": [
    { level: 3, spells: [
      { name: "Aid", index: "aid" },
      { name: "Bless", index: "bless" },
      { name: "Cure Wounds", index: "cure-wounds" },
      { name: "Lesser Restoration", index: "lesser-restoration" },
    ] },
    { level: 5, spells: [
      { name: "Mass Healing Word", index: "mass-healing-word" },
      { name: "Revivify", index: "revivify" },
    ] },
    { level: 7, spells: [
      { name: "Aura of Life", index: "aura-of-life" },
      { name: "Death Ward", index: "death-ward" },
    ] },
    { level: 9, spells: [
      { name: "Greater Restoration", index: "greater-restoration" },
      { name: "Mass Cure Wounds", index: "mass-cure-wounds" },
    ] },
  ],
  "fiend-patron": [
    { level: 3, spells: [
      { name: "Burning Hands", index: "burning-hands" },
      { name: "Command", index: "command" },
      { name: "Scorching Ray", index: "scorching-ray" },
      { name: "Suggestion", index: "suggestion" },
    ] },
    { level: 5, spells: [
      { name: "Fireball", index: "fireball" },
      { name: "Stinking Cloud", index: "stinking-cloud" },
    ] },
    { level: 7, spells: [
      { name: "Fire Shield", index: "fire-shield" },
      { name: "Wall of Fire", index: "wall-of-fire" },
    ] },
    { level: 9, spells: [
      { name: "Geas", index: "geas" },
      { name: "Insect Plague", index: "insect-plague" },
    ] },
  ],
  "draconic-sorcery": [
    { level: 3, spells: [
      { name: "Alter Self", index: "alter-self" },
      { name: "Chromatic Orb", index: "chromatic-orb" },
      { name: "Command", index: "command" },
      { name: "Dragon's Breath", index: "dragons-breath" },
    ] },
    { level: 5, spells: [
      { name: "Fear", index: "fear" },
      { name: "Fly", index: "fly" },
    ] },
    { level: 7, spells: [
      { name: "Arcane Eye", index: "arcane-eye" },
      { name: "Charm Monster", index: "charm-monster" },
    ] },
    { level: 9, spells: [
      { name: "Legend Lore", index: "legend-lore" },
      { name: "Summon Dragon", index: "summon-dragon" },
    ] },
  ],
  // Oath of Devotion (Paladin) — half-caster oath spells at levels 3/5/9/13/17,
  // transcribed from the authoritative 2024 SRD 5.2 Oath of Devotion Spells
  // table (the dataset's own copy was garbled; the DB row was rebuilt to match).
  "oath-of-devotion": [
    { level: 3, spells: [
      { name: "Protection from Evil and Good", index: "protection-from-evil-and-good" },
      { name: "Shield of Faith", index: "shield-of-faith" },
    ] },
    { level: 5, spells: [
      { name: "Aid", index: "aid" },
      { name: "Zone of Truth", index: "zone-of-truth" },
    ] },
    { level: 9, spells: [
      { name: "Beacon of Hope", index: "beacon-of-hope" },
      { name: "Dispel Magic", index: "dispel-magic" },
    ] },
    { level: 13, spells: [
      { name: "Freedom of Movement", index: "freedom-of-movement" },
      { name: "Guardian of Faith", index: "guardian-of-faith" },
    ] },
    { level: 17, spells: [
      { name: "Commune", index: "commune" },
      { name: "Flame Strike", index: "flame-strike" },
    ] },
  ],

  // ---- Homebrew subclasses ----
  // Caster homebrew subclasses get full official-depth spell lists, matching
  // what Life Domain / Fiend / Draconic / Oath of Devotion grant. All spells
  // are real SRD spells (valid 2014 slugs). Milestone levels follow the
  // official cadence: Cleric/Sorcerer/Warlock at 3/5/7/9, Paladin at
  // 3/5/9/13/17. Wizard/Bard/Druid/Ranger homebrew subclasses intentionally
  // get NO list — their official 2024 counterparts don't grant one either.

  // Cleric domains (the War/Tempest/Trickery lists are themselves open SRD).
  "war-domain": [
    { level: 3, spells: [{ name: "Divine Favor", index: "divine-favor" }, { name: "Spiritual Weapon", index: "spiritual-weapon" }] },
    { level: 5, spells: [{ name: "Haste", index: "haste" }, { name: "Spirit Guardians", index: "spirit-guardians" }] },
    { level: 7, spells: [{ name: "Freedom of Movement", index: "freedom-of-movement" }, { name: "Stoneskin", index: "stoneskin" }] },
    { level: 9, spells: [{ name: "Flame Strike", index: "flame-strike" }, { name: "Hold Monster", index: "hold-monster" }] },
  ],
  "storm-domain": [
    { level: 3, spells: [{ name: "Fog Cloud", index: "fog-cloud" }, { name: "Thunderwave", index: "thunderwave" }] },
    { level: 5, spells: [{ name: "Call Lightning", index: "call-lightning" }, { name: "Sleet Storm", index: "sleet-storm" }] },
    { level: 7, spells: [{ name: "Control Water", index: "control-water" }, { name: "Ice Storm", index: "ice-storm" }] },
    { level: 9, spells: [{ name: "Cone of Cold", index: "cone-of-cold" }, { name: "Insect Plague", index: "insect-plague" }] },
  ],
  "trickery-domain": [
    { level: 3, spells: [{ name: "Disguise Self", index: "disguise-self" }, { name: "Mirror Image", index: "mirror-image" }] },
    { level: 5, spells: [{ name: "Blink", index: "blink" }, { name: "Dispel Magic", index: "dispel-magic" }] },
    { level: 7, spells: [{ name: "Dimension Door", index: "dimension-door" }, { name: "Polymorph", index: "polymorph" }] },
    { level: 9, spells: [{ name: "Dominate Person", index: "dominate-person" }, { name: "Modify Memory", index: "modify-memory" }] },
  ],

  // Warlock patrons.
  "fey-patron": [
    { level: 3, spells: [{ name: "Faerie Fire", index: "faerie-fire" }, { name: "Calm Emotions", index: "calm-emotions" }] },
    { level: 5, spells: [{ name: "Blink", index: "blink" }, { name: "Plant Growth", index: "plant-growth" }] },
    { level: 7, spells: [{ name: "Dominate Beast", index: "dominate-beast" }, { name: "Greater Invisibility", index: "greater-invisibility" }] },
    { level: 9, spells: [{ name: "Dominate Person", index: "dominate-person" }, { name: "Seeming", index: "seeming" }] },
  ],
  "celestial-patron": [
    { level: 3, spells: [{ name: "Cure Wounds", index: "cure-wounds" }, { name: "Guiding Bolt", index: "guiding-bolt" }] },
    { level: 5, spells: [{ name: "Daylight", index: "daylight" }, { name: "Revivify", index: "revivify" }] },
    { level: 7, spells: [{ name: "Death Ward", index: "death-ward" }, { name: "Guardian of Faith", index: "guardian-of-faith" }] },
    { level: 9, spells: [{ name: "Flame Strike", index: "flame-strike" }, { name: "Greater Restoration", index: "greater-restoration" }] },
  ],
  "voidborn-patron": [
    { level: 3, spells: [{ name: "Hideous Laughter", index: "hideous-laughter" }, { name: "Detect Thoughts", index: "detect-thoughts" }] },
    { level: 5, spells: [{ name: "Clairvoyance", index: "clairvoyance" }, { name: "Sending", index: "sending" }] },
    { level: 7, spells: [{ name: "Black Tentacles", index: "black-tentacles" }, { name: "Confusion", index: "confusion" }] },
    { level: 9, spells: [{ name: "Dominate Person", index: "dominate-person" }, { name: "Telekinesis", index: "telekinesis" }] },
  ],

  // Sorcerer origins.
  "wildspark-sorcery": [
    { level: 3, spells: [{ name: "Color Spray", index: "color-spray" }, { name: "Blur", index: "blur" }] },
    { level: 5, spells: [{ name: "Haste", index: "haste" }, { name: "Slow", index: "slow" }] },
    { level: 7, spells: [{ name: "Confusion", index: "confusion" }, { name: "Polymorph", index: "polymorph" }] },
    { level: 9, spells: [{ name: "Telekinesis", index: "telekinesis" }, { name: "Seeming", index: "seeming" }] },
  ],
  "stormborn-sorcery": [
    { level: 3, spells: [{ name: "Thunderwave", index: "thunderwave" }, { name: "Gust of Wind", index: "gust-of-wind" }] },
    { level: 5, spells: [{ name: "Call Lightning", index: "call-lightning" }, { name: "Fly", index: "fly" }] },
    { level: 7, spells: [{ name: "Ice Storm", index: "ice-storm" }, { name: "Control Water", index: "control-water" }] },
    { level: 9, spells: [{ name: "Cone of Cold", index: "cone-of-cold" }, { name: "Telekinesis", index: "telekinesis" }] },
  ],
  "starborn-sorcery": [
    { level: 3, spells: [{ name: "Faerie Fire", index: "faerie-fire" }, { name: "Detect Thoughts", index: "detect-thoughts" }] },
    { level: 5, spells: [{ name: "Sending", index: "sending" }, { name: "Clairvoyance", index: "clairvoyance" }] },
    { level: 7, spells: [{ name: "Arcane Eye", index: "arcane-eye" }, { name: "Banishment", index: "banishment" }] },
    { level: 9, spells: [{ name: "Telepathic Bond", index: "telepathic-bond" }, { name: "Scrying", index: "scrying" }] },
  ],

  // Paladin oaths (half-caster cadence: 3/5/9/13/17).
  "oath-of-the-stormguard": [
    { level: 3, spells: [{ name: "Divine Favor", index: "divine-favor" }, { name: "Thunderwave", index: "thunderwave" }] },
    { level: 5, spells: [{ name: "Gust of Wind", index: "gust-of-wind" }, { name: "Shatter", index: "shatter" }] },
    { level: 9, spells: [{ name: "Call Lightning", index: "call-lightning" }, { name: "Sleet Storm", index: "sleet-storm" }] },
    { level: 13, spells: [{ name: "Control Water", index: "control-water" }, { name: "Ice Storm", index: "ice-storm" }] },
    { level: 17, spells: [{ name: "Cone of Cold", index: "cone-of-cold" }, { name: "Insect Plague", index: "insect-plague" }] },
  ],
  "oath-of-the-wanderer": [
    { level: 3, spells: [{ name: "Longstrider", index: "longstrider" }, { name: "Expeditious Retreat", index: "expeditious-retreat" }] },
    { level: 5, spells: [{ name: "Pass without Trace", index: "pass-without-trace" }, { name: "Locate Object", index: "locate-object" }] },
    { level: 9, spells: [{ name: "Haste", index: "haste" }, { name: "Water Walk", index: "water-walk" }] },
    { level: 13, spells: [{ name: "Freedom of Movement", index: "freedom-of-movement" }, { name: "Locate Creature", index: "locate-creature" }] },
    { level: 17, spells: [{ name: "Commune with Nature", index: "commune-with-nature" }, { name: "Tree Stride", index: "tree-stride" }] },
  ],
  "oath-of-judgment": [
    { level: 3, spells: [{ name: "Bane", index: "bane" }, { name: "Hunter's Mark", index: "hunters-mark" }] },
    { level: 5, spells: [{ name: "Hold Person", index: "hold-person" }, { name: "Zone of Truth", index: "zone-of-truth" }] },
    { level: 9, spells: [{ name: "Bestow Curse", index: "bestow-curse" }, { name: "Fear", index: "fear" }] },
    { level: 13, spells: [{ name: "Banishment", index: "banishment" }, { name: "Compulsion", index: "compulsion" }] },
    { level: 17, spells: [{ name: "Hold Monster", index: "hold-monster" }, { name: "Dispel Evil and Good", index: "dispel-evil-and-good" }] },
  ],
};

// Base-species traits that grant an at-will cantrip from the species itself
// (not a subspecies/lineage). Maps the trait index → the spell index to fetch
// and surface. Tiefling's Otherworldly Presence grants Thaumaturgy at-will —
// it lives on the base species, so it can't ride the lineage-spell-* subspecies
// path Fire Bolt/Chill Touch use.
export const SPECIES_CANTRIP_SPELL: Record<string, string> = {
  "otherworldly-presence": "thaumaturgy",
};

// Maps subspecies index → the class whose cantrip list to use for the
// lineage cantrip picker (e.g. High Elf's Prestidigitation → Wizard list).
export const LINEAGE_CANTRIP_CLASS: Record<string, string> = {
  "elven-lineage-high-elf": "wizard",
};

// Maps trait index → the cantrip's default name and which class list the
// player picks from. Mirrors LINEAGE_CANTRIP_CLASS but keyed by the trait
// that grants the ability (used in character-sheet.ts and PlaySheet.tsx
// to surface the interactive picker next to the right trait).
export const SWAPPABLE_CANTRIP_TRAITS: Record<
  string,
  { defaultCantrip: string; cantripClass: string }
> = {
  "high-elf-cantrip-versatility": { defaultCantrip: "Prestidigitation", cantripClass: "wizard" },
};
