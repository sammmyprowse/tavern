import {
  ABILITY_ORDER,
  abilityModifier,
  actionSurgeMax,
  bardicInspirationDie,
  bardicInspirationMax,
  breathWeaponDice,
  brutalStrikeDice,
  clericChannelDivinityMax,
  computeArmorClass,
  divineSparkDice,
  favoredEnemyMax,
  FIGHTING_STYLE_KNOWN_BY_CLASS,
  finalAbilityScores,
  fullCasterSlots,
  halfCasterSlots,
  HALF_CASTER_CLASSES,
  focusPointsMax,
  indomitableMax,
  layOnHandsMax,
  LEVEL_20_ABILITY_BOOSTS,
  martialArtsDie,
  maxHp,
  metamagicKnownMax,
  paladinChannelDivinityMax,
  preparedSpellCount as computePreparedSpellCount,
  proficiencyBonusForLevel,
  rageDamageBonus,
  rageMax,
  secondWindMax,
  sorceryPointsMax,
  unarmoredMovementBonus,
  warlockPreparedSpellsMax,
  warlockSlots,
  wholenessOfBodyMax,
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
  speciesIndex: string;
  speciesIsHomebrew: boolean;
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
  fightingStyleKnownMax: number;
  secondWindMax: number;
  actionSurgeMax: number;
  indomitableMax: number;
  rageMax: number;
  rageDamageBonus: number;
  brutalStrikeDice: number;
  martialArtsDie: number;
  focusPointsMax: number;
  unarmoredMovementBonus: number;
  wholenessOfBodyMax: number;
  // Species traits (Dragonborn/Dwarf/Orc/Goliath/homebrew Tortle) — see
  // CLAUDE.md's "Species traits" section for sourcing/scope notes.
  breathWeaponDice: number;
  breathWeaponMax: number;
  breathWeaponDamageType: string | null;
  draconicFlightAvailable: boolean;
  stonecunningMax: number;
  adrenalineRushMax: number;
  largeFormAvailable: boolean;
  relentlessEnduranceAvailable: boolean;
  naturalArmorAC: number | null;
  // Giant Ancestry (Goliath) — uses = Proficiency Bonus per Long Rest.
  giantAncestryUsesMax: number;
  // Lineage spellcasting (Elf/Gnome/Tiefling): cantrip at character level 1,
  // always-prepared spells at character levels 3 and 5 (1 free cast per Long
  // Rest each). Detected by the "lineage-spell-" prefix on subspecies trait
  // indexes. spellcasting ability is INT for Elf/Gnome, CHA for Tiefling.
  lineageSpells: { name: string; traitIndex: string; unlockLevel: number }[];
  lineageSpellSaveDC: number | null;
  lineageSpellAttackBonus: number | null;
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

  // Level-20 capstone ability boosts (Primal Champion/Body and Mind): "Your
  // [X] and [Y] scores increase by 4, to a maximum of 25" — a real exception
  // to the universal 20-cap finalAbilityScores() enforces for every other
  // class and feat. Applied here, as an additive correction layered on top
  // of the normal (20-capped) computation above, rather than threading a
  // per-class exception through finalAbilityScores itself — keeps that
  // function's cap simple and correct for every other class. Must happen
  // before maxHpValue/proficiencyBonus/savingThrows/skills below so they
  // reflect the boosted scores.
  const levelTwentyBoost = LEVEL_20_ABILITY_BOOSTS[cls.index];
  if (levelTwentyBoost && draft.level >= 20) {
    for (const ability of levelTwentyBoost) {
      finalScores[ability] = Math.min(25, finalScores[ability] + 4);
      modifiers[ability] = abilityModifier(finalScores[ability]);
    }
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

  const clsEquipChoiceIdx = Math.min(draft.classEquipmentChoice, cls.startingEquipmentOptions.length - 1);
  const bgEquipChoiceIdx = Math.min(draft.backgroundEquipmentChoice, background.equipmentOptions.length - 1);
  const ownedEquipment = [
    ...(cls.startingEquipmentOptions[clsEquipChoiceIdx] ?? cls.startingEquipmentFirstOption),
    ...(background.equipmentOptions[bgEquipChoiceIdx] ?? background.equipmentFirstOption),
  ];

  const spellcastingAbility = cls.spellcastingAbility;
  const spellAbilityMod = spellcastingAbility ? modifiers[spellcastingAbility] : 0;

  return {
    name: draft.name,
    level: draft.level,
    speciesName: species.name,
    speciesIndex: species.index,
    speciesIsHomebrew: species.isHomebrew,
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
      ? cls.index === "warlock"
        ? warlockSlots(draft.level)
        : HALF_CASTER_CLASSES.has(cls.index)
          ? halfCasterSlots(draft.level)
          : fullCasterSlots(draft.level)
      : [],
    cantripsKnownCount: CANTRIPS_KNOWN_BY_CLASS[cls.index]?.(draft.level) ?? 0,
    // Gated on having a spellcasting ability at all, NOT on being in
    // CANTRIPS_KNOWN_BY_CLASS — Paladin proved those two aren't the same set
    // (it gets prepared spells but no cantrips at all). Every prepared caster
    // confirmed so far (Wizard/Sorcerer/Cleric/Bard/Druid/Paladin) uses the
    // generic level+modifier formula — Warlock is the one exception, with its
    // own slower, level-only Prepared Spells table (see warlockPreparedSpellsMax).
    preparedSpellsCount: cls.index === "warlock"
      ? warlockPreparedSpellsMax(draft.level)
      : spellcastingAbility
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
    fightingStyleKnownMax: FIGHTING_STYLE_KNOWN_BY_CLASS[cls.index]?.(draft.level) ?? 0,
    secondWindMax: cls.index === "fighter" ? secondWindMax(draft.level) : 0,
    actionSurgeMax: cls.index === "fighter" ? actionSurgeMax(draft.level) : 0,
    indomitableMax: cls.index === "fighter" ? indomitableMax(draft.level) : 0,
    rageMax: cls.index === "barbarian" ? rageMax(draft.level) : 0,
    rageDamageBonus: cls.index === "barbarian" ? rageDamageBonus(draft.level) : 0,
    brutalStrikeDice: cls.index === "barbarian" ? brutalStrikeDice(draft.level) : 0,
    martialArtsDie: cls.index === "monk" ? martialArtsDie(draft.level) : 0,
    focusPointsMax: cls.index === "monk" ? focusPointsMax(draft.level) : 0,
    unarmoredMovementBonus: cls.index === "monk" ? unarmoredMovementBonus(draft.level) : 0,
    wholenessOfBodyMax: cls.index === "monk" ? wholenessOfBodyMax(modifiers.wis) : 0,
    // Breath Weapon's dice/uses are on the BASE species (every Dragonborn
    // has it), but the damage TYPE is on the chosen Draconic Ancestor
    // subspecies — confirmed from each ancestor's own subspecies row
    // (data.damage_type), not assumed from the ancestor's color/name.
    breathWeaponDice: species.index === "dragonborn" ? breathWeaponDice(draft.level) : 0,
    breathWeaponMax: species.index === "dragonborn" ? proficiencyBonus : 0,
    breathWeaponDamageType: species.index === "dragonborn" ? subspecies?.damageType?.name ?? null : null,
    draconicFlightAvailable: species.index === "dragonborn" && draft.level >= 5,
    stonecunningMax: species.index === "dwarf" ? proficiencyBonus : 0,
    adrenalineRushMax: species.index === "orc" ? proficiencyBonus : 0,
    largeFormAvailable: species.index === "goliath" && draft.level >= 5,
    relentlessEnduranceAvailable: species.index === "orc",
    // Natural Armor (homebrew Tortle): "your base Armor Class is 17" — a
    // flat override, not an additive bonus. null for every other species,
    // matching computeArmorClass's flatUnarmoredAC param shape.
    naturalArmorAC: species.index === "tortle" ? 17 : null,
    giantAncestryUsesMax: species.index === "goliath" ? proficiencyBonus : 0,
    ...(() => {
      const LINEAGE_ABILITY: Partial<Record<string, AbilityKey>> = {
        elf: "int",
        gnome: "int",
        tiefling: "cha",
      };
      const lsa = LINEAGE_ABILITY[species.index] ?? null;
      const spells = (subspecies?.traits ?? [])
        .filter((t) => t.index.startsWith("lineage-spell-"))
        .map((t) => ({ name: t.name, traitIndex: t.index, unlockLevel: t.level ?? 1 }));
      return {
        lineageSpells: spells,
        lineageSpellSaveDC: lsa ? 8 + proficiencyBonus + modifiers[lsa] : null,
        lineageSpellAttackBonus: lsa ? proficiencyBonus + modifiers[lsa] : null,
      };
    })(),
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
  hasDefenseFightingStyle = false,
  unarmoredDefenseBonus = 0,
  flatUnarmoredAC: number | null = null,
): number {
  const equipped = resolveEquippedItems(ownedEquipment, equipmentLookup, equippedIndexes).filter(
    (item) => item.armor_class,
  );
  return computeArmorClass(equipped, dexMod, hasDefenseFightingStyle, unarmoredDefenseBonus, flatUnarmoredAC);
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
  notes: string | null;
  bonusDamageDice: string | null;
  bonusDamageCondition: string | null;
}

const RANGED_CATEGORIES = ["ranged-weapons", "ammunition"];

// "Monk weapon" per Martial Arts' own text: "Simple Melee weapons" or
// "Martial Melee weapons that have the Light property." Checked against the
// equipment table's own category tags rather than a hand-maintained weapon
// list, so it stays correct if the SRD data changes.
function isMonkWeapon(lookup: EquipmentLookupItem): boolean {
  const categories = lookup.categories ?? [];
  if (categories.includes("simple-melee-weapons")) return true;
  return categories.includes("martial-melee-weapons") && lookup.properties.some((p) => p.index === "light");
}

// hasArcheryFightingStyle adds the Archery Fighting Style feat's "+2 bonus
// to attack rolls you make with Ranged weapons" — confirmed directly from
// the feat's own SRD text. rageDamageBonusWhileRaging adds Barbarian's Rage
// Damage to Strength-based attacks only ("When you make an attack using
// Strength... and deal damage to the target, you gain a bonus to the
// damage") — the caller is responsible for only passing a nonzero value
// while Rage is actually active (play state, not derived from level alone).
// monkMartialArtsDie applies Monk's Dexterous Attacks (use DEX same as
// Finesse weapons already do — picks whichever of DEX/STR is higher, a
// reasonable reading of "can use" rather than "must use") and the Martial
// Arts die ("roll your Martial Arts die in place of the normal damage") to
// any equipped weapon that qualifies as a Monk weapon, taking the larger of
// the weapon's own die and the Martial Arts die rather than always
// overriding — a level-1 Monk wielding a Quarterstaff still benefits from
// its bigger Versatile die. Doesn't synthesize an Unarmed Strike entry
// itself (there's nothing equipped to resolve) — the caller adds that
// separately. All new params default to 0/false/null so every existing
// call site keeps working unchanged.
// masteredWeaponIndexes (Weapon Mastery, Barbarian/Fighter/Paladin/Ranger/
// Rogue): a weapon's mastery property only shows if its base weapon type is
// among the character's chosen masteries — null means "don't gate," which
// applies to every class without the feature AND to a class that HAS it but
// hasn't recorded a choice yet (existing characters created before this
// feature shipped have an empty weaponMasteryChoices array; treating that
// as "show unconditionally" rather than "show nothing" avoids silently
// taking mastery away from every pre-existing character of these classes —
// see PlaySheet.tsx for exactly when null vs. a real Set is passed).
export function resolveWeapons(
  ownedEquipment: EquipmentBundleItem[],
  equipmentLookup: Map<string, EquipmentLookupItem>,
  modifiers: Record<AbilityKey, number>,
  proficiencyBonus: number,
  hasArcheryFightingStyle = false,
  rageDamageBonusWhileRaging = 0,
  monkMartialArtsDie: number | null = null,
  masteredWeaponIndexes: Set<string> | null = null,
): ResolvedWeapon[] {
  const weapons: ResolvedWeapon[] = [];
  for (const item of ownedEquipment) {
    if (!item.index) continue;
    const lookup = equipmentLookup.get(item.index);
    if (!lookup?.damage) continue;

    const isFinesse = lookup.properties.some((p) => p.index === "finesse");
    const isRanged = (lookup.categories ?? []).some((c) => RANGED_CATEGORIES.includes(c));
    const usesMartialArts = !isRanged && monkMartialArtsDie != null && isMonkWeapon(lookup);
    const ability: AbilityKey = isRanged
      ? "dex"
      : isFinesse || usesMartialArts
        ? modifiers.dex > modifiers.str
          ? "dex"
          : "str"
        : "str";

    let damageDice = lookup.damage.damageDice;
    if (usesMartialArts) {
      const weaponDieSize = parseInt(damageDice.match(/d(\d+)/)?.[1] ?? "0", 10);
      damageDice = `1d${Math.max(weaponDieSize, monkMartialArtsDie)}`;
    }

    weapons.push({
      index: lookup.index,
      name: lookup.name,
      ability,
      attackBonus:
        modifiers[ability] +
        proficiencyBonus +
        (isRanged && hasArcheryFightingStyle ? 2 : 0) +
        (lookup.attackBonus ?? 0),
      damageDice,
      damageBonus:
        modifiers[ability] + (ability === "str" ? rageDamageBonusWhileRaging : 0) + (lookup.damageBonus ?? 0),
      damageType: lookup.damage.damageType,
      mastery:
        lookup.mastery && (!masteredWeaponIndexes || masteredWeaponIndexes.has(lookup.baseIndex ?? lookup.index))
          ? lookup.mastery
          : null,
      notes: lookup.notes ?? null,
      bonusDamageDice: lookup.bonusDamageDice ?? null,
      bonusDamageCondition: lookup.bonusDamageCondition ?? null,
    });
  }
  return weapons;
}
