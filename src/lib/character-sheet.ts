import {
  ABILITY_ORDER,
  abilityModifier,
  bardicInspirationDie,
  bardicInspirationMax,
  clericChannelDivinityMax,
  computeArmorClass,
  divineSparkDice,
  favoredEnemyMax,
  finalAbilityScores,
  fullCasterSlots,
  halfCasterSlots,
  HALF_CASTER_CLASSES,
  layOnHandsMax,
  maxHp,
  metamagicKnownMax,
  paladinChannelDivinityMax,
  preparedSpellCount as computePreparedSpellCount,
  proficiencyBonusForLevel,
  sorceryPointsMax,
  wildShapeMax,
  spellAttackBonus as computeSpellAttackBonus,
  spellSaveDC as computeSpellSaveDC,
  sneakAttackDice,
  CANTRIPS_KNOWN_BY_CLASS,
  type AbilityKey,
  type CharacterDraft,
  type EquipmentItem,
} from "./character";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  SkillInfo,
  EquipmentLookupItem,
  EquipmentBundleItem,
} from "./srd";

export interface CharacterSheetRefs {
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  skills: SkillInfo[];
}

export interface ResolvedSkill {
  index: string;
  name: string;
  ability: AbilityKey;
  bonus: number;
  proficient: boolean;
  expertise: boolean;
}

export interface ResolvedSave {
  ability: AbilityKey;
  bonus: number;
  proficient: boolean;
}

export interface CharacterSheet {
  name: string;
  level: number;
  speciesName: string;
  subspeciesName: string | null;
  className: string;
  classIndex: string;
  hitDie: number;
  maxHpValue: number;
  backgroundName: string;
  backgroundIsHomebrew: boolean;
  backgroundFeatName: string | null;
  finalScores: Record<AbilityKey, number>;
  modifiers: Record<AbilityKey, number>;
  proficiencyBonus: number;
  savingThrows: ResolvedSave[];
  skills: ResolvedSkill[];
  ownedEquipment: EquipmentBundleItem[];
  initiative: number;
  speed: number | null;
  passivePerception: number;
  sneakAttackDice: number | null;
  spellcastingAbility: AbilityKey | null;
  spellSaveDC: number | null;
  spellAttackBonus: number | null;
  spellSlots: number[];
  cantripsKnownCount: number;
  preparedSpellsCount: number;
  sorceryPointsMax: number;
  metamagicKnownMax: number;
  channelDivinityMax: number;
  divineSparkDice: number;
  bardicInspirationMax: number;
  bardicInspirationDie: number;
  wildShapeMax: number;
  layOnHandsMax: number;
  favoredEnemyMax: number;
}

export function buildCharacterSheet(
  draft: CharacterDraft,
  refs: CharacterSheetRefs,
): CharacterSheet | null {
  const species = refs.species.find((s) => s.index === draft.speciesIndex);
  const subspecies = refs.subspecies.find((s) => s.index === draft.subspeciesIndex);
  const cls = refs.classes.find((c) => c.index === draft.classIndex);
  const background = refs.backgrounds.find((b) => b.index === draft.backgroundIndex);

  if (!species || !cls || !background) return null;

  const asiBonuses = draft.featChoices
    .filter((fc) => fc.featIndex === "ability-score-improvement")
    .map((fc) => fc.abilityBonus);
  const rawScores = finalAbilityScores(draft.baseAbilityScores, [
    draft.backgroundAbilityBonus,
    ...asiBonuses,
  ]);
  const finalScores = {} as Record<AbilityKey, number>;
  const modifiers = {} as Record<AbilityKey, number>;
  for (const ability of ABILITY_ORDER) {
    finalScores[ability] = rawScores[ability] ?? 10;
    modifiers[ability] = abilityModifier(finalScores[ability]);
  }

  const proficiencyBonus = proficiencyBonusForLevel(draft.level);
  const maxHpValue = maxHp(cls.hitDie, modifiers.con, draft.hpRolls);

  const proficientSaves = new Set(cls.savingThrows.map((s) => s.index));
  const savingThrows: ResolvedSave[] = ABILITY_ORDER.map((ability) => {
    const proficient = proficientSaves.has(ability);
    return {
      ability,
      proficient,
      bonus: modifiers[ability] + (proficient ? proficiencyBonus : 0),
    };
  });

  // Proficiency-table refs use a "skill-" prefixed index (e.g. "skill-athletics");
  // the skills table itself uses the bare index ("athletics"). Normalize to bare
  // form here so lookups against refs.skills (below) actually match.
  const backgroundSkillIndexes = background.proficiencies
    .filter((p) => p.index.startsWith("skill-"))
    .map((p) => p.index.replace(/^skill-/, ""));
  const proficientSkills = new Set([
    ...draft.skillChoices.map((s) => s.replace(/^skill-/, "")),
    ...backgroundSkillIndexes,
  ]);

  const expertiseSkills = new Set(draft.expertiseChoices);
  const skills: ResolvedSkill[] = refs.skills.map((skill) => {
    const ability = skill.abilityScore as AbilityKey;
    const proficient = proficientSkills.has(skill.index);
    const expertise = proficient && expertiseSkills.has(skill.index);
    return {
      index: skill.index,
      name: skill.name,
      ability,
      proficient,
      expertise,
      bonus: modifiers[ability] + (proficient ? proficiencyBonus * (expertise ? 2 : 1) : 0),
    };
  });

  const perception = skills.find((s) => s.index === "perception");
  const passivePerception = 10 + (perception?.bonus ?? modifiers.wis);

  const ownedEquipment = [
    ...cls.startingEquipmentFirstOption,
    ...background.equipmentFirstOption,
  ];

  const spellcastingAbility = cls.spellcastingAbility;
  const spellAbilityMod = spellcastingAbility ? modifiers[spellcastingAbility] : 0;

  return {
    name: draft.name,
    level: draft.level,
    speciesName: species.name,
    subspeciesName: subspecies?.name ?? null,
    className: cls.name,
    classIndex: cls.index,
    hitDie: cls.hitDie,
    maxHpValue,
    backgroundName: background.name,
    backgroundIsHomebrew: background.isHomebrew,
    backgroundFeatName: background.feat?.name ?? null,
    finalScores,
    modifiers,
    proficiencyBonus,
    savingThrows,
    skills,
    ownedEquipment,
    initiative: modifiers.dex,
    speed: species.speed,
    passivePerception,
    sneakAttackDice: cls.index === "rogue" ? sneakAttackDice(draft.level) : null,
    spellcastingAbility,
    spellSaveDC: spellcastingAbility ? computeSpellSaveDC(proficiencyBonus, spellAbilityMod) : null,
    spellAttackBonus: spellcastingAbility ? computeSpellAttackBonus(proficiencyBonus, spellAbilityMod) : null,
    spellSlots: spellcastingAbility
      ? HALF_CASTER_CLASSES.has(cls.index)
        ? halfCasterSlots(draft.level)
        : fullCasterSlots(draft.level)
      : [],
    cantripsKnownCount: CANTRIPS_KNOWN_BY_CLASS[cls.index]?.(draft.level) ?? 0,
    // Gated on having a spellcasting ability at all, NOT on being in
    // CANTRIPS_KNOWN_BY_CLASS — Paladin proved those two aren't the same set
    // (it gets prepared spells but no cantrips at all). Every prepared caster
    // confirmed so far (Wizard/Sorcerer/Cleric/Bard/Druid/Paladin) uses this
    // same level+modifier formula. Revisit this gate once Warlock is built —
    // Warlock uses a fixed known-spells list instead of prepared spells, so
    // it'll need excluding here even though it has a spellcasting ability.
    preparedSpellsCount: spellcastingAbility
      ? computePreparedSpellCount(draft.level, spellAbilityMod)
      : 0,
    sorceryPointsMax: cls.index === "sorcerer" ? sorceryPointsMax(draft.level) : 0,
    metamagicKnownMax: cls.index === "sorcerer" ? metamagicKnownMax(draft.level) : 0,
    channelDivinityMax:
      cls.index === "cleric"
        ? clericChannelDivinityMax(draft.level)
        : cls.index === "paladin"
          ? paladinChannelDivinityMax(draft.level)
          : 0,
    divineSparkDice: cls.index === "cleric" ? divineSparkDice(draft.level) : 0,
    bardicInspirationMax: cls.index === "bard" ? bardicInspirationMax(modifiers.cha) : 0,
    bardicInspirationDie: cls.index === "bard" ? bardicInspirationDie(draft.level) : 0,
    layOnHandsMax: cls.index === "paladin" ? layOnHandsMax(draft.level) : 0,
    favoredEnemyMax: cls.index === "ranger" ? favoredEnemyMax(draft.level) : 0,
    wildShapeMax: cls.index === "druid" ? wildShapeMax(draft.level) : 0,
  };
}

export function resolveEquippedItems(
  ownedEquipment: EquipmentBundleItem[],
  equipmentLookup: Map<string, EquipmentLookupItem>,
  equippedIndexes: Set<string>,
): EquipmentItem[] {
  return ownedEquipment
    .filter((item) => item.index && equippedIndexes.has(item.index))
    .map((item) => {
      const lookup = equipmentLookup.get(item.index!);
      return {
        index: item.index!,
        name: item.name,
        categories: lookup?.categories ?? null,
        armor_class: lookup?.armorClass ?? null,
      };
    });
}

export function computeAC(
  ownedEquipment: EquipmentBundleItem[],
  equipmentLookup: Map<string, EquipmentLookupItem>,
  equippedIndexes: Set<string>,
  dexMod: number,
): number {
  const equipped = resolveEquippedItems(ownedEquipment, equipmentLookup, equippedIndexes).filter(
    (item) => item.armor_class,
  );
  return computeArmorClass(equipped, dexMod);
}

export interface ResolvedWeapon {
  index: string;
  name: string;
  ability: AbilityKey;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageType: string | null;
  mastery: { index: string; name: string } | null;
}

const RANGED_CATEGORIES = ["ranged-weapons", "ammunition"];

export function resolveWeapons(
  ownedEquipment: EquipmentBundleItem[],
  equipmentLookup: Map<string, EquipmentLookupItem>,
  modifiers: Record<AbilityKey, number>,
  proficiencyBonus: number,
): ResolvedWeapon[] {
  const weapons: ResolvedWeapon[] = [];
  for (const item of ownedEquipment) {
    if (!item.index) continue;
    const lookup = equipmentLookup.get(item.index);
    if (!lookup?.damage) continue;

    const isFinesse = lookup.properties.some((p) => p.index === "finesse");
    const isRanged = (lookup.categories ?? []).some((c) => RANGED_CATEGORIES.includes(c));
    const ability: AbilityKey = isRanged
      ? "dex"
      : isFinesse
        ? modifiers.dex > modifiers.str
          ? "dex"
          : "str"
        : "str";

    weapons.push({
      index: lookup.index,
      name: lookup.name,
      ability,
      attackBonus: modifiers[ability] + proficiencyBonus,
      damageDice: lookup.damage.damageDice,
      damageBonus: modifiers[ability],
      damageType: lookup.damage.damageType,
      mastery: lookup.mastery,
    });
  }
  return weapons;
}
