"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ABILITY_ORDER, formatModifier, type CharacterDraft } from "@/lib/character";
import { buildCharacterSheet, computeAC, resolveWeapons } from "@/lib/character-sheet";
import { rollD20, rollDice, rollFlatDie, doubleDiceNotation, type RollMode, type DiceLogEntry } from "@/lib/dice";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  SkillInfo,
  EquipmentLookupItem,
} from "@/lib/srd";
import DiceLog from "./DiceLog";

interface PlaySheetProps {
  characterId: string;
  draft: CharacterDraft;
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  skills: SkillInfo[];
  equipment: EquipmentLookupItem[];
}

interface PlayState {
  currentHp: number;
  tempHp: number;
  hitDiceUsed: number;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  equippedIndexes: string[];
  rollMode: RollMode;
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
}: PlaySheetProps) {
  const storageKey = `tavern_play_${characterId}`;
  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));
  const sheet = buildCharacterSheet(draft, { species, subspecies, classes, backgrounds, skills });

  const allOwnedIndexes = (sheet?.ownedEquipment ?? [])
    .map((i) => i.index)
    .filter((i): i is string => Boolean(i));

  const defaultPlayState: PlayState = {
    currentHp: sheet ? sheet.hitDie + sheet.modifiers.con : 1,
    tempHp: 0,
    hitDiceUsed: 0,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    equippedIndexes: allOwnedIndexes,
    rollMode: "normal",
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
  const maxHp = sheet.hitDie + sheet.modifiers.con;
  const totalHitDice = 1;
  const isDying = play.currentHp <= 0;

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
    }));
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

        <h1 className="mt-2 font-heading text-3xl font-bold text-tavern-gold">
          {sheet.name || "Unnamed"}
        </h1>
        <p className="text-tavern-muted">
          {sheet.subspeciesName ?? sheet.speciesName} {sheet.className} — {sheet.backgroundName}
          {sheet.backgroundIsHomebrew ? " (Homebrew)" : ""}
        </p>

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
                  {skill.proficient && <span className="mr-1.5 text-tavern-gold-light">&bull;</span>}
                  {skill.name}{" "}
                  <span className="text-xs opacity-60">({skill.ability.toUpperCase()})</span>
                </span>
                <span className="font-heading font-bold">{formatModifier(skill.bonus)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Attacks */}
        {weapons.length > 0 && (
          <div className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
            <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Attacks
            </h2>
            <div className="mt-3 space-y-2">
              {weapons.map((weapon) => (
                <div
                  key={weapon.index}
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
