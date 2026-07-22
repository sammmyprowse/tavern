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
import { parseCharacterEffectRow, type CharacterEffect, type CharacterEffectRow } from "@/lib/dm-effects";
import { getUserMonsters } from "@/app/homebrew/actions";
import EncounterManager from "@/components/dm/EncounterManager";
import PartyControls from "@/components/dm/PartyControls";

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

  const [{ data: rosterRows }, { data: encounterRows }, { data: effectRows }, { data: noteRows }] =
    await Promise.all([
      supabase
        .from("party_characters")
        .select("character_id, characters(id, name, draft, user_id)")
        .eq("party_id", id),
      supabase
        .from("encounters")
        .select("id, name, state, created_at")
        .eq("party_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("character_effects")
        .select("id, character_id, party_id, kind, name, data, created_at")
        .eq("party_id", id)
        .order("created_at"),
      supabase
        .from("party_character_notes")
        .select("character_id, note")
        .eq("party_id", id),
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

  // Full stat blocks for every monster already placed in a saved encounter,
  // plus ALL of the leader's homebrew monsters (small, owner-scoped list —
  // they're needed both as stat blocks and as builder list entries). Newly
  // built encounters trigger a server round-trip (create → revalidate), so
  // this list is always complete by the time the run view renders. A user
  // monster that was deleted after being saved into an encounter simply has
  // no stat block — MonsterCard tolerates that.
  const usedIndexes = [
    ...new Set(encounters.flatMap((e) => e.state.monsters.map((m) => m.index))),
  ];
  const [usedStatBlocks, userMonsters] = await Promise.all([
    getMonstersByIndex(usedIndexes.filter((i) => !i.startsWith("user-monster:"))),
    getUserMonsters(),
  ]);
  const statBlocksByIndex: Record<string, MonsterStatBlock> = Object.fromEntries(
    [...usedStatBlocks, ...userMonsters].map((sb) => [sb.index, sb]),
  );

  // Homebrew monsters join the builder's pick list, re-sorted into the same
  // CR-then-name order the SRD list arrives in.
  const allMonsters = [
    ...monsters,
    ...userMonsters.map((sb) => ({
      index: sb.index,
      name: sb.name,
      type: sb.type,
      size: sb.size,
      challengeRating: sb.challengeRating,
      xp: sb.xp,
      armorClass: sb.armorClass,
      hitPoints: sb.hitPoints,
      isHomebrew: true,
    })),
  ].sort((a, b) => a.challengeRating - b.challengeRating || a.name.localeCompare(b.name));

  const managerMembers = members.map((m) => ({
    id: m.id,
    name: m.name,
    level: m.draft.level,
    initiativeMod: m.sheet?.initiative ?? 0,
  }));

  const effectsByCharacter: Record<string, CharacterEffect[]> = {};
  for (const row of (effectRows ?? []) as CharacterEffectRow[]) {
    const effect = parseCharacterEffectRow(row);
    (effectsByCharacter[effect.characterId] ??= []).push(effect);
  }
  const notesByCharacter: Record<string, string> = Object.fromEntries(
    (noteRows ?? []).map((n) => [n.character_id, n.note]),
  );

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

        <PartyControls
          partyId={party.id}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          effectsByCharacter={effectsByCharacter}
          notesByCharacter={notesByCharacter}
        />

        <EncounterManager
          partyId={party.id}
          monsters={allMonsters}
          statBlocksByIndex={statBlocksByIndex}
          encounters={encounters}
          members={managerMembers}
        />
      </div>
    </div>
  );
}
