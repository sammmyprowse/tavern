import type { AbilityBonusChoice, AbilityKey, CharacterDraft, UpdateDraftFn } from "@/lib/character";
import type { BackgroundOption } from "@/lib/srd";

interface BackgroundStepProps {
  backgrounds: BackgroundOption[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function BackgroundStep({ backgrounds, draft, onUpdate }: BackgroundStepProps) {
  const selected = backgrounds.find((b) => b.index === draft.backgroundIndex) ?? null;
  const eligible = (selected?.abilityScores.map((a) => a.index as AbilityKey)) ?? [];

  function selectBackground(b: BackgroundOption) {
    if (b.index === draft.backgroundIndex) return;
    onUpdate({ backgroundIndex: b.index, backgroundAbilityBonus: null });
  }

  function setMode(mode: AbilityBonusChoice["mode"]) {
    if (mode === "three") {
      onUpdate({ backgroundAbilityBonus: { mode: "three", plusOne: eligible } });
    } else {
      onUpdate({
        backgroundAbilityBonus: { mode: "two", plusTwo: eligible[0], plusOne: [eligible[1]] },
      });
    }
  }

  function setPlusTwo(ability: AbilityKey) {
    const plusOne = eligible.filter((a) => a !== ability).slice(0, 1);
    onUpdate((prev) => {
      if (!prev.backgroundAbilityBonus || prev.backgroundAbilityBonus.mode !== "two") return {};
      return { backgroundAbilityBonus: { mode: "two", plusTwo: ability, plusOne } };
    });
  }

  function setPlusOne(ability: AbilityKey) {
    onUpdate((prev) => {
      if (!prev.backgroundAbilityBonus || prev.backgroundAbilityBonus.mode !== "two") return {};
      return {
        backgroundAbilityBonus: { ...prev.backgroundAbilityBonus, plusOne: [ability] },
      };
    });
  }

  const bonus = draft.backgroundAbilityBonus;

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Choose a Background</h2>
      <p className="mt-1 text-tavern-muted">
        Your background grants ability score bonuses, skill proficiencies, and an Origin feat.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {backgrounds.map((b) => {
          const isSelected = b.index === draft.backgroundIndex;
          return (
            <button
              key={b.index}
              onClick={() => selectBackground(b)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-tavern-gold bg-tavern-bg"
                  : "border-tavern-border hover:border-tavern-gold-light"
              }`}
            >
              <div className="font-heading font-bold text-tavern-text">{b.name}</div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-sm text-tavern-muted">
            <div>
              <span className="text-tavern-gold-light">Skill &amp; Tool Proficiencies:</span>{" "}
              {selected.proficiencies.map((p) => p.name.replace(/^(Skill|Tool): /, "")).join(", ")}
            </div>
            {selected.feat && (
              <div className="mt-1">
                <span className="text-tavern-gold-light">Origin Feat:</span> {selected.feat.name}
                {selected.feat.note ? ` (${selected.feat.note})` : ""}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
              Ability Score Bonus
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setMode("two")}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  bonus?.mode === "two"
                    ? "border-tavern-gold bg-tavern-card text-tavern-text"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                +2 to one, +1 to another
              </button>
              <button
                onClick={() => setMode("three")}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  bonus?.mode === "three"
                    ? "border-tavern-gold bg-tavern-card text-tavern-text"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                +1 to all three
              </button>
            </div>

            {bonus?.mode === "two" && (
              <div className="mt-4 flex flex-wrap gap-4">
                <label className="text-sm text-tavern-muted">
                  +2 to{" "}
                  <select
                    value={bonus.plusTwo}
                    onChange={(e) => setPlusTwo(e.target.value as AbilityKey)}
                    className="ml-1 rounded-md border border-tavern-border bg-tavern-card px-2 py-1 text-tavern-text uppercase"
                  >
                    {eligible.map((a) => (
                      <option key={a} value={a}>
                        {a.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-tavern-muted">
                  +1 to{" "}
                  <select
                    value={bonus.plusOne[0]}
                    onChange={(e) => setPlusOne(e.target.value as AbilityKey)}
                    className="ml-1 rounded-md border border-tavern-border bg-tavern-card px-2 py-1 text-tavern-text uppercase"
                  >
                    {eligible.filter((a) => a !== bonus.plusTwo).map((a) => (
                      <option key={a} value={a}>
                        {a.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {bonus?.mode === "three" && (
              <p className="mt-3 text-sm text-tavern-muted">
                +1 to {eligible.map((a) => a.toUpperCase()).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
