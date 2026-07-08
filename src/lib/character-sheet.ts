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
  featHpBonus,
  FIGHTING_STYLE_KNOWN_BY_CLASS,
  finalAbilityScores,
  fullCasterSlots,
  innateSorceryMax,
  SPECIES_NATURAL_WEAPONS,
  SUBCLASS_PREPARED_SPELLS,
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
  SWAPPABLE_CANTRIP_TRAITS,
  orderedClasses,
  combinedCasterLevel,
  multiclassAttacksPerAction,
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

// One row per class the character has levels in — primary first, then in the
// order each was first taken. Drives the multiclass header and per-class
// pending-choice pickers. subclassName is resolved by the play sheet (which
// has the subclass options), not here.
export interface SheetClass {
  classIndex: string;
  className: string;
  level: number;
  subclassIndex: string | null;
  hitDie: number;
  spellcastingAbility: AbilityKey | null;
}

// One row per spellcasting class. Each caster prepares/knows from its own list
// with its own save DC/attack (its own ability + the shared total-level
// proficiency bonus). Spell SLOTS are shared across all non-Warlock casters
// (combined caster level → CharacterSheet.spellSlots); Warlock's Pact Magic is
// the separate CharacterSheet.pactSlots pool.
export interface SpellcastingClass {
  classIndex: string;
  className: string;
  ability: AbilityKey;
  saveDC: number;
  attackBonus: number;
  cantripsKnown: number;
  preparedCount: number;
  isWarlock: boolean;
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
  // Multiclass: primary is classIndex/className above (level-1 class); classes[]
  // lists every class the character has levels in (primary first). classLevels
  // maps classIndex → that class's level for O(1) lookups in gating. For a
  // single-class character, classes has one entry and classLevels has one key.
  classes: SheetClass[];
  classLevels: Record<string, number>;
  // Hit dice available to spend, grouped by die size (e.g. [{die:10,count:5},
  // {die:6,count:3}] for a Fighter 5/Wizard 3). Single-class → one entry.
  hitDicePool: { die: number; count: number }[];
  maxHpValue: number;
  backgroundName: string;
  backgroundIsHomebrew: boolean;
  backgroundFeatName: string | null;
  backgroundFeatIndex: string | null;
  backgroundFeatDescription: string | null;
  lineageCantripTrait: { traitIndex: string; defaultCantrip: string; cantripClass: string } | null;
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
  // Backward-compat scalars, populated from the FIRST spellcasting class (or
  // null/[] for a non-caster). New per-class spell UI iterates `spellcasting`
  // instead; these stay for the print sheet, personality prompt, and any code
  // that only needs "the character's main caster." spellSlots is the SHARED
  // multiclass pool (combined caster level, Warlock excluded); pactSlots is
  // Warlock's separate Pact Magic pool.
  spellcastingAbility: AbilityKey | null;
  spellSaveDC: number | null;
  spellAttackBonus: number | null;
  spellSlots: number[];
  pactSlots: number[];
  spellcasting: SpellcastingClass[];
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
  // Tiefling Otherworldly Presence grants the Thaumaturgy cantrip at-will,
  // from the BASE species (not the Fiendish Legacy subspecies) — so it can't
  // ride the lineage-spell-* subspecies path Fire Bolt/Chill Touch use. Name
  // of the granted cantrip, or null. CHA-based (uses lineageSpell DC/attack).
  speciesCantrip: string | null;
  // Bard's Jack of All Trades (level 2+): half proficiency bonus (rounded
  // down) added to ability checks with skills you're NOT proficient in. The
  // skills list above already bakes this into each non-proficient bonus; this
  // flag is just so the UI can label why those bonuses are nonzero.
  jackOfAllTrades: boolean;
  // Wizard Arcane Recovery (level 1): once per day on a Short Rest, recover
  // spell slots totalling up to half your level (rounded up), none above 5th.
  arcaneRecoveryMax: number;
  // Sorcerer Innate Sorcery (level 1): 2 uses/Long Rest, Bonus Action for
  // Advantage on your spell attacks for 1 minute.
  innateSorceryMax: number;
  // Aasimar Healing Hands: touch-heal a flat (character level) HP, 1/Long Rest.
  // Goblin Fury of the Small: extra (level) damage vs a larger creature,
  // 1/Short or Long Rest. Shifter Shifting: Temp HP = level + CON, Speed +10,
  // 1/Short or Long Rest. All three are 1-use homebrew traits (counts here are
  // the use cap, 0 when the species lacks the trait).
  healingHandsMax: number;
  furyOfTheSmallMax: number;
  shiftingMax: number;
  // Fairy/Owlin flight: the species' Fly Speed in feet, or null. Fairy's
  // equals their walking Speed; Owlin's is a flat 30. (The "not in Heavy
  // armor" caveat is shown in the trait text but not enforced — this app
  // doesn't track armor weight category, same as Barbarian Fast Movement.)
  flySpeed: number | null;
  // Natural-weapon species (Tabaxi/Tortle Claws, Satyr Ram's Headbutt) — a
  // synthesized Unarmed Strike shown in Attacks, same shape as Monk's. null
  // for species without one. See SPECIES_NATURAL_WEAPONS.
  naturalWeapon: { name: string; damageDie: number; damageType: string; note: string | null } | null;
  // Subclass always-prepared spells reached at the current level (Life Domain,
  // Fiend Patron, Draconic Sorcery). name = display name, index = 2014 spell
  // slug for detail lookup, unlockLevel = the class level it's granted at.
  subclassPreparedSpells: { name: string; index: string; unlockLevel: number }[];
  // Attacks made with one Attack action (Extra Attack). 1 for most; up to 4
  // for a level-20 Fighter. Shown as a reminder on the Attacks card.
  attacksPerAction: number;
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

  // ── Multiclass class-level map ──────────────────────────────────────────
  // Every class the character has levels in (primary first). Each class
  // resource below is computed from THAT class's level via clvl(), not the
  // total character level — a Fighter 5/Wizard 3 gets Second Wind at Fighter 5
  // AND Arcane Recovery at Wizard 3. Total level (draft.level) still drives
  // proficiency bonus, HP sum, and species traits.
  const orderedCls = orderedClasses(draft);
  const classLevels: Record<string, number> = {};
  for (const oc of orderedCls) classLevels[oc.classIndex] = oc.level;
  const clvl = (c: string) => classLevels[c] ?? 0;
  const sheetClasses: SheetClass[] = orderedCls.map((oc) => {
    const c = refs.classes.find((x) => x.index === oc.classIndex);
    return {
      classIndex: oc.classIndex,
      className: c?.name ?? oc.classIndex,
      level: oc.level,
      subclassIndex: oc.subclassIndex,
      hitDie: c?.hitDie ?? 8,
      spellcastingAbility: c?.spellcastingAbility ?? null,
    };
  });
  // Hit dice available to spend, grouped by die size (5d10 + 3d6, etc.).
  const hitDicePool: { die: number; count: number }[] = [];
  for (const sc of sheetClasses) {
    const existing = hitDicePool.find((h) => h.die === sc.hitDie);
    if (existing) existing.count += sc.level;
    else hitDicePool.push({ die: sc.hitDie, count: sc.level });
  }
  hitDicePool.sort((a, b) => b.die - a.die);

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
  // Keyed by class level (20 IN that class), not total level — a multiclass
  // Barbarian 15/Fighter 5 has total level 20 but no Primal Champion.
  for (const sc of sheetClasses) {
    const levelTwentyBoost = LEVEL_20_ABILITY_BOOSTS[sc.classIndex];
    if (levelTwentyBoost && sc.level >= 20) {
      for (const ability of levelTwentyBoost) {
        finalScores[ability] = Math.min(25, finalScores[ability] + 4);
        modifiers[ability] = abilityModifier(finalScores[ability]);
      }
    }
  }

  const proficiencyBonus = proficiencyBonusForLevel(draft.level);

  // Base-species trait indexes (subspecies traits are handled separately in
  // the lineage block below). Used to detect trait-driven mechanics like
  // Dwarven Toughness, Tiefling's Otherworldly Presence, and the homebrew
  // natural-weapon / flight / once-per-rest traits.
  const speciesTraits = new Set(species.traits.map((t) => t.index));

  // Dwarven Toughness: "+1 Hit Point maximum for each level you have gained."
  // Tough/Hardened feats add their own per-level HP (see featHpBonus). Both
  // stack on top of the normal hit-die + CON computation.
  const dwarvenToughnessHp = speciesTraits.has("dwarven-toughness") ? draft.level : 0;
  const maxHpValue =
    maxHp(cls.hitDie, modifiers.con, draft.hpRolls) +
    dwarvenToughnessHp +
    featHpBonus(draft.featChoices, draft.level);

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
    // Human's Skillful trait (one chosen skill) and the Skilled feat (up to
    // three) both grant ordinary skill proficiency — folded in here so they
    // count toward the bonus, Expertise eligibility, and passive Perception
    // exactly like any class/background skill.
    ...(draft.humanSkillChoice ? [draft.humanSkillChoice.replace(/^skill-/, "")] : []),
    ...draft.skilledChoices.map((s) => s.replace(/^skill-/, "")),
  ]);

  // Bard's Jack of All Trades adds half proficiency bonus (rounded down) to
  // every ability check that uses a skill you're NOT proficient in (and, by
  // the rule, not Expertise either — those already double it). Applied only
  // to non-proficient skills below.
  const jackOfAllTrades = clvl("bard") >= 2;
  const jackBonus = jackOfAllTrades ? Math.floor(proficiencyBonus / 2) : 0;

  // Expertise from every class: the primary's picks in the legacy
  // expertiseChoices array, every additional class's in classExpertise[cls].
  const expertiseSkills = new Set([
    ...draft.expertiseChoices,
    ...Object.values(draft.classExpertise ?? {}).flat(),
  ]);
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
      bonus:
        modifiers[ability] +
        (proficient ? proficiencyBonus * (expertise ? 2 : 1) : jackBonus),
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

  // ── Per-class spellcasting ──────────────────────────────────────────────
  // One entry per caster class, each with its own save DC/attack (its own
  // ability + the shared total-level proficiency bonus) and its own cantrip/
  // prepared counts. Spell SLOTS are shared across all non-Warlock casters
  // (combined caster level → the full-caster table); Warlock's Pact Magic is
  // its own pactSlots pool.
  const spellcasting: SpellcastingClass[] = [];
  for (const sc of sheetClasses) {
    if (!sc.spellcastingAbility) continue;
    const mod = modifiers[sc.spellcastingAbility];
    const isWarlock = sc.classIndex === "warlock";
    spellcasting.push({
      classIndex: sc.classIndex,
      className: sc.className,
      ability: sc.spellcastingAbility,
      saveDC: computeSpellSaveDC(proficiencyBonus, mod),
      attackBonus: computeSpellAttackBonus(proficiencyBonus, mod),
      cantripsKnown: CANTRIPS_KNOWN_BY_CLASS[sc.classIndex]?.(sc.level) ?? 0,
      preparedCount: isWarlock
        ? warlockPreparedSpellsMax(sc.level)
        : computePreparedSpellCount(sc.level, mod),
      isWarlock,
    });
  }
  // Spell slots. A SINGLE non-Warlock caster uses its own class table (a pure
  // Paladin's half-caster progression differs from the multiclass combined
  // table); TWO OR MORE caster classes use the multiclass combined-caster-level
  // full table. Warlock's Pact Magic is always its own separate pool.
  const nonPactCasters = spellcasting.filter((sc) => !sc.isWarlock);
  let sharedSpellSlots: number[] = [];
  if (nonPactCasters.length === 1) {
    const only = nonPactCasters[0].classIndex;
    sharedSpellSlots = HALF_CASTER_CLASSES.has(only)
      ? halfCasterSlots(clvl(only))
      : fullCasterSlots(clvl(only));
  } else if (nonPactCasters.length > 1) {
    sharedSpellSlots = fullCasterSlots(combinedCasterLevel(draft));
  }
  const pactSlots = clvl("warlock") > 0 ? warlockSlots(clvl("warlock")) : [];
  // Backward-compat scalars from the first (usually only) caster.
  const primaryCaster = spellcasting[0] ?? null;

  // Fighting Style count summed across every class that grants it (Fighter/
  // Paladin/Ranger) — each class's own picks live in classFightingStyles.
  let fightingStyleKnownMax = 0;
  for (const sc of sheetClasses) {
    fightingStyleKnownMax += FIGHTING_STYLE_KNOWN_BY_CLASS[sc.classIndex]?.(sc.level) ?? 0;
  }

  // Alert feat: "When you roll Initiative, you can add your Proficiency Bonus
  // to the roll." Applied to the static Initiative stat since this app shows
  // a flat Initiative number rather than rolling it.
  const takenFeatIndexes = new Set(draft.featChoices.map((fc) => fc.featIndex));
  const initiative = modifiers.dex + (takenFeatIndexes.has("alert") ? proficiencyBonus : 0);

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
    classes: sheetClasses,
    classLevels,
    hitDicePool,
    maxHpValue,
    backgroundName: background.name,
    backgroundIsHomebrew: background.isHomebrew,
    backgroundFeatName: background.feat?.name ?? null,
    backgroundFeatIndex: background.feat?.index ?? null,
    backgroundFeatDescription: background.feat?.description ?? null,
    finalScores,
    modifiers,
    proficiencyBonus,
    savingThrows,
    skills,
    ownedEquipment,
    initiative,
    speed: species.speed,
    passivePerception,
    sneakAttackDice: clvl("rogue") > 0 ? sneakAttackDice(clvl("rogue")) : null,
    spellcastingAbility: primaryCaster?.ability ?? null,
    spellSaveDC: primaryCaster?.saveDC ?? null,
    spellAttackBonus: primaryCaster?.attackBonus ?? null,
    spellSlots: sharedSpellSlots,
    pactSlots,
    spellcasting,
    cantripsKnownCount: primaryCaster?.cantripsKnown ?? 0,
    preparedSpellsCount: primaryCaster?.preparedCount ?? 0,
    sorceryPointsMax: clvl("sorcerer") > 0 ? sorceryPointsMax(clvl("sorcerer")) : 0,
    metamagicKnownMax: clvl("sorcerer") > 0 ? metamagicKnownMax(clvl("sorcerer")) : 0,
    channelDivinityMax:
      (clvl("cleric") > 0 ? clericChannelDivinityMax(clvl("cleric")) : 0) +
      (clvl("paladin") > 0 ? paladinChannelDivinityMax(clvl("paladin")) : 0),
    divineSparkDice: clvl("cleric") > 0 ? divineSparkDice(clvl("cleric")) : 0,
    bardicInspirationMax: clvl("bard") > 0 ? bardicInspirationMax(modifiers.cha) : 0,
    bardicInspirationDie: clvl("bard") > 0 ? bardicInspirationDie(clvl("bard")) : 0,
    layOnHandsMax: clvl("paladin") > 0 ? layOnHandsMax(clvl("paladin")) : 0,
    favoredEnemyMax: clvl("ranger") > 0 ? favoredEnemyMax(clvl("ranger")) : 0,
    wildShapeMax: clvl("druid") > 0 ? wildShapeMax(clvl("druid")) : 0,
    fightingStyleKnownMax,
    secondWindMax: clvl("fighter") > 0 ? secondWindMax(clvl("fighter")) : 0,
    actionSurgeMax: clvl("fighter") > 0 ? actionSurgeMax(clvl("fighter")) : 0,
    indomitableMax: clvl("fighter") > 0 ? indomitableMax(clvl("fighter")) : 0,
    rageMax: clvl("barbarian") > 0 ? rageMax(clvl("barbarian")) : 0,
    rageDamageBonus: clvl("barbarian") > 0 ? rageDamageBonus(clvl("barbarian")) : 0,
    brutalStrikeDice: clvl("barbarian") > 0 ? brutalStrikeDice(clvl("barbarian")) : 0,
    martialArtsDie: clvl("monk") > 0 ? martialArtsDie(clvl("monk")) : 0,
    focusPointsMax: clvl("monk") > 0 ? focusPointsMax(clvl("monk")) : 0,
    unarmoredMovementBonus: clvl("monk") > 0 ? unarmoredMovementBonus(clvl("monk")) : 0,
    wholenessOfBodyMax: clvl("monk") > 0 ? wholenessOfBodyMax(modifiers.wis) : 0,
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
      const swappable =
        (subspecies?.traits ?? [])
          .map((t) => {
            const info = SWAPPABLE_CANTRIP_TRAITS[t.index];
            return info ? { traitIndex: t.index, ...info } : null;
          })
          .find(Boolean) ?? null;
      return {
        lineageSpells: spells,
        lineageSpellSaveDC: lsa ? 8 + proficiencyBonus + modifiers[lsa] : null,
        lineageSpellAttackBonus: lsa ? proficiencyBonus + modifiers[lsa] : null,
        lineageCantripTrait: swappable ?? null,
      };
    })(),
    // Tiefling's Otherworldly Presence grants Thaumaturgy at-will from the
    // base species. CHA-based, so it reuses the lineageSpell DC/attack the
    // Fiendish Legacy subspecies already establishes for this species.
    speciesCantrip: speciesTraits.has("otherworldly-presence") ? "Thaumaturgy" : null,
    jackOfAllTrades,
    arcaneRecoveryMax: clvl("wizard") > 0 ? Math.max(1, Math.ceil(clvl("wizard") / 2)) : 0,
    innateSorceryMax: clvl("sorcerer") > 0 ? innateSorceryMax(clvl("sorcerer")) : 0,
    healingHandsMax: speciesTraits.has("healing-hands") ? 1 : 0,
    furyOfTheSmallMax: speciesTraits.has("fury-of-the-small") ? 1 : 0,
    shiftingMax: speciesTraits.has("shifting") ? 1 : 0,
    flySpeed: speciesTraits.has("fairy-flight")
      ? species.speed
      : speciesTraits.has("owlin-flight")
        ? 30
        : null,
    naturalWeapon: SPECIES_NATURAL_WEAPONS[species.index] ?? null,
    // Every class's subclass always-prepared spells, each gated on THAT class's
    // level (a Cleric 3/Paladin 5 gets Life Domain's L3 spells and the oath's
    // L5 spells independently).
    subclassPreparedSpells: sheetClasses.flatMap((sc) =>
      (SUBCLASS_PREPARED_SPELLS[sc.subclassIndex ?? ""] ?? [])
        .filter((m) => sc.level >= m.level)
        .flatMap((m) => m.spells.map((s) => ({ ...s, unlockLevel: m.level }))),
    ),
    attacksPerAction: multiclassAttacksPerAction(draft),
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
  range: string | null;
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

    const hasReach = lookup.properties.some((p) => p.index === "reach");
    const range = lookup.rangeLong
      ? `${lookup.rangeNormal}/${lookup.rangeLong} ft`
      : lookup.throwRangeNormal
        ? `5 ft · throw ${lookup.throwRangeNormal}/${lookup.throwRangeLong} ft`
        : hasReach
          ? "10 ft"
          : "5 ft";

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
      range,
    });
  }
  return weapons;
}
