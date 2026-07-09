import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { getSkillsList } from "@/lib/srd";
import HomebrewManager, { type HomebrewFeat } from "@/components/homebrew/HomebrewManager";
import SubclassManager, { type HomebrewSubclass } from "@/components/homebrew/SubclassManager";
import BackgroundManager, { type HomebrewBackground } from "@/components/homebrew/BackgroundManager";
import SpeciesManager, { type HomebrewSpecies } from "@/components/homebrew/SpeciesManager";
import type { UserSubclassFeature, UserSpeciesTrait } from "@/lib/user-content";

export const metadata = { title: "Homebrew — Tavern" };

export default async function HomebrewPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">Homebrew</h1>
          <p className="text-lg text-tavern-muted">Sign in to create your own homebrew content.</p>
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

  const [{ data }, skills] = await Promise.all([
    supabase
      .from("user_content")
      .select("id, name, kind, data")
      .eq("user_id", userData.user.id)
      .in("kind", ["feat", "subclass", "background", "species"])
      .order("name"),
    getSkillsList(),
  ]);

  const rows = data ?? [];
  const feats: HomebrewFeat[] = rows
    .filter((r) => r.kind === "feat")
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: (row.data as { description?: string }).description ?? "",
    }));
  const subclasses: HomebrewSubclass[] = rows
    .filter((r) => r.kind === "subclass")
    .map((row) => {
      const d = row.data as {
        classIndex?: string;
        summary?: string;
        description?: string;
        features?: UserSubclassFeature[];
      };
      return {
        id: row.id,
        name: row.name,
        classIndex: d.classIndex ?? "",
        summary: d.summary ?? "",
        description: d.description ?? "",
        features: d.features ?? [],
      };
    });
  const backgrounds: HomebrewBackground[] = rows
    .filter((r) => r.kind === "background")
    .map((row) => {
      const d = row.data as {
        description?: string;
        skills?: string[];
        abilities?: string[];
        featIndex?: string;
      };
      return {
        id: row.id,
        name: row.name,
        description: d.description ?? "",
        skills: d.skills ?? [],
        abilities: d.abilities ?? [],
        featIndex: d.featIndex ?? "",
      };
    });
  const speciesList: HomebrewSpecies[] = rows
    .filter((r) => r.kind === "species")
    .map((row) => {
      const d = row.data as {
        description?: string;
        size?: string;
        speed?: number;
        traits?: UserSpeciesTrait[];
      };
      return {
        id: row.id,
        name: row.name,
        description: d.description ?? "",
        size: d.size ?? "Medium",
        speed: typeof d.speed === "number" ? d.speed : 30,
        traits: d.traits ?? [],
      };
    });
  const skillOptions = skills.map((s) => ({ index: s.index, name: s.name }));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">Homebrew</h1>
      <p className="mt-1 text-tavern-muted">
        Create your own content. It appears — tagged homebrew — in the relevant picker on your own
        characters. More content types are coming.
      </p>

      <div className="mt-6">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Feats
        </h2>
        <div className="mt-2">
          <HomebrewManager feats={feats} />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Subclasses
        </h2>
        <div className="mt-2">
          <SubclassManager subclasses={subclasses} />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Backgrounds
        </h2>
        <div className="mt-2">
          <BackgroundManager backgrounds={backgrounds} skills={skillOptions} />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Species
        </h2>
        <div className="mt-2">
          <SpeciesManager species={speciesList} />
        </div>
      </div>
    </div>
  );
}
