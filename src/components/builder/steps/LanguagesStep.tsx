import type { CharacterDraft, UpdateDraftFn } from "@/lib/character";
import type { LanguageOption } from "@/lib/srd";

// Languages automatically granted by class — not counted against the 2-pick
// budget and excluded from the selectable list entirely.
const CLASS_AUTO_LANGUAGES: Record<string, string> = {
  rogue: "thieves-cant",
  druid: "druidic",
};

interface LanguagesStepProps {
  languages: LanguageOption[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function LanguagesStep({ languages, draft, onUpdate }: LanguagesStepProps) {
  const autoGrantIndex = draft.classIndex ? CLASS_AUTO_LANGUAGES[draft.classIndex] : undefined;
  const autoGrantLanguage = autoGrantIndex ? languages.find((l) => l.index === autoGrantIndex) : null;

  // All class-restricted language indexes — never available as free picks.
  const restrictedIndexes = new Set(Object.values(CLASS_AUTO_LANGUAGES));
  const pickableLanguages = languages.filter((l) => !restrictedIndexes.has(l.index));

  const standardLanguages = pickableLanguages.filter((l) => !l.isRare);
  const rareLanguages = pickableLanguages.filter((l) => l.isRare);

  const chosen = new Set(draft.languageChoices);
  const PICK_COUNT = 2;
  const remaining = PICK_COUNT - chosen.size;

  function toggle(index: string) {
    if (chosen.has(index)) {
      onUpdate({ languageChoices: draft.languageChoices.filter((l) => l !== index) });
    } else if (chosen.size < PICK_COUNT) {
      onUpdate({ languageChoices: [...draft.languageChoices, index] });
    }
  }

  function languageButton(lang: LanguageOption) {
    const isChosen = chosen.has(lang.index);
    const isDisabled = !isChosen && chosen.size >= PICK_COUNT;
    return (
      <button
        key={lang.index}
        onClick={() => toggle(lang.index)}
        disabled={isDisabled}
        className={`rounded-lg border p-3 text-left text-sm transition-colors ${
          isChosen
            ? "border-tavern-gold bg-tavern-bg text-tavern-text"
            : isDisabled
              ? "cursor-not-allowed border-tavern-border text-tavern-muted opacity-40"
              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
        }`}
      >
        {lang.name}
      </button>
    );
  }

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Languages</h2>
      <p className="mt-1 text-tavern-muted">
        Choose 2 languages your character speaks and reads.
      </p>

      <div className="mt-2 text-sm text-tavern-muted">
        {remaining > 0
          ? `${remaining} pick${remaining !== 1 ? "s" : ""} remaining`
          : "Both languages chosen."}
      </div>

      {autoGrantLanguage && (
        <div className="mt-4 rounded-lg border border-tavern-gold/30 bg-tavern-bg p-3 text-sm">
          <span className="text-tavern-gold-light">Auto-granted: </span>
          <span className="text-tavern-text">{autoGrantLanguage.name}</span>
          <span className="ml-2 text-xs text-tavern-muted">(class feature, not a free pick)</span>
        </div>
      )}

      <div className="mt-6">
        <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Standard Languages
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {standardLanguages.map(languageButton)}
        </div>
      </div>

      {rareLanguages.length > 0 && (
        <div className="mt-6">
          <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
            Rare Languages
          </h3>
          <p className="mt-1 text-xs text-tavern-muted">
            Typically spoken by monsters or planes-touched beings.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rareLanguages.map(languageButton)}
          </div>
        </div>
      )}
    </div>
  );
}
