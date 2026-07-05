import { getAllSpells } from "@/lib/srd";
import SpellCompendium from "@/components/spells/SpellCompendium";

export const metadata = {
  title: "Spell Compendium — Tavern",
};

export default async function SpellsPage() {
  const spells = await getAllSpells();

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
