import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ABILITY_ORDER, formatModifier, type CharacterDraft, type UpdateDraftFn } from "@/lib/character";
import { buildCharacterSheet, computeAC } from "@/lib/character-sheet";
import type { PersonalityAnswers } from "@/lib/personality";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  EquipmentLookupItem,
  SkillInfo,
} from "@/lib/srd";
import { saveCharacter } from "@/app/builder/actions";

interface ReviewStepProps {
  draft: CharacterDraft;
  personality: PersonalityAnswers | null;
  onUpdate: UpdateDraftFn;
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  equipment: EquipmentLookupItem[];
  skills: SkillInfo[];
  onRestart: () => void;
  isSignedIn: boolean;
}

export default function ReviewStep({
  draft,
  personality,
  onUpdate,
  species,
  subspecies,
  classes,
  backgrounds,
  equipment,
  skills,
  onRestart,
  isSignedIn,
}: ReviewStepProps) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const result = await saveCharacter(draft, personality);
    if (result.success && result.characterId) {
      // Straight to the new character's play sheet — no reason to make the
      // player click through to My Characters and find it themselves.
      router.push(`/characters/${result.characterId}`);
    } else {
      setSaveState("error");
      setSaveError(result.error ?? "Something went wrong.");
    }
  }

  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));
  const sheet = buildCharacterSheet(draft, { species, subspecies, classes, backgrounds, skills });
  const resolvedEquipment = sheet?.ownedEquipment ?? [];
  const allOwnedIndexes = new Set(
    resolvedEquipment.map((i) => i.index).filter((i): i is string => Boolean(i)),
  );

  const ac = sheet ? computeAC(resolvedEquipment, equipmentByIndex, allOwnedIndexes, sheet.modifiers.dex) : 10;
  const hp = sheet?.maxHpValue ?? null;
  const profBonus = sheet?.proficiencyBonus ?? 2;

  const chosenSkillIndexes = new Set(draft.skillChoices.map((s) => s.replace(/^skill-/, "")));
  const chosenSkillNames = sheet?.skills.filter((s) => chosenSkillIndexes.has(s.index)) ?? [];

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Review Your Character</h2>
      <p className="mt-1 text-tavern-muted">Saved automatically in this browser as you build.</p>

      <div className="mt-6">
        <label className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Character Name
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Name your character"
          className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-3 py-2 text-tavern-text placeholder:text-tavern-muted/50"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-center">
          <div className="font-heading text-xs tracking-wider text-tavern-muted uppercase">Armor Class</div>
          <div className="mt-1 font-heading text-3xl font-bold text-tavern-gold-light">{ac}</div>
        </div>
        <div className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-center">
          <div className="font-heading text-xs tracking-wider text-tavern-muted uppercase">Hit Points</div>
          <div className="mt-1 font-heading text-3xl font-bold text-tavern-gold-light">{hp ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-tavern-border bg-tavern-bg p-4 text-center">
          <div className="font-heading text-xs tracking-wider text-tavern-muted uppercase">Proficiency Bonus</div>
          <div className="mt-1 font-heading text-3xl font-bold text-tavern-gold-light">
            {formatModifier(profBonus)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_ORDER.map((ability) => {
          const score = sheet?.finalScores[ability];
          return (
            <div
              key={ability}
              className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center"
            >
              <div className="font-heading text-xs tracking-wider text-tavern-gold-light uppercase">
                {ability}
              </div>
              <div className="mt-1 font-heading text-xl font-bold text-tavern-text">{score ?? "—"}</div>
              {score !== undefined && (
                <div className="text-xs text-tavern-muted">
                  {formatModifier(sheet!.modifiers[ability])}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Species</dt>
          <dd className="text-tavern-text">
            {sheet?.speciesName}
            {sheet?.speciesIsHomebrew ? " (Homebrew)" : ""}
            {sheet?.subspeciesName ? ` — ${sheet.subspeciesName}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Class</dt>
          <dd className="text-tavern-text">
            {sheet?.className} (d{sheet?.hitDie})
            {chosenSkillNames.length > 0
              ? ` — ${chosenSkillNames.map((s) => s.name).join(", ")}`
              : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Background</dt>
          <dd className="text-tavern-text">
            {sheet?.backgroundName}
            {sheet?.backgroundIsHomebrew ? " (Homebrew)" : ""}
            {sheet?.backgroundFeatName ? ` — ${sheet.backgroundFeatName}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Starting Equipment</dt>
          <dd className="text-right text-tavern-text">
            {resolvedEquipment.map((item, i) => (
              <div key={i}>
                {item.isMoney ? item.name : `${item.count > 1 ? `${item.count}× ` : ""}${item.name}`}
              </div>
            ))}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1">
          <dt className="text-tavern-gold-light">Personality &amp; Backstory</dt>
          <dd className="text-tavern-text">{personality ? "Added" : "Skipped"}</dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-tavern-muted">
        Starting equipment shown is option A from your class and background — choosing between
        equipment packages is coming soon.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {isSignedIn ? (
          <>
            <button
              onClick={handleSave}
              disabled={!draft.name.trim() || saveState === "saving"}
              className="rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
            >
              {saveState === "saving" ? "Saving…" : "Save Character"}
            </button>
            {saveState === "error" && (
              <span className="text-sm text-tavern-oxblood-light">{saveError}</span>
            )}
          </>
        ) : (
          <p className="text-sm text-tavern-muted">
            <Link href="/login" className="text-tavern-gold-light underline hover:text-tavern-gold">
              Sign in
            </Link>{" "}
            to save this character to your account.
          </p>
        )}
      </div>

      <button
        onClick={onRestart}
        className="mt-6 font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-oxblood-light"
      >
        Start Over
      </button>
    </div>
  );
}
