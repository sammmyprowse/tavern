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
  type AbilityKey,
  type AbilityBonusChoice,
  type CharacterDraft,
  type MetamagicOption,
} from "@/lib/character";
import { buildCharacterSheet, computeAC, resolveWeapons } from "@/lib/character-sheet";
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
} from "@/app/characters/actions";
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
  classSpells: SpellOption[];
  isOwner: boolean;
  isPublic: boolean;
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
  classSpells,
  isOwner,
  isPublic,
}: PlaySheetProps) {
  const storageKey = `tavern_play_${characterId}`;
  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));
  // Shadows the `draft` prop so a successful level-up can update the sheet
  // instantly without a server round trip — same instant-feedback feel as
  // the rest of the play sheet's local state.
  const [currentDraft, setCurrentDraft] = useState(draft);
  const sheet = buildCharacterSheet(currentDraft, { species, subspecies, classes, backgrounds, skills });
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
  };

  const [play, setPlay] = useState<PlayState>(defaultPlayState);
  const [diceLog, setDiceLog] = useState<DiceLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [damageInput, setDamageInput] = useState("");
  const [healInput, setHealInput] = useState("");

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
  const ac = computeAC(sheet.ownedEquipment, equipmentByIndex, equippedSet, sheet.modifiers.dex);
  const weapons = resolveWeapons(sheet.ownedEquipment, equipmentByIndex, sheet.modifiers, sheet.proficiencyBonus);
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

  function applyDamage() {
    const amount = parseInt(damageInput, 10);
    if (!amount || amount < 0) return;
    setPlay((prev) => {
      const tempAbsorbed = Math.min(prev.tempHp, amount);
      const remaining = amount - tempAbsorbed;
      return {
        ...prev,
        tempHp: prev.tempHp - tempAbsorbed,
        currentHp: Math.max(0, prev.currentHp - remaining),
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
    }));
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

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-bold text-tavern-gold">
              {sheet.name || "Unnamed"}
            </h1>
            <p className="font-heading text-base font-bold tracking-wide text-tavern-gold-light">
              {sheet.className}
              {chosenSubclass ? ` (${chosenSubclass.name})` : ""}
            </p>
            <p className="text-tavern-muted">
              Level {sheet.level} {sheet.subspeciesName ?? sheet.speciesName} — {sheet.backgroundName}
              {sheet.backgroundIsHomebrew ? " (Homebrew)" : ""}
            </p>
            {chosenOrder && (
              <p className="text-xs text-tavern-muted">
                {sheet.className} Order: {chosenOrder.name}
              </p>
            )}
          </div>
          {isOwner && <ShareControl characterId={characterId} initialIsPublic={isPublic} />}
        </div>

        {!isOwner && (
          <p className="mt-2 text-xs text-tavern-muted">
            You&apos;re viewing someone else&apos;s character. Rolls and HP changes here are
            local to your browser only — they don&apos;t affect the owner&apos;s copy.
          </p>
        )}

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
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["AC", ac],
            ["Initiative", formatModifier(sheet.initiative)],
            ["Speed", sheet.speed ?? "—"],
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
        <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
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
            <button
              onClick={spendHitDie}
              disabled={play.hitDiceUsed >= totalHitDice}
              className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:cursor-not-allowed disabled:opacity-30"
            >
              Spend Hit Die ({totalHitDice - play.hitDiceUsed} left)
            </button>
          </div>

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
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
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
        <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
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

        {/* Spells */}
        {sheet.spellcastingAbility && (
          <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
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

        {/* Features */}
        {unlockedFeatures.length > 0 && (
          <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
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
          <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
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
        <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
          <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            Equipment
          </h2>
          <p className="mt-1 text-xs text-tavern-muted">
            Tap to equip or unequip. Armor and shields affect your AC live.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sheet.ownedEquipment
              .filter((item) => !item.isMoney && item.index)
              .map((item, i) => {
                const isEquipped = equippedSet.has(item.index!);
                return (
                  <button
                    key={`${item.index}-${i}`}
                    onClick={() => toggleEquipped(item.index!)}
                    className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm ${
                      isEquipped
                        ? "border-tavern-gold bg-tavern-bg text-tavern-text"
                        : "border-tavern-border text-tavern-muted"
                    }`}
                  >
                    <span>
                      {item.count > 1 ? `${item.count}× ` : ""}
                      {item.name}
                    </span>
                    <span className="text-xs uppercase">{isEquipped ? "Equipped" : "Stowed"}</span>
                  </button>
                );
              })}
          </div>
        </div>

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
        onClear={() => setDiceLog([])}
      />
    </div>
  );
}
