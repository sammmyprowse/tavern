"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ABILITY_ORDER,
  formatModifier,
  hpGainForLevelUp,
  fixedAverageHpGain,
  MAX_LEVEL,
  ORDER_CHOICES,
  ASI_LEVELS,
  EXPERTISE_SCHEDULE,
  METAMAGIC_OPTIONS,
  magicalCunningRegain,
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
import {
  levelUpCharacter,
  chooseSubclass,
  chooseOriginOrder,
  chooseFeat,
  chooseExpertise,
  setKnownCantrips,
  setPreparedSpells,
  setMetamagicChoices,
  setFightingStyleChoices,
  setCharacterInventory,
  setCharacterCurrency,
} from "@/app/characters/actions";
import { resolveInventoryEquipment, type InventoryItem } from "@/lib/inventory";
import { deriveStartingCurrency, type Currency } from "@/lib/currency";
import { equipmentDetailLines } from "@/lib/equipment-details";
import InventoryManager from "./InventoryManager";
import CurrencyTracker from "./CurrencyTracker";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  SkillInfo,
  EquipmentLookupItem,
  ClassFeature,
  SubclassOption,
  FeatOption,
  SpellOption,
} from "@/lib/srd";
import DiceLog from "./DiceLog";
import ShareControl from "./ShareControl";
import CharacterAvatar from "./CharacterAvatar";
import CharacterBio from "./CharacterBio";
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
  features: ClassFeature[];
  subclassOptions: SubclassOption[];
  generalFeats: FeatOption[];
  fightingStyleFeats: FeatOption[];
  traitDescriptions: Record<string, string>;
  classSpells: SpellOption[];
  isOwner: boolean;
  isPublic: boolean;
  avatarUrl: string | null;
  bio: string | null;
  personality: PersonalityAnswers | null;
  inventory: InventoryItem[];
  currency: Currency | null;
}

interface PlayState {
  currentHp: number;
  tempHp: number;
  hitDiceUsed: number;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  equippedIndexes: string[];
  rollMode: RollMode;
  // expendedSlots[i] = slots used at spell level i+1. Play state, not part of
  // the saved draft — resets every Long Rest the same way hit dice used does.
  expendedSlots: number[];
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
  expendedStonecunning: number;
  expendedAdrenalineRush: number;
  usedLargeForm: boolean;
  // Relentless Endurance (Orc): "drop to 1 Hit Point instead" the first
  // time you'd be reduced to 0 each Long Rest — checked automatically by
  // applyDamage below, not a button the player clicks.
  usedRelentlessEndurance: boolean;
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
  features,
  subclassOptions,
  generalFeats,
  fightingStyleFeats,
  traitDescriptions,
  classSpells,
  isOwner,
  isPublic,
  avatarUrl,
  bio,
  personality,
  inventory: initialInventory,
  currency: initialCurrency,
}: PlaySheetProps) {
  const storageKey = `tavern_play_${characterId}`;
  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));
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
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [subclassPending, setSubclassPending] = useState(false);
  const [selectedSubclassIndex, setSelectedSubclassIndex] = useState<string | null>(null);
  const [orderPending, setOrderPending] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [featPickerLevel, setFeatPickerLevel] = useState<number | null>(null);
  const [selectedFeatIndex, setSelectedFeatIndex] = useState<string | null>(null);
  const [asiBonus, setAsiBonus] = useState<AbilityBonusChoice | null>(null);
  const [featPending, setFeatPending] = useState(false);
  const [expertisePickerLevel, setExpertisePickerLevel] = useState<number | null>(null);
  const [selectedExpertiseSkills, setSelectedExpertiseSkills] = useState<string[]>([]);
  const [expertisePending, setExpertisePending] = useState(false);
  const [cantripPickerOpen, setCantripPickerOpen] = useState(false);
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

  const allOwnedIndexes = (sheet?.ownedEquipment ?? [])
    .map((i) => i.index)
    .filter((i): i is string => Boolean(i));

  const defaultPlayState: PlayState = {
    currentHp: sheet ? sheet.maxHpValue : 1,
    tempHp: 0,
    hitDiceUsed: 0,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    equippedIndexes: allOwnedIndexes,
    rollMode: "normal",
    expendedSlots: [],
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
    expendedStonecunning: 0,
    expendedAdrenalineRush: 0,
    usedLargeForm: false,
    usedRelentlessEndurance: false,
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

  const equippedSet = new Set(play.equippedIndexes);
  const hasDefenseFightingStyle = currentDraft.fightingStyleChoices.includes("defense");
  const hasArcheryFightingStyle = currentDraft.fightingStyleChoices.includes("archery");
  // Unarmored Defense (Barbarian: 10+DEX+CON; Monk: 10+DEX+WIS — both "while
  // you aren't wearing armor," Monk also excludes wielding a Shield, already
  // handled by computeArmorClass's existing bodyArmor branch either way).
  // Only takes effect while unarmored, so passing it unconditionally for
  // either class is safe.
  const unarmoredDefenseBonus =
    sheet.classIndex === "barbarian"
      ? sheet.modifiers.con
      : sheet.classIndex === "monk"
        ? sheet.modifiers.wis
        : 0;
  const rageDamageBonusWhileRaging =
    sheet.classIndex === "barbarian" && play.isRaging ? sheet.rageDamageBonus : 0;
  const monkMartialArtsDie = sheet.classIndex === "monk" ? sheet.martialArtsDie : null;
  const allOwnedBundleItems = [...sheet.ownedEquipment, ...inventoryBundleItems];
  const ac = computeAC(
    allOwnedBundleItems,
    augmentedLookup,
    equippedSet,
    sheet.modifiers.dex,
    hasDefenseFightingStyle,
    unarmoredDefenseBonus,
    sheet.naturalArmorAC,
  );
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
      }
    : null;
  const weapons = [
    ...(monkUnarmedStrike ? [monkUnarmedStrike] : []),
    ...resolveWeapons(
      allOwnedBundleItems,
      augmentedLookup,
      sheet.modifiers,
      sheet.proficiencyBonus,
      hasArcheryFightingStyle,
      rageDamageBonusWhileRaging,
      monkMartialArtsDie,
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
  const displaySpeed =
    sheet.classIndex === "monk" && sheet.speed != null && !wearingArmorOrShield
      ? sheet.speed + sheet.unarmoredMovementBonus
      : sheet.speed;
  const maxHp = sheet.maxHpValue;
  const totalHitDice = sheet.level;
  const isDying = play.currentHp <= 0;

  const orderOptions = ORDER_CHOICES[sheet.classIndex] ?? null;
  const needsOrderChoice = !!orderOptions && !currentDraft.orderChoice;
  const chosenOrder = orderOptions?.find((o) => o.key === currentDraft.orderChoice) ?? null;

  const needsSubclassChoice =
    sheet.level >= 3 && !currentDraft.subclassIndex && subclassOptions.length > 0;
  const chosenSubclass = subclassOptions.find((s) => s.index === currentDraft.subclassIndex) ?? null;
  // For classes with only one SRD subclass, the source data already flattens
  // some subclass features into the base `features` table too (e.g. Cleric's
  // "Disciple of Life") — dedupe by name so those don't show twice.
  const baseFeatureNames = new Set(features.map((f) => f.name));
  const subclassFeatures: ClassFeature[] = chosenSubclass
    ? chosenSubclass.features
        .filter((f) => !baseFeatureNames.has(f.name))
        .map((f) => ({
          index: `${chosenSubclass.index}-${f.name}`,
          name: f.name,
          level: f.level,
          description: f.description,
        }))
    : [];

  const pendingAsiLevels = ASI_LEVELS.filter(
    (lvl) => lvl <= sheet.level && !currentDraft.featChoices.some((fc) => fc.level === lvl),
  );
  const takenFeatIndexes = new Set(currentDraft.featChoices.map((fc) => fc.featIndex));
  const featFeatures: ClassFeature[] = currentDraft.featChoices.map((fc) => {
    const opt = generalFeats.find((f) => f.index === fc.featIndex);
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
  const resolvedFeatLevels = new Set(currentDraft.featChoices.map((fc) => fc.level));
  const baseFeaturesWithoutResolvedAsi = features.filter(
    (f) => !(f.name === "Ability Score Improvement" && resolvedFeatLevels.has(f.level)),
  );

  const unlockedFeatures = [...baseFeaturesWithoutResolvedAsi, ...subclassFeatures, ...featFeatures]
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

  const expertiseSchedule = EXPERTISE_SCHEDULE[sheet.classIndex] ?? [];
  const pendingExpertiseMilestone = expertiseSchedule.find((m) => {
    const priorCount = expertiseSchedule
      .filter((x) => x.level < m.level)
      .reduce((sum, x) => sum + x.count, 0);
    return m.level <= sheet.level && currentDraft.expertiseChoices.length === priorCount;
  });
  const expertiseEligibleSkills = sheet.skills.filter(
    (s) => s.proficient && !currentDraft.expertiseChoices.includes(s.index),
  );

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
    (sheet.classIndex === "warlock" && sheet.spellSlots.some((n) => n > 0));

  const cantripOptions = classSpells.filter((s) => s.level === 0);
  // Spells of a level you have no slots for yet aren't preparable.
  const maxSpellLevel = sheet.spellSlots.reduce(
    (max, count, i) => (count > 0 ? i + 1 : max),
    0,
  );
  const preparedOptions = classSpells.filter((s) => s.level >= 1 && s.level <= maxSpellLevel);
  const knownCantripDetails = currentDraft.knownCantrips
    .map((index) => cantripOptions.find((s) => s.index === index))
    .filter((s): s is SpellOption => Boolean(s));
  const preparedSpellDetails = currentDraft.preparedSpells
    .map((index) => preparedOptions.find((s) => s.index === index))
    .filter((s): s is SpellOption => Boolean(s))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const knownMetamagicDetails = currentDraft.metamagicChoices
    .map((key) => METAMAGIC_OPTIONS.find((m) => m.key === key))
    .filter((m): m is MetamagicOption => Boolean(m));
  const knownFightingStyleDetails = currentDraft.fightingStyleChoices
    .map((index) => fightingStyleFeats.find((f) => f.index === index))
    .filter((f): f is FeatOption => Boolean(f));

  function pushLog(entry: Omit<DiceLogEntry, "id">) {
    setDiceLog((prev) => [{ ...entry, id: prev.length + Date.now() }, ...prev].slice(0, 50));
  }

  function rollCheck(label: string, modifier: number) {
    const result = rollD20(modifier, play.rollMode);
    pushLog({
      label,
      detail:
        result.rolls.length > 1
          ? `d20 [${result.rolls.join(", ")}] ${formatModifier(modifier)}`
          : `d20 ${formatModifier(modifier)}`,
      total: result.total,
      isNat20: result.isNat20,
      isNat1: result.isNat1,
    });
  }

  function rollAttack(weapon: ReturnType<typeof resolveWeapons>[number]) {
    const result = rollD20(weapon.attackBonus, play.rollMode);
    pushLog({
      label: `${weapon.name} Attack`,
      detail:
        result.rolls.length > 1
          ? `d20 [${result.rolls.join(", ")}] ${formatModifier(weapon.attackBonus)}`
          : `d20 ${formatModifier(weapon.attackBonus)}`,
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

  function toggleEquipped(index: string) {
    setPlay((prev) => {
      const next = new Set(prev.equippedIndexes);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, equippedIndexes: [...next] };
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
      hitDiceUsed: Math.max(0, prev.hitDiceUsed - Math.max(1, Math.ceil(totalHitDice / 2))),
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      expendedSlots: [],
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
      expendedStonecunning: 0,
      expendedAdrenalineRush: 0,
      usedLargeForm: false,
      usedRelentlessEndurance: false,
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
    const bardFontOfInspiration = sheet?.classIndex === "bard" && sheet.level >= 5;
    const warlockPactMagic = sheet?.classIndex === "warlock";
    setPlay((prev) => ({
      ...prev,
      expendedChannelDivinity: Math.max(0, prev.expendedChannelDivinity - 1),
      expendedBardicInspiration: bardFontOfInspiration ? 0 : prev.expendedBardicInspiration,
      expendedWildShape: Math.max(0, prev.expendedWildShape - 1),
      expendedSlots: warlockPactMagic ? [] : prev.expendedSlots,
      expendedSecondWind: Math.max(0, prev.expendedSecondWind - 1),
      expendedActionSurge: 0,
      expendedRage: Math.max(0, prev.expendedRage - 1),
      expendedFocusPoints: 0,
      expendedAdrenalineRush: 0,
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
    const idx = sheet.spellSlots.findIndex((n) => n > 0);
    if (idx < 0) return;
    const regain = magicalCunningRegain(sheet.spellSlots[idx]);
    setPlay((prev) => {
      const next = [...prev.expendedSlots];
      next[idx] = Math.max(0, (next[idx] ?? 0) - regain);
      return { ...prev, expendedSlots: next, usedMagicalCunning: true };
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

  function spendHitDie() {
    if (play.hitDiceUsed >= totalHitDice) return;
    const roll = rollFlatDie(sheet!.hitDie);
    const healed = Math.max(1, roll + sheet!.modifiers.con);
    pushLog({
      label: "Hit Die",
      detail: `d${sheet!.hitDie} ${roll} ${formatModifier(sheet!.modifiers.con)}`,
      total: healed,
    });
    setPlay((prev) => ({
      ...prev,
      hitDiceUsed: prev.hitDiceUsed + 1,
      currentHp: Math.min(maxHp, prev.currentHp + healed),
    }));
  }

  async function handleLevelUp(mode: "roll" | "average") {
    if (!sheet || sheet.level >= MAX_LEVEL) return;
    setLevelUpPending(true);
    setLevelUpError(null);

    const dieResult = mode === "roll" ? rollFlatDie(sheet.hitDie) : fixedAverageHpGain(sheet.hitDie);
    const gain = hpGainForLevelUp(sheet.hitDie, sheet.modifiers.con, dieResult);

    const result = await levelUpCharacter(characterId, gain);
    if (result.success && result.draft) {
      pushLog({
        label: `Level Up → ${result.draft.level}`,
        detail:
          mode === "roll"
            ? `d${sheet.hitDie} ${dieResult} ${formatModifier(sheet.modifiers.con)}`
            : `avg d${sheet.hitDie} (${dieResult}) ${formatModifier(sheet.modifiers.con)}`,
        total: gain,
      });
      setCurrentDraft(result.draft);
      setPlay((prev) => ({ ...prev, currentHp: prev.currentHp + gain }));
      setLevelingUp(false);
    } else {
      setLevelUpError(result.error ?? "Couldn't level up.");
    }
    setLevelUpPending(false);
  }

  async function handleChooseSubclass(subclassIndex: string) {
    setSubclassPending(true);
    setChoiceError(null);
    const result = await chooseSubclass(characterId, subclassIndex);
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

  function openFeatPicker(level: number) {
    setFeatPickerLevel(level);
    setSelectedFeatIndex(null);
    setAsiBonus(null);
    setChoiceError(null);
  }

  function cancelFeatPicker() {
    setFeatPickerLevel(null);
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
    if (featPickerLevel == null || !selectedFeatIndex) return;
    setFeatPending(true);
    setChoiceError(null);
    const result = await chooseFeat(characterId, featPickerLevel, selectedFeatIndex, asiBonus);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      cancelFeatPicker();
    } else {
      setChoiceError(result.error ?? "Couldn't choose feat.");
    }
    setFeatPending(false);
  }

  function openExpertisePicker(level: number) {
    setExpertisePickerLevel(level);
    setSelectedExpertiseSkills([]);
    setChoiceError(null);
  }

  function cancelExpertisePicker() {
    setExpertisePickerLevel(null);
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

  async function confirmExpertise() {
    if (expertisePickerLevel == null) return;
    setExpertisePending(true);
    setChoiceError(null);
    const result = await chooseExpertise(characterId, expertisePickerLevel, selectedExpertiseSkills);
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
    setSelectedCantrips(currentDraft.knownCantrips);
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
    const result = await setKnownCantrips(characterId, selectedCantrips);
    if (result.success && result.draft) {
      setCurrentDraft(result.draft);
      setCantripPickerOpen(false);
    } else {
      setChoiceError(result.error ?? "Couldn't save cantrips.");
    }
    setSpellsPending(false);
  }

  function openPreparedPicker() {
    setSelectedPrepared(currentDraft.preparedSpells);
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
    const result = await setPreparedSpells(characterId, selectedPrepared);
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

  function toggleFeature(index: string) {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
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
                  {sheet.className}
                  {chosenSubclass ? ` (${chosenSubclass.name})` : ""}
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

        <SectionNav
          sections={[
            { id: "stats", label: "Stats" },
            { id: "hp", label: "HP & Resources" },
            { id: "abilities", label: "Abilities" },
            { id: "skills", label: "Skills" },
            ...(sheet.fightingStyleKnownMax > 0
              ? [{ id: "fighting-style", label: "Fighting Style" }]
              : []),
            ...(sheet.spellcastingAbility ? [{ id: "spells", label: "Spells" }] : []),
            ...(speciesTraits.length > 0 ? [{ id: "species-traits", label: "Species Traits" }] : []),
            ...(unlockedFeatures.length > 0 ? [{ id: "features", label: "Features" }] : []),
            ...(weapons.length > 0 ? [{ id: "attacks", label: "Attacks" }] : []),
            { id: "equipment", label: "Equipment" },
            ...(personality || isOwner ? [{ id: "personality", label: "Personality" }] : []),
          ]}
        />

        {isOwner && (
          <div className="mt-4">
            {sheet.level >= MAX_LEVEL ? (
              <p className="text-xs tracking-wide text-tavern-muted uppercase">
                Maximum level reached
              </p>
            ) : !levelingUp ? (
              <button
                onClick={() => setLevelingUp(true)}
                className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
              >
                Level Up to {sheet.level + 1}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tavern-gold/40 bg-tavern-card p-3">
                <span className="text-xs text-tavern-muted">
                  Hit points for level {sheet.level + 1} (d{sheet.hitDie}
                  {formatModifier(sheet.modifiers.con)}):
                </span>
                <button
                  onClick={() => handleLevelUp("roll")}
                  disabled={levelUpPending}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                >
                  Roll d{sheet.hitDie}
                </button>
                <button
                  onClick={() => handleLevelUp("average")}
                  disabled={levelUpPending}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:opacity-50"
                >
                  Take Average ({fixedAverageHpGain(sheet.hitDie)})
                </button>
                <button
                  onClick={() => {
                    setLevelingUp(false);
                    setLevelUpError(null);
                  }}
                  disabled={levelUpPending}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
            {levelUpError && (
              <p className="mt-1 text-xs text-tavern-oxblood-light">{levelUpError}</p>
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

        {isOwner && needsSubclassChoice && (
          <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
            <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
              Choose your subclass
            </p>
            {subclassOptions.length === 1 && (
              <p className="mt-1 text-xs text-tavern-muted">
                Only one subclass is in the free SRD right now — more options are coming later.
              </p>
            )}
            <div className="mt-2 space-y-2">
              {subclassOptions.map((opt) => {
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
                      {opt.summary && <p className="mt-1 text-xs text-tavern-muted">{opt.summary}</p>}
                    </button>
                    {isSelected && (
                      <div className="space-y-1 border-t border-tavern-border p-2">
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
            {selectedSubclassIndex && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => handleChooseSubclass(selectedSubclassIndex)}
                  disabled={subclassPending}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                >
                  Confirm {subclassOptions.find((o) => o.index === selectedSubclassIndex)?.name}
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
        )}

        {isOwner &&
          pendingAsiLevels.map((lvl) => (
            <div key={lvl} className="mt-4">
              {featPickerLevel !== lvl ? (
                <button
                  onClick={() => openFeatPicker(lvl)}
                  className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
                >
                  Choose a Feat (Level {lvl})
                </button>
              ) : (
                <div className="rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
                  <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
                    Choose a Feat — Level {lvl}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {generalFeats
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
          ))}

        {isOwner && pendingExpertiseMilestone && (
          <div className="mt-4">
            {expertisePickerLevel !== pendingExpertiseMilestone.level ? (
              <button
                onClick={() => openExpertisePicker(pendingExpertiseMilestone.level)}
                className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
              >
                Choose Expertise ({pendingExpertiseMilestone.count}) — Level {pendingExpertiseMilestone.level}
              </button>
            ) : (
              <div className="rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
                <p className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light uppercase">
                  Choose {pendingExpertiseMilestone.count} Skills for Expertise
                </p>
                <p className="mt-1 text-xs text-tavern-muted">
                  Expertise doubles your proficiency bonus on the chosen skill. Only skills you&apos;re
                  already proficient in are eligible.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {expertiseEligibleSkills.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => toggleExpertiseSkill(s.index, pendingExpertiseMilestone.count)}
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
                      expertisePending || selectedExpertiseSkills.length !== pendingExpertiseMilestone.count
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
        )}

        {choiceError && <p className="mt-1 text-xs text-tavern-oxblood-light">{choiceError}</p>}

        {/* Stat chips */}
        <div id="stats" className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["AC", ac],
            ["Initiative", formatModifier(sheet.initiative)],
            ["Speed", displaySpeed ?? "—"],
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

        {/* HP / resources */}
        <div id="hp" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-heading text-xs tracking-wider text-tavern-muted uppercase">
                Hit Points
              </div>
              <div className="font-heading text-3xl font-bold text-tavern-gold-light">
                {play.currentHp} / {maxHp}
                {play.tempHp > 0 && <span className="text-tavern-muted"> (+{play.tempHp})</span>}
              </div>
            </div>
            <div className="flex gap-2">
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
            <button
              onClick={spendHitDie}
              disabled={play.hitDiceUsed >= totalHitDice}
              className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
            >
              Spend Hit Die ({totalHitDice - play.hitDiceUsed} left)
            </button>
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
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreChannelDivinity}
                    disabled={play.expendedChannelDivinity <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.channelDivinityMax - play.expendedChannelDivinity}/{sheet.channelDivinityMax}
                  </span>
                  <button
                    onClick={expendChannelDivinity}
                    disabled={play.expendedChannelDivinity >= sheet.channelDivinityMax}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    &minus;
                  </button>
                </div>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Bardic Inspiration (d{sheet.bardicInspirationDie})
                </div>
                <div className="text-xs text-tavern-muted">
                  Confer a die as a Bonus Action — see Features below for the full effect. Regains
                  all uses on a Long Rest{sheet.level >= 5 ? " or Short Rest" : ""}.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreBardicInspiration}
                  disabled={play.expendedBardicInspiration <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.bardicInspirationMax - play.expendedBardicInspiration}/
                  {sheet.bardicInspirationMax}
                </span>
                <button
                  onClick={expendBardicInspiration}
                  disabled={play.expendedBardicInspiration >= sheet.bardicInspirationMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
          )}

          {sheet.wildShapeMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Wild Shape
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action to transform — see Features below for known forms and the full
                  effect. Regains 1 use on a Short Rest, all uses on a Long Rest.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreWildShape}
                  disabled={play.expendedWildShape <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.wildShapeMax - play.expendedWildShape}/{sheet.wildShapeMax}
                </span>
                <button
                  onClick={expendWildShape}
                  disabled={play.expendedWildShape >= sheet.wildShapeMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
          )}

          {sheet.favoredEnemyMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Favored Enemy
                </div>
                <div className="text-xs text-tavern-muted">
                  Cast Hunter&apos;s Mark without a spell slot — see Features below for the full
                  effect. Regains all uses on a Long Rest.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreFavoredEnemy}
                  disabled={play.expendedFavoredEnemy <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.favoredEnemyMax - play.expendedFavoredEnemy}/{sheet.favoredEnemyMax}
                </span>
                <button
                  onClick={expendFavoredEnemy}
                  disabled={play.expendedFavoredEnemy >= sheet.favoredEnemyMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Action Surge
                </div>
                <div className="text-xs text-tavern-muted">
                  Take one additional action this turn (not the Magic action). Regains all uses on
                  a Short or Long Rest
                  {sheet.actionSurgeMax > 1 ? " — only once per turn even with 2 uses available." : "."}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreActionSurge}
                  disabled={play.expendedActionSurge <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.actionSurgeMax - play.expendedActionSurge}/{sheet.actionSurgeMax}
                </span>
                <button
                  onClick={expendActionSurge}
                  disabled={play.expendedActionSurge >= sheet.actionSurgeMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
          )}

          {sheet.indomitableMax > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Indomitable
                </div>
                <div className="text-xs text-tavern-muted">
                  Reroll a failed saving throw, adding {formatModifier(sheet.level)} to the new
                  roll. Regains all uses on a Long Rest only.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreIndomitable}
                  disabled={play.expendedIndomitable <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.indomitableMax - play.expendedIndomitable}/{sheet.indomitableMax}
                </span>
                <button
                  onClick={expendIndomitable}
                  disabled={play.expendedIndomitable >= sheet.indomitableMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
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
                <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                  <button
                    onClick={restoreFocusPoint}
                    disabled={play.expendedFocusPoints <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.focusPointsMax - play.expendedFocusPoints}/{sheet.focusPointsMax}
                  </span>
                  <button
                    onClick={expendFocusPoint}
                    disabled={play.expendedFocusPoints >= sheet.focusPointsMax}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    &minus;
                  </button>
                </div>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
              <div>
                <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Stonecunning
                </div>
                <div className="text-xs text-tavern-muted">
                  Bonus Action for Tremorsense (60 ft, on/touching stone) for 10 minutes. Regains
                  all uses on a Long Rest only.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
                <button
                  onClick={restoreStonecunning}
                  disabled={play.expendedStonecunning <= 0}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-heading font-bold text-tavern-text">
                  {sheet.stonecunningMax - play.expendedStonecunning}/{sheet.stonecunningMax}
                </span>
                <button
                  onClick={expendStonecunning}
                  disabled={play.expendedStonecunning >= sheet.stonecunningMax}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                >
                  &minus;
                </button>
              </div>
            </div>
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
          <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            Skills
          </h2>
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
        </div>

        {/* Fighting Style — not gated on spellcastingAbility, unlike Spells
            below: Fighter/Paladin/Ranger all grant this regardless of
            whether the class casts spells. */}
        {sheet.fightingStyleKnownMax > 0 && (
          <div id="fighting-style" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                Fighting Style ({knownFightingStyleDetails.length}/{sheet.fightingStyleKnownMax})
              </h2>
              {isOwner && !fightingStylePickerOpen && (
                <button
                  onClick={openFightingStylePicker}
                  className="text-xs text-tavern-gold-light hover:text-tavern-gold"
                >
                  Edit
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-tavern-muted">
              Only 4 of the real PHB&apos;s Fighting Styles (Archery, Defense, Great Weapon
              Fighting, Two-Weapon Fighting) are in the free SRD. Archery and Defense apply
              automatically above; the other two are situational and applied manually in play.
            </p>

            {!fightingStylePickerOpen ? (
              <div className="mt-2 space-y-1">
                {knownFightingStyleDetails.map((f) => {
                  const key = `fighting-style-${f.index}`;
                  const expanded = expandedFeatures.has(key);
                  return (
                    <div key={key} className="rounded-md border border-tavern-border">
                      <button
                        onClick={() => toggleFeature(key)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                      >
                        <span className="text-tavern-text">{f.name}</span>
                      </button>
                      {expanded && f.description && (
                        <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                          {f.description}
                        </p>
                      )}
                    </div>
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
                    const expanded = expandedFeatures.has(key);
                    const selected = selectedFightingStyle.includes(f.index);
                    return (
                      <div
                        key={f.index}
                        className={`rounded-md border ${
                          selected ? "border-tavern-gold bg-tavern-card" : "border-tavern-border"
                        }`}
                      >
                        <button
                          onClick={() => toggleFightingStyleSelection(f.index, sheet.fightingStyleKnownMax)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                        >
                          <span className="text-tavern-text">{f.name}</span>
                        </button>
                        <button
                          onClick={() => toggleFeature(key)}
                          className="block w-full px-3 py-1 text-left text-[10px] text-tavern-muted hover:text-tavern-gold-light"
                        >
                          {expanded ? "Hide details" : "Show details"}
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
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={saveFightingStyle}
                    disabled={fightingStylePending}
                    className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setFightingStylePickerOpen(false)}
                    disabled={fightingStylePending}
                    className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spells */}
        {sheet.spellcastingAbility && (
          <div id="spells" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Spells
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center">
                <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                  Spell Save DC
                </div>
                <div className="mt-1 font-heading text-xl font-bold text-tavern-gold-light">
                  {sheet.spellSaveDC}
                </div>
              </div>
              <div className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center">
                <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">
                  Spell Attack
                </div>
                <div className="mt-1 font-heading text-xl font-bold text-tavern-gold-light">
                  {formatModifier(sheet.spellAttackBonus ?? 0)}
                </div>
              </div>
            </div>

            {sheet.spellSlots.some((n) => n > 0) && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Spell Slots
                </h3>
                {sheet.classIndex === "warlock" && (
                  <p className="text-xs text-tavern-muted">
                    Pact Magic — all slots are the same level, and recover fully on a Short or
                    Long Rest.
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

            {sheet.classIndex === "warlock" && sheet.level >= 2 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Magical Cunning
                  </div>
                  <div className="text-xs text-tavern-muted">
                    1-minute rite to regain {magicalCunningRegain(Math.max(0, ...sheet.spellSlots))}{" "}
                    expended Pact Magic slot
                    {magicalCunningRegain(Math.max(0, ...sheet.spellSlots)) === 1 ? "" : "s"}. Once
                    per Long Rest.
                  </div>
                </div>
                <button
                  onClick={useMagicalCunning}
                  disabled={play.usedMagicalCunning || !play.expendedSlots.some((n) => n > 0)}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {play.usedMagicalCunning ? "Used" : "Use"}
                </button>
              </div>
            )}

            {sheet.sorceryPointsMax > 0 && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                  Sorcery Points
                </h3>
                <div className="mt-2 flex items-center justify-between rounded-md border border-tavern-border px-3 py-2 sm:max-w-[200px]">
                  <button
                    onClick={restoreSorceryPoint}
                    disabled={play.expendedSorceryPoints <= 0}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                  <span className="font-heading font-bold text-tavern-text">
                    {sheet.sorceryPointsMax - play.expendedSorceryPoints}/{sheet.sorceryPointsMax}
                  </span>
                  <button
                    onClick={expendSorceryPoint}
                    disabled={play.expendedSorceryPoints >= sheet.sorceryPointsMax}
                    className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    &minus;
                  </button>
                </div>
              </div>
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
                        const expanded = expandedFeatures.has(key);
                        const selected = selectedMetamagic.includes(m.key);
                        return (
                          <div
                            key={m.key}
                            className={`rounded-md border ${
                              selected ? "border-tavern-gold bg-tavern-card" : "border-tavern-border"
                            }`}
                          >
                            <button
                              onClick={() => toggleMetamagicSelection(m.key, sheet.metamagicKnownMax)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                            >
                              <span className="text-tavern-text">{m.name}</span>
                              <span className="text-xs tracking-wide text-tavern-muted uppercase">
                                {m.cost}
                              </span>
                            </button>
                            <button
                              onClick={() => toggleFeature(key)}
                              className="block w-full px-3 py-1 text-left text-[10px] text-tavern-muted hover:text-tavern-gold-light"
                            >
                              {expanded ? "Hide details" : "Show details"}
                            </button>
                            {expanded && (
                              <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                                {m.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={saveMetamagic}
                        disabled={metamagicPending}
                        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setMetamagicPickerOpen(false)}
                        disabled={metamagicPending}
                        className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sheet.cantripsKnownCount > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Cantrips Known ({knownCantripDetails.length}/{sheet.cantripsKnownCount})
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
                  <div className="mt-2 space-y-1">
                    {knownCantripDetails.map((s) => {
                      const key = `spell-${s.index}`;
                      const expanded = expandedFeatures.has(key);
                      return (
                        <div key={key} className="rounded-md border border-tavern-border">
                          <button
                            onClick={() => toggleFeature(key)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                          >
                            <span className="text-tavern-text">{s.name}</span>
                            <span className="text-xs tracking-wide text-tavern-muted uppercase">
                              {s.school}
                            </span>
                          </button>
                          {expanded && s.description && (
                            <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                              {s.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {knownCantripDetails.length === 0 && (
                      <p className="text-xs text-tavern-muted">No cantrips chosen yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                    <p className="text-xs text-tavern-muted">
                      Choose up to {sheet.cantripsKnownCount} ({selectedCantrips.length} selected).
                    </p>
                    <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {cantripOptions.map((s) => {
                        const key = `picker-spell-${s.index}`;
                        const expanded = expandedFeatures.has(key);
                        const selected = selectedCantrips.includes(s.index);
                        return (
                          <div
                            key={s.index}
                            className={`rounded-md border ${
                              selected ? "border-tavern-gold bg-tavern-card" : "border-tavern-border"
                            }`}
                          >
                            <button
                              onClick={() => toggleCantripSelection(s.index, sheet.cantripsKnownCount)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                            >
                              <span className="text-tavern-text">{s.name}</span>
                              <span className="text-xs tracking-wide text-tavern-muted uppercase">
                                {s.school}
                              </span>
                            </button>
                            <button
                              onClick={() => toggleFeature(key)}
                              className="block w-full px-3 py-1 text-left text-[10px] text-tavern-muted hover:text-tavern-gold-light"
                            >
                              {expanded ? "Hide details" : "Show details"}
                            </button>
                            {expanded && s.description && (
                              <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                                {s.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={saveCantrips}
                        disabled={spellsPending}
                        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setCantripPickerOpen(false)}
                        disabled={spellsPending}
                        className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sheet.preparedSpellsCount > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                    Prepared Spells ({preparedSpellDetails.length}/{sheet.preparedSpellsCount})
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
                  <div className="mt-2 space-y-1">
                    {preparedSpellDetails.map((s) => {
                      const key = `spell-${s.index}`;
                      const expanded = expandedFeatures.has(key);
                      return (
                        <div key={key} className="rounded-md border border-tavern-border">
                          <button
                            onClick={() => toggleFeature(key)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                          >
                            <span className="text-tavern-text">{s.name}</span>
                            <span className="text-xs tracking-wide text-tavern-muted uppercase">
                              Lvl {s.level} &middot; {s.school}
                            </span>
                          </button>
                          {expanded && s.description && (
                            <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                              {s.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {preparedSpellDetails.length === 0 && (
                      <p className="text-xs text-tavern-muted">No spells prepared yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-3">
                    <p className="text-xs text-tavern-muted">
                      Choose up to {sheet.preparedSpellsCount} ({selectedPrepared.length} selected).
                    </p>
                    <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {preparedOptions.map((s) => {
                        const key = `picker-spell-${s.index}`;
                        const expanded = expandedFeatures.has(key);
                        const selected = selectedPrepared.includes(s.index);
                        return (
                          <div
                            key={s.index}
                            className={`rounded-md border ${
                              selected ? "border-tavern-gold bg-tavern-card" : "border-tavern-border"
                            }`}
                          >
                            <button
                              onClick={() => togglePreparedSelection(s.index, sheet.preparedSpellsCount)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                            >
                              <span className="text-tavern-text">{s.name}</span>
                              <span className="text-xs tracking-wide text-tavern-muted uppercase">
                                Lvl {s.level} &middot; {s.school}
                              </span>
                            </button>
                            <button
                              onClick={() => toggleFeature(key)}
                              className="block w-full px-3 py-1 text-left text-[10px] text-tavern-muted hover:text-tavern-gold-light"
                            >
                              {expanded ? "Hide details" : "Show details"}
                            </button>
                            {expanded && s.description && (
                              <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                                {s.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={savePrepared}
                        disabled={spellsPending}
                        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setPreparedPickerOpen(false)}
                        disabled={spellsPending}
                        className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Species Traits */}
        {speciesTraits.length > 0 && (
          <div id="species-traits" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Species Traits
            </h2>
            <div className="mt-3 space-y-1">
              {speciesTraits.map((trait) => {
                const expanded = expandedFeatures.has(trait.index);
                return (
                  <div key={trait.index} className="rounded-md border border-tavern-border">
                    <button
                      onClick={() => toggleFeature(trait.index)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                    >
                      <span className="text-tavern-text">{trait.name}</span>
                      {trait.level > 1 && (
                        <span className="text-xs tracking-wide text-tavern-muted uppercase">
                          Lvl {trait.level}
                        </span>
                      )}
                    </button>
                    {expanded && trait.description && (
                      <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                        {trait.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Features */}
        {unlockedFeatures.length > 0 && (
          <div id="features" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Features
            </h2>
            <div className="mt-3 space-y-1">
              {unlockedFeatures.map((feature) => {
                const expanded = expandedFeatures.has(feature.index);
                return (
                  <div key={feature.index} className="rounded-md border border-tavern-border">
                    <button
                      onClick={() => toggleFeature(feature.index)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
                    >
                      <span className="text-tavern-text">{feature.name}</span>
                      <span className="text-xs tracking-wide text-tavern-muted uppercase">
                        Lvl {feature.level}
                      </span>
                    </button>
                    {expanded && feature.description && (
                      <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                        {feature.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attacks */}
        {weapons.length > 0 && (
          <div id="attacks" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Attacks
            </h2>
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
            {sheet.classIndex === "monk" && (
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
            {sheet.classIndex === "monk" && sheet.level >= 17 && (
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
                    </div>
                    {weapon.notes && (
                      <div className="mt-0.5 text-xs text-tavern-gold-light italic">{weapon.notes}</div>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        <div id="equipment" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            Equipment
          </h2>
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
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sheet.ownedEquipment
              .filter((item) => !item.isMoney && item.index)
              .map((item, i) => {
                const isEquipped = equippedSet.has(item.index!);
                const detailsKey = `equip:${item.index}-${i}`;
                const expanded = expandedFeatures.has(detailsKey);
                const details = equipmentDetailLines(equipmentByIndex.get(item.index!));
                return (
                  <div
                    key={detailsKey}
                    className={`rounded-md border ${
                      isEquipped ? "border-tavern-gold bg-tavern-bg" : "border-tavern-border"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleEquipped(item.index!)}
                        className={`flex flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                          isEquipped ? "text-tavern-text" : "text-tavern-muted"
                        }`}
                      >
                        <span>
                          {item.count > 1 ? `${item.count}× ` : ""}
                          {item.name}
                        </span>
                        <span className="text-xs uppercase">{isEquipped ? "Equipped" : "Stowed"}</span>
                      </button>
                      {details.length > 0 && (
                        <button
                          onClick={() => toggleFeature(detailsKey)}
                          className="px-2 text-xs text-tavern-muted hover:text-tavern-gold-light"
                        >
                          {expanded ? "▲" : "▼"}
                        </button>
                      )}
                    </div>
                    {expanded && details.length > 0 && (
                      <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
                        {details.join("\n")}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>

          {inventory.length > 0 && (
            <div className="mt-4 border-t border-tavern-border pt-3">
              <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                Found / Custom Equipment
              </h3>
              <div className="mt-2 space-y-1.5">
                {inventory.map((item) => {
                  const base = equipmentByIndex.get(item.baseIndex);
                  const isEquipped = equippedSet.has(item.id);
                  const bonusParts = [
                    item.attackBonus ? `${formatModifier(item.attackBonus)} Attack` : null,
                    item.damageBonus ? `${formatModifier(item.damageBonus)} Damage` : null,
                    item.acBonus ? `${formatModifier(item.acBonus)} AC` : null,
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
                          <span className="text-xs uppercase">
                            {isEquipped ? "Equipped" : "Stowed"}
                          </span>
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
              </div>
            </div>
          )}

          {isOwner && !inventoryManagerOpen && !editingInventoryItem && (
            <button
              onClick={() => setInventoryManagerOpen(true)}
              className="mt-4 text-xs text-tavern-gold-light hover:text-tavern-gold"
            >
              + Add Equipment
            </button>
          )}
          {inventoryError && <p className="mt-2 text-xs text-tavern-oxblood-light">{inventoryError}</p>}
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
        </div>

        <CharacterPersonality
          characterId={characterId}
          initialPersonality={personality}
          isOwner={isOwner}
          sheet={sheet}
        />

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
      />
    </div>
  );
}
