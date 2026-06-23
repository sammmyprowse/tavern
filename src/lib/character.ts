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

export function computeArmorClass(equipped: EquipmentItem[], dexMod: number): number {
  const shield = equipped.find((item) => item.index === "shield");
  const bodyArmor = equipped.find(
    (item) => item.armor_class && item.index !== "shield",
  );

  let ac: number;
  if (bodyArmor?.armor_class) {
    const { base, dex_bonus, max_bonus } = bodyArmor.armor_class;
    const dexContribution = dex_bonus
      ? max_bonus != null
        ? Math.min(dexMod, max_bonus)
        : dexMod
      : 0;
    ac = base + dexContribution;
  } else {
    ac = 10 + dexMod;
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

// HP gained per level-up beyond 1 is never less than 1 (standard 5e rule), even
// for a Sorcerer/Wizard (d6) with a negative or zero CON modifier.
export function hpGainForLevelUp(hitDie: number, conMod: number, roll: number): number {
  return Math.max(1, roll + conMod);
}

export function fixedAverageHpGain(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}
