import type { CharacterDraft, UpdateDraftFn } from "@/lib/character";
import type { ClassOption } from "@/lib/srd";

interface ClassStepProps {
  classes: ClassOption[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function ClassStep({ classes, draft, onUpdate }: ClassStepProps) {
  const selected = classes.find((c) => c.index === draft.classIndex) ?? null;

  function selectClass(c: ClassOption) {
    if (c.index === draft.classIndex) return;
    onUpdate({ classIndex: c.index, skillChoices: [] });
  }

  function toggleSkill(skillIndex: string, choose: number) {
    onUpdate((prev) => {
      const isChosen = prev.skillChoices.includes(skillIndex);
      if (isChosen) {
        return { skillChoices: prev.skillChoices.filter((s) => s !== skillIndex) };
      }
      if (prev.skillChoices.length < choose) {
        return { skillChoices: [...prev.skillChoices, skillIndex] };
      }
      return {};
    });
  }

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Choose a Class</h2>
      <p className="mt-1 text-tavern-muted">Your class determines your hit points, proficiencies, and how you fight.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {classes.map((c) => {
          const isSelected = c.index === draft.classIndex;
          return (
            <button
              key={c.index}
              onClick={() => selectClass(c)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-tavern-gold bg-tavern-bg"
                  : "border-tavern-border hover:border-tavern-gold-light"
              }`}
            >
              <div className="font-heading font-bold text-tavern-text">{c.name}</div>
              <div className="mt-1 text-xs text-tavern-muted">d{c.hitDie} Hit Die</div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-sm text-tavern-muted">
            <div>
              <span className="text-tavern-gold-light">Primary Ability:</span>{" "}
              {selected.primaryAbilityDesc}
            </div>
            <div className="mt-1">
              <span className="text-tavern-gold-light">Saving Throws:</span>{" "}
              {selected.savingThrows.map((s) => s.name).join(", ")}
            </div>
          </div>

          {selected.proficiencyChoices.map((pc, i) => (
            <div key={i}>
              <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
                Choose {pc.choose} Skill{pc.choose > 1 ? "s" : ""}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {pc.options.map((opt) => {
                  const isChosen = draft.skillChoices.includes(opt.index);
                  const isDisabled = !isChosen && draft.skillChoices.length >= pc.choose;
                  return (
                    <button
                      key={opt.index}
                      onClick={() => toggleSkill(opt.index, pc.choose)}
                      disabled={isDisabled}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        isChosen
                          ? "border-tavern-gold bg-tavern-bg text-tavern-text"
                          : isDisabled
                            ? "border-tavern-border text-tavern-muted opacity-40"
                            : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                      }`}
                    >
                      {opt.name.replace(/^Skill: /, "")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
