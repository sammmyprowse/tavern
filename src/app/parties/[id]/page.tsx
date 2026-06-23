import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { getSpeciesList, getSubspeciesList, getClassesList } from "@/lib/srd";
import type { CharacterDraft } from "@/lib/character";
import CopyPartyLink from "@/components/parties/CopyPartyLink";
import AddCharacterControl from "@/components/parties/AddCharacterControl";
import RemoveFromPartyButton from "@/components/parties/RemoveFromPartyButton";

export default async function PartyRoster({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: userData }, { data: party }, species, subspecies, classes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("parties").select("id, name").eq("id", id).maybeSingle(),
    getSpeciesList(),
    getSubspeciesList(),
    getClassesList(),
  ]);

  if (!party) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-2xl font-bold text-tavern-gold">Party Not Found</h1>
          <p className="text-tavern-muted">This party doesn&apos;t exist, or the link is wrong.</p>
          <Link
            href="/parties"
            className="font-heading text-sm tracking-widest text-tavern-gold-light uppercase hover:text-tavern-gold"
          >
            &larr; Parties
          </Link>
        </div>
      </div>
    );
  }

  const { data: rosterRows } = await supabase
    .from("party_characters")
    .select("character_id, characters(id, name, draft, user_id)")
    .eq("party_id", id);

  const roster = (rosterRows ?? [])
    .map((row) => row.characters)
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const myUserId = userData.user?.id;
  let addableCharacters: { id: string; name: string }[] = [];

  if (myUserId) {
    const { data: myChars } = await supabase
      .from("characters")
      .select("id, name")
      .eq("user_id", myUserId);
    const rosterIds = new Set(roster.map((c) => c.id));
    addableCharacters = (myChars ?? []).filter((c) => !rosterIds.has(c.id));
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/parties"
          className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
        >
          &larr; Parties
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-heading text-3xl font-bold text-tavern-gold">{party.name}</h1>
          <CopyPartyLink partyId={party.id} />
        </div>

        {roster.length === 0 ? (
          <p className="mt-8 text-tavern-muted">No characters in this party yet.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {roster.map((c) => {
              const draft = c.draft as unknown as CharacterDraft;
              const sp = species.find((s) => s.index === draft.speciesIndex);
              const sub = subspecies.find((s) => s.index === draft.subspeciesIndex);
              const cls = classes.find((cl) => cl.index === draft.classIndex);
              const isMine = c.user_id === myUserId;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-tavern-border bg-tavern-card p-4"
                >
                  <Link href={`/characters/${c.id}`} className="flex-1 hover:opacity-80">
                    <div className="font-heading text-lg font-bold text-tavern-text">
                      {c.name}
                    </div>
                    <div className="mt-1 text-sm text-tavern-muted">
                      {sub ? sub.name : sp?.name}
                      {cls ? ` ${cls.name}` : ""}
                    </div>
                  </Link>
                  {isMine && <RemoveFromPartyButton partyId={party.id} characterId={c.id} />}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6">
          <AddCharacterControl partyId={party.id} addableCharacters={addableCharacters} />
        </div>

        {!myUserId && (
          <p className="mt-6 text-sm text-tavern-muted">
            <Link href="/login" className="text-tavern-gold-light underline hover:text-tavern-gold">
              Sign in
            </Link>{" "}
            to add one of your own characters to this party.
          </p>
        )}
      </div>
    </div>
  );
}
