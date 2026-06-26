import {
  WEAPON_MASTERY_KNOWN_BY_CLASS,
  WEAPON_MASTERY_MELEE_ONLY_CLASSES,
  type CharacterDraft,
  type UpdateDraftFn,
} from "@/lib/character";
import type { EquipmentLookupItem, MasteryPropertyInfo } from "@/lib/srd";

interface WeaponMasteryStepProps {
  classIndex: string | null;
  equipment: EquipmentLookupItem[];
  masteryProperties: MasteryPropertyInfo[];
  draft: CharacterDraft;
  onUpdate: UpdateDraftFn;
}

export default function WeaponMasteryStep({
  classIndex,
  equipment,
  masteryProperties,
  draft,
  onUpdate,
}: WeaponMasteryStepProps) {
  const requiredCount = classIndex ? WEAPON_MASTERY_KNOWN_BY_CLASS[classIndex] ?? 0 : 0;
  const meleeOnly = classIndex ? WEAPON_MASTERY_MELEE_ONLY_CLASSES.has(classIndex) : false;
  const eligibleWeapons = equipment
    .filter((e) => e.mastery && (!meleeOnly || (e.categories ?? []).includes("melee-weapons")))
    .sort((a, b) => a.name.localeCompare(b.name));
  const descByProperty = new Map(masteryProperties.map((p) => [p.index, p.description]));
  const chosen = new Set(draft.weaponMasteryChoices);

  function toggle(weaponIndex: string) {
    onUpdate((prev) => {
      const next = new Set(prev.weaponMasteryChoices);
      if (next.has(weaponIndex)) next.delete(weaponIndex);
      else if (next.size < requiredCount) next.add(weaponIndex);
      return { weaponMasteryChoices: [...next] };
    });
  }

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold text-tavern-gold">Choose Your Weapon Masteries</h2>
      <p className="mt-1 text-tavern-muted">
        Your training lets you use the mastery properties of {requiredCount} kind
        {requiredCount === 1 ? "" : "s"} of {meleeOnly ? "melee " : ""}weapon
        {requiredCount === 1 ? "" : "s"} of your choice — pick {requiredCount} below. You can
        change these later on your character sheet after a Long Rest.
      </p>
      <p className="mt-2 text-xs text-tavern-muted">
        Chosen: {chosen.size} / {requiredCount}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {eligibleWeapons.map((w) => {
          const isChosen = chosen.has(w.index);
          const atCap = chosen.size >= requiredCount && !isChosen;
          return (
            <button
              key={w.index}
              onClick={() => toggle(w.index)}
              disabled={atCap}
              className={`rounded-lg border p-3 text-left ${
                isChosen
                  ? "border-tavern-gold bg-tavern-bg"
                  : atCap
                    ? "border-tavern-border opacity-40"
                    : "border-tavern-border hover:border-tavern-gold-light"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading font-bold text-tavern-text">{w.name}</span>
                <span className="text-xs tracking-wide text-tavern-gold-light uppercase">
                  {w.mastery?.name}
                </span>
              </div>
              {w.mastery && descByProperty.get(w.mastery.index) && (
                <p className="mt-1 text-xs text-tavern-muted">{descByProperty.get(w.mastery.index)}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
