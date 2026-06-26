"use client";

import { useEffect, useState } from "react";
import ProgressSteps, { STEPS, type StepId } from "./ProgressSteps";
import SpeciesStep from "./steps/SpeciesStep";
import ClassStep from "./steps/ClassStep";
import WeaponMasteryStep from "./steps/WeaponMasteryStep";
import AbilitiesStep from "./steps/AbilitiesStep";
import BackgroundStep from "./steps/BackgroundStep";
import PersonalityStep from "./steps/PersonalityStep";
import ReviewStep from "./steps/ReviewStep";
import { EMPTY_DRAFT, WEAPON_MASTERY_KNOWN_BY_CLASS, type CharacterDraft, type DraftUpdate } from "@/lib/character";
import type { PersonalityAnswers } from "@/lib/personality";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  AbilityScoreInfo,
  EquipmentLookupItem,
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

  const draftSummary = [draft.name.trim(), selectedSpecies?.name, selectedClass?.name]
    .filter(Boolean)
    .join(" — ");

  // Only 5 of 12 classes have Weapon Mastery (Barbarian/Fighter/Paladin/
  // Ranger/Rogue) — the step is skipped entirely for the other 7 rather
  // than showing a screen with nothing to choose.
  const weaponMasteryCount = selectedClass ? WEAPON_MASTERY_KNOWN_BY_CLASS[selectedClass.index] ?? 0 : 0;
  const hasWeaponMastery = weaponMasteryCount > 0;
  const relevantSteps = STEPS.filter((s) => s.id !== "weapon-mastery" || hasWeaponMastery);

  const canAdvance: Record<StepId, boolean> = {
    species: Boolean(draft.speciesIndex) && (!selectedSpecies?.hasSubspecies || Boolean(draft.subspeciesIndex)),
    class:
      Boolean(draft.classIndex) &&
      (selectedClass?.proficiencyChoices ?? []).every(
        (pc) => draft.skillChoices.filter((s) => pc.options.some((o) => o.index === s)).length >= pc.choose,
      ),
    "weapon-mastery": draft.weaponMasteryChoices.length >= weaponMasteryCount,
    abilities: Object.values(draft.baseAbilityScores).every((v) => v !== null),
    background: Boolean(draft.backgroundIndex) && Boolean(draft.backgroundAbilityBonus),
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
