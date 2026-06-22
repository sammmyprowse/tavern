export type RollMode = "advantage" | "normal" | "disadvantage";

export interface D20RollResult {
  mode: RollMode;
  rolls: number[];
  chosen: number;
  modifier: number;
  total: number;
  isNat20: boolean;
  isNat1: boolean;
}

function rollOneD20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

export function rollD20(modifier: number, mode: RollMode = "normal"): D20RollResult {
  if (mode === "normal") {
    const roll = rollOneD20();
    return {
      mode,
      rolls: [roll],
      chosen: roll,
      modifier,
      total: roll + modifier,
      isNat20: roll === 20,
      isNat1: roll === 1,
    };
  }

  const roll1 = rollOneD20();
  const roll2 = rollOneD20();
  const chosen = mode === "advantage" ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
  return {
    mode,
    rolls: [roll1, roll2],
    chosen,
    modifier,
    total: chosen + modifier,
    isNat20: chosen === 20,
    isNat1: chosen === 1,
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
