export type RollMode = "advantage" | "normal" | "disadvantage";

export interface D20RollResult {
  mode: RollMode;
  rolls: number[];
  chosen: number;
  modifier: number;
  total: number;
  isNat20: boolean;
  isNat1: boolean;
  // Halfling Luck: defined when the first chosen die was 1 and was rerolled.
  // `rolls` contains only the original dice; `luckyReroll` is the reroll value.
  luckyReroll?: number;
}

function rollOneD20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

// lucky=true implements Halfling Luck: if the chosen die result is 1, reroll
// once and use the new value (even if it's also a 1 — the real rule).
export function rollD20(modifier: number, mode: RollMode = "normal", lucky = false): D20RollResult {
  let chosen: number;
  let rolls: number[];

  if (mode === "normal") {
    const roll = rollOneD20();
    chosen = roll;
    rolls = [roll];
  } else {
    const roll1 = rollOneD20();
    const roll2 = rollOneD20();
    chosen = mode === "advantage" ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    rolls = [roll1, roll2];
  }

  let luckyReroll: number | undefined;
  if (lucky && chosen === 1) {
    luckyReroll = rollOneD20();
    chosen = luckyReroll;
  }

  return {
    mode,
    rolls,
    chosen,
    modifier,
    total: chosen + modifier,
    isNat20: chosen === 20,
    isNat1: chosen === 1,
    luckyReroll,
  };
}

export interface DiceRollResult {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
}

const DICE_NOTATION_RE = /^(\d+)d(\d+)([+-]\d+)?$/i;

export function rollDice(notation: string): DiceRollResult {
  const match = notation.trim().match(DICE_NOTATION_RE);
  if (!match) return { notation, rolls: [], modifier: 0, total: 0 };

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;

  return { notation, rolls, modifier, total };
}

export function rollFlatDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function doubleDiceNotation(notation: string): string {
  const match = notation.trim().match(DICE_NOTATION_RE);
  if (!match) return notation;
  const count = parseInt(match[1], 10);
  const sides = match[2];
  const modifier = match[3] ?? "";
  return `${count * 2}d${sides}${modifier}`;
}

export interface DiceLogEntry {
  id: number;
  label: string;
  detail: string;
  total: number;
  isNat20?: boolean;
  isNat1?: boolean;
  critDamageNotation?: string;
  critDamageBonus?: number;
}
