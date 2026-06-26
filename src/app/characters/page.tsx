import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { getSpeciesList, getSubspeciesList, getClassesList } from "@/lib/srd";
import type { CharacterDraft } from "@/lib/character";
import CharacterList, { type CharacterListItem } from "@/components/characters/CharacterList";

export default async function Characters() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
            My Characters
          </h1>
          <p className="text-lg text-tavern-muted">Sign in to see your saved characters.</p>
          <Link
            href="/login"
            className="rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase hover:bg-tavern-oxblood-light"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: characters }, species, subspecies, classes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, draft, created_at, is_public, avatar_url")
      // RLS also permits seeing public/party-shared characters that aren't mine —
      // "My Characters" specifically means owned by me, so filter explicitly
      // rather than relying on RLS visibility alone.
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false }),
    getSpeciesList(),
    getSubspeciesList(),
    getClassesList(),
  ]);

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
            My Characters
          </h1>
          <Link
            href="/builder"
            className="rounded-lg bg-tavern-oxblood px-5 py-2 font-heading text-xs font-bold tracking-widest text-tavern-parchment uppercase hover:bg-tavern-oxblood-light"
          >
            New Character
          </Link>
        </div>

        <CharacterList
          characters={(characters ?? []).map((c): CharacterListItem => {
            const draft = c.draft as unknown as CharacterDraft;
            const sp = species.find((s) => s.index === draft.speciesIndex);
            const sub = subspecies.find((s) => s.index === draft.subspeciesIndex);
            const cls = classes.find((cl) => cl.index === draft.classIndex);
            return {
              id: c.id,
              name: c.name,
              isPublic: c.is_public,
              avatarUrl: c.avatar_url ?? null,
              subtitle: `${sub ? sub.name : sp?.name ?? ""}${cls ? ` ${cls.name}` : ""}`,
            };
          })}
        />
      </div>
    </div>
  );
}
