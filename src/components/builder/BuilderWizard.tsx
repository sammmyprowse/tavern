"use client";

import { useEffect, useState } from "react";
import ProgressSteps, { STEPS, type StepId } from "./ProgressSteps";
import SpeciesStep from "./steps/SpeciesStep";
import ClassStep from "./steps/ClassStep";
import WeaponMasteryStep from "./steps/WeaponMasteryStep";
import AbilitiesStep from "./steps/AbilitiesStep";
import BackgroundStep from "./steps/BackgroundStep";
import LanguagesStep from "./steps/LanguagesStep";
import PersonalityStep from "./steps/PersonalityStep";
import ReviewStep from "./steps/ReviewStep";
import { EMPTY_DRAFT, WEAPON_MASTERY_KNOWN_BY_CLASS, type CharacterDraft, type DraftUpdate } from "@/lib/character";
import { buildQuickDraft } from "@/lib/quick-build";
import type { PersonalityAnswers } from "@/lib/personality";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  AbilityScoreInfo,
  EquipmentLookupItem,
  LanguageOption,
  SkillInfo,
  MasteryPropertyInfo,
} from "@/lib/srd";

const STORAGE_KEY = "tavern_character_draft";
const PERSONALITY_STORAGE_KEY = "tavern_character_personality";

interface BuilderWizardProps {
  isSignedIn: boolean;
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  abilityScores: AbilityScoreInfo[];
  equipment: EquipmentLookupItem[];
  languages: LanguageOption[];
  skills: SkillInfo[];
  masteryProperties: MasteryPropertyInfo[];
}

export default function BuilderWizard({
  isSignedIn,
  species,
  subspecies,
  classes,
  backgrounds,
  abilityScores,
  equipment,
  languages,
  skills,
  masteryProperties,
}: BuilderWizardProps) {
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [personality, setPersonality] = useState<PersonalityAnswers | null>(null);
  const [step, setStep] = useState<StepId>("species");
  const [loaded, setLoaded] = useState(false);
  // True only when a *meaningful* saved draft was found on mount and the
  // player hasn't yet said whether to continue it or start over — gates
  // the whole wizard behind a choice instead of silently resuming (or
  // silently overwriting) whatever they were partway through last time.
  const [hasUnresolvedDraft, setHasUnresolvedDraft] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [qbSpecies, setQbSpecies] = useState("");
  const [qbClass, setQbClass] = useState("");
  const [qbName, setQbName] = useState("");

  const quickRefs = { species, subspecies, classes, backgrounds, languages, equipment };

  // Quick Build: fill a complete draft from an optional species/class/name and
  // jump straight to Review to tweak or save. Surprise Me randomizes everything.
  function runQuickBuild(random: boolean) {
    setDraft(
      buildQuickDraft(quickRefs, {
        random,
        speciesIndex: random ? undefined : qbSpecies || undefined,
        classIndex: random ? undefined : qbClass || undefined,
        name: random ? undefined : qbName || undefined,
      }),
    );
    setQuickOpen(false);
    setStep("review");
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        // One-time hydration from localStorage on mount — kept behind the
        // `loaded` gate below so SSR/client markup never mismatches. Merged
        // over EMPTY_DRAFT so a draft saved before a schema change (e.g. the
        // level/hpRolls fields) still gets valid defaults for the new keys.
        const parsed = { ...EMPTY_DRAFT, ...JSON.parse(saved) };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft(parsed);
        if (parsed.speciesIndex || parsed.classIndex || parsed.name.trim()) {
          setHasUnresolvedDraft(true);
        }
      } catch {
        // ignore corrupt saved draft
      }
    }
    const savedPersonality = localStorage.getItem(PERSONALITY_STORAGE_KEY);
    if (savedPersonality) {
      try {
        setPersonality(JSON.parse(savedPersonality));
      } catch {
        // ignore corrupt saved personality
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft, loaded]);

  useEffect(() => {
    if (!loaded) return;
    // Stored separately from the draft (its own key, kept out of
    // CharacterDraft entirely) — personality is presentation flavor, never
    // read by buildCharacterSheet, same separation as bio/avatar_url on the
    // characters table.
    if (personality) localStorage.setItem(PERSONALITY_STORAGE_KEY, JSON.stringify(personality));
    else localStorage.removeItem(PERSONALITY_STORAGE_KEY);
  }, [personality, loaded]);

  function updateDraft(update: DraftUpdate) {
    setDraft((prev) => ({ ...prev, ...(typeof update === "function" ? update(prev) : update) }));
  }

  function restart() {
    setDraft(EMPTY_DRAFT);
    setPersonality(null);
    setStep("species");
    setHasUnresolvedDraft(false);
  }

  const selectedSpecies = species.find((s) => s.index === draft.speciesIndex) ?? null;
  const selectedClass = classes.find((c) => c.index === draft.classIndex) ?? null;
  const selectedBackground = backgrounds.find((b) => b.index === draft.backgroundIndex) ?? null;

  const draftSummary = [draft.name.trim(), selectedSpecies?.name, selectedClass?.name]
    .filter(Boolean)
    .join(" — ");

  // Only 5 of 12 classes have Weapon Mastery (Barbarian/Fighter/Paladin/
  // Ranger/Rogue) — the step is skipped entirely for the other 7 rather
  // than showing a screen with nothing to choose.
  const weaponMasteryCount = selectedClass ? WEAPON_MASTERY_KNOWN_BY_CLASS[selectedClass.index] ?? 0 : 0;
  const hasWeaponMastery = weaponMasteryCount > 0;
  const relevantSteps = STEPS.filter((s) => s.id !== "weapon-mastery" || hasWeaponMastery);

  const needsToolProficiencyChoice =
    (selectedBackground?.toolProficiencyChoices.length ?? 0) > 0;

  const canAdvance: Record<StepId, boolean> = {
    species: Boolean(draft.speciesIndex) && (!selectedSpecies?.hasSubspecies || Boolean(draft.subspeciesIndex)),
    class:
      Boolean(draft.classIndex) &&
      (selectedClass?.proficiencyChoices ?? []).every(
        (pc) => draft.skillChoices.filter((s) => pc.options.some((o) => o.index === s)).length >= pc.choose,
      ),
    "weapon-mastery": draft.weaponMasteryChoices.length >= weaponMasteryCount,
    abilities: Object.values(draft.baseAbilityScores).every((v) => v !== null),
    background:
      Boolean(draft.backgroundIndex) &&
      Boolean(draft.backgroundAbilityBonus) &&
      (!needsToolProficiencyChoice || Boolean(draft.toolProficiencyChoice)),
    languages: draft.languageChoices.length >= 2,
    personality: true,
    review: true,
  };

  const currentIndex = relevantSteps.findIndex((s) => s.id === step);

  function goNext() {
    if (currentIndex < relevantSteps.length - 1) setStep(relevantSteps[currentIndex + 1].id);
  }
  function goBack() {
    if (currentIndex > 0) setStep(relevantSteps[currentIndex - 1].id);
  }

  if (!loaded) return null;

  if (hasUnresolvedDraft) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col items-center rounded-xl border border-tavern-border bg-tavern-card p-6 py-10 text-center sm:p-8">
          <h2 className="font-heading text-2xl font-bold text-tavern-gold">Unfinished Character</h2>
          <p className="mt-3 max-w-md text-tavern-muted">
            {draftSummary
              ? `You have an unfinished character in progress: ${draftSummary}.`
              : "You have an unfinished character in progress."}{" "}
            Continue where you left off, or start fresh?
          </p>
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => setHasUnresolvedDraft(false)}
              className="rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light"
            >
              Continue
            </button>
            <button
              onClick={restart}
              className="rounded-lg border border-tavern-border px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-muted uppercase hover:border-tavern-gold-light hover:text-tavern-gold-light"
            >
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Quick Build / Surprise Me — only offered at the very start. */}
      {step === "species" && (
        <div className="mb-4 rounded-xl border border-tavern-gold/40 bg-tavern-card p-4">
          {!quickOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-tavern-muted">
                In a hurry? Let the tavern build one for you.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setQuickOpen(true)}
                  className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
                >
                  ⚡ Quick Build
                </button>
                <button
                  onClick={() => runQuickBuild(true)}
                  className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-muted uppercase hover:border-tavern-gold-light hover:text-tavern-gold-light"
                >
                  🎲 Surprise Me
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-tavern-gold-light">Quick Build</p>
              <p className="mt-0.5 text-xs text-tavern-muted">
                Pick what you care about — anything you leave blank is chosen for you (recommended
                skills, ability scores, background, and more). You&apos;ll land on Review to tweak.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select
                  value={qbSpecies}
                  onChange={(e) => setQbSpecies(e.target.value)}
                  className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text"
                >
                  <option value="">Random species</option>
                  {species.map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.name}
                      {s.isHomebrew ? " (Homebrew)" : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={qbClass}
                  onChange={(e) => setQbClass(e.target.value)}
                  className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text"
                >
                  <option value="">Random class</option>
                  {classes.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={qbName}
                  onChange={(e) => setQbName(e.target.value)}
                  placeholder="Name (optional)"
                  className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => runQuickBuild(false)}
                  className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
                >
                  Build It
                </button>
                <button
                  onClick={() => setQuickOpen(false)}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ProgressSteps current={step} steps={relevantSteps} />

      <div className="rounded-xl border border-tavern-border bg-tavern-card p-6 sm:p-8">
        {step === "species" && (
          <SpeciesStep
            species={species}
            subspecies={subspecies}
            draft={draft}
            onUpdate={updateDraft}
          />
        )}
        {step === "class" && (
          <ClassStep classes={classes} skills={skills} draft={draft} onUpdate={updateDraft} />
        )}
        {step === "weapon-mastery" && (
          <WeaponMasteryStep
            classIndex={draft.classIndex}
            equipment={equipment}
            masteryProperties={masteryProperties}
            draft={draft}
            onUpdate={updateDraft}
          />
        )}
        {step === "abilities" && (
          <AbilitiesStep
            abilityScores={abilityScores}
            skills={skills}
            draft={draft}
            onUpdate={updateDraft}
          />
        )}
        {step === "background" && (
          <BackgroundStep backgrounds={backgrounds} draft={draft} onUpdate={updateDraft} />
        )}
        {step === "languages" && (
          <LanguagesStep languages={languages} draft={draft} onUpdate={updateDraft} />
        )}
        {step === "personality" && (
          <PersonalityStep personality={personality} onUpdate={setPersonality} onSkip={goNext} />
        )}
        {step === "review" && (
          <ReviewStep
            draft={draft}
            personality={personality}
            onUpdate={updateDraft}
            species={species}
            subspecies={subspecies}
            classes={classes}
            backgrounds={backgrounds}
            equipment={equipment}
            languages={languages}
            skills={skills}
            onRestart={restart}
            onSaved={restart}
            isSignedIn={isSignedIn}
          />
        )}
      </div>

      {step !== "review" && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className="font-heading text-sm tracking-widest text-tavern-muted uppercase disabled:opacity-30 hover:text-tavern-gold-light"
          >
            &larr; Back
          </button>
          <button
            onClick={goNext}
            disabled={!canAdvance[step]}
            className="rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
