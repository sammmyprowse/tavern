import { getAllSpells } from "@/lib/srd";
import { createClient } from "@/lib/supabase-server";
import { getUserCompendiumSpells } from "@/app/homebrew/actions";
import SpellCompendium from "@/components/spells/SpellCompendium";

export const metadata = {
  title: "Spell Compendium — Tavern",
};

export default async function SpellsPage() {
  const supabase = await createClient();
  const [{ data: userData }, srdSpells] = await Promise.all([
    supabase.auth.getUser(),
    getAllSpells(),
  ]);
  // A signed-in user also sees their own homebrew spells in the compendium.
  const userSpells = userData.user ? await getUserCompendiumSpells() : [];
  const spells = [...srdSpells, ...userSpells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
        Spell Compendium
      </h1>
      <p className="mt-1 text-tavern-muted">
        Browse and search every spell — filter by level, school, or class, and expand any spell for
        its full rules text.
      </p>
      <div className="mt-6">
        <SpellCompendium spells={spells} />
      </div>
    </div>
  );
}
