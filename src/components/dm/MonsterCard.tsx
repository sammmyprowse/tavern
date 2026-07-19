"use client";

import { useState } from "react";
import type { EncounterMonster } from "@/lib/encounter";
import type { MonsterStatBlock } from "@/lib/srd";
import { abilityMod, crLabel, formatMod } from "@/lib/encounter";
import { rollD20, rollDice } from "@/lib/dice";
import { CounterStepper } from "@/components/playsheet/ResourceCounter";
import { ExpandableRow, SpellRow } from "@/components/playsheet/SheetPrimitives";

export interface DmLogEntry {
  id: number;
  label: string;
  detail: string;
  total: number;
  isNat20?: boolean;
  isNat1?: boolean;
}

const ABILITY_LABELS = [
  ["str", "STR"],
  ["dex", "DEX"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "WIS"],
  ["cha", "CHA"],
] as const;

// One monster on the board, playable like a mini character sheet: live HP,
// click-to-roll checks/saves/attacks, expandable ability text. All rolls go to
// the shared DM roll log; HP changes persist via the parent.
export default function MonsterCard({
  monster,
  statBlock,
  active,
  onHpSet,
  pushLog,
}: {
  monster: EncounterMonster;
  statBlock: MonsterStatBlock | undefined;
  active: boolean;
  onHpSet: (hp: number) => void;
  pushLog: (entry: Omit<DmLogEntry, "id">) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function rollCheck(label: string, mod: number) {
    const r = rollD20(mod);
    pushLog({
      label: `${monster.name} ${label}`,
      detail: `d20 [${r.rolls.join(", ")}] ${formatMod(mod)}`,
      total: r.total,
      isNat20: r.isNat20,
      isNat1: r.isNat1,
    });
  }

  function rollDamage(label: string, notation: string) {
    const r = rollDice(notation);
    pushLog({
      label: `${monster.name} ${label} Damage`,
      detail: `${notation} [${r.rolls.join(", ")}]${r.modifier ? ` ${formatMod(r.modifier)}` : ""}`,
      total: r.total,
    });
  }

  function applyAmount(sign: 1 | -1) {
    const n = parseInt(amount.trim(), 10);
    if (Number.isNaN(n) || n <= 0) return;
    onHpSet(monster.currentHp + sign * n);
    setAmount("");
  }

  const down = monster.currentHp <= 0;

  if (!statBlock) {
    // Stat block still loading (brand-new encounter pre-refresh) or missing
    // from the dataset — HP tracking still works.
    return (
      <div className="rounded-lg border border-tavern-border bg-tavern-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-heading font-bold text-tavern-text">{monster.name}</span>
          <CounterStepper
            remaining={monster.currentHp}
            max={monster.maxHp}
            onRestore={() => onHpSet(monster.currentHp + 1)}
            onExpend={() => onHpSet(monster.currentHp - 1)}
          />
        </div>
      </div>
    );
  }

  const speedLine = Object.entries(statBlock.speed)
    .map(([k, v]) => (k === "walk" ? v : `${k} ${v}`))
    .join(", ");
  const senseLine = Object.entries(statBlock.senses)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(", ");

  return (
    <div
      className={`rounded-lg border bg-tavern-card p-4 ${
        active ? "border-tavern-gold" : "border-tavern-border"
      } ${down ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className={`font-heading text-lg font-bold text-tavern-text ${down ? "line-through" : ""}`}>
            {monster.name}
          </div>
          <div className="text-xs text-tavern-muted">
            {statBlock.size} {statBlock.type}, {statBlock.alignment} · CR{" "}
            {crLabel(statBlock.challengeRating)} ({statBlock.xp} XP)
          </div>
          <div className="mt-0.5 text-xs text-tavern-muted">
            AC {statBlock.armorClass}
            {statBlock.armorType ? ` (${statBlock.armorType})` : ""} · Speed {speedLine || "—"}
            {monster.initiative !== null ? ` · Init ${monster.initiative}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <CounterStepper
            remaining={monster.currentHp}
            max={monster.maxHp}
            onRestore={() => onHpSet(monster.currentHp + 1)}
            onExpend={() => onHpSet(monster.currentHp - 1)}
          />
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-14 rounded-md border border-tavern-border bg-tavern-bg px-2 py-0.5 text-center text-xs text-tavern-text placeholder:text-tavern-muted"
            />
            <button
              onClick={() => applyAmount(-1)}
              className="rounded-md border border-tavern-border px-2 py-0.5 text-xs text-tavern-oxblood-light hover:border-tavern-oxblood-light"
            >
              Dmg
            </button>
            <button
              onClick={() => applyAmount(1)}
              className="rounded-md border border-tavern-border px-2 py-0.5 text-xs text-tavern-gold-light hover:border-tavern-gold-light"
            >
              Heal
            </button>
          </div>
        </div>
      </div>

      {/* Ability checks: tap to roll d20 + mod. */}
      <div className="mt-3 grid grid-cols-6 gap-1">
        {ABILITY_LABELS.map(([key, label]) => {
          const score = statBlock.abilities[key];
          const mod = abilityMod(score);
          return (
            <button
              key={key}
              onClick={() => rollCheck(`${label} Check`, mod)}
              className="rounded-md border border-tavern-border px-1 py-1 text-center hover:border-tavern-gold-light"
              title={`Roll ${label} check`}
            >
              <div className="text-[9px] tracking-wider text-tavern-muted uppercase">{label}</div>
              <div className="font-heading text-sm font-bold text-tavern-text">{score}</div>
              <div className="text-[10px] text-tavern-gold-light">{formatMod(mod)}</div>
            </button>
          );
        })}
      </div>

      {/* Saves: proficient ones use the listed bonus, the rest the raw mod. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ABILITY_LABELS.map(([key, label]) => {
          const listed = statBlock.savingThrows.find((s) => s.ability === label);
          const mod = listed?.bonus ?? abilityMod(statBlock.abilities[key]);
          return (
            <button
              key={key}
              onClick={() => rollCheck(`${label} Save`, mod)}
              className={`rounded-md border px-2 py-0.5 text-xs hover:border-tavern-gold-light ${
                listed
                  ? "border-tavern-gold-light/40 text-tavern-gold-light"
                  : "border-tavern-border text-tavern-muted"
              }`}
            >
              {label} save {formatMod(mod)}
            </button>
          );
        })}
        {statBlock.skills.map((s) => (
          <button
            key={s.skill}
            onClick={() => rollCheck(s.skill, s.bonus)}
            className="rounded-md border border-tavern-gold-light/40 px-2 py-0.5 text-xs text-tavern-gold-light hover:border-tavern-gold-light"
          >
            {s.skill} {formatMod(s.bonus)}
          </button>
        ))}
      </div>

      {/* Traits (Pack Tactics, …) */}
      {statBlock.specialAbilities.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {statBlock.specialAbilities.map((a) => (
            <ExpandableRow
              key={a.name}
              name={a.name}
              description={a.description}
              expanded={expanded.has(`sa:${a.name}`)}
              onToggle={() => toggle(`sa:${a.name}`)}
            />
          ))}
        </div>
      )}

      {/* Actions — attacks get roll buttons, the rest are readable rows. */}
      <div className="mt-3 space-y-2">
        {statBlock.actions.map((a) => (
          <SpellRow
            key={a.name}
            name={a.name}
            metaLine={
              a.attackBonus !== null
                ? `${formatMod(a.attackBonus)} to hit${
                    a.damageDice ? ` · ${a.damageDice}${a.damageType ? ` ${a.damageType.toLowerCase()}` : ""}` : ""
                  }`
                : "Action"
            }
            description={a.description}
            expanded={expanded.has(`ac:${a.name}`)}
            onToggle={() => toggle(`ac:${a.name}`)}
            actions={
              a.attackBonus !== null ? (
                <>
                  <button
                    onClick={() => rollCheck(`${a.name} Attack`, a.attackBonus!)}
                    className="rounded-md border border-tavern-border px-2 py-1 text-xs text-tavern-gold-light hover:border-tavern-gold-light"
                  >
                    Attack {formatMod(a.attackBonus)}
                  </button>
                  {a.damageDice && (
                    <button
                      onClick={() => rollDamage(a.name, a.damageDice!)}
                      className="rounded-md border border-tavern-border px-2 py-1 text-xs text-tavern-gold-light hover:border-tavern-gold-light"
                    >
                      Damage
                    </button>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
        {statBlock.reactions.map((r) => (
          <ExpandableRow
            key={r.name}
            name={r.name}
            rightLabel="Reaction"
            description={r.description}
            expanded={expanded.has(`re:${r.name}`)}
            onToggle={() => toggle(`re:${r.name}`)}
          />
        ))}
        {statBlock.legendaryActions.map((l) => (
          <ExpandableRow
            key={l.name}
            name={l.name}
            rightLabel="Legendary"
            description={l.description}
            expanded={expanded.has(`le:${l.name}`)}
            onToggle={() => toggle(`le:${l.name}`)}
          />
        ))}
      </div>

      {/* Defenses / senses footnotes */}
      <div className="mt-3 space-y-0.5 text-[11px] text-tavern-muted">
        {statBlock.damageVulnerabilities.length > 0 && (
          <p>Vulnerable: {statBlock.damageVulnerabilities.join(", ")}</p>
        )}
        {statBlock.damageResistances.length > 0 && (
          <p>Resistant: {statBlock.damageResistances.join(", ")}</p>
        )}
        {statBlock.damageImmunities.length > 0 && (
          <p>Immune: {statBlock.damageImmunities.join(", ")}</p>
        )}
        {statBlock.conditionImmunities.length > 0 && (
          <p>Condition immunities: {statBlock.conditionImmunities.join(", ")}</p>
        )}
        {senseLine && <p>Senses: {senseLine}</p>}
        {statBlock.languages && <p>Languages: {statBlock.languages}</p>}
      </div>
    </div>
  );
}
