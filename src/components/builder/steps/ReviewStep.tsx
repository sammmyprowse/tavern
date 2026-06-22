import {
  ABILITY_ORDER,
  abilityModifier,
  computeArmorClass,
  finalAbilityScores,
  formatModifier,
  maxHpAtLevelOne,
  proficiencyBonusForLevel,
  type CharacterDraft,
  type EquipmentItem,
  type UpdateDraftFn,
} from "@/lib/character";
import type {
  SpeciesOption,
  SubspeciesOption,
  ClassOption,
  BackgroundOption,
  EquipmentLookupItem,
} from "@/lib/srd";

interface ReviewStepProps {
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
  species: SpeciesOption[];
  subspecies: SubspeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  equipment: EquipmentLookupItem[];
  onRestart: () => void;
}

export default function ReviewStep({
  draft,
  onUpdate,
  species,
  subspecies,
  classes,
  backgrounds,
  equipment,
  onRestart,
}: ReviewStepProps) {
  const selectedSpecies = species.find((s) => s.index === draft.speciesIndex);
  const selectedSubspecies = subspecies.find((s) => s.index === draft.subspeciesIndex);
  const selectedClass = classes.find((c) => c.index === draft.classIndex);
  const selectedBackground = backgrounds.find((b) => b.index === draft.backgroundIndex);

  const finalScores = finalAbilityScores(draft.baseAbilityScores, draft.backgroundAbilityBonus);
  const equipmentByIndex = new Map(equipment.map((e) => [e.index, e]));

  const resolvedEquipment = [
    ...(selectedClass?.startingEquipmentFirstOption ?? []),
    ...(selectedBackground?.equipmentFirstOption ?? []),
  ];

  const equippedForAc: EquipmentItem[] = resolvedEquipment
    .filter((item) => item.index && equipmentByIndex.get(item.index)?.armorClass)
    .map((item) => {
      const lookup = equipmentByIndex.get(item.index!)!;
      return {
        index: lookup.index,
        name: lookup.name,
        categories: lookup.categories,
        armor_class: lookup.armorClass,
      };
    });

  const dexMod = finalScores.dex !== null ? abilityModifier(finalScores.dex) : 0;
  const conMod = finalScores.con !== null ? abilityModifier(finalScores.con) : 0;
  const ac = computeArmorClass(equippedForAc, dexMod);
  const hp = selectedClass ? maxHpAtLevelOne(selectedClass.hitDie, conMod) : null;
  const profBonus = proficiencyBonusForLevel(1);

  const chosenSkillNames = (selectedClass?.proficiencyChoices ?? [])
    .flatMap((pc) => pc.options)
    .filter((opt) => draft.skillChoices.includes(opt.index))
    .map((opt) => opt.name.replace(/^Skill: /, ""));

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
          const score = finalScores[ability];
          return (
            <div
              key={ability}
              className="rounded-lg border border-tavern-border bg-tavern-bg p-3 text-center"
            >
              <div className="font-heading text-xs tracking-wider text-tavern-gold-light uppercase">
                {ability}
              </div>
              <div className="mt-1 font-heading text-xl font-bold text-tavern-text">{score ?? "—"}</div>
              {score !== null && (
                <div className="text-xs text-tavern-muted">{formatModifier(abilityModifier(score))}</div>
              )}
            </div>
          );
        })}
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Species</dt>
          <dd className="text-tavern-text">
            {selectedSpecies?.name}
            {selectedSubspecies ? ` — ${selectedSubspecies.name}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Class</dt>
          <dd className="text-tavern-text">
            {selectedClass?.name} (d{selectedClass?.hitDie})
            {chosenSkillNames.length > 0 ? ` — ${chosenSkillNames.join(", ")}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1 border-b border-tavern-border pb-2">
          <dt className="text-tavern-gold-light">Background</dt>
          <dd className="text-tavern-text">
            {selectedBackground?.name}
            {selectedBackground?.feat ? ` — ${selectedBackground.feat.name}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-1">
          <dt className="text-tavern-gold-light">Starting Equipment</dt>
          <dd className="text-right text-tavern-text">
            {resolvedEquipment.map((item, i) => (
              <div key={i}>
                {item.isMoney ? item.name : `${item.count > 1 ? `${item.count}× ` : ""}${item.name}`}
              </div>
            ))}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-tavern-muted">
        Starting equipment shown is option A from your class and background — choosing between
        equipment packages is coming soon. Accounts and cloud saving are coming soon too; for now
        your character lives in this browser.
      </p>

      <button
        onClick={onRestart}
        className="mt-6 font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-oxblood-light"
      >
        Start Over
      </button>
    </div>
  );
}
