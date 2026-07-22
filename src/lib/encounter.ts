// Encounter model + 2024 encounter-building math for the DM screen.
// An encounter's live state (monster instances, HP, initiative, round) is one
// jsonb blob on the encounters row — single-writer (the DM), so last-write-
// wins via saveEncounterState is safe.

// One monster on the board. `key` is unique within the encounter (wolf-1,
// wolf-2, …); `name` is the display label ("Wolf 2"). currentHp is the live
// value the DM tracks; initiative is null until rolled/entered.
export interface EncounterMonster {
  key: string;
  index: string;
  name: string;
  maxHp: number;
  currentHp: number;
  initiative: number | null;
}

export interface EncounterState {
  monsters: EncounterMonster[];
  // Player initiative, keyed by character id — entered by the DM (players
  // roll their own dice at the table).
  playerInitiatives: Record<string, number>;
  round: number;
  // Index into the sorted combatant order; only meaningful once started.
  turn: number;
  started: boolean;
}

export const EMPTY_ENCOUNTER_STATE: EncounterState = {
  monsters: [],
  playerInitiatives: {},
  round: 1,
  turn: 0,
  started: false,
};

// Merge a stored jsonb blob against the empty state so older/partial rows
// never surface undefined fields (same pattern as normalizeDraft).
export function normalizeEncounterState(raw: unknown): EncounterState {
  const r = (raw ?? {}) as Partial<EncounterState>;
  return {
    ...EMPTY_ENCOUNTER_STATE,
    ...r,
    monsters: Array.isArray(r.monsters) ? r.monsters : [],
    playerInitiatives: r.playerInitiatives ?? {},
  };
}

// ── 2024 DMG XP budgets ─────────────────────────────────────────────────────
// XP budget PER CHARACTER by level (2024 DMG "XP Budget per Character").
// Party budget = sum over members; encounter XP = plain sum of monster XP
// (the 2024 rules dropped the 2014 multiplier for monster count).
export const XP_BUDGET_PER_CHARACTER: Record<number, { low: number; moderate: number; high: number }> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 },
};

export interface PartyXpBudget {
  low: number;
  moderate: number;
  high: number;
}

export function partyXpBudget(memberLevels: number[]): PartyXpBudget {
  return memberLevels.reduce<PartyXpBudget>(
    (acc, lvl) => {
      const row = XP_BUDGET_PER_CHARACTER[Math.min(20, Math.max(1, lvl))];
      return {
        low: acc.low + row.low,
        moderate: acc.moderate + row.moderate,
        high: acc.high + row.high,
      };
    },
    { low: 0, moderate: 0, high: 0 },
  );
}

export type EncounterDifficulty = "Trivial" | "Low" | "Moderate" | "High";

export function encounterDifficulty(totalXp: number, budget: PartyXpBudget): EncounterDifficulty {
  if (totalXp >= budget.high) return "High";
  if (totalXp >= budget.moderate) return "Moderate";
  if (totalXp >= budget.low) return "Low";
  return "Trivial";
}

// ── Monster stat helpers ────────────────────────────────────────────────────

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

// Fractional CRs display as fractions ("1/8"), whole ones as integers.
export function crLabel(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return `${cr}`;
}

// The SRD "Experience Points by Challenge Rating" table — used to derive a
// homebrew monster's XP from its chosen CR (the SRD monsters carry their own
// xp value in-row and never consult this).
export const CR_TO_XP: Record<string, number> = {
  "0": 10,
  "0.125": 25,
  "0.25": 50,
  "0.5": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

export function crToXp(cr: number): number {
  return CR_TO_XP[`${cr}`] ?? 0;
}

// CR choices for the homebrew monster form, low to high.
export const CR_OPTIONS: number[] = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

// Standard proficiency bonus by CR: +2 through CR 4, +1 per 4 CR after.
export function crProficiencyBonus(cr: number): number {
  return Math.max(2, 2 + Math.floor((Math.max(1, cr) - 1) / 4));
}

// Turn order: monsters + party characters merged, initiative desc; entries
// without an initiative yet sort last so the tracker still renders sensibly
// mid-entry. Ties break toward monsters (arbitrary but stable).
export interface Combatant {
  id: string; // monster key or character id
  name: string;
  isMonster: boolean;
  initiative: number | null;
}

export function turnOrder(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name);
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (a.isMonster !== b.isMonster) return a.isMonster ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
