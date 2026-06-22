import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getAbilityScoresList,
  getEquipmentLookup,
} from "@/lib/srd";
import BuilderWizard from "@/components/builder/BuilderWizard";

export default async function Builder() {
  const [species, subspecies, classes, backgrounds, abilityScores, equipment] =
    await Promise.all([
      getSpeciesList(),
      getSubspeciesList(),
      getClassesList(),
      getBackgroundsList(),
      getAbilityScoresList(),
      getEquipmentLookup(),
    ]);

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <BuilderWizard
        species={species}
        subspecies={subspecies}
        classes={classes}
        backgrounds={backgrounds}
        abilityScores={abilityScores}
        equipment={Array.from(equipment.values())}
      />
    </div>
  );
}
