"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ABILITY_ORDER,
  formatModifier,
  hpGainForLevelUp,
  fixedAverageHpGain,
  MAX_LEVEL,
  xpForNextLevel,
  XP_THRESHOLDS,
  ORDER_CHOICES,
  GIANT_ANCESTRY_OPTIONS,
  ASI_LEVELS,
  EXPERTISE_SCHEDULE,
  METAMAGIC_OPTIONS,
  WEAPON_MASTERY_KNOWN_BY_CLASS,
  WEAPON_MASTERY_MELEE_ONLY_CLASSES,
  MULTICLASS_SKILL_GRANTS,
  magicalCunningRegain,
  meetsMulticlassPrereq,
  MULTICLASS_PREREQUISITES,
  MULTICLASS_PREREQ_MIN,
  type AbilityKey,
  type AbilityBonusChoice,
  type CharacterDraft,
  type MetamagicOption,
} from "@/lib/character";
import {
  buildCharacterSheet,
  computeAC,
  resolveWeapons,
  type ResolvedWeapon,
} from "@/lib/character-sheet";
import { rollD20, rollDice, rollFlatDie, doubleDiceNotation, type RollMode, type DiceLogEntry } from "@/lib/dice";
import { CONDITIONS, EXHAUSTION_MAX, exhaustionD20Penalty, exhaustionSpeedPenalty } from "@/lib/conditions";
import { buildCharacterExport, downloadCharacterExport } from "@/lib/character-export";
import {
  levelUpCharacter,
  levelDownCharacter,
  setLevelingProgress,
  chooseSubclass,
  chooseOriginOrder,
  chooseGiantAncestry,
  chooseFeat,
  chooseExpertise,
  setKnownCantrips,
  setPreparedSpells,
  setMetamagicChoices,
  setFightingStyleChoices,
  setWeaponMasteryChoices,
  setMulticlassSkills,
  setHumanSkillChoice,
  setSkilledChoices,
  setCharacterInventory,
  setCharacterCurrency,
  setCharacterMagicItems,
} from "@/app/characters/actions";
import { resolveInventoryEquipment, type InventoryItem } from "@/lib/inventory";
import type { MagicItem } from "@/lib/magic-items";
import { deriveStartingCurrency, type Currency } from "@/lib/currency";
import { equipmentDetailLines, magicItemDetailLines } from "@/lib/equipment-details";
import InventoryManager from "./InventoryManager";
import MagicItemManager from "./MagicItemManager";
import CurrencyTracker from "./CurrencyTracker";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  SkillInfo,
  EquipmentLookupItem,
  LanguageOption,
  MagicItemLookupEntry,
  MasteryPropertyInfo,
  ClassFeature,
  SubclassOption,
  FeatOption,
  SpellOption,
} from "@/lib/srd";
import type { CharacterEffect } from "@/lib/dm-effects";
import DmEffectsPanel from "./DmEffectsPanel";
import DiceLog from "./DiceLog";
import { CounterStepper, ResourceRow } from "./ResourceCounter";
import { CardHeader, ExpandableRow, PickerOption, SaveCancelRow, SpellRow } from "./SheetPrimitives";
import ShareControl from "./ShareControl";
import CharacterAvatar from "./CharacterAvatar";
import CharacterBio from "./CharacterBio";
import CharacterNotes from "./CharacterNotes";
import CharacterPersonality from "./CharacterPersonality";
import DeleteCharacterButton from "./DeleteCharacterButton";
import SectionNav from "./SectionNav";
import type { PersonalityAnswers } from "@/lib/personality";

interface PlaySheetProps {
  characterId: string;
  draft: CharacterDraft;
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  skills: SkillInfo[];
  equipment: EquipmentLookupItem[];
  languages: LanguageOption[];
  magicItemLookup: MagicItemLookupEntry[];
  // Base-class features across every class the character has, each tagged with
  // its owning class so the Features list can gate on that class's level.
  features: (ClassFeature & { classIndex: string })[];
  // Flat union of every class's subclass options (name lookups + dedup) plus a
  // per-class map (the per-class subclass pickers).
  subclassOptions: SubclassOption[];
  subclassOptionsByClass: Record<string, SubclassOption[]>;
  generalFeats: FeatOption[];
  epicBoonFeats: FeatOption[];
  fightingStyleFeats: FeatOption[];
  masteryProperties: MasteryPropertyInfo[];
  traitDescriptions: Record<string, string>;
  classSpells: SpellOption[];
  // Spell list per caster class (each caster prepares from its own list).
  classSpellsByClass: Record<string, SpellOption[]>;
  lineageCantripSpells: SpellOption[];
  subclassSpellData: SpellOption[];
  isOwner: boolean;
  isPublic: boolean;
  // DM-pushed effects (owner only — non-owners always get []).
  dmEffects: CharacterEffect[];
  avatarUrl: string | null;
  bio: string | null;
  notes: string | null;
  personality: PersonalityAnswers | null;
  inventory: InventoryItem[];
  currency: Currency | null;
  magicItems: MagicItem[];
}

interface PlayState {
  currentHp: number;
  tempHp: number;
  // Legacy single-pool hit-dice-used counter (kept for older saved play state).
  // Multiclass tracks per die size instead — hitDiceUsedByDie[dieSize] = spent.
  hitDiceUsed: number;
  hitDiceUsedByDie: Record<string, number>;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  equippedIndexes: string[];
  // Separate from equippedIndexes since magic items live in their own list
  // (magicItems, not ownedEquipment/inventory) — same localStorage-only,
  // ephemeral-session treatment as every other equip state on this sheet.
  equippedMagicItemIndexes: string[];
  // Magic items the character is attuned to (max 3, the standard limit). A
  // separate concept from equipped — you can carry an item without attuning.
  attunedMagicItemIndexes: string[];
  rollMode: RollMode;
  // expendedSlots[i] = slots used at spell level i+1. Play state, not part of
  // the saved draft — resets every Long Rest the same way hit dice used does.
  expendedSlots: number[];
  // Warlock's Pact Magic slots are a SEPARATE pool from the shared spell slots
  // (they never share a counter, even when a multiclass caster has regular
  // slots at the same level), recovered on a Short OR Long Rest.
  // expendedPactSlots[i] = pact slots used at spell level i+1.
  expendedPactSlots: number[];
  // Sorcery Points (Sorcerer only) — same play-state treatment as spell
  // slots: resets on Long Rest, not part of the saved draft.
  expendedSorceryPoints: number;
  // Channel Divinity (Cleric only). Same play-state treatment, but it's also
  // the app's first Short-Rest-recovered resource — Long Rest still resets it
  // fully, but shortRest() now also exists to regain just 1 charge.
  expendedChannelDivinity: number;
  // Bardic Inspiration (Bard only). Long Rest always fully resets it; Short
  // Rest also fully resets it from level 5 on (Font of Inspiration) — below
  // that, Short Rest does nothing to it, same as every other class resource.
  expendedBardicInspiration: number;
  // Wild Shape (Druid only). Same Short-Rest-regains-1/Long-Rest-regains-all
  // treatment as Channel Divinity, unconditionally from level 2 on.
  expendedWildShape: number;
  // Lay on Hands (Paladin only). A variable-amount HP pool, not a fixed-size
  // "uses" counter like the others — Long-Rest-only recovery, no Short Rest
  // component (confirmed from the feature's own text).
  expendedLayOnHands: number;
  // Favored Enemy (Ranger only). Long-Rest-only recovery, same as Lay on
  // Hands — no Short Rest component.
  expendedFavoredEnemy: number;
  // Magical Cunning (Warlock only, from level 2). Not a counter like the
  // others — a single once-per-Long-Rest trigger that partially refunds
  // expendedSlots (see useMagicalCunning below), so it's tracked as a
  // boolean "already used this Long Rest" flag instead.
  usedMagicalCunning: boolean;
  // Second Wind (Fighter only). Short Rest regains 1, Long Rest regains all
  // — same shape as Channel Divinity/Wild Shape.
  expendedSecondWind: number;
  // Action Surge (Fighter only, from level 2). Short OR Long Rest regains
  // all uses (confirmed "finish a Short or Long Rest") — same shape as
  // Warlock's Pact Magic slots, but its own counter since it's a distinct
  // resource.
  expendedActionSurge: number;
  // Indomitable (Fighter only, from level 9). Long-Rest-only, no Short Rest
  // component (confirmed by omission) — same shape as Lay on Hands/Favored
  // Enemy.
  expendedIndomitable: number;
  // Rage (Barbarian only). Short Rest regains 1, Long Rest regains all.
  expendedRage: number;
  // Whether Rage is CURRENTLY active right now — independent of
  // expendedRage (a Barbarian can have unused Rage uses left without
  // currently being enraged). Drives the Rage Damage bonus auto-applied to
  // Strength-based weapon damage above. This app has no turn/round tracker,
  // so duration/extension isn't modeled — the player toggles this off
  // manually when they judge Rage has ended.
  isRaging: boolean;
  // Persistent Rage (Barbarian only, from level 15). Once-per-Long-Rest
  // trigger that fully restores expendedRage — same boolean-flag shape as
  // Warlock's usedMagicalCunning, not a counter.
  usedPersistentRage: boolean;
  // Focus Points (Monk only). Regains all expended points on a Short OR
  // Long Rest (confirmed "finish a Short or Long Rest... regain all your
  // expended points") — full recovery either way, not a partial Short Rest
  // regain like Channel Divinity/Wild Shape/Second Wind/Rage.
  expendedFocusPoints: number;
  // Wholeness of Body (Monk only, from level 6). Long-Rest-only, same shape
  // as Lay on Hands/Favored Enemy.
  expendedWholenessOfBody: number;
  // Uncanny Metabolism (Monk only, from level 2). Once-per-Long-Rest trigger
  // that fully restores expendedFocusPoints and heals — same boolean-flag
  // shape as usedMagicalCunning/usedPersistentRage.
  usedUncannyMetabolism: boolean;
  // Species traits (Dragonborn/Dwarf/Orc/Goliath). Breath Weapon/Stonecunning
  // regain all uses on a Long Rest only (confirmed); Adrenaline Rush regains
  // on a Short OR Long Rest (confirmed "finish a Short or Long Rest").
  expendedBreathWeapon: number;
  usedDraconicFlight: boolean;
  expendedGiantAncestry: number;
  expendedStonecunning: number;
  expendedAdrenalineRush: number;
  usedLargeForm: boolean;
  // Homebrew species once-per-rest traits. Healing Hands (Aasimar): Long-Rest
  // only. Fury of the Small (Goblin) and Shifting (Shifter): Short OR Long
  // Rest. All three are single-use (a boolean would do, but a count keeps the
  // same expend/restore UI shape as the others).
  expendedHealingHands: number;
  expendedFuryOfTheSmall: number;
  expendedShifting: number;
  // Innate Sorcery (Sorcerer): 2 uses/Long Rest.
  expendedInnateSorcery: number;
  // Arcane Recovery (Wizard): once per day, used on a Short Rest. Reset on a
  // Long Rest. Boolean flag, same shape as usedMagicalCunning.
  usedArcaneRecovery: boolean;
  // Human Resourceful grants Heroic Inspiration on each Long Rest; also a
  // generic DM-grantable flag any character can toggle. Shown as a stat chip.
  heroicInspiration: boolean;
  // Exhaustion level (0-6). Each level is a -2 penalty on every d20 test and
  // -5 ft Speed; auto-applied to rolls and displaySpeed. A Long Rest reduces
  // it by 1.
  exhaustionLevel: number;
  // Active conditions (indexes into CONDITIONS) — tracked/shown, not auto-
  // simulated. Concentration is a free-text reminder of the spell you're
  // concentrating on ("" = none).
  conditions: string[];
  concentratingOn: string;
  // Relentless Endurance (Orc): "drop to 1 Hit Point instead" the first
  // time you'd be reduced to 0 each Long Rest — checked automatically by
  // applyDamage below, not a button the player clicks.
  usedRelentlessEndurance: boolean;
  // Lineage spellcasting (Elf/Gnome/Tiefling): 1 free cast per Long Rest for
  // the always-prepared spells at character levels 3 and 5. Cantrips are
  // at-will and need no tracking.
  usedLineageSpell3: boolean;
  usedLineageSpell5: boolean;
  // Chosen lineage cantrip (High Elf: swappable from Wizard list on Long Rest).
  // null = use the default from the trait (e.g. Prestidigitation for High Elf).
  lineageCantrip: string | null;
  // Starting equipment has no "delete" concept in the build itself (it's
  // derived fresh from class/background every render, not stored as
  // removable state) — this is the play-state-only equivalent of deleting
  // an inventory row: indexes listed here are filtered out of the unified
  // Equipment list entirely. A player can always get the same item back via
  // "+ Add Equipment" since it's just another real catalog item at that
  // point, so no separate "undo" affordance is needed.
  removedStartingIndexes: string[];
}

export default function PlaySheet({
  characterId,
  draft,
  species,
  subspecies,
  classes,
  backgrounds,
  skills,
  equipment,
  languages,
  magicItemLookup,
  features,
  subclassOptions,
  subclassOptionsByClass,
  generalFeats,
  epicBoonFeats,
  fightingStyleFeats,
  masteryProperties,
  traitDescriptions,
  classSpells,
  classSpellsByClass,
  lineageCantripSpells,
  subclassSpellData,
  isOwner,
  isPublic,
  dmEffects,
  avatarUrl,
  bio,
  notes,
  personality,
  inventory: initialInventory,
  currency: initialCurrency,
  magicItems: initialMagicItems,
}: PlaySheetProps) {
  const storageKey = `tavern_play_${characterId}`;
  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));
  const magicItemByIndex = new Map(magicItemLookup.map((m) => [m.index, m]));
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [inventoryManagerOpen, setInventoryManagerOpen] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const { bundleItems: inventoryBundleItems, augmentedLookup } = resolveInventoryEquipment(
    inventory,
    equipmentByIndex,
  );

  async function saveInventory(next: InventoryItem[]) {
    setInventoryError(null);
    const result = await setCharacterInventory(characterId, next);
    if (!result.success) {
      setInventoryError(result.error ?? "Couldn't save inventory.");
      return;
    }
    setInventory(next);
    setInventoryManagerOpen(false);
    setEditingInventoryItem(null);
  }

  function handleSaveInventoryItem(item: InventoryItem) {
    const exists = inventory.some((i) => i.id === item.id);
    const next = exists ? inventory.map((i) => (i.id === item.id ? item : i)) : [...inventory, item];
    saveInventory(next);
  }

  function handleRemoveInventoryItem(id: string) {
    saveInventory(inventory.filter((i) => i.id !== id));
  }

  const [magicItems, setMagicItems] = useState<MagicItem[]>(initialMagicItems);
  const [magicItemManagerOpen, setMagicItemManagerOpen] = useState(false);
  const [editingMagicItem, setEditingMagicItem] = useState<MagicItem | null>(null);
  const [magicItemError, setMagicItemError] = useState<string | null>(null);

  async function saveMagicItems(next: MagicItem[]) {
    setMagicItemError(null);
    const result = await setCharacterMagicItems(characterId, next);
    if (!result.success) {
      setMagicItemError(result.error ?? "Couldn't save magic items.");
      return;
    }
    setMagicItems(next);
    setMagicItemManagerOpen(false);
    setEditingMagicItem(null);
  }

  function handleSaveMagicItem(item: MagicItem) {
    const exists = magicItems.some((i) => i.id === item.id);
    const next = exists ? magicItems.map((i) => (i.id === item.id ? item : i)) : [...magicItems, item];
    saveMagicItems(next);
  }

  function handleRemoveMagicItem(id: string) {
    saveMagicItems(magicItems.filter((i) => i.id !== id));
  }
  // Shadows the `draft` prop so a successful level-up can update the sheet
  // instantly without a server round trip — same instant-feedback feel as
  // the rest of the play sheet's local state.
  const [currentDraft, setCurrentDraft] = useState(draft);
  const sheet = buildCharacterSheet(currentDraft, { species, subspecies, classes, backgrounds, skills });
  // Lazy initializer so deriveStartingCurrency only runs once at mount,
  // not on every render — once a player has their own saved currency
  // (initialCurrency non-null), starting money is never re-derived even
  // if ownedEquipment later changes (e.g. on level-up).
  const [currency, setCurrency] = useState<Currency>(
    () => initialCurrency ?? deriveStartingCurrency(sheet?.ownedEquipment ?? []),
  );
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  async function commitCurrency(key: keyof Currency, value: number) {
    const next = { ...currency, [key]: value };
    setCurrency(next);
    setCurrencyError(null);
    const result = await setCharacterCurrency(characterId, next);
    if (!result.success) setCurrencyError(result.error ?? "Couldn't save currency.");
  }

  const [levelingUp, setLevelingUp] = useState(false);
  const [levelUpError, setLevelUpError] = useState<string | null>(null);
  const [levelUpPending, setLevelUpPending] = useState(false);
  // Multiclass level-up: which class the next level goes into (null = the
  // primary class), and whether the "add a new class" grid is open.
  const [levelUpClass, setLevelUpClass] = useState<string | null>(null);
  const [addingClass, setAddingClass] = useState(false);
  const [levelingDown, setLevelingDown] = useState(false);
  const [levelDownError, setLevelDownError] = useState<string | null>(null);
  const [levelDownPending, setLevelDownPending] = useState(false);
  const [xpInput, setXpInput] = useState("");
  const [levelingPending, setLevelingPending] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [subclassPending, setSubclassPending] = useState(false);
  const [selectedSubclassIndex, setSelectedSubclassIndex] = useState<string | null>(null);
  const [orderPending, setOrderPending] = useState(false);
  const [ancestryPending, setAncestryPending] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  // Which class + level milestone the feat picker is open for (per-class for
  // multiclass — a Fighter 4/Wizard 4 owes two separate ASIs).
  const [featPicker, setFeatPicker] = useState<{ classIndex: string; level: number } | null>(null);
  const [selectedFeatIndex, setSelectedFeatIndex] = useState<string | null>(null);
  const [asiBonus, setAsiBonus] = useState<AbilityBonusChoice | null>(null);
  const [featPending, setFeatPending] = useState(false);
  const [expertisePicker, setExpertisePicker] = useState<{ classIndex: string; level: number } | null>(
    null,
  );
  // Multiclass skill grant (Bard/Ranger/Rogue joined as a secondary class).
  const [mcSkillPicker, setMcSkillPicker] = useState<string | null>(null);
  const [selectedMcSkills, setSelectedMcSkills] = useState<string[]>([]);
  const [mcSkillPending, setMcSkillPending] = useState(false);
  const [selectedExpertiseSkills, setSelectedExpertiseSkills] = useState<string[]>([]);
  const [expertisePending, setExpertisePending] = useState(false);
  // When a character has two spellcasting classes, this selects which one the
  // Cantrips/Prepared pickers manage (null → the first caster).
  const [activeCasterClass, setActiveCasterClass] = useState<string | null>(null);
  const [cantripPickerOpen, setCantripPickerOpen] = useState(false);
  const [lineageCantripPickerOpen, setLineageCantripPickerOpen] = useState(false);
  const [selectedCantrips, setSelectedCantrips] = useState<string[]>([]);
  const [preparedPickerOpen, setPreparedPickerOpen] = useState(false);
  const [selectedPrepared, setSelectedPrepared] = useState<string[]>([]);
  const [spellsPending, setSpellsPending] = useState(false);
  const [metamagicPickerOpen, setMetamagicPickerOpen] = useState(false);
  const [selectedMetamagic, setSelectedMetamagic] = useState<string[]>([]);
  const [metamagicPending, setMetamagicPending] = useState(false);
  const [fightingStylePickerOpen, setFightingStylePickerOpen] = useState(false);
  const [selectedFightingStyle, setSelectedFightingStyle] = useState<string[]>([]);
  const [fightingStylePending, setFightingStylePending] = useState(false);
  const [weaponMasteryPickerOpen, setWeaponMasteryPickerOpen] = useState(false);
  const [selectedWeaponMastery, setSelectedWeaponMastery] = useState<string[]>([]);
  const [weaponMasteryPending, setWeaponMasteryPending] = useState(false);
  const [bonusSkillPickerOpen, setBonusSkillPickerOpen] = useState(false);
  const [selectedHumanSkill, setSelectedHumanSkill] = useState<string | null>(null);
  const [selectedSkilled, setSelectedSkilled] = useState<string[]>([]);
  const [bonusSkillPending, setBonusSkillPending] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const allOwnedIndexes = (sheet?.ownedEquipment ?? [])
    .map((i) => i.index)
    .filter((i): i is string => Boolean(i));

  const defaultPlayState: PlayState = {
    currentHp: sheet ? sheet.maxHpValue : 1,
    tempHp: 0,
    hitDiceUsed: 0,
    hitDiceUsedByDie: {},
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    equippedIndexes: allOwnedIndexes,
    equippedMagicItemIndexes: [],
    attunedMagicItemIndexes: [],
    rollMode: "normal",
    expendedSlots: [],
    expendedPactSlots: [],
    expendedSorceryPoints: 0,
    expendedChannelDivinity: 0,
    expendedBardicInspiration: 0,
    expendedWildShape: 0,
    expendedLayOnHands: 0,
    expendedFavoredEnemy: 0,
    usedMagicalCunning: false,
    expendedSecondWind: 0,
    expendedActionSurge: 0,
    expendedIndomitable: 0,
    expendedRage: 0,
    isRaging: false,
    usedPersistentRage: false,
    expendedFocusPoints: 0,
    expendedWholenessOfBody: 0,
    usedUncannyMetabolism: false,
    expendedBreathWeapon: 0,
    usedDraconicFlight: false,
    expendedGiantAncestry: 0,
    expendedStonecunning: 0,
    expendedAdrenalineRush: 0,
    usedLargeForm: false,
    expendedHealingHands: 0,
    expendedFuryOfTheSmall: 0,
    expendedShifting: 0,
    expendedInnateSorcery: 0,
    usedArcaneRecovery: false,
    heroicInspiration: false,
    exhaustionLevel: 0,
    conditions: [],
    concentratingOn: "",
    usedRelentlessEndurance: false,
    usedLineageSpell3: false,
    usedLineageSpell5: false,
    lineageCantrip: null,
    removedStartingIndexes: [],
  };

  const [play, setPlay] = useState<PlayState>(defaultPlayState);
  const [diceLog, setDiceLog] = useState<DiceLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [damageInput, setDamageInput] = useState("");
  const [healInput, setHealInput] = useState("");
  const [layOnHandsInput, setLayOnHandsInput] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlay({ ...defaultPlayState, ...JSON.parse(saved) });
      } catch {
        // ignore corrupt saved state
      }
    }
    setLoaded(true);
    // defaultPlayState is derived fresh each render from props that don't
    // change after mount — safe to use only the storageKey as the dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (loaded) localStorage.setItem(storageKey, JSON.stringify(play));
  }, [play, loaded, storageKey]);

  if (!sheet) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-tavern-muted">
          This character&apos;s data looks incomplete and can&apos;t be displayed.
        </p>
      </div>
    );
  }

  if (!loaded) return null;

  // Multiclass helpers: a class's level (0 if the character has no levels in
  // it), and the freely-re-settable per-class choices flattened across every
  // class (the primary's in the legacy flat array, each additional class's in
  // its keyed bucket) for the derivations that don't care which class granted
  // them (Defense/Archery AC & attack bonuses, mastered weapons).
  const clsLvl = (c: string) => sheet.classLevels[c] ?? 0;
  const allFightingStyles = [
    ...currentDraft.fightingStyleChoices,
    ...Object.values(currentDraft.classFightingStyles ?? {}).flat(),
  ];
  const allWeaponMastery = [
    ...currentDraft.weaponMasteryChoices,
    ...Object.values(currentDraft.classWeaponMastery ?? {}).flat(),
  ];

  const equippedSet = new Set(play.equippedIndexes);
  const hasDefenseFightingStyle = allFightingStyles.includes("defense");
  const hasArcheryFightingStyle = allFightingStyles.includes("archery");
  // Unarmored Defense (Barbarian: 10+DEX+CON; Monk: 10+DEX+WIS — both "while
  // you aren't wearing armor," Monk also excludes wielding a Shield, already
  // handled by computeArmorClass's existing bodyArmor branch either way).
  // Only takes effect while unarmored, so passing it unconditionally for
  // either class is safe.
  const unarmoredDefenseBonus =
    clsLvl("barbarian") > 0
      ? sheet.modifiers.con
      : clsLvl("monk") > 0
        ? sheet.modifiers.wis
        : 0;
  const rageDamageBonusWhileRaging =
    clsLvl("barbarian") > 0 && play.isRaging ? sheet.rageDamageBonus : 0;
  const monkMartialArtsDie = clsLvl("monk") > 0 ? sheet.martialArtsDie : null;
  const allOwnedBundleItems = [...sheet.ownedEquipment, ...inventoryBundleItems];
  // Magic items aren't anchored to a piece of armor (a Cloak of Protection
  // isn't a buffed Cloak), so they don't go through computeAC's equipment-
  // lookup path at all — just a flat sum of every EQUIPPED magic item's own
  // acBonus, added straight onto the armor-based AC. Not multiplied by
  // count: owning 3 of an item doesn't mean wearing 3 at once.
  const equippedMagicItemSet = new Set(play.equippedMagicItemIndexes);
  const magicItemAcBonus = magicItems
    .filter((item) => equippedMagicItemSet.has(item.id))
    .reduce((sum, item) => sum + item.acBonus, 0);
  // Attunement: max 3 attuned items (the standard limit). An item can be
  // attuned only if it requires attunement (real items) or is fully homebrew
  // (magicItemIndex null — could require it, so it's allowed).
  const ATTUNEMENT_MAX = 3;
  const attunedSet = new Set(play.attunedMagicItemIndexes);
  const attunedCount = play.attunedMagicItemIndexes.length;

  // Encumbrance: total carried weight vs carrying capacity (STR × 15 lb).
  // Sums starting equipment (minus removed/money) and found/custom inventory
  // by each item's catalog weight × count. Coin weight is ignored (base rule).
  const totalWeight =
    sheet.ownedEquipment
      .filter((i) => !i.isMoney && i.index && !play.removedStartingIndexes.includes(i.index))
      .reduce((sum, i) => sum + (equipmentByIndex.get(i.index!)?.weight ?? 0) * i.count, 0) +
    inventory.reduce((sum, i) => sum + (equipmentByIndex.get(i.baseIndex)?.weight ?? 0) * i.count, 0);
  const carryingCapacity = sheet.finalScores.str * 15;
  const isEncumbered = totalWeight > carryingCapacity;
  const ac =
    computeAC(
      allOwnedBundleItems,
      augmentedLookup,
      equippedSet,
      sheet.modifiers.dex,
      hasDefenseFightingStyle,
      unarmoredDefenseBonus,
      sheet.naturalArmorAC,
    ) + magicItemAcBonus;
  // Monk's Unarmed Strike isn't equipment, so resolveWeapons (which only
  // resolves ownedEquipment) can't produce it — synthesized here and
  // prepended instead. Always available per Martial Arts' text ("while you
  // are unarmed or wielding only Monk weapons and you aren't wearing armor
  // or wielding a Shield"); this app doesn't re-check that condition against
  // currently-equipped gear, the same simplification level as not gating
  // Barbarian's Rage on "not wearing Heavy armor" either.
  const monkUnarmedStrike: ResolvedWeapon | null = monkMartialArtsDie
    ? {
        index: "unarmed-strike",
        name: "Unarmed Strike",
        ability: "dex",
        attackBonus: sheet.modifiers.dex + sheet.proficiencyBonus,
        damageDice: `1d${monkMartialArtsDie}`,
        damageBonus: sheet.modifiers.dex,
        damageType: "Bludgeoning",
        mastery: null,
        notes: null,
        bonusDamageDice: null,
        bonusDamageCondition: null,
        range: "5 ft",
      }
    : null;
  // Species natural weapon (Tabaxi/Tortle Claws, Satyr Ram's Headbutt) — a
  // synthesized Unarmed Strike, same approach as Monk's above. Uses STR like a
  // normal Unarmed Strike; a Monk can use the higher of STR/DEX (Dexterous
  // Attacks) and the larger of the natural die vs their Martial Arts die,
  // since the claws ARE their Unarmed Strike. Shown as its own row.
  const naturalWeapon: ResolvedWeapon | null = sheet.naturalWeapon
    ? (() => {
        const isMonk = monkMartialArtsDie != null;
        const ability: "str" | "dex" =
          isMonk && sheet.modifiers.dex > sheet.modifiers.str ? "dex" : "str";
        const die = Math.max(sheet.naturalWeapon.damageDie, monkMartialArtsDie ?? 0);
        return {
          index: "natural-weapon",
          name: sheet.naturalWeapon.name,
          ability,
          attackBonus: sheet.modifiers[ability] + sheet.proficiencyBonus,
          damageDice: `1d${die}`,
          damageBonus: sheet.modifiers[ability],
          damageType: sheet.naturalWeapon.damageType,
          mastery: null,
          notes: sheet.naturalWeapon.note,
          bonusDamageDice: null,
          bonusDamageCondition: null,
          range: "5 ft",
        };
      })()
    : null;
  // Empty weaponMasteryChoices means either "this class doesn't have the
  // feature" or "an existing character created before it shipped never
  // recorded a choice" — both cases fall back to null (show mastery
  // unconditionally, the pre-existing behavior), rather than silently
  // hiding every weapon's mastery the instant this feature shipped.
  const masteredWeaponIndexes = allWeaponMastery.length > 0 ? new Set(allWeaponMastery) : null;
  const weapons = [
    ...(monkUnarmedStrike ? [monkUnarmedStrike] : []),
    ...(naturalWeapon ? [naturalWeapon] : []),
    ...resolveWeapons(
      allOwnedBundleItems,
      augmentedLookup,
      sheet.modifiers,
      sheet.proficiencyBonus,
      hasArcheryFightingStyle,
      rageDamageBonusWhileRaging,
      monkMartialArtsDie,
      masteredWeaponIndexes,
    ),
  ];
  // Unarmored Movement (Monk, from level 2): "+10 feet while you aren't
  // wearing armor or wielding a Shield" — checked against currently
  // equipped gear (unlike the Unarmed Strike simplification above) since
  // Speed is purely a display value with no derived calculations riding on
  // it, making the extra correctness cheap here.
  const wearingArmorOrShield = sheet.ownedEquipment.some((item) => {
    if (!item.index || !equippedSet.has(item.index)) return false;
    return Boolean(equipmentByIndex.get(item.index)?.armorClass);
  });
  const baseSpeed =
    clsLvl("monk") > 0 && sheet.speed != null && !wearingArmorOrShield
      ? sheet.speed + sheet.unarmoredMovementBonus
      : sheet.speed;
  // Exhaustion cuts Speed by 5 ft per level (floored at 0).
  const displaySpeed =
    baseSpeed != null ? Math.max(0, baseSpeed - exhaustionSpeedPenalty(play.exhaustionLevel)) : baseSpeed;
  const maxHp = sheet.maxHpValue;
  const totalHitDice = sheet.level;
  const hitDiceUsedByDie = play.hitDiceUsedByDie ?? {};
  const isDying = play.currentHp <= 0;
  const isHalfling = sheet.speciesIndex === "halfling";

  // Leveling / XP derived values (used by the owner-only leveling controls).
  const xpMode = currentDraft.levelingMode === "xp";
  const nextLevelXp = xpForNextLevel(sheet.level);
  const hasEnoughXp = !xpMode || nextLevelXp === null || currentDraft.xp >= nextLevelXp;
  const xpIntoLevel = currentDraft.xp - (XP_THRESHOLDS[sheet.level] ?? 0);
  const xpForThisSpan = nextLevelXp !== null ? nextLevelXp - (XP_THRESHOLDS[sheet.level] ?? 0) : 0;
  const xpPct = xpForThisSpan > 0 ? Math.min(100, Math.round((xpIntoLevel / xpForThisSpan) * 100)) : 100;

  const orderOptions = ORDER_CHOICES[sheet.classIndex] ?? null;
  const needsOrderChoice = !!orderOptions && !currentDraft.orderChoice;
  const chosenOrder = orderOptions?.find((o) => o.key === currentDraft.orderChoice) ?? null;

  const needsGiantAncestryChoice = sheet.speciesIndex === "goliath" && !currentDraft.giantAncestryChoice;
  const chosenAncestry = GIANT_ANCESTRY_OPTIONS.find((o) => o.key === currentDraft.giantAncestryChoice) ?? null;

  // Each class the character has (primary + any additional). The primary's
  // subclass lives in currentDraft.subclassIndex, additional classes' in
  // secondarySubclasses. Resolved against the flat subclassOptions union.
  const classEntries = sheet.classes.map((c) => ({
    classIndex: c.classIndex,
    className: c.className,
    level: c.level,
    subclassIndex: c.subclassIndex,
    subclass: subclassOptions.find((s) => s.index === c.subclassIndex) ?? null,
  }));
  // The primary class's chosen subclass — used by the header and the
  // (primary-class) subclass picker; per-class pickers loop classEntries.
  const chosenSubclass =
    subclassOptions.find((s) => s.index === currentDraft.subclassIndex) ?? null;
  // Header subtitle. Single class: "Fighter (Champion)" (no level, as before).
  // Multiclass: "Fighter 5 (Champion) / Wizard 3 (Evoker — Homebrew)".
  const classSubtitle = classEntries
    .map((c) => {
      const lvl = classEntries.length > 1 ? ` ${c.level}` : "";
      const sub = c.subclass ? ` (${c.subclass.name}${c.subclass.isHomebrew ? " — Homebrew" : ""})` : "";
      return `${c.className}${lvl}${sub}`;
    })
    .join(" / ");

  // Level-up class targeting. levelUpClass null → continue the primary class.
  const levelUpTarget = levelUpClass ?? sheet.classIndex;
  const levelUpHitDie = classes.find((c) => c.index === levelUpTarget)?.hitDie ?? sheet.hitDie;
  const formatPrereq = (classIndex: string): string => {
    const req = MULTICLASS_PREREQUISITES[classIndex];
    if (!req) return "";
    const joiner = req.mode === "any" ? " or " : " and ";
    return req.abilities.map((a) => `${a.toUpperCase()} ${MULTICLASS_PREREQ_MIN}`).join(joiner);
  };
  // Classes the character doesn't have yet — the "add a new class" options,
  // each flagged with whether its ability prerequisites are met.
  const addableClasses = classes
    .filter((c) => clsLvl(c.index) === 0)
    .map((c) => ({
      index: c.index,
      name: c.name,
      meets: meetsMulticlassPrereq(sheet.finalScores, c.index),
      prereq: formatPrereq(c.index),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Classes that have reached level 3 with subclass options but no pick yet.
  const classesNeedingSubclass = classEntries.filter(
    (c) => c.level >= 3 && !c.subclassIndex && (subclassOptionsByClass[c.classIndex]?.length ?? 0) > 0,
  );
  const needsSubclassChoice = classesNeedingSubclass.length > 0;

  // Secondary classes (Bard/Ranger/Rogue) that grant a skill on multiclass and
  // haven't had it chosen yet.
  const pendingMulticlassSkills = classEntries.filter(
    (c) =>
      c.classIndex !== sheet.classIndex &&
      (MULTICLASS_SKILL_GRANTS[c.classIndex] ?? 0) >
        (currentDraft.multiclassSkills[c.classIndex]?.length ?? 0),
  );
  const mcSkillEligible = sheet.skills.filter((s) => !s.proficient);

  // For classes with only one SRD subclass, the source data already flattens
  // some subclass features into the base `features` table too (e.g. Cleric's
  // "Disciple of Life") — dedupe by name so those don't show twice.
  const baseFeatureNames = new Set(features.map((f) => f.name));
  // Subclass features across every class, each gated on that class's level.
  const subclassFeatures: ClassFeature[] = classEntries.flatMap((c) =>
    (c.subclass?.features ?? [])
      .filter((f) => f.level <= c.level && !baseFeatureNames.has(f.name))
      .map((f) => ({
        index: `${c.subclass!.index}-${f.name}`,
        name: f.name,
        level: f.level,
        description: f.description,
      })),
  );

  // ASI milestones owed per class (4/8/12/16/19 of THAT class). A pending entry
  // carries the owning class so chooseFeat targets the right one.
  const pendingAsi = classEntries.flatMap((c) =>
    ASI_LEVELS.filter(
      (lvl) =>
        lvl <= c.level &&
        !currentDraft.featChoices.some(
          (fc) => (fc.classIndex ?? sheet.classIndex) === c.classIndex && fc.level === lvl,
        ),
    ).map((lvl) => ({ classIndex: c.classIndex, className: c.className, level: lvl })),
  );
  const takenFeatIndexes = new Set(currentDraft.featChoices.map((fc) => fc.featIndex));
  const featFeatures: ClassFeature[] = currentDraft.featChoices.map((fc) => {
    // Epic boons live in a separate list from general feats — check both so a
    // chosen boon shows its real name + full description, not a raw slug.
    const opt =
      generalFeats.find((f) => f.index === fc.featIndex) ??
      epicBoonFeats.find((f) => f.index === fc.featIndex);
    return {
      index: `feat-${fc.featIndex}-${fc.level}`,
      name: opt?.name ?? fc.featIndex,
      level: fc.level,
      description: opt?.description ?? null,
    };
  });

  // The base class features table has a generic "Ability Score Improvement"
  // marker at level 4 for every class (it doesn't repeat at 8/12/16/19 in that
  // data, just the one mention) — once that level's choice is actually
  // resolved below, drop the generic marker so it doesn't sit next to the
  // real pick (which might not even be Ability Score Improvement).
  // A generic "Ability Score Improvement" marker is dropped once its owning
  // class's ASI at that level is resolved (keyed per class for multiclass).
  const isResolvedAsiMarker = (f: { classIndex: string; level: number; name: string }) =>
    f.name === "Ability Score Improvement" &&
    currentDraft.featChoices.some(
      (fc) => (fc.classIndex ?? sheet.classIndex) === f.classIndex && fc.level === f.level,
    );
  // The base features table also flattens the official SRD subclass's own
  // features into the base class (the "Disciple of Life" case noted above,
  // dedupe in the other direction) — this only ever looked correct before
  // homebrew subclasses existed, because Berserker/Life Domain/etc. was the
  // ONLY subclass choice, so a leaked feature like "Frenzy" always matched
  // whatever was chosen. Now that other subclasses are real alternatives,
  // a base-table feature whose name belongs to SOME subclass must only
  // show if it's also the CHOSEN subclass's own feature — otherwise a
  // Barbarian who picked Path of the Bloodletter would still see Berserker's
  // "Frenzy" leak into their Features list.
  const allSubclassFeatureNames = new Set(subclassOptions.flatMap((s) => s.features.map((f) => f.name)));
  const chosenSubclassFeatureNames = new Set(
    classEntries.flatMap((c) => c.subclass?.features.map((f) => f.name) ?? []),
  );
  const baseFeaturesWithoutResolvedAsi = features.filter(
    (f) =>
      // Base features only show up to their OWNING class's level (a Wizard-5
      // feature is hidden for a character with only 3 Wizard levels).
      f.level <= clsLvl(f.classIndex) &&
      !isResolvedAsiMarker(f) &&
      (!allSubclassFeatureNames.has(f.name) || chosenSubclassFeatureNames.has(f.name)),
  );

  const backgroundFeatFeature: ClassFeature | null = sheet.backgroundFeatIndex
    ? {
        index: `background-feat-${sheet.backgroundFeatIndex}`,
        name: sheet.backgroundFeatName ?? sheet.backgroundFeatIndex,
        level: 1,
        description: sheet.backgroundFeatDescription,
      }
    : null;

  const unlockedFeatures = [
    ...baseFeaturesWithoutResolvedAsi,
    ...subclassFeatures,
    ...featFeatures,
    ...(backgroundFeatFeature ? [backgroundFeatFeature] : []),
  ]
    .filter((f) => f.level <= sheet.level)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // Species traits weren't shown anywhere on the play sheet at all before
  // this pass — only the species NAME in the header line. Subspecies
  // traits can carry their own `level` (Elven Lineage's level-3/5 spell
  // unlocks); base species traits don't, so they default to level 1
  // (always active). Same ClassFeature shape as unlockedFeatures so the
  // JSX below reuses that exact collapsible-list pattern. Descriptions come
  // from the traitDescriptions lookup (the traits table) since
  // species/subspecies.traits only carry {index, name}.
  const chosenSpeciesOption = species.find((s) => s.index === currentDraft.speciesIndex) ?? null;
  const chosenSubspeciesOption =
    subspecies.find((s) => s.index === currentDraft.subspeciesIndex) ?? null;
  const speciesTraits: ClassFeature[] = [
    ...(chosenSpeciesOption?.traits ?? []).map((t) => ({
      index: `species-${t.index}`,
      name: t.name,
      level: 1,
      description: traitDescriptions[t.index] ?? null,
    })),
    ...(chosenSubspeciesOption?.traits ?? []).map((t) => ({
      index: `subspecies-${t.index}`,
      name: t.name,
      level: t.level ?? 1,
      description: traitDescriptions[t.index] ?? null,
    })),
  ]
    .filter((t) => t.level <= sheet.level)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // Expertise pending choices, per class that grants it (Rogue/Bard/Ranger).
  // Each class's existing picks live in the primary's legacy expertiseChoices
  // or a secondary class's classExpertise bucket.
  const pendingExpertise = classEntries.flatMap((c) => {
    const schedule = EXPERTISE_SCHEDULE[c.classIndex];
    if (!schedule) return [];
    const existing =
      c.classIndex === sheet.classIndex
        ? currentDraft.expertiseChoices
        : currentDraft.classExpertise[c.classIndex] ?? [];
    const milestone = schedule.find((m) => {
      const priorCount = schedule
        .filter((x) => x.level < m.level)
        .reduce((sum, x) => sum + x.count, 0);
      return m.level <= c.level && existing.length === priorCount;
    });
    return milestone
      ? [{ classIndex: c.classIndex, className: c.className, milestone }]
      : [];
  });
  // Eligible = proficient skills that don't already have Expertise (from any
  // class — sheet.skills.expertise is the cross-class union).
  const expertiseEligibleSkills = sheet.skills.filter((s) => s.proficient && !s.expertise);

  // Bonus skill proficiencies: Human's Skillful (1) and the Skilled feat (3
  // per time taken). The picker shows when either source applies.
  const isHuman = sheet.speciesIndex === "human";
  const skilledCount =
    currentDraft.featChoices.filter((fc) => fc.featIndex === "skilled").length * 3;
  const hasBonusSkillChoice = isHuman || skilledCount > 0;

  // Drives the Short Rest button's visibility. Grows by one OR clause per
  // class that adds a short-rest-recoverable resource (Bard always has
  // Bardic Inspiration from level 1, even though it's Long-Rest-only below
  // level 5 — the button itself stays visible, shortRest() just no-ops on it
  // until Font of Inspiration). Warlock's clause checks spell slots directly
  // rather than a dedicated sheet field — Pact Magic is the only spellcasting
  // class whose slots recover on a Short Rest at all.
  const hasShortRestResource =
    sheet.channelDivinityMax > 0 ||
    sheet.bardicInspirationMax > 0 ||
    sheet.wildShapeMax > 0 ||
    sheet.secondWindMax > 0 ||
    sheet.actionSurgeMax > 0 ||
    sheet.rageMax > 0 ||
    sheet.focusPointsMax > 0 ||
    sheet.adrenalineRushMax > 0 ||
    sheet.furyOfTheSmallMax > 0 ||
    sheet.shiftingMax > 0 ||
    sheet.arcaneRecoveryMax > 0 ||
    sheet.pactSlots.some((n) => n > 0);

  // The caster class the Spells card's cantrip/prepared pickers manage — the
  // character's first spellcasting class (usually the only one). Its spell list
  // comes from classSpellsByClass; its picks live in the legacy flat arrays if
  // it's the primary class, otherwise in its per-class bucket. (A character
  // with two caster classes manages this first one here; the second caster's
  // list is a documented follow-up.)
  const spellClass =
    (activeCasterClass && sheet.spellcasting.some((sc) => sc.classIndex === activeCasterClass)
      ? activeCasterClass
      : sheet.spellcasting[0]?.classIndex) ?? sheet.classIndex;
  const activeCaster = sheet.spellcasting.find((sc) => sc.classIndex === spellClass) ?? null;
  const activeCantripsKnown = activeCaster?.cantripsKnown ?? 0;
  const activePreparedCount = activeCaster?.preparedCount ?? 0;
  const activeSaveDC = activeCaster?.saveDC ?? sheet.spellSaveDC ?? 0;
  const activeAttackBonus = activeCaster?.attackBonus ?? sheet.spellAttackBonus ?? 0;
  const spellClassIsPrimary = spellClass === sheet.classIndex;
  const spellClassSpells = classSpellsByClass[spellClass] ?? classSpells;
  const currentKnownCantrips = spellClassIsPrimary
    ? currentDraft.knownCantrips
    : currentDraft.classCantrips[spellClass] ?? [];
  const currentPreparedSpells = spellClassIsPrimary
    ? currentDraft.preparedSpells
    : currentDraft.classPreparedSpells[spellClass] ?? [];

  const cantripOptions = spellClassSpells.filter((s) => s.level === 0);
  // Spells of a level you have no slots for yet aren't preparable.
  // Exception: half-casters (Paladin, Ranger) have no slots at level 1 but
  // do have a prepared-spell count, so fall back to showing level-1 spells
  // so they can make picks before their first slots arrive at level 2.
  const slotLevelReach = (arr: number[]) =>
    arr.reduce((max, count, i) => (count > 0 ? i + 1 : max), 0);
  const maxSpellLevel =
    Math.max(slotLevelReach(sheet.spellSlots), slotLevelReach(sheet.pactSlots)) ||
    (activePreparedCount > 0 && activeCantripsKnown === 0 ? 1 : 0);
  const preparedOptions = spellClassSpells.filter((s) => s.level >= 1 && s.level <= maxSpellLevel);
  const knownCantripDetails = currentKnownCantrips
    .map((index) => cantripOptions.find((s) => s.index === index))
    .filter((s): s is SpellOption => Boolean(s));
  const preparedSpellDetails = currentPreparedSpells
    .map((index) => preparedOptions.find((s) => s.index === index))
    .filter((s): s is SpellOption => Boolean(s))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const knownMetamagicDetails = currentDraft.metamagicChoices
    .map((key) => METAMAGIC_OPTIONS.find((m) => m.key === key))
    .filter((m): m is MetamagicOption => Boolean(m));
  const knownFightingStyleDetails = currentDraft.fightingStyleChoices
    .map((index) => fightingStyleFeats.find((f) => f.index === index))
    .filter((f): f is FeatOption => Boolean(f));

  // Weapon Mastery known count is summed across every granting class (Barbarian/
  // Fighter/Paladin/Ranger/Rogue). The picks are a single re-editable pool
  // stored on the primary and applied via the union (allWeaponMastery), same
  // shape as Fighting Style. Melee-only restriction (Barbarian) only applies if
  // EVERY granting class is melee-only — a Fighter/Barbarian can still master
  // ranged weapons via the Fighter grant.
  const weaponMasteryClasses = sheet.classes.filter(
    (c) => (WEAPON_MASTERY_KNOWN_BY_CLASS[c.classIndex] ?? 0) > 0,
  );
  const weaponMasteryMax = weaponMasteryClasses.reduce(
    (sum, c) => sum + (WEAPON_MASTERY_KNOWN_BY_CLASS[c.classIndex] ?? 0),
    0,
  );
  const weaponMasteryMeleeOnly =
    weaponMasteryClasses.length > 0 &&
    weaponMasteryClasses.every((c) => WEAPON_MASTERY_MELEE_ONLY_CLASSES.has(c.classIndex));
  const masterableWeapons = equipment
    .filter((e) => e.mastery && (!weaponMasteryMeleeOnly || (e.categories ?? []).includes("melee-weapons")))
    .sort((a, b) => a.name.localeCompare(b.name));
  const knownWeaponMasteryDetails = currentDraft.weaponMasteryChoices
    .map((index) => equipmentByIndex.get(index))
    .filter((e): e is EquipmentLookupItem => Boolean(e));

  const collapsibleSectionIds = [
    "hp", "status", "skills",
    ...(sheet.fightingStyleKnownMax > 0 ? ["fighting-style"] : []),
    ...(weaponMasteryMax > 0 ? ["weapon-mastery"] : []),
    ...(sheet.spellcastingAbility || sheet.lineageSpells.length > 0 || sheet.lineageCantripTrait !== null || sheet.speciesCantrip ? ["spells"] : []),
    ...(speciesTraits.length > 0 ? ["species-traits"] : []),
    ...(unlockedFeatures.length > 0 ? ["features"] : []),
    ...(weapons.length > 0 || clsLvl("paladin") > 0 ? ["attacks"] : []),
    "equipment",
  ];
  const allSectionsCollapsed = collapsibleSectionIds.every((id) => collapsedSections.has(id));

  function pushLog(entry: Omit<DiceLogEntry, "id">) {
    setDiceLog((prev) => [{ ...entry, id: prev.length + Date.now() }, ...prev].slice(0, 50));
  }

  function d20Detail(result: ReturnType<typeof rollD20>, modifier: number): string {
    const mod = formatModifier(modifier);
    if (result.luckyReroll !== undefined) {
      return `d20 [${result.rolls.join(", ")} → ${result.luckyReroll}] ${mod} (Lucky)`;
    }
    return result.rolls.length > 1
      ? `d20 [${result.rolls.join(", ")}] ${mod}`
      : `d20 ${mod}`;
  }

  // Exhaustion imposes a cumulative -2 on every d20 Test (checks, saves,
  // attacks, spell attacks). Subtracted from the modifier before rolling so
  // the logged total already reflects it; a note is appended when it applies.
  const exhaustionPenalty = exhaustionD20Penalty(play.exhaustionLevel);
  function withExhaustion(detail: string): string {
    return exhaustionPenalty > 0 ? `${detail} (Exhaustion −${exhaustionPenalty})` : detail;
  }

  function rollCheck(label: string, modifier: number) {
    const mod = modifier - exhaustionPenalty;
    const result = rollD20(mod, play.rollMode, isHalfling);
    pushLog({
      label,
      detail: withExhaustion(d20Detail(result, mod)),
      total: result.total,
      isNat20: result.isNat20,
      isNat1: result.isNat1,
    });
  }

  function rollAttack(weapon: ReturnType<typeof resolveWeapons>[number]) {
    const mod = weapon.attackBonus - exhaustionPenalty;
    const result = rollD20(mod, play.rollMode, isHalfling);
    pushLog({
      label: `${weapon.name} Attack`,
      detail: withExhaustion(d20Detail(result, mod)),
      total: result.total,
      isNat20: result.isNat20,
      isNat1: result.isNat1,
      critDamageNotation: result.isNat20 ? doubleDiceNotation(weapon.damageDice) : undefined,
      critDamageBonus: weapon.damageBonus,
    });
  }

  function rollDamage(weapon: ReturnType<typeof resolveWeapons>[number]) {
    const result = rollDice(weapon.damageDice);
    pushLog({
      label: `${weapon.name} Damage`,
      detail: `${weapon.damageDice} [${result.rolls.join(", ")}] ${formatModifier(weapon.damageBonus)}${weapon.damageType ? ` ${weapon.damageType}` : ""}`,
      total: result.total + weapon.damageBonus,
    });
  }

  // Conditional bonus damage (e.g. "1d6 vs goblins") is a separate roll,
  // not auto-added to rollDamage — the app has no enemy/target state to
  // check the condition against, so the player decides when it applies
  // and adds this on top of the normal Damage roll themselves. Same shape
  // as Sneak Attack/Brutal Strike's standalone "Roll Xd6" buttons.
  function rollBonusDamage(weapon: ReturnType<typeof resolveWeapons>[number]) {
    if (!weapon.bonusDamageDice) return;
    const result = rollDice(weapon.bonusDamageDice);
    pushLog({
      label: `${weapon.name} Bonus Damage${weapon.bonusDamageCondition ? ` (${weapon.bonusDamageCondition})` : ""}`,
      detail: `${weapon.bonusDamageDice} [${result.rolls.join(", ")}] — add to ${weapon.name}'s normal Damage roll`,
      total: result.total,
    });
  }

  function rollDivineSmite(slotLevel: number) {
    const diceCount = Math.min(slotLevel + 1, 5);
    const result = rollDice(`${diceCount}d8`);
    pushLog({
      label: `Divine Smite (Slot Lv.${slotLevel})`,
      detail: `${diceCount}d8 Radiant [${result.rolls.join(", ")}] — spend a level-${slotLevel} slot via Spell Slots`,
      total: result.total,
    });
  }

  function rollImprovedDivineSmite() {
    const result = rollDice("1d8");
    pushLog({
      label: "Improved Divine Smite",
      detail: `1d8 Radiant [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  function rollSpellAttack(spellName: string, attackBonus: number) {
    const mod = attackBonus - exhaustionPenalty;
    const result = rollD20(mod, play.rollMode, isHalfling);
    pushLog({
      label: `${spellName} Spell Attack`,
      detail: withExhaustion(d20Detail(result, mod)),
      total: result.total,
      isNat20: result.isNat20,
      isNat1: result.isNat1,
    });
  }

  function rollSpellDamage(spellName: string, damageDice: string, damageType: string | null) {
    const result = rollDice(damageDice);
    pushLog({
      label: `${spellName} Damage`,
      detail: `${damageDice} [${result.rolls.join(", ")}]${damageType ? ` ${damageType}` : ""}`,
      total: result.total,
    });
  }

  function castSpell(spellName: string) {
    pushLog({
      label: `Cast ${spellName}`,
      detail: "Resolve effect per spell description",
      total: 0,
    });
  }

  // For cantrips: pick the damage dice for this character's level from the
  // scaling table (e.g. Firebolt: 1d10 at 1–4, 2d10 at 5–10, etc.).
  function getCantripDamageDice(spell: { damageDice: string | null; cantripScaling: Record<string, string> | null }): string | null {
    if (!spell.cantripScaling) return spell.damageDice;
    const tiers = Object.keys(spell.cantripScaling).map(Number).sort((a, b) => a - b);
    const applicable = tiers.filter((t) => t <= (sheet?.level ?? 1));
    const tier = applicable.length > 0 ? applicable[applicable.length - 1] : tiers[0];
    return spell.cantripScaling[String(tier)] ?? spell.damageDice;
  }

  function handleCritRoll(entry: DiceLogEntry) {
    if (!entry.critDamageNotation) return;
    const result = rollDice(entry.critDamageNotation);
    const bonus = entry.critDamageBonus ?? 0;
    pushLog({
      label: `${entry.label.replace(/ Attack$/, "")} Critical Damage`,
      detail: `${entry.critDamageNotation} [${result.rolls.join(", ")}] ${formatModifier(bonus)}`,
      total: result.total + bonus,
    });
  }

  // 5e doesn't let you wear two suits of body armor or wield two shields at
  // once, but nothing previously enforced that here — a player could equip
  // a found/custom piece of armor without first unequipping their starting
  // one, leaving BOTH marked equipped. computeArmorClass only ever looks at
  // the first body-armor (or shield) item it finds in a fixed array order
  // (starting equipment always before inventory items), so the one the
  // player actually just equipped could silently lose to whichever happened
  // to come first — a real bug, the same shape as the shield-category fix
  // above but for the "two armors equipped" case specifically, not a
  // category-matching issue. Equipping a new body armor/shield now first
  // unequips any other already-equipped item of the same kind.
  function toggleEquipped(index: string) {
    setPlay((prev) => {
      const next = new Set(prev.equippedIndexes);
      if (next.has(index)) {
        next.delete(index);
      } else {
        const lookup = augmentedLookup.get(index);
        if (lookup?.armorClass) {
          const isShieldItem = (lookup.categories ?? []).includes("shields");
          for (const otherIndex of [...next]) {
            const other = augmentedLookup.get(otherIndex);
            if (!other?.armorClass) continue;
            const otherIsShield = (other.categories ?? []).includes("shields");
            if (otherIsShield === isShieldItem) next.delete(otherIndex);
          }
        }
        next.add(index);
      }
      return { ...prev, equippedIndexes: [...next] };
    });
  }

  function removeStartingItem(index: string) {
    setPlay((prev) => {
      const equippedIndexes = prev.equippedIndexes.filter((i) => i !== index);
      return {
        ...prev,
        equippedIndexes,
        removedStartingIndexes: [...prev.removedStartingIndexes, index],
      };
    });
  }

  function toggleMagicItemEquipped(id: string) {
    setPlay((prev) => {
      const next = new Set(prev.equippedMagicItemIndexes);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, equippedMagicItemIndexes: [...next] };
    });
  }

  function toggleAttunement(id: string) {
    setPlay((prev) => {
      const attuned = prev.attunedMagicItemIndexes.includes(id);
      // Block attuning a 4th item — the 3-slot limit.
      if (!attuned && prev.attunedMagicItemIndexes.length >= ATTUNEMENT_MAX) return prev;
      return {
        ...prev,
        attunedMagicItemIndexes: attuned
          ? prev.attunedMagicItemIndexes.filter((x) => x !== id)
          : [...prev.attunedMagicItemIndexes, id],
      };
    });
  }

  // Relentless Endurance (Orc): "When you are reduced to 0 Hit Points but
  // not killed outright, you can drop to 1 Hit Point instead. Once you use
  // this trait, you can't do so again until you finish a Long Rest."
  // Applied automatically here rather than as a separate confirmation step
  // — the real rule frames it as a choice, but declining it is never
  // correct, so prompting for it would just be friction. Doesn't model the
  // "not killed outright" massive-damage/instant-death exception, which
  // this app doesn't track for any class.
  function applyDamage() {
    const amount = parseInt(damageInput, 10);
    if (!amount || amount < 0) return;
    setPlay((prev) => {
      const tempAbsorbed = Math.min(prev.tempHp, amount);
      const remaining = amount - tempAbsorbed;
      const wouldDropToZero = prev.currentHp > 0 && prev.currentHp - remaining <= 0;
      const triggersRelentlessEndurance =
        sheet?.relentlessEnduranceAvailable && wouldDropToZero && !prev.usedRelentlessEndurance;
      if (triggersRelentlessEndurance) {
        pushLog({ label: "Relentless Endurance", detail: "Dropped to 1 HP instead of 0", total: 1 });
      }
      return {
        ...prev,
        tempHp: prev.tempHp - tempAbsorbed,
        currentHp: triggersRelentlessEndurance ? 1 : Math.max(0, prev.currentHp - remaining),
        usedRelentlessEndurance: triggersRelentlessEndurance ? true : prev.usedRelentlessEndurance,
      };
    });
    setDamageInput("");
  }

  function applyHeal() {
    const amount = parseInt(healInput, 10);
    if (!amount || amount < 0) return;
    setPlay((prev) => ({ ...prev, currentHp: Math.min(maxHp, prev.currentHp + amount) }));
    setHealInput("");
  }

  // Spends a variable amount from the Lay on Hands pool — unlike the other
  // resources' +/- 1 steppers, this pool is spent in arbitrary amounts (to
  // heal a creature for that many Hit Points), so it mirrors the
  // damage/heal number-input pattern instead.
  function spendLayOnHands() {
    if (!sheet) return;
    const amount = parseInt(layOnHandsInput, 10);
    if (!amount || amount < 0) return;
    setPlay((prev) => ({
      ...prev,
      expendedLayOnHands: Math.min(sheet.layOnHandsMax, prev.expendedLayOnHands + amount),
    }));
    setLayOnHandsInput("");
  }

  function restoreLayOnHands() {
    const amount = parseInt(layOnHandsInput, 10);
    if (!amount || amount < 0) return;
    setPlay((prev) => ({
      ...prev,
      expendedLayOnHands: Math.max(0, prev.expendedLayOnHands - amount),
    }));
    setLayOnHandsInput("");
  }

  // "you can also expend 5 Hit Points from the pool... to remove the
  // Poisoned condition" — a flat-cost quick action alongside the
  // variable-amount spend above.
  function curePoisonWithLayOnHands() {
    if (!sheet) return;
    setPlay((prev) => ({
      ...prev,
      expendedLayOnHands: Math.min(sheet.layOnHandsMax, prev.expendedLayOnHands + 5),
    }));
  }

  function expendFavoredEnemy() {
    setPlay((prev) => ({ ...prev, expendedFavoredEnemy: prev.expendedFavoredEnemy + 1 }));
  }

  function restoreFavoredEnemy() {
    setPlay((prev) => ({
      ...prev,
      expendedFavoredEnemy: Math.max(0, prev.expendedFavoredEnemy - 1),
    }));
  }

  function longRest() {
    setPlay((prev) => ({
      ...prev,
      currentHp: maxHp,
      tempHp: 0,
      hitDiceUsedByDie: recoverHitDice(prev.hitDiceUsedByDie, Math.max(1, Math.ceil(totalHitDice / 2))),
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      expendedSlots: [],
    expendedPactSlots: [],
      expendedSorceryPoints: 0,
      expendedChannelDivinity: 0,
      expendedBardicInspiration: 0,
      expendedWildShape: 0,
      expendedLayOnHands: 0,
      expendedFavoredEnemy: 0,
      usedMagicalCunning: false,
      expendedSecondWind: 0,
      expendedActionSurge: 0,
      expendedIndomitable: 0,
      expendedRage: 0,
      isRaging: false,
      usedPersistentRage: false,
      expendedFocusPoints: 0,
      expendedWholenessOfBody: 0,
      usedUncannyMetabolism: false,
      expendedBreathWeapon: 0,
      usedDraconicFlight: false,
      expendedGiantAncestry: 0,
      expendedStonecunning: 0,
      expendedAdrenalineRush: 0,
      usedLargeForm: false,
      expendedHealingHands: 0,
      expendedFuryOfTheSmall: 0,
      expendedShifting: 0,
      expendedInnateSorcery: 0,
      usedArcaneRecovery: false,
      // Human Resourceful: "You gain Heroic Inspiration whenever you finish a
      // Long Rest." Granted automatically here for Humans; left untouched for
      // everyone else (a DM-granted Inspiration shouldn't be wiped by a rest).
      heroicInspiration:
        sheet?.speciesIndex === "human" ? true : prev.heroicInspiration,
      // A Long Rest reduces Exhaustion by 1 (2024 rules).
      exhaustionLevel: Math.max(0, prev.exhaustionLevel - 1),
      usedRelentlessEndurance: false,
      usedLineageSpell3: false,
      usedLineageSpell5: false,
    }));
  }

  // Channel Divinity, Wild Shape, Second Wind, and Rage each regain only 1
  // use on a Short Rest; Bardic Inspiration fully resets, but only from Bard
  // level 5 on (Font of Inspiration) — below that level a Bard's Bardic
  // Inspiration is Long-Rest-only, same as every other resource. HP and hit
  // dice are untouched either way, matching the real rule that a Short Rest
  // doesn't restore those. Spell slots are also untouched for every caster
  // EXCEPT Warlock — Pact Magic's signature trait is that its slots fully
  // recover on a Short Rest too, confirmed directly from the feature's own
  // text. Action Surge and Focus Points both fully reset on a Short Rest too
  // (confirmed "finish a Short or Long Rest" for each), unlike Second
  // Wind/Rage which only regain 1.
  function shortRest() {
    const bardFontOfInspiration = (sheet?.classLevels?.["bard"] ?? 0) >= 5;
    const warlockPactMagic = (sheet?.classLevels?.["warlock"] ?? 0) > 0;
    setPlay((prev) => ({
      ...prev,
      expendedChannelDivinity: Math.max(0, prev.expendedChannelDivinity - 1),
      expendedBardicInspiration: bardFontOfInspiration ? 0 : prev.expendedBardicInspiration,
      expendedWildShape: Math.max(0, prev.expendedWildShape - 1),
      // Pact Magic slots fully recover on a Short Rest (their own pool).
      expendedPactSlots: warlockPactMagic ? [] : prev.expendedPactSlots,
      expendedSecondWind: Math.max(0, prev.expendedSecondWind - 1),
      expendedActionSurge: 0,
      expendedRage: Math.max(0, prev.expendedRage - 1),
      expendedFocusPoints: 0,
      expendedAdrenalineRush: 0,
      // Fury of the Small (Goblin) and Shifting (Shifter) both recover on a
      // Short OR Long Rest, confirmed from each trait's own text.
      expendedFuryOfTheSmall: 0,
      expendedShifting: 0,
    }));
  }

  // "You can perform an esoteric rite for 1 minute. At the end of it, you
  // regain expended Pact Magic spell slots but no more than a number equal
  // to half your maximum (round up). Once you use this feature, you can't do
  // so again until you finish a Long Rest." Warlock's slots are always a
  // single level, so there's exactly one nonzero entry in spellSlots to
  // refund against.
  function useMagicalCunning() {
    if (!sheet || play.usedMagicalCunning) return;
    const idx = sheet.pactSlots.findIndex((n) => n > 0);
    if (idx < 0) return;
    const regain = magicalCunningRegain(sheet.pactSlots[idx]);
    setPlay((prev) => {
      const next = [...prev.expendedPactSlots];
      next[idx] = Math.max(0, (next[idx] ?? 0) - regain);
      return { ...prev, expendedPactSlots: next, usedMagicalCunning: true };
    });
  }

  // Pact Magic slot expend/restore — its own pool, separate from the shared
  // spell slots' expendSpellSlot/restoreSpellSlot below.
  function expendPactSlot(levelIndex: number) {
    setPlay((prev) => {
      const next = [...prev.expendedPactSlots];
      next[levelIndex] = (next[levelIndex] ?? 0) + 1;
      return { ...prev, expendedPactSlots: next };
    });
  }
  function restorePactSlot(levelIndex: number) {
    setPlay((prev) => {
      const next = [...prev.expendedPactSlots];
      next[levelIndex] = Math.max(0, (next[levelIndex] ?? 0) - 1);
      return { ...prev, expendedPactSlots: next };
    });
  }

  function expendSorceryPoint() {
    setPlay((prev) => ({ ...prev, expendedSorceryPoints: prev.expendedSorceryPoints + 1 }));
  }

  function restoreSorceryPoint() {
    setPlay((prev) => ({
      ...prev,
      expendedSorceryPoints: Math.max(0, prev.expendedSorceryPoints - 1),
    }));
  }

  function expendBardicInspiration() {
    setPlay((prev) => ({
      ...prev,
      expendedBardicInspiration: prev.expendedBardicInspiration + 1,
    }));
  }

  function restoreBardicInspiration() {
    setPlay((prev) => ({
      ...prev,
      expendedBardicInspiration: Math.max(0, prev.expendedBardicInspiration - 1),
    }));
  }

  function expendChannelDivinity() {
    setPlay((prev) => ({ ...prev, expendedChannelDivinity: prev.expendedChannelDivinity + 1 }));
  }

  function restoreChannelDivinity() {
    setPlay((prev) => ({
      ...prev,
      expendedChannelDivinity: Math.max(0, prev.expendedChannelDivinity - 1),
    }));
  }

  function expendWildShape() {
    setPlay((prev) => ({ ...prev, expendedWildShape: prev.expendedWildShape + 1 }));
  }

  function restoreWildShape() {
    setPlay((prev) => ({ ...prev, expendedWildShape: Math.max(0, prev.expendedWildShape - 1) }));
  }

  // "As a Bonus Action, you can use it to regain Hit Points equal to 1d10
  // plus your Fighter level." Unlike Channel Divinity's "Roll Divine Spark"
  // button (which deliberately doesn't touch the charge counter, since
  // Channel Divinity has more than one effect to choose from per charge),
  // Second Wind has exactly one use for its charge — rolling, healing, and
  // expending happen together in one click.
  function useSecondWind() {
    if (!sheet || play.expendedSecondWind >= sheet.secondWindMax) return;
    const notation = `1d10${formatModifier(sheet.level)}`;
    const result = rollDice(notation);
    pushLog({
      label: "Second Wind",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
    setPlay((prev) => ({
      ...prev,
      expendedSecondWind: prev.expendedSecondWind + 1,
      currentHp: Math.min(maxHp, prev.currentHp + result.total),
    }));
  }

  function restoreSecondWind() {
    setPlay((prev) => ({ ...prev, expendedSecondWind: Math.max(0, prev.expendedSecondWind - 1) }));
  }

  function expendActionSurge() {
    setPlay((prev) => ({ ...prev, expendedActionSurge: prev.expendedActionSurge + 1 }));
  }

  function restoreActionSurge() {
    setPlay((prev) => ({ ...prev, expendedActionSurge: Math.max(0, prev.expendedActionSurge - 1) }));
  }

  function expendIndomitable() {
    setPlay((prev) => ({ ...prev, expendedIndomitable: prev.expendedIndomitable + 1 }));
  }

  function restoreIndomitable() {
    setPlay((prev) => ({ ...prev, expendedIndomitable: Math.max(0, prev.expendedIndomitable - 1) }));
  }

  // "You can enter it as a Bonus Action if you aren't wearing Heavy armor."
  // Expends a use AND marks Rage active in one click — the active flag then
  // drives the Rage Damage bonus auto-applied to Strength-based weapon
  // damage (see rageDamageBonusWhileRaging above). No turn/round tracking
  // exists in this app, so duration/extension isn't modeled — the player
  // ends Rage manually via the separate End Rage button below.
  function enterRage() {
    if (!sheet || play.expendedRage >= sheet.rageMax) return;
    setPlay((prev) => ({ ...prev, expendedRage: prev.expendedRage + 1, isRaging: true }));
  }

  function endRage() {
    setPlay((prev) => ({ ...prev, isRaging: false }));
  }

  function restoreRage() {
    setPlay((prev) => ({ ...prev, expendedRage: Math.max(0, prev.expendedRage - 1) }));
  }

  // "When you roll Initiative, you can regain all expended uses of Rage.
  // After you regain uses of Rage in this way, you can't do so again until
  // you finish a Long Rest." This app has no "roll Initiative" action to
  // hook the trigger onto (Initiative is a static stat chip, not a rollable
  // action), so it's modeled as a manually-triggered once-per-Long-Rest
  // button instead — same boolean-flag shape as Warlock's Magical Cunning.
  function usePersistentRage() {
    if (play.usedPersistentRage) return;
    setPlay((prev) => ({ ...prev, expendedRage: 0, usedPersistentRage: true }));
  }

  function rollBrutalStrike() {
    if (!sheet?.brutalStrikeDice) return;
    const notation = `${sheet.brutalStrikeDice}d10`;
    const result = rollDice(notation);
    pushLog({
      label: "Brutal Strike",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  function expendFocusPoint() {
    setPlay((prev) => ({ ...prev, expendedFocusPoints: prev.expendedFocusPoints + 1 }));
  }

  function restoreFocusPoint() {
    setPlay((prev) => ({
      ...prev,
      expendedFocusPoints: Math.max(0, prev.expendedFocusPoints - 1),
    }));
  }

  // "As a Bonus Action, you can roll your Martial Arts die. You regain a
  // number of Hit Points equal to the number rolled plus your Wisdom
  // modifier." Combines roll + heal + expend in one click, same reasoning as
  // Second Wind — exactly one use for its own separate pool.
  function useWholenessOfBody() {
    if (!sheet || play.expendedWholenessOfBody >= sheet.wholenessOfBodyMax) return;
    const notation = `1d${sheet.martialArtsDie}${formatModifier(sheet.modifiers.wis)}`;
    const result = rollDice(notation);
    pushLog({
      label: "Wholeness of Body",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
    setPlay((prev) => ({
      ...prev,
      expendedWholenessOfBody: prev.expendedWholenessOfBody + 1,
      currentHp: Math.min(maxHp, prev.currentHp + result.total),
    }));
  }

  function restoreWholenessOfBody() {
    setPlay((prev) => ({
      ...prev,
      expendedWholenessOfBody: Math.max(0, prev.expendedWholenessOfBody - 1),
    }));
  }

  // "When you roll Initiative, you can regain all expended Focus Points.
  // When you do so, roll your Martial Arts die, and regain a number of Hit
  // Points equal to your Monk level plus the number rolled. Once you use
  // this feature, you can't use it again until you finish a Long Rest."
  // Same "no roll-Initiative action exists in this app" gap as Barbarian's
  // Persistent Rage — modeled as a manually-triggered once-per-Long-Rest
  // button instead.
  function useUncannyMetabolism() {
    if (!sheet || play.usedUncannyMetabolism) return;
    const notation = `1d${sheet.martialArtsDie}`;
    const result = rollDice(notation);
    const healed = sheet.level + result.total;
    pushLog({
      label: "Uncanny Metabolism",
      detail: `${sheet.level} + ${notation} [${result.rolls.join(", ")}]`,
      total: healed,
    });
    setPlay((prev) => ({
      ...prev,
      expendedFocusPoints: 0,
      usedUncannyMetabolism: true,
      currentHp: Math.min(maxHp, prev.currentHp + healed),
    }));
  }

  // "When an attack roll hits you... reduce the attack's total damage
  // against you. The reduction equals 1d10 plus your Dexterity modifier and
  // Monk level." A convenience roll, same shape as Second Wind/Divine
  // Spark's roll buttons — the player applies the result manually against
  // the incoming damage via the existing Hurt input, since reactions/damage
  // sequencing aren't modeled here.
  function rollDeflectAttacks() {
    if (!sheet) return;
    const notation = `1d10${formatModifier(sheet.modifiers.dex + sheet.level)}`;
    const result = rollDice(notation);
    pushLog({
      label: "Deflect Attacks",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  // Quivering Palm (level 17+): "the target must make a Constitution saving
  // throw, taking 10d12 Force damage on a failed save or half as much
  // damage on a successful one." A flat, level-independent roll — doesn't
  // auto-expend the 4 Focus Points it costs to set up (a separate, much
  // earlier trigger this app doesn't sequence), same scope boundary as
  // Stunning Strike's cost being left to the generic Focus Points stepper.
  function rollQuiveringPalm() {
    const result = rollDice("10d12");
    pushLog({
      label: "Quivering Palm",
      detail: `10d12 [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  // Breath Weapon (Dragonborn): "replace one of your attacks with an
  // exhalation... Each creature... takes 1d10 [ancestry damage type]
  // damage... You can use this Breath Weapon a number of times equal to
  // your Proficiency Bonus." Rolls the damage dice (save DC shown in the
  // description text, since applying the save itself needs a target this
  // app doesn't track) and expends a use together, same single-action shape
  // as Second Wind.
  function rollBreathWeapon() {
    if (!sheet || play.expendedBreathWeapon >= sheet.breathWeaponMax) return;
    const notation = `${sheet.breathWeaponDice}d10`;
    const result = rollDice(notation);
    pushLog({
      label: `Breath Weapon (${sheet.breathWeaponDamageType ?? "?"})`,
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
    setPlay((prev) => ({ ...prev, expendedBreathWeapon: prev.expendedBreathWeapon + 1 }));
  }

  function restoreBreathWeapon() {
    setPlay((prev) => ({
      ...prev,
      expendedBreathWeapon: Math.max(0, prev.expendedBreathWeapon - 1),
    }));
  }

  // Draconic Flight (Dragonborn, level 5+) / Large Form (Goliath, level
  // 5+): both once-per-Long-Rest Bonus Action buffs with no roll involved
  // — a simple "mark used" toggle, same shape as Warlock's Magical Cunning
  // minus the resource refund.
  function useDraconicFlight() {
    if (play.usedDraconicFlight) return;
    setPlay((prev) => ({ ...prev, usedDraconicFlight: true }));
  }

  function useLargeForm() {
    if (play.usedLargeForm) return;
    setPlay((prev) => ({ ...prev, usedLargeForm: true }));
  }

  function useGiantAncestry() {
    if (!sheet || play.expendedGiantAncestry >= sheet.giantAncestryUsesMax) return;
    setPlay((prev) => ({ ...prev, expendedGiantAncestry: prev.expendedGiantAncestry + 1 }));
  }

  function restoreGiantAncestry() {
    setPlay((prev) => ({
      ...prev,
      expendedGiantAncestry: Math.max(0, prev.expendedGiantAncestry - 1),
    }));
  }

  // Stonecunning (Dwarf): "As a Bonus Action, you gain Tremorsense... You
  // can use this Bonus Action a number of times equal to your Proficiency
  // Bonus." No roll, just a stepper — Tremorsense itself isn't a numeric
  // effect this app tracks.
  function expendStonecunning() {
    setPlay((prev) => ({ ...prev, expendedStonecunning: prev.expendedStonecunning + 1 }));
  }

  function restoreStonecunning() {
    setPlay((prev) => ({
      ...prev,
      expendedStonecunning: Math.max(0, prev.expendedStonecunning - 1),
    }));
  }

  // Adrenaline Rush (Orc): "You can take the Dash action as a Bonus
  // Action. When you do so, you gain a number of Temporary Hit Points
  // equal to your Proficiency Bonus." The temp HP amount is flat and
  // deterministic (no roll needed) — grants it and expends a use together.
  function useAdrenalineRush() {
    if (!sheet || play.expendedAdrenalineRush >= sheet.adrenalineRushMax) return;
    setPlay((prev) => ({
      ...prev,
      expendedAdrenalineRush: prev.expendedAdrenalineRush + 1,
      tempHp: Math.max(prev.tempHp, sheet.proficiencyBonus),
    }));
  }

  function restoreAdrenalineRush() {
    setPlay((prev) => ({
      ...prev,
      expendedAdrenalineRush: Math.max(0, prev.expendedAdrenalineRush - 1),
    }));
  }

  // Healing Hands (Aasimar homebrew): "touch a creature and cause it to
  // regain Hit Points equal to your character level. Once you use this trait,
  // you can't use it again until you finish a Long Rest." Flat amount (no
  // roll in this homebrew version) — heals the character's own current HP and
  // expends the single use, same one-click shape as Second Wind/Wholeness.
  function useHealingHands() {
    if (!sheet || play.expendedHealingHands >= sheet.healingHandsMax) return;
    const amount = sheet.level;
    setPlay((prev) => ({
      ...prev,
      expendedHealingHands: prev.expendedHealingHands + 1,
      currentHp: Math.min(sheet.maxHpValue, prev.currentHp + amount),
    }));
    pushLog({ label: "Healing Hands", detail: `Heal ${amount} HP (touch)`, total: amount });
  }

  // Fury of the Small (Goblin homebrew): "extra damage equal to your character
  // level" against a larger creature, once per Short/Long Rest. Logs the flat
  // bonus damage and expends the use; the player adds it to their damage roll,
  // same as Sneak Attack's standalone roll button.
  function useFuryOfTheSmall() {
    if (!sheet || play.expendedFuryOfTheSmall >= sheet.furyOfTheSmallMax) return;
    setPlay((prev) => ({ ...prev, expendedFuryOfTheSmall: prev.expendedFuryOfTheSmall + 1 }));
    pushLog({
      label: "Fury of the Small",
      detail: `+${sheet.level} damage vs a larger creature — add to your damage roll`,
      total: sheet.level,
    });
  }

  // Shifting (Shifter homebrew): Bonus Action, Temp HP = level + CON mod,
  // +10 ft Speed for 1 minute, once per Short/Long Rest. Grants the temp HP
  // (Speed bump is informational) and expends the use.
  function useShifting() {
    if (!sheet || play.expendedShifting >= sheet.shiftingMax) return;
    const tempHp = Math.max(1, sheet.level + sheet.modifiers.con);
    setPlay((prev) => ({
      ...prev,
      expendedShifting: prev.expendedShifting + 1,
      tempHp: Math.max(prev.tempHp, tempHp),
    }));
    pushLog({ label: "Shifting", detail: `${tempHp} Temp HP, +10 ft Speed (1 min)`, total: tempHp });
  }

  // Innate Sorcery (Sorcerer): Bonus Action, Advantage on your spell attacks
  // for 1 minute, 2 uses/Long Rest. No roll — a stepper, same as Stonecunning.
  function useInnateSorcery() {
    if (!sheet || play.expendedInnateSorcery >= sheet.innateSorceryMax) return;
    setPlay((prev) => ({ ...prev, expendedInnateSorcery: prev.expendedInnateSorcery + 1 }));
  }

  function restoreInnateSorcery() {
    setPlay((prev) => ({
      ...prev,
      expendedInnateSorcery: Math.max(0, prev.expendedInnateSorcery - 1),
    }));
  }

  // Arcane Recovery (Wizard): once per day on a Short Rest, recover expended
  // spell slots totalling up to ceil(level/2) slot levels, none above 5th.
  // Recovers greedily from the highest eligible expended slot down — the
  // typical optimal play — and the player can fine-tune via the slot steppers
  // afterward. Marks the feature used until the next Long Rest.
  function useArcaneRecovery() {
    if (!sheet || play.usedArcaneRecovery) return;
    let budget = sheet.arcaneRecoveryMax;
    setPlay((prev) => {
      const next = [...prev.expendedSlots];
      // Slot levels 5..1 (indexes 4..0) — never 6th+ per the rule.
      for (let i = 4; i >= 0 && budget > 0; i--) {
        const slotLevel = i + 1;
        while ((next[i] ?? 0) > 0 && budget >= slotLevel) {
          next[i] -= 1;
          budget -= slotLevel;
        }
      }
      return { ...prev, expendedSlots: next, usedArcaneRecovery: true };
    });
    pushLog({
      label: "Arcane Recovery",
      detail: `Recover up to ${sheet.arcaneRecoveryMax} slot levels (none above 5th)`,
      total: sheet.arcaneRecoveryMax,
    });
  }

  function rollDivineSpark() {
    if (!sheet?.divineSparkDice) return;
    const notation = `${sheet.divineSparkDice}d8${formatModifier(sheet.modifiers.wis)}`;
    const result = rollDice(notation);
    pushLog({
      label: "Divine Spark",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  function expendSpellSlot(levelIndex: number) {
    setPlay((prev) => {
      const next = [...prev.expendedSlots];
      next[levelIndex] = (next[levelIndex] ?? 0) + 1;
      return { ...prev, expendedSlots: next };
    });
  }

  function restoreSpellSlot(levelIndex: number) {
    setPlay((prev) => {
      const next = [...prev.expendedSlots];
      next[levelIndex] = Math.max(0, (next[levelIndex] ?? 0) - 1);
      return { ...prev, expendedSlots: next };
    });
  }

  function spendHitDie(die: number) {
    const pool = sheet!.hitDicePool.find((h) => h.die === die);
    const used = play.hitDiceUsedByDie[String(die)] ?? 0;
    if (!pool || used >= pool.count) return;
    const roll = rollFlatDie(die);
    const healed = Math.max(1, roll + sheet!.modifiers.con);
    pushLog({
      label: "Hit Die",
      detail: `d${die} ${roll} ${formatModifier(sheet!.modifiers.con)}`,
      total: healed,
    });
    setPlay((prev) => ({
      ...prev,
      hitDiceUsedByDie: {
        ...prev.hitDiceUsedByDie,
        [String(die)]: (prev.hitDiceUsedByDie[String(die)] ?? 0) + 1,
      },
      currentHp: Math.min(maxHp, prev.currentHp + healed),
    }));
  }

  // Long Rest recovers half your total Hit Dice (rounded up, min 1), taken
  // greedily from whichever die sizes have been spent.
  function recoverHitDice(usedByDie: Record<string, number>, budget: number): Record<string, number> {
    const next = { ...usedByDie };
    for (const key of Object.keys(next)) {
      if (budget <= 0) break;
      const restore = Math.min(next[key], budget);
      next[key] -= restore;
      budget -= restore;
    }
    return next;
  }

  async function handleLevelUp(mode: "roll" | "average", chosenClass?: string) {
    if (!sheet || sheet.level >= MAX_LEVEL) return;
    // Which class the new level goes into (defaults to the primary class). The
    // HP roll uses THAT class's hit die.
    const targetClass = chosenClass ?? sheet.classIndex;
    const hitDie = classes.find((c) => c.index === targetClass)?.hitDie ?? sheet.hitDie;
    setLevelUpPending(true);
    setLevelUpError(null);

    const dieResult = mode === "roll" ? rollFlatDie(hitDie) : fixedAverageHpGain(hitDie);
    const gain = hpGainForLevelUp(hitDie, sheet.modifiers.con, dieResult);

    const result = await levelUpCharacter(characterId, gain, targetClass);
    if (result.success && result.draft) {
      const targetName = classes.find((c) => c.index === targetClass)?.name ?? targetClass;
      pushLog({
        label: `Level Up → ${result.draft.level} (${targetName})`,
        detail:
          mode === "roll"
            ? `d${hitDie} ${dieResult} ${formatModifier(sheet.modifiers.con)}`
            : `avg d${hitDie} (${dieResult}) ${formatModifier(sheet.modifiers.con)}`,
        total: gain,
      });
      setCurrentDraft(result.draft);
      setPlay((prev) => ({ ...prev, currentHp: prev.currentHp + gain }));
      setLevelingUp(false);
      setLevelUpClass(null);
      setAddingClass(false);
    } else {
      setLevelUpError(result.error ?? "Couldn't level up.");
    }
    setLevelUpPending(false);
  }

  // Safety net for an accidental Level Up click. Mirrors handleLevelUp's
  // currentHp adjustment in reverse (subtracts the HP roll being undone,
  // floored at 0 the same way applyDamage already floors incoming damage)
  // — the action itself handles trimming back any choices (subclass/feats/
  // expertise/fighting style/metamagic/cantrips) that are no longer valid
  // at the lower level.
  async function handleLevelDown() {
    if (!sheet || sheet.level <= 1) return;
    setLevelDownPending(true);
    setLevelDownError(null);

    const lastGain = currentDraft.hpRolls[currentDraft.hpRolls.length - 1] ?? 0;
    const result = await levelDownCharacter(characterId);
    if (result.success && result.draft) {
      pushLog({
        label: `Level Down → ${result.draft.level}`,
        detail: "Undid last level's HP and choices",
        total: -lastGain,
      });
      setCurrentDraft(result.draft);
      setPlay((prev) => ({ ...prev, currentHp: Math.max(0, prev.currentHp - lastGain) }));
      setLevelingDown(false);
    } else {
      setLevelDownError(result.error ?? "Couldn't level down.");
    }
    setLevelDownPending(false);
  }

  async function handleSetLevelingMode(mode: "milestone" | "xp") {
    setLevelingPending(true);
    const result = await setLevelingProgress(characterId, { levelingMode: mode });
    if (result.success && result.draft) setCurrentDraft(result.draft);
    setLevelingPending(false);
  }

  async function handleAddXp(delta: number) {
    if (!sheet) return;
    const next = Math.max(0, currentDraft.xp + delta);
    setLevelingPending(true);
    const result = await setLevelingProgress(characterId, { xp: next });
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      pushLog({ label: delta >= 0 ? "Gained XP" : "Adjusted XP", detail: `${currentDraft.xp} → ${next} XP`, total: delta });
      setXpInput("");
    }
    setLevelingPending(false);
  }

  async function handleChooseSubclass(subclassIndex: string, classIndex: string) {
    setSubclassPending(true);
    setChoiceError(null);
    const result = await chooseSubclass(characterId, subclassIndex, classIndex);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setSelectedSubclassIndex(null);
    } else {
      setChoiceError(result.error ?? "Couldn't choose subclass.");
    }
    setSubclassPending(false);
  }

  async function handleChooseOrder(choiceKey: string) {
    setOrderPending(true);
    setChoiceError(null);
    const result = await chooseOriginOrder(characterId, choiceKey);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
    } else {
      setChoiceError(result.error ?? "Couldn't save choice.");
    }
    setOrderPending(false);
  }

  async function handleChooseGiantAncestry(choiceKey: string) {
    setAncestryPending(true);
    setChoiceError(null);
    const result = await chooseGiantAncestry(characterId, choiceKey);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
    } else {
      setChoiceError(result.error ?? "Couldn't save choice.");
    }
    setAncestryPending(false);
  }

  function openFeatPicker(classIndex: string, level: number) {
    setFeatPicker({ classIndex, level });
    setSelectedFeatIndex(null);
    setAsiBonus(null);
    setChoiceError(null);
  }

  function cancelFeatPicker() {
    setFeatPicker(null);
    setSelectedFeatIndex(null);
    setAsiBonus(null);
    setChoiceError(null);
  }

  function availableAbilities(exclude: AbilityKey[] = []): AbilityKey[] {
    return ABILITY_ORDER.filter(
      (a) => (sheet!.finalScores[a] ?? 0) < 20 && !exclude.includes(a),
    );
  }

  function selectFeatOption(featIndex: string) {
    setSelectedFeatIndex(featIndex);
    if (featIndex === "ability-score-improvement") {
      const first = availableAbilities()[0];
      setAsiBonus(first ? { mode: "two", plusTwo: first, plusOne: [] } : null);
    } else {
      setAsiBonus(null);
    }
  }

  function setAsiSplitMode(mode: "plus-two" | "plus-one-each") {
    if (mode === "plus-two") {
      const first = availableAbilities()[0];
      setAsiBonus(first ? { mode: "two", plusTwo: first, plusOne: [] } : null);
    } else {
      const [a, b] = availableAbilities();
      setAsiBonus(a && b ? { mode: "two", plusTwo: undefined, plusOne: [a, b] } : null);
    }
  }

  function setAsiPlusTwoAbility(ability: AbilityKey) {
    setAsiBonus({ mode: "two", plusTwo: ability, plusOne: [] });
  }

  function setAsiPlusOneAt(slot: 0 | 1, ability: AbilityKey) {
    setAsiBonus((prev) => {
      if (!prev || prev.plusTwo) return prev;
      const next = [...prev.plusOne];
      next[slot] = ability;
      return { mode: "two", plusTwo: undefined, plusOne: next };
    });
  }

  async function confirmFeatChoice() {
    if (!featPicker || !selectedFeatIndex) return;
    setFeatPending(true);
    setChoiceError(null);
    const result = await chooseFeat(
      characterId,
      featPicker.level,
      selectedFeatIndex,
      asiBonus,
      featPicker.classIndex,
    );
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      cancelFeatPicker();
    } else {
      setChoiceError(result.error ?? "Couldn't choose feat.");
    }
    setFeatPending(false);
  }

  function openExpertisePicker(classIndex: string, level: number) {
    setExpertisePicker({ classIndex, level });
    setSelectedExpertiseSkills([]);
    setChoiceError(null);
  }

  function cancelExpertisePicker() {
    setExpertisePicker(null);
    setSelectedExpertiseSkills([]);
    setChoiceError(null);
  }

  function toggleExpertiseSkill(skillIndex: string, count: number) {
    setSelectedExpertiseSkills((prev) => {
      if (prev.includes(skillIndex)) return prev.filter((s) => s !== skillIndex);
      if (prev.length >= count) return prev;
      return [...prev, skillIndex];
    });
  }

  function openMcSkillPicker(classIndex: string) {
    setMcSkillPicker(classIndex);
    setSelectedMcSkills([]);
    setChoiceError(null);
  }
  function toggleMcSkill(skillIndex: string, count: number) {
    setSelectedMcSkills((prev) => {
      if (prev.includes(skillIndex)) return prev.filter((s) => s !== skillIndex);
      if (prev.length >= count) return prev;
      return [...prev, skillIndex];
    });
  }
  async function confirmMcSkills() {
    if (!mcSkillPicker) return;
    setMcSkillPending(true);
    setChoiceError(null);
    const result = await setMulticlassSkills(characterId, mcSkillPicker, selectedMcSkills);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setMcSkillPicker(null);
      setSelectedMcSkills([]);
    } else {
      setChoiceError(result.error ?? "Couldn't save skills.");
    }
    setMcSkillPending(false);
  }

  async function confirmExpertise() {
    if (!expertisePicker) return;
    setExpertisePending(true);
    setChoiceError(null);
    const result = await chooseExpertise(
      characterId,
      expertisePicker.level,
      selectedExpertiseSkills,
      expertisePicker.classIndex,
    );
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      cancelExpertisePicker();
    } else {
      setChoiceError(result.error ?? "Couldn't choose Expertise.");
    }
    setExpertisePending(false);
  }

  function rollSneakAttack() {
    if (!sheet?.sneakAttackDice) return;
    const notation = `${sheet.sneakAttackDice}d6`;
    const result = rollDice(notation);
    pushLog({
      label: "Sneak Attack",
      detail: `${notation} [${result.rolls.join(", ")}]`,
      total: result.total,
    });
  }

  function openCantripPicker() {
    setSelectedCantrips(currentKnownCantrips);
    setCantripPickerOpen(true);
    setChoiceError(null);
  }

  function toggleCantripSelection(index: string, limit: number) {
    setSelectedCantrips((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= limit) return prev;
      return [...prev, index];
    });
  }

  async function saveCantrips() {
    setSpellsPending(true);
    setChoiceError(null);
    const result = await setKnownCantrips(characterId, selectedCantrips, spellClass);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setCantripPickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save cantrips.");
    }
    setSpellsPending(false);
  }

  function openPreparedPicker() {
    setSelectedPrepared(currentPreparedSpells);
    setPreparedPickerOpen(true);
    setChoiceError(null);
  }

  function togglePreparedSelection(index: string, limit: number) {
    setSelectedPrepared((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= limit) return prev;
      return [...prev, index];
    });
  }

  async function savePrepared() {
    setSpellsPending(true);
    setChoiceError(null);
    const result = await setPreparedSpells(characterId, selectedPrepared, spellClass);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setPreparedPickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save prepared spells.");
    }
    setSpellsPending(false);
  }

  function openMetamagicPicker() {
    setSelectedMetamagic(currentDraft.metamagicChoices);
    setMetamagicPickerOpen(true);
    setChoiceError(null);
  }

  function toggleMetamagicSelection(key: string, limit: number) {
    setSelectedMetamagic((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= limit) return prev;
      return [...prev, key];
    });
  }

  async function saveMetamagic() {
    setMetamagicPending(true);
    setChoiceError(null);
    const result = await setMetamagicChoices(characterId, selectedMetamagic);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setMetamagicPickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save Metamagic options.");
    }
    setMetamagicPending(false);
  }

  function openFightingStylePicker() {
    setSelectedFightingStyle(currentDraft.fightingStyleChoices);
    setFightingStylePickerOpen(true);
    setChoiceError(null);
  }

  function toggleFightingStyleSelection(index: string, limit: number) {
    setSelectedFightingStyle((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= limit) return prev;
      return [...prev, index];
    });
  }

  async function saveFightingStyle() {
    setFightingStylePending(true);
    setChoiceError(null);
    const result = await setFightingStyleChoices(characterId, selectedFightingStyle);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setFightingStylePickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save Fighting Style.");
    }
    setFightingStylePending(false);
  }

  function openWeaponMasteryPicker() {
    setSelectedWeaponMastery(currentDraft.weaponMasteryChoices);
    setWeaponMasteryPickerOpen(true);
    setChoiceError(null);
  }

  function toggleWeaponMasterySelection(index: string, limit: number) {
    setSelectedWeaponMastery((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= limit) return prev;
      return [...prev, index];
    });
  }

  async function saveWeaponMastery() {
    setWeaponMasteryPending(true);
    setChoiceError(null);
    const result = await setWeaponMasteryChoices(characterId, selectedWeaponMastery);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setWeaponMasteryPickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save Weapon Mastery.");
    }
    setWeaponMasteryPending(false);
  }

  // Combined picker for the two "choose extra skill proficiencies" sources:
  // Human's Skillful (one skill) and the Skilled feat (3 per time taken).
  // Both persist to their own draft field but share one panel since they're
  // the same kind of choice and a Human who also took Skilled sets both here.
  function openBonusSkillPicker() {
    setSelectedHumanSkill(currentDraft.humanSkillChoice);
    setSelectedSkilled(currentDraft.skilledChoices);
    setBonusSkillPickerOpen(true);
    setChoiceError(null);
  }

  function toggleSkilledSelection(index: string, limit: number) {
    setSelectedSkilled((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= limit) return prev;
      return [...prev, index];
    });
  }

  async function saveBonusSkills(needsHuman: boolean, skilledCount: number) {
    setBonusSkillPending(true);
    setChoiceError(null);
    let ok = true;
    if (needsHuman) {
      const r = await setHumanSkillChoice(characterId, selectedHumanSkill);
      if (r.success && r.draft) setCurrentDraft(r.draft);
      else {
        ok = false;
        setChoiceError(r.error ?? "Couldn't save skill choice.");
      }
    }
    if (ok && skilledCount > 0) {
      const r = await setSkilledChoices(characterId, selectedSkilled);
      if (r.success && r.draft) setCurrentDraft(r.draft);
      else {
        ok = false;
        setChoiceError(r.error ?? "Couldn't save Skilled choices.");
      }
    }
    if (ok) setBonusSkillPickerOpen(false);
    setBonusSkillPending(false);
  }

  function toggleFeature(index: string) {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rollDeathSave() {
    const roll = rollFlatDie(20);
    pushLog({
      label: "Death Save",
      detail: `d20 ${roll}`,
      total: roll,
      isNat20: roll === 20,
      isNat1: roll === 1,
    });
    if (roll === 20) {
      setPlay((prev) => ({ ...prev, currentHp: 1, deathSaveSuccesses: 0, deathSaveFailures: 0 }));
      return;
    }
    setPlay((prev) => {
      if (roll === 1) {
        return { ...prev, deathSaveFailures: Math.min(3, prev.deathSaveFailures + 2) };
      }
      if (roll >= 10) {
        return { ...prev, deathSaveSuccesses: Math.min(3, prev.deathSaveSuccesses + 1) };
      }
      return { ...prev, deathSaveFailures: Math.min(3, prev.deathSaveFailures + 1) };
    });
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-8 pb-40 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/characters"
          className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
        >
          &larr; My Characters
        </Link>

        <div className="mt-2 flex flex-wrap items-start gap-4">
          <CharacterAvatar
            characterId={characterId}
            initialAvatarUrl={avatarUrl}
            name={sheet.name || "Unnamed"}
            isOwner={isOwner}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-heading text-3xl font-bold text-tavern-gold">
                  {sheet.name || "Unnamed"}
                </h1>
                <p className="font-heading text-base font-bold tracking-wide text-tavern-gold-light">
                  {classSubtitle}
                </p>
                <p className="text-tavern-muted">
                  Level {sheet.level} {sheet.subspeciesName ?? sheet.speciesName}
                  {sheet.speciesIsHomebrew ? " (Homebrew)" : ""} — {sheet.backgroundName}
                  {sheet.backgroundIsHomebrew ? " (Homebrew)" : ""}
                </p>
                {chosenOrder && (
                  <p className="text-xs text-tavern-muted">
                    {sheet.className} Order: {chosenOrder.name}
                  </p>
                )}
              </div>
              {isOwner && (
                <div className="flex flex-col items-end gap-2">
                  <ShareControl characterId={characterId} initialIsPublic={isPublic} />
                  <button
                    onClick={() =>
                      downloadCharacterExport(
                        buildCharacterExport({
                          name: currentDraft.name,
                          draft: currentDraft,
                          bio,
                          notes,
                          personality,
                          inventory,
                          currency,
                          magicItems,
                        }),
                      )
                    }
                    className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                    title="Download this character as a .json file you can back up or import elsewhere"
                  >
                    Export JSON
                  </button>
                  <a
                    href={`/characters/${characterId}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                    title="Open a print-friendly sheet you can save as a PDF"
                  >
                    Print / PDF
                  </a>
                  <DeleteCharacterButton
                    characterId={characterId}
                    characterName={sheet.name || "Unnamed"}
                  />
                </div>
              )}
            </div>
            <CharacterBio characterId={characterId} initialBio={bio} isOwner={isOwner} />
          </div>
        </div>

        {!isOwner && (
          <p className="mt-2 text-xs text-tavern-muted">
            You&apos;re viewing someone else&apos;s character. Rolls and HP changes here are
            local to your browser only — they don&apos;t affect the owner&apos;s copy.
          </p>
        )}

        {/* DM-pushed effects: prompts from the party leader's DM screen,
            kept live via Realtime inside the panel. Owner-only — the page
            never fetches effects for anyone else. */}
        {isOwner && (
          <DmEffectsPanel
            characterId={characterId}
            initialEffects={dmEffects}
            onApplyRest={(rest) => (rest === "long" ? longRest() : shortRest())}
            onTrackCondition={(conditionIndex) =>
              setPlay((p) =>
                p.conditions.includes(conditionIndex)
                  ? p
                  : { ...p, conditions: [...p.conditions, conditionIndex] },
              )
            }
          />
        )}

        <SectionNav
          sections={[
            { id: "stats", label: "Stats" },
            { id: "hp", label: "HP & Resources" },
            { id: "status", label: "Status" },
            { id: "abilities", label: "Abilities" },
            { id: "skills", label: "Skills" },
            ...(sheet.fightingStyleKnownMax > 0
              ? [{ id: "fighting-style", label: "Fighting Style" }]
              : []),
            ...(weaponMasteryMax > 0 ? [{ id: "weapon-mastery", label: "Weapon Mastery" }] : []),
            ...(sheet.spellcastingAbility || sheet.lineageSpells.length > 0 || sheet.lineageCantripTrait !== null || sheet.speciesCantrip ? [{ id: "spells", label: "Spells" }] : []),
            ...(speciesTraits.length > 0 ? [{ id: "species-traits", label: "Species Traits" }] : []),
            ...(unlockedFeatures.length > 0 ? [{ id: "features", label: "Features" }] : []),
            ...(weapons.length > 0 || clsLvl("paladin") > 0 ? [{ id: "attacks", label: "Attacks" }] : []),
            { id: "equipment", label: "Equipment" },
            ...(personality || isOwner ? [{ id: "personality", label: "Personality" }] : []),
            { id: "notes", label: "Notes" },
          ]}
        />

        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              if (allSectionsCollapsed) {
                setCollapsedSections(new Set());
              } else {
                setCollapsedSections(new Set(collapsibleSectionIds));
              }
            }}
            className="text-xs text-tavern-muted hover:text-tavern-gold-light"
          >
            {allSectionsCollapsed ? "Expand All" : "Collapse All"}
          </button>
        </div>

        {isOwner && (
          <div className="mt-4">
            {/* Leveling mode toggle */}
            <div className="mb-2 flex items-center gap-1 text-xs">
              <span className="text-tavern-muted">Leveling:</span>
              {(["milestone", "xp"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleSetLevelingMode(m)}
                  disabled={levelingPending}
                  className={`rounded-md border px-2 py-0.5 font-bold uppercase tracking-wide ${
                    currentDraft.levelingMode === m
                      ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                      : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                  }`}
                >
                  {m === "milestone" ? "Milestone" : "XP"}
                </button>
              ))}
            </div>

            {/* XP bar (XP mode only) */}
            {xpMode && (
              <div className="mb-3 rounded-md border border-tavern-border p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-heading font-bold text-tavern-gold-light">
                    {currentDraft.xp.toLocaleString()} XP
                  </span>
                  <span className="text-tavern-muted">
                    {nextLevelXp !== null
                      ? `${nextLevelXp.toLocaleString()} to reach level ${sheet.level + 1}`
                      : "Max level"}
                  </span>
                </div>
                {nextLevelXp !== null && (
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-tavern-bg">
                    <div className="h-full bg-tavern-gold" style={{ width: `${xpPct}%` }} />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={xpInput}
                    onChange={(e) => setXpInput(e.target.value)}
                    placeholder="Amount"
                    className="w-24 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
                  />
                  <button
                    onClick={() => { const n = parseInt(xpInput, 10); if (!isNaN(n)) handleAddXp(n); }}
                    disabled={levelingPending || !xpInput}
                    className="rounded-md bg-tavern-oxblood px-3 py-1 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-40"
                  >
                    Add XP
                  </button>
                  <button
                    onClick={() => { const n = parseInt(xpInput, 10); if (!isNaN(n)) handleAddXp(-n); }}
                    disabled={levelingPending || !xpInput}
                    className="rounded-md border border-tavern-border px-3 py-1 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-40"
                  >
                    Subtract
                  </button>
                </div>
              </div>
            )}

            {sheet.level >= MAX_LEVEL ? (
              <p className="text-xs tracking-wide text-tavern-muted uppercase">
                Maximum level reached
              </p>
            ) : !levelingUp ? (
              <button
                onClick={() => setLevelingUp(true)}
                disabled={!hasEnoughXp}
                title={!hasEnoughXp && nextLevelXp !== null ? `Need ${(nextLevelXp - currentDraft.xp).toLocaleString()} more XP` : undefined}
                className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hasEnoughXp
                  ? `Level Up to ${sheet.level + 1}`
                  : `Need ${nextLevelXp !== null ? (nextLevelXp - currentDraft.xp).toLocaleString() : ""} more XP`}
              </button>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-tavern-gold/40 bg-tavern-card p-3">
                {/* Which class does this level go into? */}
                <div>
                  <div className="text-xs text-tavern-muted">Level {sheet.level + 1} goes into:</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sheet.classes.map((c) => {
                      const active = levelUpTarget === c.classIndex && !addingClass;
                      return (
                        <button
                          key={c.classIndex}
                          onClick={() => {
                            setLevelUpClass(c.classIndex);
                            setAddingClass(false);
                          }}
                          disabled={levelUpPending}
                          className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
                            active
                              ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                          } disabled:opacity-50`}
                        >
                          {c.className} {c.level}
                        </button>
                      );
                    })}
                    {addableClasses.length > 0 && (
                      <button
                        onClick={() => {
                          setAddingClass((v) => !v);
                          setLevelUpClass(null);
                        }}
                        disabled={levelUpPending}
                        className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
                          addingClass
                            ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                            : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                        } disabled:opacity-50`}
                      >
                        + New class…
                      </button>
                    )}
                  </div>
                  {addingClass && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {addableClasses.map((c) => (
                        <button
                          key={c.index}
                          onClick={() => setLevelUpClass(c.index)}
                          disabled={levelUpPending || !c.meets}
                          title={c.meets ? undefined : `Requires ${c.prereq}`}
                          className={`rounded-md border px-2 py-1.5 text-left text-xs ${
                            levelUpClass === c.index
                              ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                              : "border-tavern-border text-tavern-text hover:border-tavern-gold-light"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <div className="font-bold">{c.name}</div>
                          <div className="text-[10px] text-tavern-muted">
                            {c.meets ? c.prereq : `Needs ${c.prereq}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {addingClass && (
                    <p className="mt-1.5 text-[10px] text-tavern-muted">
                      Multiclassing grants a subset of the new class&apos;s proficiencies (see the
                      Player&apos;s Handbook). Saving throws and starting equipment come only from
                      your first class.
                    </p>
                  )}
                </div>

                {/* HP for the chosen class's die. */}
                {(!addingClass || levelUpClass) && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-tavern-border pt-3">
                    <span className="text-xs text-tavern-muted">
                      Hit points (d{levelUpHitDie}
                      {formatModifier(sheet.modifiers.con)}):
                    </span>
                    <button
                      onClick={() => handleLevelUp("roll", levelUpTarget)}
                      disabled={levelUpPending}
                      className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                    >
                      Roll d{levelUpHitDie}
                    </button>
                    <button
                      onClick={() => handleLevelUp("average", levelUpTarget)}
                      disabled={levelUpPending}
                      className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:opacity-50"
                    >
                      Take Average ({fixedAverageHpGain(levelUpHitDie)})
                    </button>
                    <button
                      onClick={() => {
                        setLevelingUp(false);
                        setLevelUpError(null);
                        setLevelUpClass(null);
                        setAddingClass(false);
                      }}
                      disabled={levelUpPending}
                      className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {levelUpError && (
              <p className="mt-1 text-xs text-tavern-oxblood-light">{levelUpError}</p>
            )}

            {!levelingUp && sheet.level > 1 && !levelingDown && (
              <button
                onClick={() => setLevelingDown(true)}
                className="mt-2 block text-xs text-tavern-muted hover:text-tavern-oxblood-light"
              >
                Accidentally leveled up? Level Down
              </button>
            )}
            {levelingDown && (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-tavern-oxblood bg-tavern-oxblood/10 px-3 py-2">
                <span className="text-xs text-tavern-text">
                  Level down to {sheet.level - 1}? This undoes the HP gained at level{" "}
                  {sheet.level} and any choices made at that level (subclass, feats, expertise,
                  fighting style, metamagic, cantrips).
                </span>
                <button
                  onClick={handleLevelDown}
                  disabled={levelDownPending}
                  className="rounded-md bg-tavern-oxblood px-3 py-1 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                >
                  {levelDownPending ? "Leveling Down…" : "Confirm Level Down"}
                </button>
                <button
                  onClick={() => {
                    setLevelingDown(false);
                    setLevelDownError(null);
                  }}
                  disabled={levelDownPending}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
            {levelDownError && (
              <p className="mt-1 text-xs text-tavern-oxblood-light">{levelDownError}</p>
            )}
          </div>
        )}

        {isOwner && needsOrderChoice && orderOptions && (
          <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
            <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
              Choose your {sheet.className} Order
            </p>
            <div className="mt-2 space-y-2">
              {orderOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleChooseOrder(opt.key)}
                  disabled={orderPending}
                  className="block w-full rounded-md border border-tavern-border p-3 text-left hover:border-tavern-gold-light disabled:opacity-50"
                >
                  <span className="font-heading font-bold text-tavern-text">{opt.name}</span>
                  <p className="mt-1 text-xs text-tavern-muted">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {isOwner && needsGiantAncestryChoice && (
          <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
            <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
              Choose your Giant Ancestry
            </p>
            <p className="mt-1 text-xs text-tavern-muted">
              Pick one benefit you can invoke as a Bonus Action ({sheet.proficiencyBonus}× per Long Rest).
            </p>
            <div className="mt-2 space-y-2">
              {GIANT_ANCESTRY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleChooseGiantAncestry(opt.key)}
                  disabled={ancestryPending}
                  className="block w-full rounded-md border border-tavern-border p-3 text-left hover:border-tavern-gold-light disabled:opacity-50"
                >
                  <span className="font-heading font-bold text-tavern-text">{opt.name}</span>
                  <p className="mt-1 text-xs text-tavern-muted">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {isOwner &&
          classesNeedingSubclass.map((needCls) => {
            const opts = subclassOptionsByClass[needCls.classIndex] ?? [];
            return (
          <div key={needCls.classIndex} className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
            <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
              Choose your {needCls.className} subclass
            </p>
            {opts.length === 1 && (
              <p className="mt-1 text-xs text-tavern-muted">
                Only one subclass is in the free SRD right now — more options are coming later.
              </p>
            )}
            <div className="mt-2 space-y-2">
              {opts.map((opt) => {
                const isSelected = selectedSubclassIndex === opt.index;
                return (
                  <div
                    key={opt.index}
                    className={`rounded-md border ${isSelected ? "border-tavern-gold" : "border-tavern-border"}`}
                  >
                    <button
                      onClick={() => setSelectedSubclassIndex(opt.index)}
                      className="block w-full p-3 text-left hover:bg-tavern-bg"
                    >
                      <span className="font-heading font-bold text-tavern-text">{opt.name}</span>
                      {opt.isHomebrew && (
                        <span className="ml-2 inline-block rounded-full border border-tavern-gold-light/40 px-2 py-0.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                          Homebrew
                        </span>
                      )}
                      {opt.summary && <p className="mt-1 text-xs text-tavern-muted">{opt.summary}</p>}
                    </button>
                    {isSelected && (
                      <div className="space-y-1 border-t border-tavern-border p-2">
                        {opt.isHomebrew && (
                          <p className="px-1 pb-1 text-xs text-tavern-muted">
                            <span className="text-tavern-gold-light">Homebrew subclass</span> —
                            original content written for Tavern, not part of the official SRD.
                          </p>
                        )}
                        <p className="px-1 pb-1 text-[10px] tracking-wider text-tavern-muted uppercase">
                          What you&apos;ll gain
                        </p>
                        {opt.features.map((f) => {
                          const key = `picker-${opt.index}-${f.name}`;
                          const expanded = expandedFeatures.has(key);
                          return (
                            <div key={key} className="rounded-md border border-tavern-border">
                              <button
                                onClick={() => toggleFeature(key)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                              >
                                <span className="text-tavern-text">{f.name}</span>
                                <span className="text-xs tracking-wide text-tavern-muted uppercase">
                                  Lvl {f.level}
                                </span>
                              </button>
                              {expanded && (
                                <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                                  {f.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedSubclassIndex && opts.some((o) => o.index === selectedSubclassIndex) && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => handleChooseSubclass(selectedSubclassIndex, needCls.classIndex)}
                  disabled={subclassPending}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                >
                  Confirm {opts.find((o) => o.index === selectedSubclassIndex)?.name}
                </button>
                <button
                  onClick={() => setSelectedSubclassIndex(null)}
                  disabled={subclassPending}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
            );
          })}

        {isOwner &&
          pendingMulticlassSkills.map((c) => {
            const count = MULTICLASS_SKILL_GRANTS[c.classIndex] ?? 0;
            const isOpen = mcSkillPicker === c.classIndex;
            return (
              <div key={`mcskill-${c.classIndex}`} className="mt-4">
                {!isOpen ? (
                  <button
                    onClick={() => openMcSkillPicker(c.classIndex)}
                    className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
                  >
                    Choose {c.className} Multiclass Skill ({count})
                  </button>
                ) : (
                  <div className="rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
                    <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
                      {c.className} grants {count} skill proficiency
                    </p>
                    <p className="mt-1 text-xs text-tavern-muted">
                      Multiclassing into {c.className} grants a skill of your choice. (It also grants
                      some armor/weapon{c.classIndex === "rogue" ? "/tool" : ""} proficiencies, which
                      this sheet doesn&apos;t track mechanically.)
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {mcSkillEligible.map((s) => (
                        <button
                          key={s.index}
                          onClick={() => toggleMcSkill(s.index, count)}
                          className={`rounded-md border p-2 text-left text-sm transition-colors ${
                            selectedMcSkills.includes(s.index)
                              ? "border-tavern-gold bg-tavern-bg text-tavern-text"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={confirmMcSkills}
                        disabled={mcSkillPending || selectedMcSkills.length !== count}
                        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => {
                          setMcSkillPicker(null);
                          setSelectedMcSkills([]);
                        }}
                        disabled={mcSkillPending}
                        className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        {isOwner &&
          pendingAsi.map((p) => {
            const lvl = p.level;
            const isOpen = featPicker?.classIndex === p.classIndex && featPicker?.level === p.level;
            const classLabel = sheet.classes.length > 1 ? `${p.className} ` : "";
            return (
            <div key={`${p.classIndex}-${p.level}`} className="mt-4">
              {!isOpen ? (
                <button
                  onClick={() => openFeatPicker(p.classIndex, p.level)}
                  className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
                >
                  Choose a Feat ({classLabel}Level {lvl})
                </button>
              ) : (
                <div className="rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
                  <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
                    Choose a Feat — {classLabel}Level {lvl}
                  </p>
                  {lvl >= 19 && (
                    <p className="mt-1 text-xs text-tavern-muted">
                      At level 19 you may take an Epic Boon (listed at the end) instead of an
                      ordinary feat or Ability Score Improvement.
                    </p>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[...generalFeats, ...(lvl >= 19 ? epicBoonFeats : [])]
                      .filter(
                        (f) => f.index === "ability-score-improvement" || !takenFeatIndexes.has(f.index),
                      )
                      .map((f) => (
                        <button
                          key={f.index}
                          onClick={() => selectFeatOption(f.index)}
                          className={`rounded-md border p-3 text-left text-sm transition-colors ${
                            selectedFeatIndex === f.index
                              ? "border-tavern-gold bg-tavern-bg"
                              : "border-tavern-border hover:border-tavern-gold-light"
                          }`}
                        >
                          <span className="font-heading font-bold text-tavern-text">{f.name}</span>
                          {f.isHomebrew && (
                            <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                              Homebrew
                            </span>
                          )}
                          {f.description && (
                            <p className="mt-1 text-xs text-tavern-muted">{f.description}</p>
                          )}
                        </button>
                      ))}
                  </div>

                  {selectedFeatIndex === "ability-score-improvement" && asiBonus && (
                    <div className="mt-4 rounded-md border border-tavern-border bg-tavern-bg p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setAsiSplitMode("plus-two")}
                          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                            asiBonus.plusTwo
                              ? "border-tavern-gold text-tavern-text"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                          }`}
                        >
                          +2 to one
                        </button>
                        <button
                          onClick={() => setAsiSplitMode("plus-one-each")}
                          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                            !asiBonus.plusTwo
                              ? "border-tavern-gold text-tavern-text"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                          }`}
                        >
                          +1 to two
                        </button>
                      </div>
                      {asiBonus.plusTwo ? (
                        <label className="mt-3 block text-sm text-tavern-muted">
                          +2 to{" "}
                          <select
                            value={asiBonus.plusTwo}
                            onChange={(e) => setAsiPlusTwoAbility(e.target.value as AbilityKey)}
                            className="ml-1 rounded-md border border-tavern-border bg-tavern-card px-2 py-1 text-tavern-text uppercase"
                          >
                            {availableAbilities().map((a) => (
                              <option key={a} value={a}>
                                {a.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-4">
                          <label className="text-sm text-tavern-muted">
                            +1 to{" "}
                            <select
                              value={asiBonus.plusOne[0]}
                              onChange={(e) => setAsiPlusOneAt(0, e.target.value as AbilityKey)}
                              className="ml-1 rounded-md border border-tavern-border bg-tavern-card px-2 py-1 text-tavern-text uppercase"
                            >
                              {availableAbilities([asiBonus.plusOne[1]]).map((a) => (
                                <option key={a} value={a}>
                                  {a.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-sm text-tavern-muted">
                            +1 to{" "}
                            <select
                              value={asiBonus.plusOne[1]}
                              onChange={(e) => setAsiPlusOneAt(1, e.target.value as AbilityKey)}
                              className="ml-1 rounded-md border border-tavern-border bg-tavern-card px-2 py-1 text-tavern-text uppercase"
                            >
                              {availableAbilities([asiBonus.plusOne[0]]).map((a) => (
                                <option key={a} value={a}>
                                  {a.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={confirmFeatChoice}
                      disabled={
                        featPending ||
                        !selectedFeatIndex ||
                        (selectedFeatIndex === "ability-score-improvement" && !asiBonus)
                      }
                      className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={cancelFeatPicker}
                      disabled={featPending}
                      className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}

        {isOwner &&
          pendingExpertise.map((pe) => {
            const isOpen =
              expertisePicker?.classIndex === pe.classIndex &&
              expertisePicker?.level === pe.milestone.level;
            const classLabel = sheet.classes.length > 1 ? `${pe.className} ` : "";
            return (
          <div key={`${pe.classIndex}-${pe.milestone.level}`} className="mt-4">
            {!isOpen ? (
              <button
                onClick={() => openExpertisePicker(pe.classIndex, pe.milestone.level)}
                className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
              >
                Choose {classLabel}Expertise ({pe.milestone.count}) — Level {pe.milestone.level}
              </button>
            ) : (
              <div className="rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
                <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
                  Choose {pe.milestone.count} Skills for {classLabel}Expertise
                </p>
                <p className="mt-1 text-xs text-tavern-muted">
                  Expertise doubles your proficiency bonus on the chosen skill. Only skills you&apos;re
                  already proficient in are eligible.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {expertiseEligibleSkills.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => toggleExpertiseSkill(s.index, pe.milestone.count)}
                      className={`rounded-md border p-2 text-left text-sm transition-colors ${
                        selectedExpertiseSkills.includes(s.index)
                          ? "border-tavern-gold bg-tavern-bg text-tavern-text"
                          : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={confirmExpertise}
                    disabled={
                      expertisePending || selectedExpertiseSkills.length !== pe.milestone.count
                    }
                    className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancelExpertisePicker}
                    disabled={expertisePending}
                    className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
            );
          })}

        {choiceError && <p className="mt-1 text-xs text-tavern-oxblood-light">{choiceError}</p>}

        {/* Stat chips */}
        <div id="stats" className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["AC", ac],
            ["Initiative", formatModifier(sheet.initiative)],
            ["Speed", displaySpeed ?? "—"],
            // Fairy/Owlin Fly Speed (see sheet.flySpeed) shown as its own chip
            // right after Speed, only when the species grants flight.
            ...(sheet.flySpeed != null ? [["Fly Speed", sheet.flySpeed] as const] : []),
            ["Prof. Bonus", formatModifier(sheet.proficiencyBonus)],
            ["Passive Perc.", sheet.passivePerception],
            ["Hit Die", `d${sheet.hitDie}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-tavern-border bg-tavern-card p-3 text-center"
            >
              <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                {label}
              </div>
              <div className="mt-1 font-heading text-xl font-bold text-tavern-gold-light">
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Heroic Inspiration — a universal 2024 mechanic (DMs grant it; Human
            Resourceful auto-grants it on each Long Rest). A simple toggle the
            player flips when they gain or spend it. */}
        <button
          onClick={() => setPlay((prev) => ({ ...prev, heroicInspiration: !prev.heroicInspiration }))}
          disabled={!isOwner}
          className={`mt-3 flex w-full items-center justify-between rounded-lg border p-3 text-left disabled:opacity-60 ${
            play.heroicInspiration
              ? "border-tavern-gold bg-tavern-gold/10"
              : "border-tavern-border bg-tavern-card"
          }`}
        >
          <span>
            <span className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
              Heroic Inspiration
            </span>
            <span className="ml-2 text-xs text-tavern-muted">
              {play.heroicInspiration
                ? "You have it — reroll any d20 (tap to spend)."
                : "None — tap when the DM grants it."}
            </span>
          </span>
          <span className="font-heading text-xl font-bold text-tavern-gold-light">
            {play.heroicInspiration ? "★" : "☆"}
          </span>
        </button>

        {/* HP / resources */}
        <div id="hp" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-heading text-xs tracking-wider text-tavern-muted uppercase">
                Hit Points
              </div>
              <div className="font-heading text-3xl font-bold text-tavern-gold-light">
                {play.currentHp} / {maxHp}
                {play.tempHp > 0 && <span className="text-tavern-muted"> (+{play.tempHp})</span>}
              </div>
            </div>
            <button
              onClick={() => toggleSection("hp")}
              className="mt-1 shrink-0 text-sm text-tavern-muted hover:text-tavern-gold-light"
            >
              {collapsedSections.has("hp") ? "▸" : "▾"}
            </button>
          </div>
          {!collapsedSections.has("hp") && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={damageInput}
                  onChange={(e) => setDamageInput(e.target.value)}
                  placeholder="Damage"
                  className="w-24 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-tavern-text"
                />
                <button
                  onClick={applyDamage}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-sm font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Hurt
                </button>
                <input
                  type="number"
                  value={healInput}
                  onChange={(e) => setHealInput(e.target.value)}
                  placeholder="Heal"
                  className="w-24 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-tavern-text"
                />
                <button
                  onClick={applyHeal}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-600"
                >
                  Heal
                </button>
              </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-tavern-bg">
            <div
              className="h-full bg-tavern-oxblood transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (play.currentHp / maxHp) * 100))}%` }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              onClick={longRest}
              className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light"
            >
              Long Rest
            </button>
            {hasShortRestResource && (
              <button
                onClick={shortRest}
                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light"
              >
                Short Rest
              </button>
            )}
            {/* One Spend button per die size (a multiclass character has a
                mixed pool, e.g. 5d10 + 3d6). Single-class shows just one. */}
            {sheet.hitDicePool.map((h) => {
              const remaining = h.count - (hitDiceUsedByDie[String(h.die)] ?? 0);
              return (
                <button
                  key={h.die}
                  onClick={() => spendHitDie(h.die)}
                  disabled={remaining <= 0}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Spend d{h.die} ({remaining} left)
                </button>
              );
            })}
          </div>

          {sheet.channelDivinityMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Channel Divinity
                </div>
                <div className="text-xs text-tavern-muted">
                  Spend a use for one of this class&apos;s Channel Divinity effects — see Features
                  below for the full options. Regains 1 use on a Short Rest, all uses on a Long
                  Rest.
                </div>
              </div>
              <div className="flex items-center gap-3">
                {sheet.divineSparkDice > 0 && (
                  <button
                    onClick={rollDivineSpark}
                    className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                  >
                    Roll Divine Spark
                  </button>
                )}
                <CounterStepper
                  remaining={sheet.channelDivinityMax - play.expendedChannelDivinity}
                  max={sheet.channelDivinityMax}
                  onRestore={restoreChannelDivinity}
                  onExpend={expendChannelDivinity}
                />
              </div>
            </div>
          )}

          {sheet.layOnHandsMax > 0 && (
            <div className="mt-4 rounded-md border border-tavern-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Lay on Hands
                  </div>
                  <div className="text-xs text-tavern-muted">
                    Bonus Action to touch a creature and restore HP from the pool. Regains all on a
                    Long Rest.
                  </div>
                </div>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.layOnHandsMax - play.expendedLayOnHands}/{sheet.layOnHandsMax}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="number"
                  value={layOnHandsInput}
                  onChange={(e) => setLayOnHandsInput(e.target.value)}
                  placeholder="Amount"
                  className="w-24 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-tavern-text"
                />
                <button
                  onClick={spendLayOnHands}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-sm font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Spend
                </button>
                <button
                  onClick={restoreLayOnHands}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-600"
                >
                  Restore
                </button>
                <button
                  onClick={curePoisonWithLayOnHands}
                  disabled={sheet.layOnHandsMax - play.expendedLayOnHands < 5}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-sm font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Cure Poison (5)
                </button>
              </div>
            </div>
          )}

          {sheet.bardicInspirationMax > 0 && (
            <ResourceRow
              title={`Bardic Inspiration (d${sheet.bardicInspirationDie})`}
              description={`Confer a die as a Bonus Action — see Features below for the full effect. Regains all uses on a Long Rest${sheet.level >= 5 ? " or Short Rest" : ""}.`}
              remaining={sheet.bardicInspirationMax - play.expendedBardicInspiration}
              max={sheet.bardicInspirationMax}
              onRestore={restoreBardicInspiration}
              onExpend={expendBardicInspiration}
            />
          )}

          {sheet.wildShapeMax > 0 && (
            <ResourceRow
              title="Wild Shape"
              description="Bonus Action to transform — see Features below for known forms and the full effect. Regains 1 use on a Short Rest, all uses on a Long Rest."
              remaining={sheet.wildShapeMax - play.expendedWildShape}
              max={sheet.wildShapeMax}
              onRestore={restoreWildShape}
              onExpend={expendWildShape}
            />
          )}

          {sheet.favoredEnemyMax > 0 && (
            <ResourceRow
              title="Favored Enemy"
              description="Cast Hunter's Mark without a spell slot — see Features below for the full effect. Regains all uses on a Long Rest."
              remaining={sheet.favoredEnemyMax - play.expendedFavoredEnemy}
              max={sheet.favoredEnemyMax}
              onRestore={restoreFavoredEnemy}
              onExpend={expendFavoredEnemy}
            />
          )}

          {sheet.secondWindMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Second Wind
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action to regain 1d10{formatModifier(sheet.level)} Hit Points. Regains 1 use
                  on a Short Rest, all uses on a Long Rest.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={useSecondWind}
                  disabled={play.expendedSecondWind >= sheet.secondWindMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Use Second Wind
                </button>
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreSecondWind}
                    disabled={play.expendedSecondWind <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.secondWindMax - play.expendedSecondWind}/{sheet.secondWindMax}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sheet.actionSurgeMax > 0 && (
            <ResourceRow
              title="Action Surge"
              description={`Take one additional action this turn (not the Magic action). Regains all uses on a Short or Long Rest${sheet.actionSurgeMax > 1 ? " — only once per turn even with 2 uses available." : "."}`}
              remaining={sheet.actionSurgeMax - play.expendedActionSurge}
              max={sheet.actionSurgeMax}
              onRestore={restoreActionSurge}
              onExpend={expendActionSurge}
            />
          )}

          {sheet.indomitableMax > 0 && (
            <ResourceRow
              title="Indomitable"
              description={`Reroll a failed saving throw, adding ${formatModifier(sheet.level)} to the new roll. Regains all uses on a Long Rest only.`}
              remaining={sheet.indomitableMax - play.expendedIndomitable}
              max={sheet.indomitableMax}
              onRestore={restoreIndomitable}
              onExpend={expendIndomitable}
            />
          )}

          {sheet.rageMax > 0 && (
            <div className="mt-4 rounded-md border border-tavern-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Rage{play.isRaging ? " (Active)" : ""}
                  </div>
                  <div className="text-xs text-tavern-muted">
                    Bonus Action to enter. While active: +{sheet.rageDamageBonus} damage on
                    Strength attacks (auto-applied above), Resistance to Bludgeoning/Piercing/
                    Slashing, Advantage on Strength checks and saves. Regains 1 use on a Short
                    Rest, all uses on a Long Rest.
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreRage}
                    disabled={play.expendedRage <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.rageMax - play.expendedRage}/{sheet.rageMax}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={enterRage}
                  disabled={play.isRaging || play.expendedRage >= sheet.rageMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Enter Rage
                </button>
                <button
                  onClick={endRage}
                  disabled={!play.isRaging}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  End Rage
                </button>
                {sheet.level >= 15 && (
                  <button
                    onClick={usePersistentRage}
                    disabled={play.usedPersistentRage}
                    className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {play.usedPersistentRage ? "Persistent Rage Used" : "Persistent Rage (regain all)"}
                  </button>
                )}
              </div>
            </div>
          )}

          {sheet.focusPointsMax > 0 && (
            <div className="mt-4 rounded-md border border-tavern-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Focus Points
                  </div>
                  <div className="text-xs text-tavern-muted">
                    Spend on Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike,
                    and other Focus features — see Features below. Save DC{" "}
                    {8 + sheet.modifiers.wis + sheet.proficiencyBonus}. Regains all uses on a
                    Short or Long Rest.
                  </div>
                </div>
                <CounterStepper
                  remaining={sheet.focusPointsMax - play.expendedFocusPoints}
                  max={sheet.focusPointsMax}
                  onRestore={restoreFocusPoint}
                  onExpend={expendFocusPoint}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={useUncannyMetabolism}
                  disabled={play.usedUncannyMetabolism}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {play.usedUncannyMetabolism
                    ? "Uncanny Metabolism Used"
                    : `Uncanny Metabolism (regain all + heal 1d${sheet.martialArtsDie}+lvl)`}
                </button>
              </div>
            </div>
          )}

          {sheet.wholenessOfBodyMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Wholeness of Body
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action to regain 1d{sheet.martialArtsDie}
                  {formatModifier(sheet.modifiers.wis)} Hit Points. Regains all uses on a Long
                  Rest only.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={useWholenessOfBody}
                  disabled={play.expendedWholenessOfBody >= sheet.wholenessOfBodyMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Use
                </button>
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreWholenessOfBody}
                    disabled={play.expendedWholenessOfBody <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.wholenessOfBodyMax - play.expendedWholenessOfBody}/
                    {sheet.wholenessOfBodyMax}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sheet.breathWeaponMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Breath Weapon
                </div>
                <div className="text-xs text-tavern-muted">
                  Replace one attack with a 15-ft Cone or 30-ft Line. DEX save DC{" "}
                  {8 + sheet.modifiers.con + sheet.proficiencyBonus}, half damage on a success.
                  Regains all uses on a Long Rest only.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={rollBreathWeapon}
                  disabled={play.expendedBreathWeapon >= sheet.breathWeaponMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Roll {sheet.breathWeaponDice}d10 {sheet.breathWeaponDamageType ?? ""}
                </button>
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreBreathWeapon}
                    disabled={play.expendedBreathWeapon <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.breathWeaponMax - play.expendedBreathWeapon}/{sheet.breathWeaponMax}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sheet.draconicFlightAvailable && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Draconic Flight
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action for a Fly Speed equal to your Speed for 10 minutes. Once per Long
                  Rest.
                </div>
              </div>
              <button
                onClick={useDraconicFlight}
                disabled={play.usedDraconicFlight}
                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
              >
                {play.usedDraconicFlight ? "Used" : "Use"}
              </button>
            </div>
          )}

          {sheet.stonecunningMax > 0 && (
            <ResourceRow
              title="Stonecunning"
              description="Bonus Action for Tremorsense (60 ft, on/touching stone) for 10 minutes. Regains all uses on a Long Rest only."
              remaining={sheet.stonecunningMax - play.expendedStonecunning}
              max={sheet.stonecunningMax}
              onRestore={restoreStonecunning}
              onExpend={expendStonecunning}
            />
          )}

          {sheet.adrenalineRushMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Adrenaline Rush
                </div>
                <div className="text-xs text-tavern-muted">
                  Dash as a Bonus Action and gain {sheet.proficiencyBonus} Temporary Hit Points.
                  Regains all uses on a Short or Long Rest.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={useAdrenalineRush}
                  disabled={play.expendedAdrenalineRush >= sheet.adrenalineRushMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Use
                </button>
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreAdrenalineRush}
                    disabled={play.expendedAdrenalineRush <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.adrenalineRushMax - play.expendedAdrenalineRush}/{sheet.adrenalineRushMax}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sheet.largeFormAvailable && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Large Form
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action to become Large for 10 minutes: Advantage on Strength checks, +10
                  ft Speed. Once per Long Rest.
                </div>
              </div>
              <button
                onClick={useLargeForm}
                disabled={play.usedLargeForm}
                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
              >
                {play.usedLargeForm ? "Used" : "Use"}
              </button>
            </div>
          )}

          {sheet.giantAncestryUsesMax > 0 && chosenAncestry && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Giant Ancestry — {chosenAncestry.name}
                </div>
                <div className="text-xs text-tavern-muted">
                  {chosenAncestry.description} Regains all uses on a Long Rest.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={useGiantAncestry}
                  disabled={play.expendedGiantAncestry >= sheet.giantAncestryUsesMax}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Use
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={restoreGiantAncestry}
                    disabled={play.expendedGiantAncestry === 0}
                    className="rounded border border-tavern-border px-1.5 py-0.5 text-xs text-tavern-muted hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.giantAncestryUsesMax - play.expendedGiantAncestry}/{sheet.giantAncestryUsesMax}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sheet.healingHandsMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Healing Hands
                </div>
                <div className="text-xs text-tavern-muted">
                  Touch a creature to restore {sheet.level} Hit Points. Once per Long Rest.
                </div>
              </div>
              <button
                onClick={useHealingHands}
                disabled={play.expendedHealingHands >= sheet.healingHandsMax}
                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
              >
                {play.expendedHealingHands >= sheet.healingHandsMax ? "Used" : "Heal"}
              </button>
            </div>
          )}

          {sheet.furyOfTheSmallMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Fury of the Small
                </div>
                <div className="text-xs text-tavern-muted">
                  On a hit against a larger creature, deal +{sheet.level} damage. Once per Short or
                  Long Rest.
                </div>
              </div>
              <button
                onClick={useFuryOfTheSmall}
                disabled={play.expendedFuryOfTheSmall >= sheet.furyOfTheSmallMax}
                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
              >
                {play.expendedFuryOfTheSmall >= sheet.furyOfTheSmallMax ? "Used" : `+${sheet.level} Dmg`}
              </button>
            </div>
          )}

          {sheet.shiftingMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Shifting
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action: gain {Math.max(1, sheet.level + sheet.modifiers.con)} Temporary Hit
                  Points and +10 ft Speed for 1 minute. Once per Short or Long Rest.
                </div>
              </div>
              <button
                onClick={useShifting}
                disabled={play.expendedShifting >= sheet.shiftingMax}
                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
              >
                {play.expendedShifting >= sheet.shiftingMax ? "Used" : "Shift"}
              </button>
            </div>
          )}


          {isDying && (
            <div className="mt-4 rounded-lg border border-tavern-oxblood bg-tavern-oxblood/10 p-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-bold text-tavern-oxblood-light uppercase">
                  Death Saves
                </span>
                <button
                  onClick={rollDeathSave}
                  className="rounded-md bg-tavern-oxblood px-3 py-1 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll
                </button>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span>Successes: {play.deathSaveSuccesses}/3</span>
                <span>Failures: {play.deathSaveFailures}/3</span>
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Conditions & Status */}
        <div id="status" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <CardHeader
            title="Conditions & Status"
            collapsed={collapsedSections.has("status")}
            onToggle={() => toggleSection("status")}
          />
          {!collapsedSections.has("status") && (<>
            {/* Exhaustion */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Exhaustion
                </div>
                <div className="text-xs text-tavern-muted">
                  {play.exhaustionLevel === 0
                    ? "No exhaustion. Each level is −2 to all d20 tests and −5 ft Speed; a Long Rest removes one level."
                    : play.exhaustionLevel >= EXHAUSTION_MAX
                      ? "Level 6 — the character dies."
                      : `−${exhaustionD20Penalty(play.exhaustionLevel)} to all d20 tests (checks, saves, attacks) and −${exhaustionSpeedPenalty(play.exhaustionLevel)} ft Speed — applied automatically.`}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={() => setPlay((p) => ({ ...p, exhaustionLevel: Math.max(0, p.exhaustionLevel - 1) }))}
                  disabled={play.exhaustionLevel <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  −
                </button>
                <span className={`font-heading font-bold ${play.exhaustionLevel > 0 ? "text-tavern-oxblood-light" : "text-tavern-text"}`}>
                  {play.exhaustionLevel}/{EXHAUSTION_MAX}
                </span>
                <button
                  onClick={() => setPlay((p) => ({ ...p, exhaustionLevel: Math.min(EXHAUSTION_MAX, p.exhaustionLevel + 1) }))}
                  disabled={play.exhaustionLevel >= EXHAUSTION_MAX}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Concentration */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-tavern-border p-3">
              <span className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                Concentrating on
              </span>
              <input
                type="text"
                value={play.concentratingOn}
                onChange={(e) => setPlay((p) => ({ ...p, concentratingOn: e.target.value }))}
                placeholder="e.g. Hex, Bless — reminder only"
                className="min-w-[8rem] flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted/60"
              />
              {play.concentratingOn && (
                <button
                  onClick={() => setPlay((p) => ({ ...p, concentratingOn: "" }))}
                  className="rounded-md border border-tavern-border px-2 py-1 text-xs text-tavern-muted hover:border-tavern-gold-light"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Conditions */}
            <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => {
                  const active = play.conditions.includes(c.index);
                  return (
                    <button
                      key={c.index}
                      onClick={() =>
                        setPlay((p) => ({
                          ...p,
                          conditions: active
                            ? p.conditions.filter((x) => x !== c.index)
                            : [...p.conditions, c.index],
                        }))
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        active
                          ? "border-tavern-oxblood bg-tavern-oxblood/20 text-tavern-oxblood-light"
                          : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {play.conditions.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {CONDITIONS.filter((c) => play.conditions.includes(c.index)).map((c) => (
                    <div key={c.index} className="rounded-md border border-tavern-border p-2.5 text-xs">
                      <span className="font-bold text-tavern-oxblood-light">{c.name}:</span>{" "}
                      <span className="text-tavern-muted">{c.effect}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}
        </div>

        {/* Ability scores + saves */}
        <div id="abilities" className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_ORDER.map((ability) => (
            <button
              key={ability}
              onClick={() => rollCheck(`${ability.toUpperCase()} Check`, sheet.modifiers[ability])}
              className="rounded-lg border border-tavern-border bg-tavern-card p-3 text-center hover:border-tavern-gold-light"
            >
              <div className="font-heading text-xs tracking-wider text-tavern-gold-light uppercase">
                {ability}
              </div>
              <div className="mt-1 font-heading text-xl font-bold text-tavern-text">
                {sheet.finalScores[ability]}
              </div>
              <div className="text-xs text-tavern-muted">
                {formatModifier(sheet.modifiers[ability])}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {sheet.savingThrows.map((save) => (
            <button
              key={save.ability}
              onClick={() => rollCheck(`${save.ability.toUpperCase()} Save`, save.bonus)}
              className={`rounded-lg border p-2 text-center text-xs hover:border-tavern-gold-light ${
                save.proficient
                  ? "border-tavern-gold/40 bg-tavern-bg"
                  : "border-tavern-border bg-tavern-card"
              }`}
            >
              <div className="text-tavern-muted">{save.ability.toUpperCase()} Save</div>
              <div className="font-heading font-bold text-tavern-text">
                {formatModifier(save.bonus)}
              </div>
            </button>
          ))}
        </div>

        {/* Skills */}
        <div id="skills" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <button
            onClick={() => toggleSection("skills")}
            className="flex w-full items-center justify-between"
          >
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Skills
            </h2>
            <span className="text-xs text-tavern-muted">
              {collapsedSections.has("skills") ? "▸" : "▾"}
            </span>
          </button>
          {!collapsedSections.has("skills") && (
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {sheet.skills.map((skill) => (
                <button
                  key={skill.index}
                  onClick={() => rollCheck(skill.name, skill.bonus)}
                  className={`flex items-center justify-between rounded-md px-3 py-1.5 text-left text-sm hover:bg-tavern-bg ${
                    skill.proficient ? "text-tavern-text" : "text-tavern-muted"
                  }`}
                >
                  <span>
                    {skill.proficient && (
                      <span className="mr-1.5 text-tavern-gold-light">
                        {skill.expertise ? "••" : "•"}
                      </span>
                    )}
                    {skill.name}{" "}
                    <span className="text-xs opacity-60">({skill.ability.toUpperCase()})</span>
                  </span>
                  <span className="font-heading font-bold">{formatModifier(skill.bonus)}</span>
                </button>
              ))}
            </div>
          )}
          {!collapsedSections.has("skills") && sheet.jackOfAllTrades && (
            <p className="mt-2 text-xs text-tavern-muted italic">
              Jack of All Trades: half your proficiency bonus (+{Math.floor(sheet.proficiencyBonus / 2)})
              is already included on every skill you&apos;re not proficient in.
            </p>
          )}
          {!collapsedSections.has("skills") && hasBonusSkillChoice && (
            <div className="mt-3">
              {!bonusSkillPickerOpen ? (
                <div className="flex items-center justify-between rounded-md border border-tavern-border p-3">
                  <div className="text-xs text-tavern-muted">
                    {isHuman && "Skillful: 1 chosen skill proficiency. "}
                    {skilledCount > 0 && `Skilled feat: ${skilledCount} chosen skill proficiencies.`}
                  </div>
                  {isOwner && (
                    <button
                      onClick={openBonusSkillPicker}
                      className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                    >
                      {currentDraft.humanSkillChoice || currentDraft.skilledChoices.length > 0
                        ? "Edit Skills"
                        : "Choose Skills"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                  {isHuman && (
                    <>
                      <p className="text-xs font-bold text-tavern-gold-light">
                        Skillful — choose 1 skill proficiency
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {sheet.skills.map((s) => (
                          <button
                            key={`human-${s.index}`}
                            onClick={() =>
                              setSelectedHumanSkill((prev) => (prev === s.index ? null : s.index))
                            }
                            className={`rounded-md border px-2 py-1.5 text-left text-xs ${
                              selectedHumanSkill === s.index
                                ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold"
                                : "border-tavern-border text-tavern-text hover:border-tavern-gold-light"
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {skilledCount > 0 && (
                    <>
                      <p className={`text-xs font-bold text-tavern-gold-light ${isHuman ? "mt-3" : ""}`}>
                        Skilled — choose {skilledCount} ({selectedSkilled.length} selected)
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {sheet.skills.map((s) => {
                          const selected = selectedSkilled.includes(s.index);
                          return (
                            <button
                              key={`skilled-${s.index}`}
                              onClick={() => toggleSkilledSelection(s.index, skilledCount)}
                              className={`rounded-md border px-2 py-1.5 text-left text-xs ${
                                selected
                                  ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold"
                                  : "border-tavern-border text-tavern-text hover:border-tavern-gold-light"
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => saveBonusSkills(isHuman, skilledCount)}
                      disabled={bonusSkillPending}
                      className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                    >
                      {bonusSkillPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setBonusSkillPickerOpen(false)}
                      className="rounded-md border border-tavern-border px-3 py-1.5 text-xs text-tavern-muted hover:border-tavern-gold-light"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Languages & Proficiencies — always shown. Every PC knows Common
            (2024 PHB), so it's listed even when no extra languages were
            chosen, plus the two creation-time language picks and any
            automatic class language (Thieves' Cant / Druidic). */}
        {(() => {
          const languagesByIndex = new Map(languages.map((l) => [l.index, l]));
          const background = backgrounds.find((b) => b.index === currentDraft.backgroundIndex) ?? null;
          const autoLang =
            currentDraft.classIndex === "rogue"
              ? "Thieves' Cant"
              : currentDraft.classIndex === "druid"
                ? "Druidic"
                : null;
          const chosenNames = currentDraft.languageChoices.map(
            (idx) => languagesByIndex.get(idx)?.name ?? idx,
          );
          const toolProfName = currentDraft.toolProficiencyChoice
            ? background?.toolProficiencyChoices
                .flatMap((tpc) => tpc.options)
                .find((o) => o.index === currentDraft.toolProficiencyChoice)
                ?.name.replace(/^Tool:\s*/, "") ?? currentDraft.toolProficiencyChoice
            : null;
          // Common first, then any auto class language, then chosen languages —
          // deduped so a player who picked Common as one of their two doesn't
          // see it twice.
          const allLanguages = [
            ...new Set(["Common", ...(autoLang ? [autoLang] : []), ...chosenNames]),
          ];
          return (
            <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
              <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                Languages &amp; Proficiencies
              </h2>
              <p className="mt-2 text-sm text-tavern-text">{allLanguages.join(", ")}</p>
              {toolProfName && (
                <p className="mt-1 text-sm text-tavern-muted">
                  Tool Proficiency: {toolProfName}
                </p>
              )}
            </div>
          );
        })()}

        {/* Fighting Style — not gated on spellcastingAbility, unlike Spells
            below: Fighter/Paladin/Ranger all grant this regardless of
            whether the class casts spells. */}
        {sheet.fightingStyleKnownMax > 0 && (() => {
          const fsPending = isOwner && knownFightingStyleDetails.length < sheet.fightingStyleKnownMax;
          return (
          <div
            id="fighting-style"
            className={`mt-6 rounded-xl border bg-tavern-card p-5 ${fsPending ? "border-tavern-gold/60" : "border-tavern-border"}`}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => toggleSection("fighting-style")}
                className="flex items-center gap-1.5 text-left"
              >
                <span className={`text-[10px] leading-none ${fsPending ? "text-tavern-gold-light" : "text-tavern-muted"}`}>
                  {collapsedSections.has("fighting-style") ? "▸" : "▾"}
                </span>
                <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                  Fighting Style ({knownFightingStyleDetails.length}/{sheet.fightingStyleKnownMax})
                </h2>
              </button>
              {isOwner && !fightingStylePickerOpen && (
                <button
                  onClick={openFightingStylePicker}
                  className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                >
                  Edit
                </button>
              )}
            </div>
            {fsPending && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-tavern-gold/40 bg-tavern-gold/5 px-3 py-1.5 text-xs font-bold text-tavern-gold-light">
                ✦ New Fighting Style Selections Available
              </div>
            )}
            {(!collapsedSections.has("fighting-style") || fightingStylePickerOpen) && (
            <p className="mt-1 text-xs text-tavern-muted">
              Only 4 of the real PHB&apos;s Fighting Styles (Archery, Defense, Great Weapon
              Fighting, Two-Weapon Fighting) are in the free SRD. Archery and Defense apply
              automatically above; the other two are situational and applied manually in play.
            </p>)}
            {(!collapsedSections.has("fighting-style") || fightingStylePickerOpen) && <>
            {!fightingStylePickerOpen ? (
              <div className="mt-2 space-y-1">
                {knownFightingStyleDetails.map((f) => {
                  const key = `fighting-style-${f.index}`;
                  return (
                    <ExpandableRow
                      key={key}
                      name={f.name}
                      description={f.description}
                      expanded={expandedFeatures.has(key)}
                      onToggle={() => toggleFeature(key)}
                    />
                  );
                })}
                {knownFightingStyleDetails.length === 0 && (
                  <p className="text-xs text-tavern-muted">No Fighting Style chosen yet.</p>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                <p className="text-xs text-tavern-muted">
                  Choose up to {sheet.fightingStyleKnownMax} ({selectedFightingStyle.length} selected).
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {fightingStyleFeats.map((f) => {
                    const key = `picker-fighting-style-${f.index}`;
                    return (
                      <PickerOption
                        key={f.index}
                        name={f.name}
                        description={f.description}
                        selected={selectedFightingStyle.includes(f.index)}
                        onSelect={() => toggleFightingStyleSelection(f.index, sheet.fightingStyleKnownMax)}
                        detailsExpanded={expandedFeatures.has(key)}
                        onToggleDetails={() => toggleFeature(key)}
                      />
                    );
                  })}
                </div>
                <SaveCancelRow
                  pending={fightingStylePending}
                  onSave={saveFightingStyle}
                  onCancel={() => setFightingStylePickerOpen(false)}
                />
              </div>
            )}
            </>}
          </div>
          );
        })()}

        {/* Weapon Mastery */}
        {weaponMasteryMax > 0 && (() => {
          const wmPending = isOwner && knownWeaponMasteryDetails.length < weaponMasteryMax;
          return (
          <div
            id="weapon-mastery"
            className={`mt-6 rounded-xl border bg-tavern-card p-5 ${wmPending ? "border-tavern-gold/60" : "border-tavern-border"}`}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => toggleSection("weapon-mastery")}
                className="flex items-center gap-1.5 text-left"
              >
                <span className={`text-[10px] leading-none ${wmPending ? "text-tavern-gold-light" : "text-tavern-muted"}`}>
                  {collapsedSections.has("weapon-mastery") ? "▸" : "▾"}
                </span>
                <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                  Weapon Mastery ({knownWeaponMasteryDetails.length}/{weaponMasteryMax})
                </h2>
              </button>
              {isOwner && !weaponMasteryPickerOpen && (
                <button
                  onClick={openWeaponMasteryPicker}
                  className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                >
                  Edit
                </button>
              )}
            </div>
            {wmPending && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-tavern-gold/40 bg-tavern-gold/5 px-3 py-1.5 text-xs font-bold text-tavern-gold-light">
                ✦ New Weapon Mastery Selections Available
              </div>
            )}
            {(!collapsedSections.has("weapon-mastery") || weaponMasteryPickerOpen) && (
            <p className="mt-1 text-xs text-tavern-muted">
              You can use the mastery properties of these weapon kinds. Change one whenever you
              finish a Long Rest.
            </p>)}
            {(!collapsedSections.has("weapon-mastery") || weaponMasteryPickerOpen) && <>
            {!weaponMasteryPickerOpen ? (
              <div className="mt-2 space-y-1">
                {knownWeaponMasteryDetails.map((w) => {
                  const masteryDesc = w.mastery
                    ? masteryProperties.find((p) => p.index === w.mastery!.index)?.description
                    : null;
                  return (
                    <div
                      key={w.index}
                      className="rounded-md border border-tavern-border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-tavern-text">{w.name}</span>
                        <span className="text-xs tracking-wide text-tavern-gold-light uppercase">
                          {w.mastery?.name}
                        </span>
                      </div>
                      {masteryDesc && (
                        <p className="mt-1 text-xs text-tavern-muted">{masteryDesc}</p>
                      )}
                    </div>
                  );
                })}
                {knownWeaponMasteryDetails.length === 0 && (
                  <p className="text-xs text-tavern-muted">No Weapon Mastery chosen yet.</p>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                <p className="text-xs text-tavern-muted">
                  Choose up to {weaponMasteryMax} ({selectedWeaponMastery.length} selected).
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {masterableWeapons.map((w) => {
                    const key = `picker-weapon-mastery-${w.index}`;
                    const description = w.mastery
                      ? masteryProperties.find((p) => p.index === w.mastery!.index)?.description ?? null
                      : null;
                    return (
                      <PickerOption
                        key={w.index}
                        name={w.name}
                        rightLabel={w.mastery?.name}
                        rightLabelTone="gold"
                        description={description}
                        selected={selectedWeaponMastery.includes(w.index)}
                        onSelect={() => toggleWeaponMasterySelection(w.index, weaponMasteryMax)}
                        detailsExpanded={expandedFeatures.has(key)}
                        onToggleDetails={() => toggleFeature(key)}
                      />
                    );
                  })}
                </div>
                <SaveCancelRow
                  pending={weaponMasteryPending}
                  onSave={saveWeaponMastery}
                  onCancel={() => setWeaponMasteryPickerOpen(false)}
                />
              </div>
            )}
            </>}
          </div>
          );
        })()}

        {/* Spells */}
        {(sheet.spellcastingAbility || sheet.lineageSpells.length > 0 || sheet.lineageCantripTrait !== null || sheet.speciesCantrip) && (
          <div id="spells" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <button
              onClick={() => toggleSection("spells")}
              className="flex w-full items-center justify-between"
            >
              <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                Spells
              </h2>
              <span className="text-xs text-tavern-muted">
                {collapsedSections.has("spells") ? "▸" : "▾"}
              </span>
            </button>
            {(!collapsedSections.has("spells") || cantripPickerOpen || preparedPickerOpen || metamagicPickerOpen || lineageCantripPickerOpen) && (<>
            {/* One Save DC / Attack pair per caster class (each uses its own
                ability). A single-class caster shows just its own. */}
            {sheet.spellcasting.map((sc) => (
              <div key={sc.classIndex} className="mt-3">
                {sheet.spellcasting.length > 1 && (
                  <div className="mb-1 font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                    {sc.className} — {sc.ability.toUpperCase()}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center">
                    <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                      Spell Save DC
                    </div>
                    <div className="mt-1 font-heading text-xl font-bold text-tavern-gold-light">
                      {sc.saveDC}
                    </div>
                  </div>
                  <div className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center">
                    <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                      Spell Attack
                    </div>
                    <div className="mt-1 font-heading text-xl font-bold text-tavern-gold-light">
                      {formatModifier(sc.attackBonus)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {sheet.spellSlots.some((n) => n > 0) && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Spell Slots
                </h3>
                {sheet.spellcasting.filter((sc) => !sc.isWarlock).length > 1 && (
                  <p className="text-xs text-tavern-muted">
                    Shared multiclass spell slots (combined caster level) — any class&apos;s prepared
                    spells can be cast using them.
                  </p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sheet.spellSlots.map((total, i) => {
                    if (total === 0) return null;
                    const used = play.expendedSlots[i] ?? 0;
                    const remaining = total - used;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-tavern-border px-3 py-2"
                      >
                        <span className="text-sm text-tavern-muted">Level {i + 1}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restoreSpellSlot(i)}
                            disabled={remaining >= total}
                            className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                          >
                            +
                          </button>
                          <span className="font-heading font-bold text-tavern-text">
                            {remaining}/{total}
                          </span>
                          <button
                            onClick={() => expendSpellSlot(i)}
                            disabled={remaining <= 0}
                            className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                          >
                            &minus;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warlock Pact Magic — a separate pool from the shared slots above. */}
            {sheet.pactSlots.some((n) => n > 0) && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Pact Magic Slots
                </h3>
                <p className="text-xs text-tavern-muted">
                  All the same level, and recover fully on a Short or Long Rest.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sheet.pactSlots.map((total, i) => {
                    if (total === 0) return null;
                    const used = play.expendedPactSlots[i] ?? 0;
                    const remaining = total - used;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-tavern-border px-3 py-2"
                      >
                        <span className="text-sm text-tavern-muted">Level {i + 1}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restorePactSlot(i)}
                            disabled={remaining >= total}
                            className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                          >
                            +
                          </button>
                          <span className="font-heading font-bold text-tavern-text">
                            {remaining}/{total}
                          </span>
                          <button
                            onClick={() => expendPactSlot(i)}
                            disabled={remaining <= 0}
                            className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                          >
                            &minus;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {clsLvl("warlock") >= 2 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Magical Cunning
                  </div>
                  <div className="text-xs text-tavern-muted">
                    1-minute rite to regain {magicalCunningRegain(Math.max(0, ...sheet.pactSlots))}{" "}
                    expended Pact Magic slot
                    {magicalCunningRegain(Math.max(0, ...sheet.pactSlots)) === 1 ? "" : "s"}. Once
                    per Long Rest.
                  </div>
                </div>
                <button
                  onClick={useMagicalCunning}
                  disabled={play.usedMagicalCunning || !play.expendedPactSlots.some((n) => n > 0)}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {play.usedMagicalCunning ? "Used" : "Use"}
                </button>
              </div>
            )}

            {sheet.arcaneRecoveryMax > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Arcane Recovery
                  </div>
                  <div className="text-xs text-tavern-muted">
                    Once per day on a Short Rest, recover expended spell slots totalling up to{" "}
                    {sheet.arcaneRecoveryMax} slot level{sheet.arcaneRecoveryMax === 1 ? "" : "s"}{" "}
                    (none above 5th). Recovers your highest slots first — adjust below if needed.
                  </div>
                </div>
                <button
                  onClick={useArcaneRecovery}
                  disabled={play.usedArcaneRecovery || !play.expendedSlots.some((n) => n > 0)}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {play.usedArcaneRecovery ? "Used" : "Recover"}
                </button>
              </div>
            )}

            {sheet.sorceryPointsMax > 0 && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Sorcery Points
                </h3>
                <div className="mt-2 sm:max-w-[200px]">
                  <CounterStepper
                    remaining={sheet.sorceryPointsMax - play.expendedSorceryPoints}
                    max={sheet.sorceryPointsMax}
                    onRestore={restoreSorceryPoint}
                    onExpend={expendSorceryPoint}
                  />
                </div>
              </div>
            )}

            {sheet.innateSorceryMax > 0 && (
              <ResourceRow
                title="Innate Sorcery"
                description={`Bonus Action: for 1 minute your Spell Save DC is +1 and you have Advantage on your spell attack rolls. ${sheet.innateSorceryMax} uses per Long Rest.`}
                remaining={sheet.innateSorceryMax - play.expendedInnateSorcery}
                max={sheet.innateSorceryMax}
                onRestore={restoreInnateSorcery}
                onExpend={useInnateSorcery}
              />
            )}

            {sheet.metamagicKnownMax > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Metamagic ({knownMetamagicDetails.length}/{sheet.metamagicKnownMax})
                  </h3>
                  {isOwner && !metamagicPickerOpen && (
                    <button
                      onClick={openMetamagicPicker}
                      className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-tavern-muted">
                  Original homebrew options — the official Metamagic list isn&apos;t part of the
                  free SRD. The schedule above (2 at level 2, +2 at 10, +2 at 17) is from the real
                  rules.
                </p>

                {!metamagicPickerOpen ? (
                  <div className="mt-2 space-y-1">
                    {knownMetamagicDetails.map((m) => {
                      const key = `metamagic-${m.key}`;
                      const expanded = expandedFeatures.has(key);
                      return (
                        <div key={key} className="rounded-md border border-tavern-border">
                          <button
                            onClick={() => toggleFeature(key)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                          >
                            <span className="text-tavern-text">{m.name}</span>
                            <span className="text-xs tracking-wide text-tavern-muted uppercase">
                              {m.cost}
                            </span>
                          </button>
                          {expanded && (
                            <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                              {m.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {knownMetamagicDetails.length === 0 && (
                      <p className="text-xs text-tavern-muted">No Metamagic options chosen yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                    <p className="text-xs text-tavern-muted">
                      Choose up to {sheet.metamagicKnownMax} ({selectedMetamagic.length} selected).
                    </p>
                    <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {METAMAGIC_OPTIONS.map((m) => {
                        const key = `picker-metamagic-${m.key}`;
                        return (
                          <PickerOption
                            key={m.key}
                            name={m.name}
                            rightLabel={m.cost}
                            description={m.description}
                            selected={selectedMetamagic.includes(m.key)}
                            onSelect={() => toggleMetamagicSelection(m.key, sheet.metamagicKnownMax)}
                            detailsExpanded={expandedFeatures.has(key)}
                            onToggleDetails={() => toggleFeature(key)}
                          />
                        );
                      })}
                    </div>
                    <SaveCancelRow
                      pending={metamagicPending}
                      onSave={saveMetamagic}
                      onCancel={() => setMetamagicPickerOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Which caster class's cantrips/prepared spells to manage (only
                shown for a multiclass with two spellcasting classes). */}
            {sheet.spellcasting.length > 1 && (
              <div className="mt-4">
                <div className="mb-1 font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                  Manage spells for
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sheet.spellcasting.map((sc) => (
                    <button
                      key={sc.classIndex}
                      onClick={() => setActiveCasterClass(sc.classIndex)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
                        spellClass === sc.classIndex
                          ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                          : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                      }`}
                    >
                      {sc.className}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeCantripsKnown > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Cantrips Known ({knownCantripDetails.length}/{activeCantripsKnown})
                  </h3>
                  {isOwner && !cantripPickerOpen && (
                    <button
                      onClick={openCantripPicker}
                      className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {!cantripPickerOpen ? (
                  <div className="mt-2 space-y-2">
                    {knownCantripDetails.map((s) => {
                      const key = `spell-${s.index}`;
                      const damageDice = getCantripDamageDice(s);
                      return (
                        <SpellRow
                          key={key}
                          name={s.name}
                          isHomebrew={s.isHomebrew}
                          metaLine={`Cantrip${s.school ? ` · ${s.school}` : ""}${s.range ? ` · ${s.range}` : ""}${s.concentration ? " · Concentration" : ""}${s.ritual ? " · Ritual" : ""}${s.dcType ? ` · DC ${activeSaveDC} ${s.dcType.toUpperCase()} save` : ""}`}
                          description={s.description}
                          expanded={expandedFeatures.has(key)}
                          onToggle={() => toggleFeature(key)}
                          actions={
                            <>
                              {s.attackType && (
                                <button
                                  onClick={() => rollSpellAttack(s.name, activeAttackBonus)}
                                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                                >
                                  Attack {formatModifier(activeAttackBonus)}
                                </button>
                              )}
                              {damageDice && (
                                <button
                                  onClick={() => rollSpellDamage(s.name, damageDice, s.damageType)}
                                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                                >
                                  Damage
                                </button>
                              )}
                              {!s.attackType && !damageDice && (
                                <button
                                  onClick={() => castSpell(s.name)}
                                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                                >
                                  Cast
                                </button>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                    {knownCantripDetails.length === 0 && (
                      <p className="text-xs text-tavern-muted">No cantrips chosen yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                    <p className="text-xs text-tavern-muted">
                      Choose up to {activeCantripsKnown} ({selectedCantrips.length} selected).
                    </p>
                    <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {cantripOptions.map((s) => {
                        const key = `picker-spell-${s.index}`;
                        return (
                          <PickerOption
                            key={s.index}
                            name={s.name}
                            rightLabel={s.school}
                            description={s.description}
                            selected={selectedCantrips.includes(s.index)}
                            onSelect={() => toggleCantripSelection(s.index, activeCantripsKnown)}
                            detailsExpanded={expandedFeatures.has(key)}
                            onToggleDetails={() => toggleFeature(key)}
                          />
                        );
                      })}
                    </div>
                    <SaveCancelRow
                      pending={spellsPending}
                      onSave={saveCantrips}
                      onCancel={() => setCantripPickerOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {activePreparedCount > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Prepared Spells ({preparedSpellDetails.length}/{activePreparedCount})
                  </h3>
                  {isOwner && !preparedPickerOpen && (
                    <button
                      onClick={openPreparedPicker}
                      className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {!preparedPickerOpen ? (
                  <div className="mt-2 space-y-2">
                    {preparedSpellDetails.map((s) => {
                      const key = `spell-${s.index}`;
                      return (
                        <SpellRow
                          key={key}
                          name={s.name}
                          isHomebrew={s.isHomebrew}
                          metaLine={`Level ${s.level}${s.school ? ` · ${s.school}` : ""}${s.range ? ` · ${s.range}` : ""}${s.concentration ? " · Concentration" : ""}${s.ritual ? " · Ritual" : ""}${s.dcType ? ` · DC ${activeSaveDC} ${s.dcType.toUpperCase()} save` : ""}`}
                          description={s.description}
                          expanded={expandedFeatures.has(key)}
                          onToggle={() => toggleFeature(key)}
                          actions={
                            <>
                              {s.attackType && (
                                <button
                                  onClick={() => rollSpellAttack(s.name, activeAttackBonus)}
                                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                                >
                                  Attack {formatModifier(activeAttackBonus)}
                                </button>
                              )}
                              {s.damageDice && (
                                <button
                                  onClick={() => rollSpellDamage(s.name, s.damageDice!, s.damageType)}
                                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                                >
                                  Damage
                                </button>
                              )}
                              <button
                                onClick={() => castSpell(s.name)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Cast
                              </button>
                            </>
                          }
                        />
                      );
                    })}
                    {preparedSpellDetails.length === 0 && (
                      <p className="text-xs text-tavern-muted">No spells prepared yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                    <p className="text-xs text-tavern-muted">
                      Choose up to {activePreparedCount} ({selectedPrepared.length} selected).
                    </p>
                    <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {preparedOptions.map((s) => {
                        const key = `picker-spell-${s.index}`;
                        return (
                          <PickerOption
                            key={s.index}
                            name={s.name}
                            rightLabel={`Lvl ${s.level} · ${s.school}`}
                            description={s.description}
                            selected={selectedPrepared.includes(s.index)}
                            onSelect={() => togglePreparedSelection(s.index, activePreparedCount)}
                            detailsExpanded={expandedFeatures.has(key)}
                            onToggleDetails={() => toggleFeature(key)}
                          />
                        );
                      })}
                    </div>
                    <SaveCancelRow
                      pending={spellsPending}
                      onSave={savePrepared}
                      onCancel={() => setPreparedPickerOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}
            {sheet.subclassPreparedSpells.length > 0 && (() => {
              const attackBonus = sheet.spellAttackBonus ?? 0;
              const saveDC = sheet.spellSaveDC ?? 0;
              const findSpell = (idx: string) => subclassSpellData.find((s) => s.index === idx) ?? null;
              return (
                <div className="mt-4 space-y-2 rounded-md border border-tavern-border p-3">
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Subclass Spells (Always Prepared)
                  </div>
                  <p className="text-xs text-tavern-muted">
                    Granted by your subclass — always prepared and don&apos;t count against your
                    prepared-spell limit. Cast using your normal spell slots.
                  </p>
                  {sheet.subclassPreparedSpells.map((sp) => {
                    const spell = findSpell(sp.index);
                    const key = `subclass-spell-${sp.index}`;
                    const expanded = expandedFeatures.has(key);
                    const damageDice = spell?.level === 0 && spell ? getCantripDamageDice(spell) : spell?.damageDice ?? null;
                    return (
                      <div key={key} className="rounded-md border border-tavern-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button onClick={() => toggleFeature(key)} className="flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-heading font-bold text-tavern-text">{sp.name}</span>
                              {spell?.description && (
                                <span className="text-xs text-tavern-muted">{expanded ? "▴" : "▾"}</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-tavern-muted">
                              {spell ? (spell.level === 0 ? "Cantrip" : `Level ${spell.level}`) : `Unlocked at level ${sp.unlockLevel}`}
                              {spell?.school ? ` · ${spell.school}` : ""}
                              {spell?.range ? ` · ${spell.range}` : ""}
                              {spell?.concentration ? " · Concentration" : ""}
                              {spell?.dcType ? ` · DC ${saveDC} ${spell.dcType.toUpperCase()} save` : ""}
                            </div>
                          </button>
                          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                            {spell?.attackType && (
                              <button
                                onClick={() => rollSpellAttack(sp.name, attackBonus)}
                                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                              >
                                Attack {formatModifier(attackBonus)}
                              </button>
                            )}
                            {damageDice && (
                              <button
                                onClick={() => rollSpellDamage(sp.name, damageDice, spell?.damageType ?? null)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Damage
                              </button>
                            )}
                            <button
                              onClick={() => castSpell(sp.name)}
                              className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                            >
                              Cast
                            </button>
                          </div>
                        </div>
                        {expanded && spell?.description && (
                          <p className="mt-2 border-t border-tavern-border pt-2 text-xs whitespace-pre-line text-tavern-muted">
                            {spell.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {(sheet.lineageSpells.length > 0 || sheet.lineageCantripTrait !== null || sheet.speciesCantrip) && (() => {
              const cantrips = [
                ...sheet.lineageSpells.filter((s) => s.unlockLevel === 1),
                // Tiefling's Thaumaturgy (base-species at-will cantrip) — shown
                // alongside the lineage cantrips with the same at-will treatment.
                ...(sheet.speciesCantrip
                  ? [{ name: sheet.speciesCantrip, traitIndex: "species-cantrip", unlockLevel: 1 }]
                  : []),
              ];
              const leveled = sheet.lineageSpells.filter((s) => s.unlockLevel > 1 && sheet.level >= s.unlockLevel);
              if (cantrips.length === 0 && leveled.length === 0 && !sheet.lineageCantripTrait) return null;
              const currentCantrip = play.lineageCantrip ?? sheet.lineageCantripTrait?.defaultCantrip ?? null;
              const lineageAttackBonus = sheet.lineageSpellAttackBonus ?? 0;
              const lineageSaveDC = sheet.lineageSpellSaveDC ?? 0;
              // Look up full spell details from the lineage class spell list
              const findSpell = (name: string) => lineageCantripSpells.find((s) => s.name === name) ?? null;
              const cantripOptions = lineageCantripSpells.filter((s) => s.level === 0);
              return (
                <div className="mt-4 space-y-2 rounded-md border border-tavern-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                      Lineage Spells
                    </div>
                    {sheet.lineageSpellSaveDC !== null && (
                      <div className="text-xs text-tavern-muted">
                        DC {lineageSaveDC} · Attack {formatModifier(lineageAttackBonus)}
                      </div>
                    )}
                  </div>
                  {cantrips.map((s) => {
                    const spell = findSpell(s.name);
                    const key = `lineage-cantrip-fixed-${s.traitIndex}`;
                    const expanded = expandedFeatures.has(key);
                    const damageDice = spell ? getCantripDamageDice(spell) : null;
                    return (
                      <div key={key} className="rounded-md border border-tavern-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button onClick={() => toggleFeature(key)} className="flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-heading font-bold text-tavern-text">{s.name}</span>
                              <span className="text-xs text-tavern-muted">{expanded ? "▴" : "▾"}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-tavern-muted">
                              {spell && spell.level > 0 ? `Level ${spell.level}` : "Cantrip"} · At-will
                              {spell?.range ? ` · ${spell.range}` : ""}
                              {spell?.concentration ? " · Concentration" : ""}
                              {spell?.dcType ? ` · DC ${lineageSaveDC} ${spell.dcType.toUpperCase()} save` : ""}
                            </div>
                          </button>
                          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                            {spell?.attackType && (
                              <button
                                onClick={() => rollSpellAttack(s.name, lineageAttackBonus)}
                                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                              >
                                Attack {formatModifier(lineageAttackBonus)}
                              </button>
                            )}
                            {damageDice && (
                              <button
                                onClick={() => rollSpellDamage(s.name, damageDice, spell?.damageType ?? null)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Damage
                              </button>
                            )}
                            {!spell?.attackType && !damageDice && (
                              <button
                                onClick={() => castSpell(s.name)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Cast
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && spell?.description && (
                          <p className="mt-2 border-t border-tavern-border pt-2 text-xs whitespace-pre-line text-tavern-muted">
                            {spell.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {sheet.lineageCantripTrait !== null && !lineageCantripPickerOpen && (() => {
                    const spell = currentCantrip ? findSpell(currentCantrip) : null;
                    const key = `lineage-cantrip-swap-${sheet.lineageCantripTrait.traitIndex}`;
                    const expanded = expandedFeatures.has(key);
                    const damageDice = spell ? getCantripDamageDice(spell) : null;
                    return (
                      <div className="rounded-md border border-tavern-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button onClick={() => toggleFeature(key)} className="flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-heading font-bold text-tavern-text">{currentCantrip}</span>
                              <span className="text-xs text-tavern-muted">{expanded ? "▴" : "▾"}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-tavern-muted">
                              Cantrip · At-will
                              {spell?.range ? ` · ${spell.range}` : ""}
                              {spell?.concentration ? " · Concentration" : ""}
                              {spell?.dcType ? ` · DC ${lineageSaveDC} ${spell.dcType.toUpperCase()} save` : ""}
                            </div>
                          </button>
                          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                            {spell?.attackType && (
                              <button
                                onClick={() => rollSpellAttack(currentCantrip!, lineageAttackBonus)}
                                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                              >
                                Attack {formatModifier(lineageAttackBonus)}
                              </button>
                            )}
                            {damageDice && (
                              <button
                                onClick={() => rollSpellDamage(currentCantrip!, damageDice, spell?.damageType ?? null)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Damage
                              </button>
                            )}
                            {!spell?.attackType && !damageDice && (
                              <button
                                onClick={() => castSpell(currentCantrip!)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Cast
                              </button>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => setLineageCantripPickerOpen(true)}
                                className="rounded-md border border-tavern-border px-2 py-1.5 text-xs text-tavern-muted hover:border-tavern-gold-light hover:text-tavern-gold-light"
                              >
                                Change
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && spell?.description && (
                          <p className="mt-2 border-t border-tavern-border pt-2 text-xs whitespace-pre-line text-tavern-muted">
                            {spell.description}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {sheet.lineageCantripTrait !== null && lineageCantripPickerOpen && (
                    <div className="rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                      <p className="mb-2 text-xs font-bold text-tavern-gold-light">Choose Cantrip</p>
                      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {cantripOptions.map((s) => (
                          <button
                            key={s.index}
                            onClick={() => {
                              setPlay((p) => ({ ...p, lineageCantrip: s.name }));
                              setLineageCantripPickerOpen(false);
                            }}
                            className={`rounded-md border px-2 py-1.5 text-left text-xs ${
                              s.name === currentCantrip
                                ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold"
                                : "border-tavern-border text-tavern-text hover:border-tavern-gold-light"
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setLineageCantripPickerOpen(false)}
                        className="mt-2 text-xs text-tavern-muted hover:text-tavern-gold-light"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {leveled.map((s) => {
                    const spell = findSpell(s.name);
                    const isUsed = s.unlockLevel === 3 ? play.usedLineageSpell3 : play.usedLineageSpell5;
                    const markUsed = s.unlockLevel === 3
                      ? () => { setPlay((p) => ({ ...p, usedLineageSpell3: true })); castSpell(s.name); }
                      : () => { setPlay((p) => ({ ...p, usedLineageSpell5: true })); castSpell(s.name); };
                    const key = `lineage-spell-${s.traitIndex}`;
                    const expanded = expandedFeatures.has(key);
                    return (
                      <div key={key} className="rounded-md border border-tavern-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button onClick={() => toggleFeature(key)} className="flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-heading font-bold text-tavern-text">{s.name}</span>
                              <span className="text-xs text-tavern-muted">{expanded ? "▴" : "▾"}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-tavern-muted">
                              Level {spell?.level ?? s.unlockLevel} · Always prepared · 1× free per Long Rest
                              {spell?.range ? ` · ${spell.range}` : ""}
                              {spell?.concentration ? " · Concentration" : ""}
                              {spell?.dcType ? ` · DC ${lineageSaveDC} ${spell.dcType.toUpperCase()} save` : ""}
                            </div>
                          </button>
                          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                            {spell?.attackType && (
                              <button
                                onClick={() => rollSpellAttack(s.name, lineageAttackBonus)}
                                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                              >
                                Attack {formatModifier(lineageAttackBonus)}
                              </button>
                            )}
                            {spell?.damageDice && (
                              <button
                                onClick={() => rollSpellDamage(s.name, spell.damageDice!, spell.damageType)}
                                className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                              >
                                Damage
                              </button>
                            )}
                            <button
                              onClick={markUsed}
                              disabled={isUsed}
                              className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              {isUsed ? "Used" : "Cast Free"}
                            </button>
                          </div>
                        </div>
                        {expanded && spell?.description && (
                          <p className="mt-2 border-t border-tavern-border pt-2 text-xs whitespace-pre-line text-tavern-muted">
                            {spell.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>)}
          </div>
        )}

        {/* Species Traits */}
        {speciesTraits.length > 0 && (
          <div id="species-traits" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <CardHeader
              title="Species Traits"
              collapsed={collapsedSections.has("species-traits")}
              onToggle={() => toggleSection("species-traits")}
            />
            {!collapsedSections.has("species-traits") && (
            <div className="mt-3 space-y-1">
              {speciesTraits.map((trait) => (
                <ExpandableRow
                  key={trait.index}
                  name={trait.name}
                  rightLabel={trait.level > 1 ? `Lvl ${trait.level}` : null}
                  description={trait.description}
                  expanded={expandedFeatures.has(trait.index)}
                  onToggle={() => toggleFeature(trait.index)}
                />
              ))}
            </div>
            )}
          </div>
        )}

        {/* Features */}
        {unlockedFeatures.length > 0 && (
          <div id="features" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <CardHeader
              title="Features"
              collapsed={collapsedSections.has("features")}
              onToggle={() => toggleSection("features")}
            />
            {!collapsedSections.has("features") && (
            <div className="mt-3 space-y-1">
              {unlockedFeatures.map((feature) => {
                return (
                  <ExpandableRow
                    key={feature.index}
                    name={feature.name}
                    rightLabel={`Lvl ${feature.level}`}
                    description={feature.description}
                    expanded={expandedFeatures.has(feature.index)}
                    onToggle={() => toggleFeature(feature.index)}
                  />
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Attacks */}
        {(weapons.length > 0 || clsLvl("paladin") > 0) && (
          <div id="attacks" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <CardHeader
              title="Attacks"
              collapsed={collapsedSections.has("attacks")}
              onToggle={() => toggleSection("attacks")}
            />
            {!collapsedSections.has("attacks") && (<>
            {sheet.attacksPerAction > 1 && (
              <div className="mt-3 rounded-md border border-tavern-gold/40 bg-tavern-gold/5 p-3">
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Extra Attack
                </div>
                <div className="text-xs text-tavern-muted">
                  When you take the Attack action, you make {sheet.attacksPerAction} attacks instead
                  of one — tap Attack that many times. (Two-Weapon Fighting, Sneak Attack, and
                  bonus-action attacks are separate from this.)
                </div>
              </div>
            )}
            {sheet.sneakAttackDice && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading font-bold text-tavern-text">Sneak Attack</div>
                  <div className="text-xs text-tavern-muted">
                    Once per turn, with Advantage or an ally adjacent to the target, on a hit with a
                    Finesse or Ranged weapon.
                  </div>
                </div>
                <button
                  onClick={rollSneakAttack}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll {sheet.sneakAttackDice}d6
                </button>
              </div>
            )}
            {sheet.brutalStrikeDice > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading font-bold text-tavern-text">Brutal Strike</div>
                  <div className="text-xs text-tavern-muted">
                    Forgo Reckless Attack&apos;s Advantage on one Strength attack to deal extra
                    damage and trigger an effect (see Features for the options).
                  </div>
                </div>
                <button
                  onClick={rollBrutalStrike}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll {sheet.brutalStrikeDice}d10
                </button>
              </div>
            )}
            {clsLvl("monk") > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading font-bold text-tavern-text">Deflect Attacks</div>
                  <div className="text-xs text-tavern-muted">
                    Reaction to reduce an attack&apos;s damage against you. Apply the result
                    manually against the incoming damage.
                  </div>
                </div>
                <button
                  onClick={rollDeflectAttacks}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll 1d10{formatModifier(sheet.modifiers.dex + sheet.level)}
                </button>
              </div>
            )}
            {clsLvl("monk") >= 17 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading font-bold text-tavern-text">Quivering Palm</div>
                  <div className="text-xs text-tavern-muted">
                    Costs 4 Focus Points to set up on a hit (spend via the Focus Points stepper
                    above); ending it later forces a CON save vs your Save DC for this damage.
                  </div>
                </div>
                <button
                  onClick={rollQuiveringPalm}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll 10d12
                </button>
              </div>
            )}
            {clsLvl("paladin") > 0 && (
              <div className="mt-3 rounded-md border border-tavern-border p-3">
                <div className="mb-2">
                  <div className="font-heading font-bold text-tavern-text">Divine Smite</div>
                  <div className="text-xs text-tavern-muted">
                    On a melee weapon hit, expend a spell slot for extra Radiant damage — 2d8 at
                    slot level 1, +1d8 per level above 1st (max 5d8). Spend the slot via Spell Slots
                    above.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4].map((slotLevel) => {
                    const total = sheet.spellSlots[slotLevel - 1] ?? 0;
                    if (total === 0) return null;
                    const available = total - (play.expendedSlots[slotLevel - 1] ?? 0);
                    const dice = Math.min(slotLevel + 1, 5);
                    return (
                      <button
                        key={slotLevel}
                        onClick={() => rollDivineSmite(slotLevel)}
                        disabled={available === 0}
                        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-40"
                      >
                        {dice}d8 Lv.{slotLevel} ({available}/{total})
                      </button>
                    );
                  })}
                  {sheet.spellSlots.every((n) => n === 0) && (
                    <span className="text-xs text-tavern-muted italic">Spell slots unlock at level 2.</span>
                  )}
                </div>
              </div>
            )}
            {clsLvl("paladin") >= 11 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading font-bold text-tavern-text">Improved Divine Smite</div>
                  <div className="text-xs text-tavern-muted">
                    Your melee weapon hits deal an extra 1d8 Radiant damage automatically.
                  </div>
                </div>
                <button
                  onClick={rollImprovedDivineSmite}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Roll 1d8
                </button>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {weapons.map((weapon, i) => (
                <div
                  key={`${weapon.index}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border p-3"
                >
                  <div>
                    <div className="font-heading font-bold text-tavern-text">{weapon.name}</div>
                    <div className="text-xs text-tavern-muted">
                      {weapon.damageDice} {formatModifier(weapon.damageBonus)}
                      {weapon.damageType ? ` ${weapon.damageType}` : ""}
                      {weapon.mastery ? ` — ${weapon.mastery.name}` : ""}
                      {weapon.range ? ` · ${weapon.range}` : ""}
                    </div>
                    {weapon.mastery && (() => {
                      const desc = masteryProperties.find((p) => p.index === weapon.mastery!.index)?.description;
                      return desc ? <div className="mt-0.5 text-xs text-tavern-muted italic">{desc}</div> : null;
                    })()}
                    {weapon.bonusDamageDice && (
                      <div className="mt-0.5 text-xs text-tavern-gold-light italic">
                        +{weapon.bonusDamageDice} bonus damage
                        {weapon.bonusDamageCondition ? ` ${weapon.bonusDamageCondition}` : ""}
                      </div>
                    )}
                    {weapon.notes && (
                      <div className="mt-0.5 text-xs text-tavern-muted italic">{weapon.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => rollAttack(weapon)}
                      className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                    >
                      Attack {formatModifier(weapon.attackBonus)}
                    </button>
                    <button
                      onClick={() => rollDamage(weapon)}
                      className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                    >
                      Damage
                    </button>
                    {weapon.bonusDamageDice && (
                      <button
                        onClick={() => rollBonusDamage(weapon)}
                        className="rounded-md border border-tavern-gold-light/60 px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light"
                      >
                        Bonus {weapon.bonusDamageDice}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>)}
          </div>
        )}

        {/* Equipment */}
        <div id="equipment" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <CardHeader
            title="Equipment"
            collapsed={collapsedSections.has("equipment")}
            onToggle={() => toggleSection("equipment")}
          />
          {!collapsedSections.has("equipment") && (<>
          <div className="mt-3">
            <CurrencyTracker
              currency={currency}
              isOwner={isOwner}
              error={currencyError}
              onCommit={commitCurrency}
            />
          </div>
          <p className="mt-1 text-xs text-tavern-muted">
            Tap to equip or unequip. Armor and shields affect your AC live.
          </p>
          {/* Encumbrance + attunement summary */}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className={`flex-1 rounded-md border p-2.5 text-xs ${isEncumbered ? "border-tavern-oxblood" : "border-tavern-border"}`}>
              <span className="font-heading font-bold tracking-wider text-tavern-gold-light uppercase">Weight</span>{" "}
              <span className={isEncumbered ? "font-bold text-tavern-oxblood-light" : "text-tavern-text"}>
                {totalWeight % 1 === 0 ? totalWeight : totalWeight.toFixed(1)} / {carryingCapacity} lb
              </span>
              <span className="text-tavern-muted">
                {isEncumbered ? " — over capacity (Encumbered)" : ` — carrying capacity (STR ${sheet.finalScores.str} × 15)`}
              </span>
            </div>
            {magicItems.length > 0 && (
              <div className="rounded-md border border-tavern-border p-2.5 text-xs">
                <span className="font-heading font-bold tracking-wider text-tavern-gold-light uppercase">Attunement</span>{" "}
                <span className={attunedCount >= ATTUNEMENT_MAX ? "font-bold text-tavern-gold-light" : "text-tavern-text"}>
                  {attunedCount} / {ATTUNEMENT_MAX}
                </span>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-1.5">
            {sheet.ownedEquipment
              .filter((item) => !item.isMoney && item.index && !play.removedStartingIndexes.includes(item.index))
              .map((item, i) => {
                const isEquipped = equippedSet.has(item.index!);
                const detailsKey = `equip:${item.index}-${i}`;
                const expanded = expandedFeatures.has(detailsKey);
                const details = equipmentDetailLines(equipmentByIndex.get(item.index!));
                return (
                  <div
                    key={detailsKey}
                    className={`rounded-md border p-2.5 ${
                      isEquipped ? "border-tavern-gold bg-tavern-bg" : "border-tavern-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => toggleEquipped(item.index!)}
                        className={`flex flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
                          isEquipped ? "text-tavern-text" : "text-tavern-muted"
                        }`}
                      >
                        <span>
                          {item.count > 1 ? `${item.count}× ` : ""}
                          {item.name}
                        </span>
                        <span className="text-xs uppercase">{isEquipped ? "Equipped" : "Stowed"}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {details.length > 0 && (
                          <button
                            onClick={() => toggleFeature(detailsKey)}
                            className="px-1 text-xs text-tavern-muted hover:text-tavern-gold-light"
                          >
                            {expanded ? "▲" : "▼"}
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => removeStartingItem(item.index!)}
                            className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && details.length > 0 && (
                      <p className="mt-1.5 border-t border-tavern-border pt-1.5 text-xs whitespace-pre-line text-tavern-muted">
                        {details.join("\n")}
                      </p>
                    )}
                  </div>
                );
              })}

            {inventory.map((item) => {
              const base = equipmentByIndex.get(item.baseIndex);
              const isEquipped = equippedSet.has(item.id);
              const bonusParts = [
                item.attackBonus ? `${formatModifier(item.attackBonus)} Attack` : null,
                item.damageBonus ? `${formatModifier(item.damageBonus)} Damage` : null,
                item.acBonus ? `${formatModifier(item.acBonus)} AC` : null,
                item.bonusDamageDice
                  ? `+${item.bonusDamageDice}${item.bonusDamageCondition ? ` ${item.bonusDamageCondition}` : ""}`
                  : null,
              ].filter(Boolean);
              const detailsKey = `inv:${item.id}`;
              const expanded = expandedFeatures.has(detailsKey);
              const baseDetails = equipmentDetailLines(base);
              return (
                <div
                  key={item.id}
                  className={`rounded-md border p-2.5 ${
                    isEquipped ? "border-tavern-gold bg-tavern-bg" : "border-tavern-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => toggleEquipped(item.id)}
                      className={`flex flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
                        isEquipped ? "text-tavern-text" : "text-tavern-muted"
                      }`}
                    >
                      <span>
                        {item.count > 1 ? `${item.count}× ` : ""}
                        {item.customName ?? base?.name ?? item.baseIndex}
                      </span>
                      <span className="text-xs uppercase">{isEquipped ? "Equipped" : "Stowed"}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {baseDetails.length > 0 && (
                        <button
                          onClick={() => toggleFeature(detailsKey)}
                          className="px-1 text-xs text-tavern-muted hover:text-tavern-gold-light"
                        >
                          {expanded ? "▲" : "▼"}
                        </button>
                      )}
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setEditingInventoryItem(item)}
                            className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveInventoryItem(item.id)}
                            className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {(bonusParts.length > 0 || item.notes) && (
                    <p className="mt-1.5 text-xs text-tavern-muted">
                      {bonusParts.join(", ")}
                      {bonusParts.length > 0 && item.notes ? " — " : ""}
                      {item.notes}
                    </p>
                  )}
                  {expanded && baseDetails.length > 0 && (
                    <p className="mt-1.5 border-t border-tavern-border pt-1.5 text-xs whitespace-pre-line text-tavern-muted">
                      {baseDetails.join("\n")}
                    </p>
                  )}
                </div>
              );
            })}

            {magicItems.map((item) => {
              const lookup = item.magicItemIndex ? magicItemByIndex.get(item.magicItemIndex) : undefined;
              const isEquipped = equippedMagicItemSet.has(item.id);
              const isAttuned = attunedSet.has(item.id);
              // Real items expose whether they need attunement; homebrew
              // (no index) could require it, so it's allowed there too.
              const canAttune = (lookup?.requiresAttunement ?? false) || !item.magicItemIndex;
              const summaryParts = [
                item.acBonus ? `${formatModifier(item.acBonus)} AC` : null,
                lookup?.requiresAttunement ? "Requires Attunement" : null,
                item.notes,
              ].filter(Boolean);
              const detailsKey = `magic:${item.id}`;
              const expanded = expandedFeatures.has(detailsKey);
              const details = magicItemDetailLines(lookup);
              return (
                <div
                  key={item.id}
                  className={`rounded-md border p-2.5 ${
                    isEquipped ? "border-tavern-gold bg-tavern-bg" : "border-tavern-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => toggleMagicItemEquipped(item.id)}
                      className={`flex flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
                        isEquipped ? "text-tavern-text" : "text-tavern-muted"
                      }`}
                    >
                      <span>
                        {item.count > 1 ? `${item.count}× ` : ""}
                        {item.customName ?? lookup?.name ?? "Unknown Item"}
                      </span>
                      <span className="text-xs uppercase">{isEquipped ? "Equipped" : "Stowed"}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {canAttune && (
                        <button
                          onClick={() => toggleAttunement(item.id)}
                          disabled={!isAttuned && attunedCount >= ATTUNEMENT_MAX}
                          title={!isAttuned && attunedCount >= ATTUNEMENT_MAX ? "You're already attuned to 3 items" : undefined}
                          className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                            isAttuned
                              ? "border-tavern-gold bg-tavern-gold/15 text-tavern-gold-light"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light disabled:opacity-30"
                          }`}
                        >
                          {isAttuned ? "Attuned" : "Attune"}
                        </button>
                      )}
                      {details.length > 0 && (
                        <button
                          onClick={() => toggleFeature(detailsKey)}
                          className="px-1 text-xs text-tavern-muted hover:text-tavern-gold-light"
                        >
                          {expanded ? "▲" : "▼"}
                        </button>
                      )}
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setEditingMagicItem(item)}
                            className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveMagicItem(item.id)}
                            className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {summaryParts.length > 0 && (
                    <p className="mt-1.5 text-xs text-tavern-muted">{summaryParts.join(" — ")}</p>
                  )}
                  {expanded && details.length > 0 && (
                    <p className="mt-1.5 border-t border-tavern-border pt-1.5 text-xs whitespace-pre-line text-tavern-muted">
                      {details.join("\n")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {isOwner && !inventoryManagerOpen && !editingInventoryItem && !magicItemManagerOpen && !editingMagicItem && (
            <div className="mt-4 flex gap-4">
              <button
                onClick={() => setInventoryManagerOpen(true)}
                className="text-xs text-tavern-gold-light hover:text-tavern-gold"
              >
                + Add Equipment
              </button>
              <button
                onClick={() => setMagicItemManagerOpen(true)}
                className="text-xs text-tavern-gold-light hover:text-tavern-gold"
              >
                + Add Magic Item
              </button>
            </div>
          )}
          {inventoryError && <p className="mt-2 text-xs text-tavern-oxblood-light">{inventoryError}</p>}
          {magicItemError && <p className="mt-2 text-xs text-tavern-oxblood-light">{magicItemError}</p>}
          {isOwner && (inventoryManagerOpen || editingInventoryItem) && (
            <InventoryManager
              equipmentLookup={equipmentByIndex}
              editingItem={editingInventoryItem}
              onSave={handleSaveInventoryItem}
              onClose={() => {
                setInventoryManagerOpen(false);
                setEditingInventoryItem(null);
              }}
            />
          )}
          {isOwner && (magicItemManagerOpen || editingMagicItem) && (
            <MagicItemManager
              magicItemLookup={magicItemByIndex}
              editingItem={editingMagicItem}
              onSave={handleSaveMagicItem}
              onClose={() => {
                setMagicItemManagerOpen(false);
                setEditingMagicItem(null);
              }}
            />
          )}
          </>)}
        </div>

        <CharacterPersonality
          characterId={characterId}
          initialPersonality={personality}
          isOwner={isOwner}
          sheet={sheet}
        />

        <CharacterNotes characterId={characterId} initialNotes={notes} isOwner={isOwner} />

        <p className="mt-6 text-xs text-tavern-muted">
          This is an early version of the play sheet — custom items, per-class resources
          (Rage, Spell Slots, etc.), and the full rules-explanation panels from the original
          Angrenor sheet are coming in a future pass.
        </p>
      </div>

      <DiceLog
        entries={diceLog}
        rollMode={play.rollMode}
        onRollModeChange={(mode) => setPlay((prev) => ({ ...prev, rollMode: mode }))}
        onCritRoll={handleCritRoll}
        onRoll={pushLog}
        onClear={() => setDiceLog([])}
        lucky={isHalfling}
      />
    </div>
  );
}
