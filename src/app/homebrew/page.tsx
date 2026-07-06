import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import HomebrewManager, { type HomebrewFeat } from "@/components/homebrew/HomebrewManager";

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

  const { data } = await supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", userData.user.id)
    .eq("kind", "feat")
    .order("name");

  const feats: HomebrewFeat[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: (row.data as { description?: string }).description ?? "",
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">Homebrew</h1>
      <p className="mt-1 text-tavern-muted">
        Create your own content. Custom <span className="text-tavern-gold-light">feats</span> are
        available now — more content types are coming.
      </p>

      <div className="mt-6">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Feats
        </h2>
        <div className="mt-2">
          <HomebrewManager feats={feats} />
        </div>
      </div>
    </div>
  );
}
