export type StepId =
  | "species"
  | "class"
  | "weapon-mastery"
  | "abilities"
  | "background"
  | "personality"
  | "review";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "species", label: "Species" },
  { id: "class", label: "Class" },
  { id: "weapon-mastery", label: "Weapons" },
  { id: "abilities", label: "Abilities" },
  { id: "background", label: "Background" },
  { id: "personality", label: "Personality" },
  { id: "review", label: "Review" },
];

// `steps` defaults to the full list — BuilderWizard passes a filtered list
// when the selected class doesn't have Weapon Mastery, so that step's chip
// doesn't show at all instead of leading somewhere with nothing to choose.
export default function ProgressSteps({
  current,
  steps = STEPS,
}: {
  current: StepId;
  steps?: { id: StepId; label: string }[];
}) {
  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol className="mb-10 flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2 sm:gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-heading text-sm font-bold ${
                  isActive
                    ? "bg-tavern-oxblood text-tavern-parchment"
                    : isDone
                      ? "bg-tavern-gold text-tavern-bg"
                      : "border border-tavern-border text-tavern-muted"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`font-heading text-xs tracking-wider uppercase ${
                  isActive ? "text-tavern-gold-light" : "text-tavern-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className="mb-5 h-px w-4 bg-tavern-border sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}
