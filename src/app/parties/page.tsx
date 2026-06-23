import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import CreatePartyForm from "@/components/parties/CreatePartyForm";

export default async function Parties() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
            Parties
          </h1>
          <p className="text-lg text-tavern-muted">Sign in to see or start a party.</p>
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

  const userId = userData.user.id;

  const [{ data: createdParties }, { data: myCharacters }] = await Promise.all([
    supabase
      .from("parties")
      .select("id, name, created_at")
      .eq("created_by", userId),
    supabase.from("characters").select("id").eq("user_id", userId),
  ]);

  const myCharacterIds = (myCharacters ?? []).map((c) => c.id);
  let memberParties: { id: string; name: string; created_at: string }[] = [];

  if (myCharacterIds.length > 0) {
    const { data: membershipRows } = await supabase
      .from("party_characters")
      .select("party_id")
      .in("character_id", myCharacterIds);
    const partyIds = [...new Set((membershipRows ?? []).map((r) => r.party_id))];
    if (partyIds.length > 0) {
      const { data } = await supabase
        .from("parties")
        .select("id, name, created_at")
        .in("id", partyIds);
      memberParties = data ?? [];
    }
  }

  const leaderPartyIds = new Set((createdParties ?? []).map((p) => p.id));
  const partyMap = new Map<string, { id: string; name: string; created_at: string }>();
  for (const p of [...(createdParties ?? []), ...memberParties]) partyMap.set(p.id, p);
  const parties = [...partyMap.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
          Parties
        </h1>
        <p className="mt-1 text-tavern-muted">
          Start a party and share its link with other players so you can see each
          other&apos;s characters.
        </p>

        <div className="mt-6">
          <CreatePartyForm />
        </div>

        {parties.length === 0 ? (
          <p className="mt-8 text-tavern-muted">You&apos;re not in any parties yet.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {parties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parties/${p.id}`}
                  className="block rounded-lg border border-tavern-border bg-tavern-card p-4 hover:border-tavern-gold-light"
                >
                  <div className="flex items-center gap-2">
                    <div className="font-heading text-lg font-bold text-tavern-text">
                      {p.name}
                    </div>
                    {leaderPartyIds.has(p.id) && (
                      <span className="rounded-full border border-tavern-gold-light/40 px-2 py-0.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                        Leader
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
