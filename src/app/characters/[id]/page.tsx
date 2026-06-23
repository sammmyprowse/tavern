import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getSkillsList,
  getEquipmentLookup,
  getFeaturesForClass,
} from "@/lib/srd";
import type { CharacterDraft } from "@/lib/character";
import PlaySheet from "@/components/playsheet/PlaySheet";

export default async function CharacterPlaySheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: userData }, { data: character }, species, subspecies, classes, backgrounds, skills, equipment] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.from("characters").select("id, user_id, name, draft, is_public").eq("id", id).maybeSingle(),
      getSpeciesList(),
      getSubspeciesList(),
      getClassesList(),
      getBackgroundsList(),
      getSkillsList(),
      getEquipmentLookup(),
    ]);

  if (!character) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-2xl font-bold text-tavern-gold">Character Not Found</h1>
          <p className="text-tavern-muted">
            This character doesn&apos;t exist, isn&apos;t shared publicly, or doesn&apos;t belong
            to your account.
          </p>
          <Link
            href="/characters"
            className="font-heading text-sm tracking-widest text-tavern-gold-light uppercase hover:text-tavern-gold"
          >
            &larr; My Characters
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = userData.user?.id === character.user_id;
  const draft = character.draft as unknown as CharacterDraft;
  const features = draft.classIndex ? await getFeaturesForClass(draft.classIndex) : [];

  return (
    <PlaySheet
      characterId={character.id}
      draft={draft}
      species={species}
      subspecies={subspecies}
      classes={classes}
      backgrounds={backgrounds}
      skills={skills}
      equipment={Array.from(equipment.values())}
      features={features}
      isOwner={isOwner}
      isPublic={character.is_public}
    />
  );
}
