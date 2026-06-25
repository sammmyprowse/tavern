import type { CharacterDraft, UpdateDraftFn } from "@/lib/character";
import type { ClassOption, SkillInfo } from "@/lib/srd";

interface ClassStepProps {
  classes: ClassOption[];
  skills: SkillInfo[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function ClassStep({ classes, skills, draft, onUpdate }: ClassStepProps) {
  const skillsByIndex = new Map(skills.map((s) => [s.index, s]));
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
          {selected.description && (
            <p className="text-sm text-tavern-muted italic">{selected.description}</p>
          )}
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
              <p className="mt-1 text-xs text-tavern-muted">
                Proficiency in a skill adds your Proficiency Bonus to checks that use it — pick
                whichever match how you plan to solve problems (talk your way through, sneak past,
                fight, or puzzle it out).
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pc.options.map((opt) => {
                  const isChosen = draft.skillChoices.includes(opt.index);
                  const isDisabled = !isChosen && draft.skillChoices.length >= pc.choose;
                  const skillIndex = opt.index.replace(/^skill-/, "");
                  const skill = skillsByIndex.get(skillIndex);
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
                      <span className="font-heading font-bold text-tavern-text">
                        {opt.name.replace(/^Skill: /, "")}
                        {skill && (
                          <span className="ml-1.5 text-[10px] tracking-wider text-tavern-muted uppercase">
                            {skill.abilityScore.toUpperCase()}
                          </span>
                        )}
                      </span>
                      {skill?.description && (
                        <p className="mt-0.5 text-xs text-tavern-muted">{skill.description}</p>
                      )}
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
