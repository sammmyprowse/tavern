import {
  ABILITY_ORDER,
  STANDARD_ARRAY,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  pointBuyCost,
  pointBuyRemaining,
  abilityModifier,
  formatModifier,
  type AbilityKey,
  type AbilityScoreMethod,
  type CharacterDraft,
  type UpdateDraftFn,
} from "@/lib/character";
import type { AbilityScoreInfo, SkillInfo } from "@/lib/srd";

interface AbilitiesStepProps {
  abilityScores: AbilityScoreInfo[];
  skills: SkillInfo[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

// What each ability governs beyond its skill list — skills alone undersell
// CON (zero governed skills, despite being the most important survival
// stat) and don't mention combat/spellcasting at all. Spellcasting ability
// per class confirmed independently while building each class's resources
// this project (Wizard=INT; Cleric/Druid/Ranger=WIS; Bard/Sorcerer/Warlock/
// Paladin=CHA; Fighter/Barbarian/Monk/Rogue cast nothing).
const ABILITY_COMBAT_NOTES: Record<AbilityKey, string> = {
  str: "Melee attack and damage rolls, and how much you can carry.",
  dex: "Armor Class, Initiative, and ranged attack rolls.",
  con: "Hit Point maximum — the single biggest factor in staying alive.",
  int: "Wizard spellcasting.",
  wis: "Cleric, Druid, and Ranger spellcasting.",
  cha: "Bard, Sorcerer, Warlock, and Paladin spellcasting.",
};

const METHODS: { key: AbilityScoreMethod; label: string; blurb: string }[] = [
  { key: "standard", label: "Standard Array", blurb: `Assign the fixed set ${STANDARD_ARRAY.join(", ")}.` },
  { key: "pointbuy", label: "Point Buy", blurb: `Spend ${POINT_BUY_BUDGET} points; each score ${POINT_BUY_MIN}–${POINT_BUY_MAX}.` },
  { key: "rolled", label: "Rolled", blurb: "Roll 4d6, drop the lowest, six times — then assign." },
  { key: "manual", label: "Manual", blurb: "Type any scores (for a DM-set or homebrew array)." },
];

// One 4d6-drop-lowest roll.
function roll4d6DropLowest(): number {
  const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  dice.sort((a, b) => a - b);
  return dice[1] + dice[2] + dice[3];
}

export default function AbilitiesStep({ abilityScores, skills, draft, onUpdate }: AbilitiesStepProps) {
  const method = draft.abilityScoreMethod;
  const scores = draft.baseAbilityScores;

  function setMethod(next: AbilityScoreMethod) {
    // Switching method clears the current assignment so stale values from a
    // different method don't linger (e.g. a 14 left over when moving to
    // Standard Array). Point Buy starts every score at the 8 minimum.
    onUpdate({
      abilityScoreMethod: next,
      baseAbilityScores:
        next === "pointbuy"
          ? (Object.fromEntries(ABILITY_ORDER.map((a) => [a, POINT_BUY_MIN])) as Record<AbilityKey, number>)
          : { str: null, dex: null, con: null, int: null, wis: null, cha: null },
      rolledAbilityPool: [],
    });
  }

  // --- Standard Array & Rolled share an "assign from a pool" model ---
  function poolFor(): number[] {
    return method === "rolled" ? draft.rolledAbilityPool : [...STANDARD_ARRAY];
  }
  function availableValuesFor(ability: AbilityKey): number[] {
    const usedByOthers = ABILITY_ORDER.filter((a) => a !== ability)
      .map((a) => scores[a])
      .filter((v): v is number => v !== null);
    // Remove each used value once (a rolled pool can contain duplicates).
    const remaining = [...poolFor()];
    for (const used of usedByOthers) {
      const i = remaining.indexOf(used);
      if (i !== -1) remaining.splice(i, 1);
    }
    return remaining;
  }
  function assignFromPool(ability: AbilityKey, value: string) {
    const num = value === "" ? null : Number(value);
    onUpdate((prev) => ({
      baseAbilityScores: { ...prev.baseAbilityScores, [ability]: num },
    }));
  }

  // --- Rolled ---
  function rollPool() {
    const pool = Array.from({ length: 6 }, roll4d6DropLowest).sort((a, b) => b - a);
    onUpdate({
      rolledAbilityPool: pool,
      baseAbilityScores: { str: null, dex: null, con: null, int: null, wis: null, cha: null },
    });
  }

  // --- Point Buy ---
  function adjustPointBuy(ability: AbilityKey, delta: number) {
    const current = scores[ability] ?? POINT_BUY_MIN;
    const next = current + delta;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return;
    const nextScores = { ...scores, [ability]: next };
    if (pointBuyRemaining(nextScores) < 0) return;
    onUpdate({ baseAbilityScores: nextScores });
  }

  // --- Manual ---
  function setManual(ability: AbilityKey, value: string) {
    const num = value === "" ? null : Number(value);
    onUpdate((prev) => ({
      baseAbilityScores: { ...prev.baseAbilityScores, [ability]: num },
    }));
  }

  // Standard Array's Randomize button — a random valid distribution of the six fixed values.
  function randomizeStandard() {
    const shuffled = [...STANDARD_ARRAY];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const next = {} as Record<AbilityKey, number>;
    ABILITY_ORDER.forEach((ability, i) => {
      next[ability] = shuffled[i];
    });
    onUpdate({ baseAbilityScores: next });
  }

  const pointsLeft = pointBuyRemaining(scores);

  return (
    <div>
      <div>
        <h2 className="font-heading text-2xl font-bold text-tavern-gold">Assign Ability Scores</h2>
        <p className="mt-1 text-tavern-muted">
          Choose how to generate your six ability scores. Racial and background bonuses are added on
          top afterward.
        </p>
      </div>

      {/* Method selector */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMethod(m.key)}
            className={`rounded-lg border p-3 text-left ${
              method === m.key
                ? "border-tavern-gold bg-tavern-gold/10"
                : "border-tavern-border bg-tavern-bg hover:border-tavern-gold-light"
            }`}
          >
            <div className="font-heading text-sm font-bold text-tavern-gold-light">{m.label}</div>
            <div className="mt-0.5 text-xs text-tavern-muted">{m.blurb}</div>
          </button>
        ))}
      </div>

      {/* Method-specific control bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {method === "standard" && (
          <>
            <p className="text-sm text-tavern-muted">
              Assign each value from {STANDARD_ARRAY.join(", ")} exactly once.
            </p>
            <button
              onClick={randomizeStandard}
              className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
            >
              Randomize
            </button>
          </>
        )}
        {method === "pointbuy" && (
          <p className={`text-sm font-bold ${pointsLeft < 0 ? "text-tavern-oxblood-light" : "text-tavern-gold-light"}`}>
            Points remaining: {pointsLeft} / {POINT_BUY_BUDGET}
          </p>
        )}
        {method === "rolled" && (
          <>
            <p className="text-sm text-tavern-muted">
              {draft.rolledAbilityPool.length === 0
                ? "Roll to generate six values, then assign them below."
                : `Your rolls: ${draft.rolledAbilityPool.join(", ")}`}
            </p>
            <button
              onClick={rollPool}
              className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
            >
              {draft.rolledAbilityPool.length === 0 ? "Roll Scores" : "Re-roll"}
            </button>
          </>
        )}
        {method === "manual" && (
          <p className="text-sm text-tavern-muted">
            Type any score (1–30). Use this for a DM-provided array or homebrew rules.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ABILITY_ORDER.map((ability) => {
          const info = abilityScores.find((a) => a.index === ability);
          const value = scores[ability];
          const governedSkills = skills.filter((s) => s.abilityScore === ability);
          return (
            <div
              key={ability}
              className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-center"
            >
              <div className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                {info?.name ?? ability.toUpperCase()}
              </div>
              <div className="mt-0.5 text-xs text-tavern-muted">{info?.fullName}</div>
              {info?.description && (
                <div className="mt-1 text-xs text-tavern-muted italic">{info.description}</div>
              )}
              <div className="mt-1 text-xs text-tavern-muted">{ABILITY_COMBAT_NOTES[ability]}</div>
              {governedSkills.length > 0 && (
                <div className="mt-1 text-xs text-tavern-muted">
                  Skills: {governedSkills.map((s) => s.name).join(", ")}
                </div>
              )}

              {/* Input varies by method */}
              {(method === "standard" || method === "rolled") && (
                <select
                  value={value ?? ""}
                  onChange={(e) => assignFromPool(ability, e.target.value)}
                  disabled={method === "rolled" && draft.rolledAbilityPool.length === 0}
                  className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-card px-2 py-1.5 text-center font-heading text-lg font-bold text-tavern-text disabled:opacity-40"
                >
                  <option value="">—</option>
                  {/* Include the currently-selected value so it stays shown alongside the remaining pool. */}
                  {[...(value !== null ? [value] : []), ...availableValuesFor(ability)]
                    .map((v, i) => ({ v, i }))
                    .sort((a, b) => b.v - a.v)
                    .map(({ v, i }) => (
                      <option key={`${v}-${i}`} value={v}>
                        {v}
                      </option>
                    ))}
                </select>
              )}

              {method === "pointbuy" && (
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button
                    onClick={() => adjustPointBuy(ability, -1)}
                    disabled={(value ?? POINT_BUY_MIN) <= POINT_BUY_MIN}
                    className="h-8 w-8 rounded-md border border-tavern-border font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="font-heading text-lg font-bold text-tavern-text">{value ?? POINT_BUY_MIN}</span>
                  <button
                    onClick={() => adjustPointBuy(ability, 1)}
                    disabled={
                      (value ?? POINT_BUY_MIN) >= POINT_BUY_MAX ||
                      pointsLeft - (pointBuyCost((value ?? POINT_BUY_MIN) + 1) - pointBuyCost(value ?? POINT_BUY_MIN)) < 0
                    }
                    className="h-8 w-8 rounded-md border border-tavern-border font-bold text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}

              {method === "manual" && (
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={value ?? ""}
                  onChange={(e) => setManual(ability, e.target.value)}
                  className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-card px-2 py-1.5 text-center font-heading text-lg font-bold text-tavern-text"
                />
              )}

              {value !== null && (
                <div className="mt-1 text-sm text-tavern-muted">
                  modifier {formatModifier(abilityModifier(value))}
                  {method === "pointbuy" && ` · costs ${pointBuyCost(value)}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {method === "pointbuy" && pointsLeft > 0 && (
        <p className="mt-4 text-sm text-tavern-muted">
          You still have {pointsLeft} point{pointsLeft === 1 ? "" : "s"} to spend.
        </p>
      )}
    </div>
  );
}
