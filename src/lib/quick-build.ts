import {
  ABILITY_ORDER,
  STANDARD_ARRAY,
  EMPTY_DRAFT,
  WEAPON_MASTERY_KNOWN_BY_CLASS,
  WEAPON_MASTERY_MELEE_ONLY_CLASSES,
  type AbilityKey,
  type CharacterDraft,
} from "./character";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  LanguageOption,
  EquipmentLookupItem,
} from "./srd";

// The order to hand out the standard array (15/14/13/12/10/8) per class —
// primary attack/spellcasting ability first, then the usual survival stats.
// Reflects the 2024 PHB's own recommended arrays.
const CLASS_ABILITY_PRIORITY: Record<string, AbilityKey[]> = {
  barbarian: ["str", "con", "dex", "wis", "cha", "int"],
  bard: ["cha", "dex", "con", "wis", "int", "str"],
  cleric: ["wis", "con", "str", "dex", "cha", "int"],
  druid: ["wis", "con", "dex", "int", "cha", "str"],
  fighter: ["str", "con", "dex", "wis", "cha", "int"],
  monk: ["dex", "wis", "con", "str", "int", "cha"],
  paladin: ["str", "cha", "con", "wis", "dex", "int"],
  ranger: ["dex", "wis", "con", "str", "int", "cha"],
  rogue: ["dex", "con", "wis", "cha", "int", "str"],
  sorcerer: ["cha", "con", "dex", "wis", "int", "str"],
  warlock: ["cha", "con", "dex", "wis", "int", "str"],
  wizard: ["int", "con", "dex", "wis", "cha", "str"],
};

const RANDOM_NAMES = [
  "Aldric", "Bryn", "Corvin", "Dalia", "Elara", "Fenwick", "Greta", "Halden",
  "Isolde", "Joric", "Kestrel", "Lyra", "Marn", "Nadia", "Orin", "Perrin",
  "Quilla", "Roran", "Sable", "Thorne", "Ulric", "Vesper", "Wren", "Yara",
];

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// Pick the first element (deterministic quick build) or a random one (surprise).
function pickOne<T>(arr: T[], random: boolean): T | undefined {
  if (arr.length === 0) return undefined;
  return random ? arr[randInt(arr.length)] : arr[0];
}

export interface QuickBuildRefs {
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  languages: LanguageOption[];
  equipment: EquipmentLookupItem[];
}

export interface QuickBuildOptions {
  speciesIndex?: string;
  classIndex?: string;
  name?: string;
  // true = fill any unspecified field randomly; false = deterministic defaults.
  random: boolean;
}

// Produce a complete, valid level-1 CharacterDraft from a species + class + name
// (any of which may be omitted and chosen for you). Every builder step's
// requirements are satisfied: skills, ability scores, background + its ability
// bonus + tool choice, two languages, and weapon mastery for classes that have
// it — so the result drops straight into Review and saves cleanly.
export function buildQuickDraft(refs: QuickBuildRefs, opts: QuickBuildOptions): CharacterDraft {
  const random = opts.random;

  const species =
    refs.species.find((s) => s.index === opts.speciesIndex) ?? pickOne(refs.species, random)!;
  const cls =
    refs.classes.find((c) => c.index === opts.classIndex) ?? pickOne(refs.classes, random)!;

  // Subspecies (only if the species has lineages).
  const subOptions = refs.subspecies.filter((s) => s.speciesIndex === species.index);
  const subspecies = species.hasSubspecies ? pickOne(subOptions, random) : undefined;

  // Ability scores — standard array along the class's priority order.
  const priority = CLASS_ABILITY_PRIORITY[cls.index] ?? [...ABILITY_ORDER];
  const baseAbilityScores = {} as Record<AbilityKey, number>;
  priority.forEach((ability, i) => {
    baseAbilityScores[ability] = STANDARD_ARRAY[i] ?? 8;
  });

  // Skills — take the required count from each proficiency-choice group.
  const skillChoices: string[] = [];
  for (const pc of cls.proficiencyChoices) {
    const pool = random ? [...pc.options].sort(() => Math.random() - 0.5) : pc.options;
    for (const opt of pool.slice(0, pc.choose)) skillChoices.push(opt.index);
  }

  // Background + its ability bonus (+2 to the class's best eligible ability,
  // +1 to the next) + a tool proficiency if the background offers one.
  const background = pickOne(refs.backgrounds, random)!;
  const eligible = background.abilityScores.map((a) => a.index as AbilityKey);
  const rankedEligible = [...eligible].sort(
    (a, b) => priority.indexOf(a) - priority.indexOf(b),
  );
  const backgroundAbilityBonus =
    rankedEligible.length >= 2
      ? { mode: "two" as const, plusTwo: rankedEligible[0], plusOne: [rankedEligible[1]] }
      : { mode: "three" as const, plusOne: eligible };
  const toolProficiencyChoice =
    background.toolProficiencyChoices[0]?.options?.[0]?.index ?? null;

  // Two languages — prefer standard (non-rare) ones.
  const langPool = refs.languages.filter((l) => !l.isRare);
  const shuffledLangs = random ? [...langPool].sort(() => Math.random() - 0.5) : langPool;
  const languageChoices = shuffledLangs.slice(0, 2).map((l) => l.index);

  // Weapon mastery for the 5 classes that get it — pick the required count of
  // weapons that actually have a mastery property (melee-only for Barbarian).
  const masteryCount = WEAPON_MASTERY_KNOWN_BY_CLASS[cls.index] ?? 0;
  let weaponMasteryChoices: string[] = [];
  if (masteryCount > 0) {
    const meleeOnly = WEAPON_MASTERY_MELEE_ONLY_CLASSES.has(cls.index);
    const masteryWeapons = refs.equipment.filter(
      (e) =>
        e.mastery &&
        (!meleeOnly || (e.categories ?? []).includes("melee-weapons")),
    );
    const pool = random ? [...masteryWeapons].sort(() => Math.random() - 0.5) : masteryWeapons;
    weaponMasteryChoices = pool.slice(0, masteryCount).map((e) => e.index);
  }

  const name = opts.name?.trim() || (random ? RANDOM_NAMES[randInt(RANDOM_NAMES.length)] : "New Hero");

  return {
    ...EMPTY_DRAFT,
    name,
    speciesIndex: species.index,
    subspeciesIndex: subspecies?.index ?? null,
    classIndex: cls.index,
    skillChoices,
    baseAbilityScores,
    abilityScoreMethod: "standard",
    backgroundIndex: background.index,
    backgroundAbilityBonus,
    toolProficiencyChoice,
    languageChoices,
    weaponMasteryChoices,
  };
}
