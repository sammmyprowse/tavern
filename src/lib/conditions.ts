// The 15 standard conditions (2024 rules), with a short factual effect summary.
// Tracked as a visible status list on the play sheet — effects aren't
// auto-applied (they're too varied and situational), but they're surfaced as
// reminders the same way many other rules in this app are shown-not-simulated.
// Exhaustion is handled separately (it's a 0-6 level with a numeric penalty,
// not an on/off condition).
export interface ConditionInfo {
  index: string;
  name: string;
  effect: string;
}

export const CONDITIONS: ConditionInfo[] = [
  { index: "blinded", name: "Blinded", effect: "Can't see; auto-fail sight checks. Attacks against you have Advantage; your attacks have Disadvantage." },
  { index: "charmed", name: "Charmed", effect: "Can't attack the charmer or target them with harmful effects; the charmer has Advantage on social checks with you." },
  { index: "deafened", name: "Deafened", effect: "Can't hear; auto-fail hearing checks." },
  { index: "frightened", name: "Frightened", effect: "Disadvantage on checks and attacks while the source is in line of sight; can't willingly move closer to it." },
  { index: "grappled", name: "Grappled", effect: "Speed 0. Ends if the grappler is Incapacitated or you're moved out of reach." },
  { index: "incapacitated", name: "Incapacitated", effect: "Can't take actions, Bonus Actions, or Reactions; concentration breaks; can't speak." },
  { index: "invisible", name: "Invisible", effect: "Heavily obscured; attacks against you have Disadvantage, your attacks have Advantage; Surprise/hidden benefits." },
  { index: "paralyzed", name: "Paralyzed", effect: "Incapacitated, can't move/speak, auto-fail STR/DEX saves. Attacks against you have Advantage; hits within 5 ft are crits." },
  { index: "petrified", name: "Petrified", effect: "Turned to solid substance, Incapacitated, Resistance to all damage, immune to poison/disease progression." },
  { index: "poisoned", name: "Poisoned", effect: "Disadvantage on attack rolls and ability checks." },
  { index: "prone", name: "Prone", effect: "Can only crawl. Disadvantage on attacks; attacks within 5 ft have Advantage, ranged attacks against you have Disadvantage." },
  { index: "restrained", name: "Restrained", effect: "Speed 0. Attacks against you have Advantage, your attacks have Disadvantage; Disadvantage on DEX saves." },
  { index: "stunned", name: "Stunned", effect: "Incapacitated, can't move, auto-fail STR/DEX saves. Attacks against you have Advantage." },
  { index: "unconscious", name: "Unconscious", effect: "Incapacitated, Prone, drop everything, auto-fail STR/DEX saves. Attacks have Advantage; hits within 5 ft are crits." },
];

// 2024 Exhaustion: each level imposes a cumulative -2 penalty on every d20
// Test (checks, attacks, saves) and reduces Speed by 5 ft per level. Level 6
// is death.
export const EXHAUSTION_MAX = 6;
export function exhaustionD20Penalty(level: number): number {
  return Math.max(0, Math.min(level, EXHAUSTION_MAX)) * 2;
}
export function exhaustionSpeedPenalty(level: number): number {
  return Math.max(0, Math.min(level, EXHAUSTION_MAX)) * 5;
}
