import { EMPTY_PERSONALITY, type PersonalityAnswers } from "@/lib/personality";
import PersonalityQuestionnaire from "@/components/PersonalityQuestionnaire";

interface PersonalityStepProps {
  personality: PersonalityAnswers | null;
  onUpdate: (personality: PersonalityAnswers | null) => void;
}

export default function PersonalityStep({ personality, onUpdate }: PersonalityStepProps) {
  if (!personality) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <h2 className="font-heading text-2xl font-bold text-tavern-gold">Bring Your Character to Life</h2>
        <p className="mt-3 max-w-md text-tavern-muted">
          Answer a few quick questions about who they are. At the end you&apos;ll get a ready-to-use
          prompt — paste it into one AI tool and it&apos;ll hand back both a backstory and a portrait.
          Works best with ChatGPT, Google Gemini, or Grok, since they can generate the image too.
        </p>
        <p className="mt-3 max-w-md text-sm text-tavern-gold-light">
          This is entirely optional flavor — nothing here changes your character&apos;s stats,
          gameplay, or inventory.
        </p>
        <div className="mt-6 flex gap-4">
          <button
            onClick={() => onUpdate(EMPTY_PERSONALITY)}
            className="rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light"
          >
            Let&apos;s Do It
          </button>
          <button
            onClick={() => onUpdate(null)}
            className="rounded-lg border border-tavern-border px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-muted uppercase hover:border-tavern-gold-light hover:text-tavern-gold-light"
          >
            Skip For Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-tavern-gold">Personality &amp; Backstory</h2>
          <p className="mt-1 text-tavern-muted">
            Pick what fits, write your own, or leave it as None — entirely optional flavor.
          </p>
        </div>
        <button
          onClick={() => onUpdate(null)}
          className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
        >
          Skip this entirely
        </button>
      </div>

      <div className="mt-6">
        <PersonalityQuestionnaire
          personality={personality}
          onChange={(key, value) => onUpdate({ ...personality, [key]: value || "None" })}
        />
      </div>
    </div>
  );
}
