import { ABILITY_ORDER, STANDARD_ARRAY, abilityModifier, formatModifier, type AbilityKey, type CharacterDraft, type UpdateDraftFn } from "@/lib/character";
import type { AbilityScoreInfo } from "@/lib/srd";

interface AbilitiesStepProps {
  abilityScores: AbilityScoreInfo[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function AbilitiesStep({ abilityScores, draft, onUpdate }: AbilitiesStepProps) {
  function availableValuesFor(ability: AbilityKey): number[] {
    const usedByOthers = ABILITY_ORDER.filter((a) => a !== ability)
      .map((a) => draft.baseAbilityScores[a])
      .filter((v): v is number => v !== null);
    return STANDARD_ARRAY.filter((v) => !usedByOthers.includes(v));
  }

  function assign(ability: AbilityKey, value: string) {
    const num = value === "" ? null : Number(value);
    onUpdate((prev) => ({
      baseAbilityScores: { ...prev.baseAbilityScores, [ability]: num },
    }));
  }

  const allAssigned = ABILITY_ORDER.every((a) => draft.baseAbilityScores[a] !== null);

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Assign Ability Scores</h2>
      <p className="mt-1 text-tavern-muted">
        Assign the standard array — {STANDARD_ARRAY.join(", ")} — to your six abilities.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ABILITY_ORDER.map((ability) => {
          const info = abilityScores.find((a) => a.index === ability);
          const value = draft.baseAbilityScores[ability];
          const options = availableValuesFor(ability);
          return (
            <div
              key={ability}
              className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-center"
            >
              <div className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                {info?.name ?? ability.toUpperCase()}
              </div>
              <div className="mt-0.5 text-xs text-tavern-muted">{info?.fullName}</div>

              <select
                value={value ?? ""}
                onChange={(e) => assign(ability, e.target.value)}
                className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-card px-2 py-1.5 text-center font-heading text-lg font-bold text-tavern-text"
              >
                <option value="">—</option>
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>

              {value !== null && (
                <div className="mt-1 text-sm text-tavern-muted">
                  modifier {formatModifier(abilityModifier(value))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!allAssigned && (
        <p className="mt-4 text-sm text-tavern-muted">
          Assign all six values to continue — each value from the array can only be used once.
        </p>
      )}
    </div>
  );
}
