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
}

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

export function finalAbilityScores(
  base: AbilityScores,
  bonus: AbilityBonusChoice | null,
): AbilityScores {
  const result = { ...base };
  if (!bonus) return result;
  if (bonus.mode === "two" && bonus.plusTwo) {
    result[bonus.plusTwo] = (result[bonus.plusTwo] ?? 0) + 2;
  }
  for (const ability of bonus.plusOne) {
    result[ability] = (result[ability] ?? 0) + 1;
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
