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
};

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

export function maxHpAtLevelOne(hitDie: number, conMod: number): number {
  return hitDie + conMod;
}
