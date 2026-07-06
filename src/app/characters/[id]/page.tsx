import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getSkillsList,
  getEquipmentLookup,
  getLanguagesList,
  getMagicItemLookup,
  getFeaturesForClass,
  getSubclassesForClass,
  getGeneralFeatsList,
  getEpicBoonFeats,
  getFightingStyleFeats,
  getWeaponMasteryProperties,
  getSpellsForClass,
  getSpellsByIndex,
  getTraitDescriptions,
} from "@/lib/srd";
import {
  EMPTY_DRAFT,
  LINEAGE_CANTRIP_CLASS,
  SPECIES_CANTRIP_SPELL,
  SUBCLASS_PREPARED_SPELLS,
  type CharacterDraft,
} from "@/lib/character";
import type { PersonalityAnswers } from "@/lib/personality";
import type { InventoryItem } from "@/lib/inventory";
import type { MagicItem } from "@/lib/magic-items";
import type { Currency } from "@/lib/currency";
import { getUserFeats } from "@/app/homebrew/actions";
import PlaySheet from "@/components/playsheet/PlaySheet";

export default async function CharacterPlaySheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: userData },
    { data: character },
    species,
    subspecies,
    classes,
    backgrounds,
    skills,
    equipment,
    languages,
    magicItemLookup,
    generalFeats,
    epicBoonFeats,
    fightingStyleFeats,
    masteryProperties,
    traitDescriptions,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("characters")
      .select(
        "id, user_id, name, draft, is_public, avatar_url, bio, notes, personality, inventory, currency, magic_items",
      )
      .eq("id", id)
      .maybeSingle(),
    getSpeciesList(),
    getSubspeciesList(),
    getClassesList(),
    getBackgroundsList(),
    getSkillsList(),
    getEquipmentLookup(),
    getLanguagesList(),
    getMagicItemLookup(),
    getGeneralFeatsList(),
    getEpicBoonFeats(),
    getFightingStyleFeats(),
    getWeaponMasteryProperties(),
    getTraitDescriptions(),
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
  // The owner's custom homebrew feats are offered alongside the built-in feats
  // in the picker (and resolve their name/description in the Features list).
  // Only the owner sees their own homebrew, so this is skipped for viewers.
  const userFeats = isOwner ? await getUserFeats() : [];
  const allGeneralFeats = [...generalFeats, ...userFeats];
  // Merged against EMPTY_DRAFT the same way the builder wizard's localStorage
  // hydration already is — a character saved before some later CharacterDraft
  // field existed (weaponMasteryChoices, fightingStyleChoices, etc.) has a
  // raw DB row that's simply missing that key, and a bare cast leaves it
  // `undefined` rather than that field's real default. Any code that calls
  // an array method on it (e.g. `.length`) then throws for every character
  // saved before that field shipped — confirmed live with a hand-inserted
  // pre-Weapon-Mastery draft, the same trap CLAUDE.md already documents for
  // the builder wizard's own localStorage path, just never fixed here too.
  const draft = { ...EMPTY_DRAFT, ...(character.draft as unknown as CharacterDraft) };
  const [features, subclassOptions, classSpells] = draft.classIndex
    ? await Promise.all([
        getFeaturesForClass(draft.classIndex),
        getSubclassesForClass(draft.classIndex),
        getSpellsForClass(draft.classIndex),
      ])
    : [[], [], []];

  // Fetch description/combat data for the specific spells this subspecies
  // grants (Fire Bolt for Infernal Tiefling, Dancing Lights for Drow, etc.)
  // by collecting their indexes directly from the subspecies trait list rather
  // than fetching an entire class's spell catalog.
  const characterSubspecies = subspecies.find((s) => s.index === draft.subspeciesIndex) ?? null;
  const lineageSpellIndexes = (characterSubspecies?.traits ?? [])
    .filter((t) => t.index.startsWith("lineage-spell-"))
    .map((t) => t.index.replace(/^lineage-spell-/, ""));
  // Base-species cantrips (e.g. Tiefling's Thaumaturgy via Otherworldly
  // Presence) live on the species, not a lineage-spell-* subspecies trait —
  // collect their spell indexes too so the at-will cantrip can be surfaced.
  const characterSpecies = species.find((s) => s.index === draft.speciesIndex) ?? null;
  const speciesCantripIndexes = (characterSpecies?.traits ?? [])
    .map((t) => SPECIES_CANTRIP_SPELL[t.index])
    .filter((idx): idx is string => Boolean(idx));
  const lineageSpellData = await getSpellsByIndex([
    ...lineageSpellIndexes,
    ...speciesCantripIndexes,
  ]);

  // For subspecies with a swappable cantrip (currently only High Elf), also
  // fetch all cantrips from that class so the picker can show the full list.
  const lineageCantripClass = draft.subspeciesIndex
    ? (LINEAGE_CANTRIP_CLASS[draft.subspeciesIndex] ?? null)
    : null;
  const cantripPickerSpells = lineageCantripClass
    ? (lineageCantripClass === draft.classIndex
        ? classSpells
        : await getSpellsForClass(lineageCantripClass)
      ).filter((s) => s.level === 0)
    : [];

  // Combine: specific lineage spell data + any cantrip picker options not
  // already covered (e.g. a non-lineage-spell wizard cantrip the player
  // switched to, which won't be in lineageSpellData by index).
  const seenIndexes = new Set(lineageSpellData.map((s) => s.index));
  const lineageCantripSpells = [
    ...lineageSpellData,
    ...cantripPickerSpells.filter((s) => !seenIndexes.has(s.index)),
  ];

  // Detail data (description/range/attack/damage) for subclass always-prepared
  // spells (Life Domain / Fiend / Draconic Sorcery), fetched by slug. A few
  // 2024-only spells aren't in the 2014 dataset and simply won't resolve here —
  // the play sheet shows those as name-only rows.
  const subclassSpellIndexes = (SUBCLASS_PREPARED_SPELLS[draft.subclassIndex ?? ""] ?? [])
    .flatMap((m) => m.spells.map((s) => s.index));
  const subclassSpellData = await getSpellsByIndex(subclassSpellIndexes);

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
      languages={languages}
      magicItemLookup={Array.from(magicItemLookup.values())}
      features={features}
      subclassOptions={subclassOptions}
      generalFeats={allGeneralFeats}
      epicBoonFeats={epicBoonFeats}
      fightingStyleFeats={fightingStyleFeats}
      masteryProperties={masteryProperties}
      traitDescriptions={traitDescriptions}
      classSpells={classSpells}
      lineageCantripSpells={lineageCantripSpells}
      subclassSpellData={subclassSpellData}
      isOwner={isOwner}
      isPublic={character.is_public}
      avatarUrl={character.avatar_url}
      bio={character.bio}
      notes={character.notes}
      personality={character.personality as unknown as PersonalityAnswers | null}
      inventory={(character.inventory as unknown as InventoryItem[] | null) ?? []}
      currency={character.currency as unknown as Currency | null}
      magicItems={(character.magic_items as unknown as MagicItem[] | null) ?? []}
    />
  );
}
