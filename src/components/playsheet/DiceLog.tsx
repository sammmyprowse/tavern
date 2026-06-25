"use client";

import { useState } from "react";
import { rollD20, rollFlatDie, type DiceLogEntry, type RollMode } from "@/lib/dice";

interface DiceLogProps {
  entries: DiceLogEntry[];
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
  onCritRoll: (entry: DiceLogEntry) => void;
  onRoll: (entry: Omit<DiceLogEntry, "id">) => void;
  onClear: () => void;
}

const RAW_DICE = [4, 6, 8, 10, 12, 20, 100];

export default function DiceLog({
  entries,
  rollMode,
  onRollModeChange,
  onCritRoll,
  onRoll,
  onClear,
}: DiceLogProps) {
  const [hidden, setHidden] = useState(false);

  // A generic dice tray — tap any die to roll it on its own, independent of
  // any specific check/attack/feature. Only d20 honors the current Roll
  // Mode toggle (Advantage/Disadvantage is specifically a d20 mechanic in
  // 5e — it doesn't apply to damage or other dice), rolling twice and
  // showing both results the same way every other d20 roll in this app
  // does. Every other die is a single flat roll.
  function rollRawDie(sides: number) {
    if (sides === 20) {
      const result = rollD20(0, rollMode);
      onRoll({
        label: "d20",
        detail: result.rolls.length > 1 ? `[${result.rolls.join(", ")}]` : "",
        total: result.total,
        isNat20: result.isNat20,
        isNat1: result.isNat1,
      });
      return;
    }
    const roll = rollFlatDie(sides);
    onRoll({ label: `d${sides}`, detail: "", total: roll });
  }

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-tavern-oxblood px-4 py-2 font-heading text-xs font-bold tracking-widest text-tavern-parchment uppercase shadow-lg hover:bg-tavern-oxblood-light"
      >
        Dice Log
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-h-[60vh] w-80 flex-col rounded-xl border border-tavern-border bg-tavern-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-tavern-border px-3 py-2">
        <div className="flex gap-1">
          {(["disadvantage", "normal", "advantage"] as RollMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onRollModeChange(mode)}
              className={`rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase transition-colors ${
                rollMode === mode
                  ? "bg-tavern-oxblood text-tavern-parchment"
                  : "text-tavern-muted hover:text-tavern-gold-light"
              }`}
            >
              {mode === "advantage" ? "Adv" : mode === "disadvantage" ? "Disadv" : "Normal"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClear}
            className="text-[10px] tracking-wide text-tavern-muted uppercase hover:text-tavern-oxblood-light"
          >
            Clear
          </button>
          <button
            onClick={() => setHidden(true)}
            className="text-[10px] tracking-wide text-tavern-muted uppercase hover:text-tavern-gold-light"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-tavern-border px-3 py-2">
        {RAW_DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => rollRawDie(sides)}
            className="flex-1 rounded-md border border-tavern-border py-1.5 text-center font-heading text-xs font-bold text-tavern-gold-light hover:border-tavern-gold-light hover:bg-tavern-bg"
          >
            d{sides}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {entries.length === 0 && (
          <p className="text-center text-xs text-tavern-muted">No rolls yet. Tap anything to roll.</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-lg p-2 text-sm ${
              entry.isNat20
                ? "bg-emerald-600 text-white"
                : entry.isNat1
                  ? "bg-tavern-oxblood text-white"
                  : "bg-tavern-bg text-tavern-text"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading font-bold">{entry.label}</span>
              <span className="font-heading text-lg font-bold">{entry.total}</span>
            </div>
            <div className="text-xs opacity-80">{entry.detail}</div>
            {entry.isNat20 && entry.critDamageNotation && (
              <button
                onClick={() => onCritRoll(entry)}
                className="mt-1.5 w-full rounded bg-white/20 px-2 py-1 text-xs font-bold uppercase hover:bg-white/30"
              >
                Tap for crit damage
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
