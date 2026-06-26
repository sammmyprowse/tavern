import type { CharacterDraft, UpdateDraftFn } from "@/lib/character";
import type { SpeciesOption, SubspeciesOption } from "@/lib/srd";

interface SpeciesStepProps {
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function SpeciesStep({ species, subspecies, draft, onUpdate }: SpeciesStepProps) {
  const selected = species.find((s) => s.index === draft.speciesIndex) ?? null;
  const lineageOptions = selected
    ? subspecies.filter((sub) => sub.speciesIndex === selected.index)
    : [];

  function selectSpecies(s: SpeciesOption) {
    if (s.index === draft.speciesIndex) return;
    onUpdate({ speciesIndex: s.index, subspeciesIndex: null });
  }

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Choose a Species</h2>
      <p className="mt-1 text-tavern-muted">Your species shapes your size, speed, and innate traits.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {species.map((s) => {
          const isSelected = s.index === draft.speciesIndex;
          return (
            <button
              key={s.index}
              onClick={() => selectSpecies(s)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-tavern-gold bg-tavern-bg"
                  : "border-tavern-border hover:border-tavern-gold-light"
              }`}
            >
              <div className="font-heading font-bold text-tavern-text">{s.name}</div>
              {s.isHomebrew && (
                <span className="mt-1 inline-block rounded-full border border-tavern-gold-light/40 px-2 py-0.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                  Homebrew
                </span>
              )}
              <div className="mt-1 text-xs text-tavern-muted">
                {s.size ? `${s.size} · ` : ""}
                {s.speed} ft speed
              </div>
            </button>
          );
        })}
      </div>

      {selected?.description && (
        <p className="mt-6 text-sm text-tavern-muted italic">{selected.description}</p>
      )}

      {selected && selected.traits.length > 0 && (
        <div className="mt-6 rounded-lg border border-tavern-border bg-tavern-bg p-4">
          <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            {selected.name} Traits
          </h3>
          {selected.isHomebrew && (
            <p className="mt-1 text-xs text-tavern-muted">
              <span className="text-tavern-gold-light">Homebrew species</span> — original
              content written for Tavern, not part of the official SRD.
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm text-tavern-muted">
            {selected.traits.map((t) => (
              <li key={t.index}>{t.name}</li>
            ))}
          </ul>
        </div>
      )}

      {selected && lineageOptions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            Choose a Lineage
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lineageOptions.map((sub) => {
              const isSelected = sub.index === draft.subspeciesIndex;
              return (
                <button
                  key={sub.index}
                  onClick={() => onUpdate({ subspeciesIndex: sub.index })}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-tavern-gold bg-tavern-bg"
                      : "border-tavern-border hover:border-tavern-gold-light"
                  }`}
                >
                  <div className="font-heading font-bold text-tavern-text">{sub.name}</div>
                  {sub.description && <p className="mt-1 text-xs text-tavern-muted italic">{sub.description}</p>}
                  <ul className="mt-1 space-y-0.5 text-xs text-tavern-muted">
                    {sub.traits.map((t) => (
                      <li key={t.index}>
                        {t.name}
                        {t.level && t.level > 1 ? ` (level ${t.level})` : ""}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
