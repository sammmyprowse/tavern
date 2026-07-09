import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getAbilityScoresList,
  getEquipmentLookup,
  getLanguagesList,
  getSkillsList,
  getWeaponMasteryProperties,
} from "@/lib/srd";
import { createClient } from "@/lib/supabase-server";
import { getUserBackgrounds, getUserSpecies, getUserClasses } from "@/app/homebrew/actions";
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
    languages,
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
    getLanguagesList(),
    getSkillsList(),
    getWeaponMasteryProperties(),
  ]);

  // The signed-in user's own homebrew backgrounds/species are offered alongside
  // the SRD + dev-authored ones (tagged homebrew in the pickers).
  const [userBackgrounds, userSpecies, userClasses] = userData.user
    ? await Promise.all([getUserBackgrounds(), getUserSpecies(), getUserClasses()])
    : [[], [], []];
  const allBackgrounds = [...backgrounds, ...userBackgrounds];
  const allSpecies = [...species, ...userSpecies];
  const allClasses = [...classes, ...userClasses];

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <BuilderWizard
        isSignedIn={Boolean(userData.user)}
        species={allSpecies}
        subspecies={subspecies}
        classes={allClasses}
        backgrounds={allBackgrounds}
        abilityScores={abilityScores}
        equipment={Array.from(equipment.values())}
        languages={languages}
        skills={skills}
        masteryProperties={masteryProperties}
      />
    </div>
  );
}
