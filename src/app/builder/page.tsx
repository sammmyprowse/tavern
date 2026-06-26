import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getAbilityScoresList,
  getEquipmentLookup,
  getSkillsList,
  getWeaponMasteryProperties,
} from "@/lib/srd";
import { createClient } from "@/lib/supabase-server";
import BuilderWizard from "@/components/builder/BuilderWizard";

export default async function Builder() {
  const supabase = await createClient();
  const [
    { data: userData },
    species,
    subspecies,
    classes,
    backgrounds,
    abilityScores,
    equipment,
    skills,
    masteryProperties,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getSpeciesList(),
    getSubspeciesList(),
    getClassesList(),
    getBackgroundsList(),
    getAbilityScoresList(),
    getEquipmentLookup(),
    getSkillsList(),
    getWeaponMasteryProperties(),
  ]);

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <BuilderWizard
        isSignedIn={Boolean(userData.user)}
        species={species}
        subspecies={subspecies}
        classes={classes}
        backgrounds={backgrounds}
        abilityScores={abilityScores}
        equipment={Array.from(equipment.values())}
        skills={skills}
        masteryProperties={masteryProperties}
      />
    </div>
  );
}
