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
  type SpellOption,
} from "@/lib/srd";
import {
  LINEAGE_CANTRIP_CLASS,
  SPECIES_CANTRIP_SPELL,
  SUBCLASS_PREPARED_SPELLS,
  normalizeDraft,
  orderedClasses,
  type CharacterDraft,
} from "@/lib/character";
import type { PersonalityAnswers } from "@/lib/personality";
import { parseCharacterEffectRow, type CharacterEffectRow } from "@/lib/dm-effects";
import type { InventoryItem } from "@/lib/inventory";
import type { MagicItem } from "@/lib/magic-items";
import type { Currency } from "@/lib/currency";
import {
  getUserFeats,
  getUserSubclasses,
  getUserBackgrounds,
  getUserSpecies,
  getUserSpells,
  getUserClasses,
} from "@/app/homebrew/actions";
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
  // normalizeDraft merges against EMPTY_DRAFT (surviving the missing-key trap
  // for rows saved before a field existed — see CLAUDE.md) AND backfills the
  // multiclass fields for legacy single-class rows — see character.ts.
  const draft = normalizeDraft(character.draft as unknown as CharacterDraft);

  // Everything below depends only on the draft + the reference lists already
  // fetched above, so it all goes in ONE parallel batch (this used to be 4-5
  // sequential await stages): the owner's homebrew content, each class's
  // features/subclasses/spells, lineage spell details, the swappable-cantrip
  // class list, and subclass always-prepared spell details.
  const classList = orderedClasses(draft);
  const characterSubspecies = subspecies.find((s) => s.index === draft.subspeciesIndex) ?? null;
  const lineageSpellIndexes = (characterSubspecies?.traits ?? [])
    .filter((t) => t.index.startsWith("lineage-spell-"))
    .map((t) => t.index.replace(/^lineage-spell-/, ""));
  // Base-species cantrips (e.g. Tiefling's Thaumaturgy via Otherworldly
  // Presence) live on the species, not a lineage-spell-* subspecies trait.
  // Looked up against the SRD species list only — a homebrew species never
  // carries SPECIES_CANTRIP_SPELL trait indexes, so this matches the old
  // merged-list behaviour.
  const characterSpecies = species.find((s) => s.index === draft.speciesIndex) ?? null;
  const speciesCantripIndexes = (characterSpecies?.traits ?? [])
    .map((t) => SPECIES_CANTRIP_SPELL[t.index])
    .filter((idx): idx is string => Boolean(idx));
  // Subspecies with a swappable cantrip (currently only High Elf) need that
  // class's full cantrip list for the picker.
  const lineageCantripClass = draft.subspeciesIndex
    ? (LINEAGE_CANTRIP_CLASS[draft.subspeciesIndex] ?? null)
    : null;
  // Subclass always-prepared spells across every class's chosen subclass. A
  // few 2024-only spells aren't in the 2014 dataset and render name-only.
  const subclassSpellIndexes = classList.flatMap((c) =>
    (SUBCLASS_PREPARED_SPELLS[c.subclassIndex ?? ""] ?? []).flatMap((m) =>
      m.spells.map((s) => s.index),
    ),
  );

  const [
    userFeats,
    userSubclasses,
    userBackgrounds,
    userSpecies,
    userSpells,
    userClasses,
    { data: effectRows },
    perClass,
    lineageSpellData,
    lineageClassSpells,
    subclassSpellData,
  ] = await Promise.all([
    // Owner-only homebrew content: offered in the pickers and needed to
    // resolve a character built on homebrew species/background/class/spells.
    isOwner ? getUserFeats() : [],
    isOwner ? getUserSubclasses() : [],
    isOwner ? getUserBackgrounds() : [],
    isOwner ? getUserSpecies() : [],
    isOwner ? getUserSpells() : [],
    isOwner ? getUserClasses() : [],
    // DM-pushed effects (owner only; RLS scopes the select to the owner's
    // view anyway, this just skips the query for visitors).
    isOwner
      ? supabase
          .from("character_effects")
          .select("id, character_id, party_id, kind, name, data, created_at")
          .eq("character_id", id)
          .order("created_at")
      : Promise.resolve({ data: null }),
    // Features/subclasses/spells per class the character has levels in
    // (primary first) — a multiclass sheet shows both classes' content.
    Promise.all(
      classList.map(async (c) => {
        const [classFeatures, classSubclasses, classSpellList] = await Promise.all([
          getFeaturesForClass(c.classIndex),
          getSubclassesForClass(c.classIndex),
          getSpellsForClass(c.classIndex),
        ]);
        return {
          classIndex: c.classIndex,
          subclassIndex: c.subclassIndex,
          features: classFeatures,
          subclassOptions: classSubclasses,
          classSpells: classSpellList,
        };
      }),
    ),
    getSpellsByIndex([...lineageSpellIndexes, ...speciesCantripIndexes]),
    lineageCantripClass ? getSpellsForClass(lineageCantripClass) : ([] as SpellOption[]),
    getSpellsByIndex(subclassSpellIndexes),
  ]);

  const allGeneralFeats = [...generalFeats, ...userFeats];
  const allSpecies = [...species, ...userSpecies];
  const allBackgrounds = [...backgrounds, ...userBackgrounds];
  const allClasses = [...classes, ...userClasses];
  // Merge the owner's homebrew species trait text into the trait-description
  // lookup so their Species Traits render with full descriptions.
  const allTraitDescriptions = {
    ...traitDescriptions,
    ...Object.fromEntries(userSpecies.flatMap((s) => Object.entries(s.traitDescriptions))),
  };

  // Base-class features, each tagged with its owning class so the Features list
  // can filter by that class's level (a Wizard-3 feature shows only if the
  // character has ≥3 Wizard levels, regardless of total level).
  const features = [
    ...perClass.flatMap((p) => p.features.map((f) => ({ ...f, classIndex: p.classIndex }))),
    // Homebrew class features aren't in the `features` table — they ride on the
    // UserClass and are filtered by class level in the Features list.
    ...userClasses.flatMap((uc) => uc.features),
  ];
  // Flat union of every class's subclass options (for name lookups + the
  // base-feature dedup) plus a per-class map (for the per-class subclass picker).
  // Merge the owner's custom subclasses into each class's option list.
  const subclassesForClass = (classIndex: string, base: typeof perClass[number]["subclassOptions"]) => [
    ...base,
    ...userSubclasses
      .filter((us) => us.classIndex === classIndex)
      .map(({ classIndex: _c, ...option }) => option),
  ];
  const subclassOptions = perClass.flatMap((p) => subclassesForClass(p.classIndex, p.subclassOptions));
  const subclassOptionsByClass = Object.fromEntries(
    perClass.map((p) => [p.classIndex, subclassesForClass(p.classIndex, p.subclassOptions)]),
  );
  // Merge the owner's homebrew spells into each class's spell list (a spell can
  // belong to several classes).
  const spellsForClass = (classIndex: string, base: typeof perClass[number]["classSpells"]) => [
    ...base,
    ...userSpells
      .filter((us) => us.classes.includes(classIndex))
      .map(({ classes: _c, ...option }) => option),
  ];
  const classSpellsByClass = Object.fromEntries(
    perClass.map((p) => [p.classIndex, spellsForClass(p.classIndex, p.classSpells)]),
  );
  const classSpells = perClass[0] ? spellsForClass(perClass[0].classIndex, perClass[0].classSpells) : [];

  // Swappable-cantrip picker options (High Elf): all cantrips from the
  // lineage's class, with the owner's homebrew cantrips for that class merged
  // in the same way as the main pickers.
  const cantripPickerSpells = lineageCantripClass
    ? spellsForClass(lineageCantripClass, lineageClassSpells).filter((s) => s.level === 0)
    : [];

  // Combine: specific lineage spell data + any cantrip picker options not
  // already covered (e.g. a non-lineage-spell wizard cantrip the player
  // switched to, which won't be in lineageSpellData by index).
  const seenIndexes = new Set(lineageSpellData.map((s) => s.index));
  const lineageCantripSpells = [
    ...lineageSpellData,
    ...cantripPickerSpells.filter((s) => !seenIndexes.has(s.index)),
  ];

  return (
    <PlaySheet
      characterId={character.id}
      draft={draft}
      species={allSpecies}
      subspecies={subspecies}
      classes={allClasses}
      backgrounds={allBackgrounds}
      skills={skills}
      equipment={Array.from(equipment.values())}
      languages={languages}
      magicItemLookup={Array.from(magicItemLookup.values())}
      features={features}
      subclassOptions={subclassOptions}
      subclassOptionsByClass={subclassOptionsByClass}
      classSpellsByClass={classSpellsByClass}
      generalFeats={allGeneralFeats}
      epicBoonFeats={epicBoonFeats}
      fightingStyleFeats={fightingStyleFeats}
      masteryProperties={masteryProperties}
      traitDescriptions={allTraitDescriptions}
      classSpells={classSpells}
      lineageCantripSpells={lineageCantripSpells}
      subclassSpellData={subclassSpellData}
      isOwner={isOwner}
      isPublic={character.is_public}
      dmEffects={((effectRows ?? []) as CharacterEffectRow[]).map(parseCharacterEffectRow)}
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
