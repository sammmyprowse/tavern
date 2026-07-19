import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getSkillsList,
  getMonsterList,
  getMonstersByIndex,
  type MonsterStatBlock,
} from "@/lib/srd";
import { normalizeDraft, type CharacterDraft } from "@/lib/character";
import { buildCharacterSheet } from "@/lib/character-sheet";
import { normalizeEncounterState, formatMod, type EncounterState } from "@/lib/encounter";
import EncounterManager from "@/components/dm/EncounterManager";

// The DM screen: party-leader-only. A stat dashboard over every member's
// derived sheet plus the encounter builder/runner. AC is deliberately absent —
// equipped armor lives in each player's client-side play state, so the server
// can't know it.
export default async function DmScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: userData }, { data: party }, species, subspecies, classes, backgrounds, skills, monsters] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.from("parties").select("id, name, created_by").eq("id", id).maybeSingle(),
      getSpeciesList(),
      getSubspeciesList(),
      getClassesList(),
      getBackgroundsList(),
      getSkillsList(),
      getMonsterList(),
    ]);

  const myUserId = userData.user?.id;
  const isLeader = Boolean(party) && Boolean(myUserId) && myUserId === party!.created_by;

  if (!party || !isLeader) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-heading text-2xl font-bold text-tavern-gold">DM Screen</h1>
          <p className="text-tavern-muted">
            {party
              ? "Only the party leader can open the DM screen for this party."
              : "This party doesn't exist, or the link is wrong."}
          </p>
          <Link
            href={party ? `/parties/${party.id}` : "/parties"}
            className="font-heading text-sm tracking-widest text-tavern-gold-light uppercase hover:text-tavern-gold"
          >
            &larr; {party ? "Party" : "Parties"}
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: rosterRows }, { data: encounterRows }] = await Promise.all([
    supabase
      .from("party_characters")
      .select("character_id, characters(id, name, draft, user_id)")
      .eq("party_id", id),
    supabase
      .from("encounters")
      .select("id, name, state, created_at")
      .eq("party_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const roster = (rosterRows ?? [])
    .map((row) => row.characters)
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const refs = { species, subspecies, classes, backgrounds, skills };
  const members = roster.map((c) => {
    const draft = normalizeDraft(c.draft as unknown as CharacterDraft);
    // Null when the character is built on its owner's homebrew species/class/
    // background (homebrew refs are owner-scoped) — shown as a fallback row.
    const sheet = buildCharacterSheet(draft, refs);
    return { id: c.id, name: c.name, draft, sheet };
  });

  const encounters = (encounterRows ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    state: normalizeEncounterState(e.state as unknown as EncounterState),
  }));

  // Full stat blocks for every monster already placed in a saved encounter.
  // Newly built encounters trigger a server round-trip (create → revalidate),
  // so this list is always complete by the time the run view renders.
  const usedIndexes = [
    ...new Set(encounters.flatMap((e) => e.state.monsters.map((m) => m.index))),
  ];
  const usedStatBlocks = await getMonstersByIndex(usedIndexes);
  const statBlocksByIndex: Record<string, MonsterStatBlock> = Object.fromEntries(
    usedStatBlocks.map((sb) => [sb.index, sb]),
  );

  const managerMembers = members.map((m) => ({
    id: m.id,
    name: m.name,
    level: m.draft.level,
    initiativeMod: m.sheet?.initiative ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href={`/parties/${party.id}`}
          className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
        >
          &larr; {party.name}
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold text-tavern-gold">DM Screen</h1>

        <h2 className="mt-8 font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Party
        </h2>
        {members.length === 0 ? (
          <p className="mt-3 text-tavern-muted">No characters in this party yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-tavern-border bg-tavern-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-tavern-border text-[10px] tracking-wider text-tavern-muted uppercase">
                  <th className="px-3 py-2">Character</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Lvl</th>
                  <th className="px-3 py-2">Max HP</th>
                  <th className="px-3 py-2">Pass. Perc.</th>
                  <th className="px-3 py-2">Init.</th>
                  <th className="px-3 py-2">Speed</th>
                  <th className="px-3 py-2">Spell DC</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-tavern-border last:border-b-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/characters/${m.id}`}
                        className="font-heading font-bold text-tavern-text hover:text-tavern-gold-light"
                      >
                        {m.name}
                      </Link>
                    </td>
                    {m.sheet ? (
                      <>
                        <td className="px-3 py-2 text-tavern-muted">
                          {m.sheet.classes.map((c) => `${c.className} ${c.level}`).join(" / ")}
                        </td>
                        <td className="px-3 py-2 text-tavern-text">{m.sheet.level}</td>
                        <td className="px-3 py-2 text-tavern-text">{m.sheet.maxHpValue}</td>
                        <td className="px-3 py-2 text-tavern-text">{m.sheet.passivePerception}</td>
                        <td className="px-3 py-2 text-tavern-text">{formatMod(m.sheet.initiative)}</td>
                        <td className="px-3 py-2 text-tavern-text">
                          {m.sheet.speed !== null ? `${m.sheet.speed} ft` : "—"}
                        </td>
                        <td className="px-3 py-2 text-tavern-text">
                          {m.sheet.spellcasting.length > 0
                            ? m.sheet.spellcasting
                                .map((sc) => `${sc.saveDC} (${sc.className})`)
                                .join(", ")
                            : "—"}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="px-3 py-2 text-xs text-tavern-muted">
                        Uses homebrew content only its owner can resolve — open the sheet for
                        details.
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-tavern-muted">
          AC isn&apos;t shown — equipped armor is tracked on each player&apos;s own play sheet.
        </p>

        <EncounterManager
          partyId={party.id}
          monsters={monsters}
          statBlocksByIndex={statBlocksByIndex}
          encounters={encounters}
          members={managerMembers}
        />
      </div>
    </div>
  );
}
