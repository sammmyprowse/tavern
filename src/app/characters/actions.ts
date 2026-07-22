"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  MAX_LEVEL,
  ORDER_CHOICES,
  GIANT_ANCESTRY_OPTIONS,
  ASI_LEVELS,
  ABILITY_ORDER,
  EXPERTISE_SCHEDULE,
  FIGHTING_STYLE_KNOWN_BY_CLASS,
  CANTRIPS_KNOWN_BY_CLASS,
  metamagicKnownMax,
  normalizeDraft,
  classLevelOf,
  appendClassLevel,
  meetsMulticlassPrereq,
  finalAbilityScores,
  type AbilityKey,
  type AbilityBonusChoice,
  type CharacterDraft,
} from "@/lib/character";
import type { PersonalityAnswers } from "@/lib/personality";
import type { InventoryItem } from "@/lib/inventory";
import type { MagicItem } from "@/lib/magic-items";
import type { Currency } from "@/lib/currency";
import type { Json } from "@/lib/database.types";

// Shared by every action below that mutates a single owned character's draft:
// authenticate, then fetch the draft scoped to that user. Centralized so the
// ownership filter (`.eq("user_id", ...)`) can't be forgotten on a new action.
async function loadOwnedDraft(characterId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "You need to sign in to do that." };
  }

  const { data: character } = await supabase
    .from("characters")
    .select("draft")
    .eq("id", characterId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!character) {
    return { ok: false as const, error: "Character not found." };
  }

  return {
    ok: true as const,
    supabase,
    userId: userData.user.id,
    // normalizeDraft merges against EMPTY_DRAFT (so a row saved before a later
    // CharacterDraft field existed doesn't crash on a missing key) AND backfills
    // the multiclass fields (levelClasses, per-class buckets, feat attribution)
    // for legacy single-class rows. Same trap documented in CLAUDE.md, now
    // handled in one place for every action that mutates a draft.
    draft: normalizeDraft(character.draft as unknown as CharacterDraft),
  };
}

// Final ability scores derived from the draft alone (base + background bonus +
// every ASI pick), no SRD refs needed — enough to check multiclass ability
// prerequisites server-side. Mirrors buildCharacterSheet's own computation.
function finalScoresFromDraft(draft: CharacterDraft): Record<AbilityKey, number> {
  const asiBonuses = draft.featChoices
    .filter((fc) => fc.featIndex === "ability-score-improvement")
    .map((fc) => fc.abilityBonus);
  const raw = finalAbilityScores(draft.baseAbilityScores, [
    draft.backgroundAbilityBonus,
    ...asiBonuses,
  ]);
  const scores = {} as Record<AbilityKey, number>;
  for (const a of ABILITY_ORDER) scores[a] = raw[a] ?? 10;
  return scores;
}

async function saveDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  characterId: string,
  userId: string,
  draft: CharacterDraft,
) {
  return supabase
    .from("characters")
    .update({ draft: draft as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userId);
}

export interface SetPublicResult {
  success: boolean;
  error?: string;
}

export async function setCharacterPublic(
  characterId: string,
  isPublic: boolean,
): Promise<SetPublicResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ is_public: isPublic })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetBioResult {
  success: boolean;
  error?: string;
}

export async function setCharacterBio(characterId: string, bio: string): Promise<SetBioResult> {
  if (bio.length > 2000) {
    return { success: false, error: "Bio is too long (max 2000 characters)." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ bio })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

// Free-form campaign notes (a running journal). Same shape as setCharacterBio,
// with a larger cap since a campaign log grows over many sessions.
export async function setCharacterNotes(characterId: string, notes: string): Promise<SetBioResult> {
  if (notes.length > 20000) {
    return { success: false, error: "Notes are too long (max 20000 characters)." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ notes })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetPersonalityResult {
  success: boolean;
  error?: string;
}

export async function setCharacterPersonality(
  characterId: string,
  personality: PersonalityAnswers | null,
): Promise<SetPersonalityResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ personality: personality as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetInventoryResult {
  success: boolean;
  error?: string;
}

// Same freely-overwritable shape as setMetamagicChoices/setFightingStyleChoices
// — the client manages add/remove/edit as local array operations and sends
// the full updated list each time, rather than separate add/remove actions.
export async function setCharacterInventory(
  characterId: string,
  inventory: InventoryItem[],
): Promise<SetInventoryResult> {
  if (!Array.isArray(inventory) || inventory.length > 200) {
    return { success: false, error: "Invalid inventory." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ inventory: inventory as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetCurrencyResult {
  success: boolean;
  error?: string;
}

export async function setCharacterCurrency(
  characterId: string,
  currency: Currency,
): Promise<SetCurrencyResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ currency: currency as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetMagicItemsResult {
  success: boolean;
  error?: string;
}

// Same freely-overwritable shape as setCharacterInventory — separate
// column/action rather than folded into inventory, since a magic item has
// a meaningfully different shape (anchors into magic_items, not
// equipment; no baseIndex/attackBonus/damageBonus/bonusDamageDice).
export async function setCharacterMagicItems(
  characterId: string,
  magicItems: MagicItem[],
): Promise<SetMagicItemsResult> {
  if (!Array.isArray(magicItems) || magicItems.length > 200) {
    return { success: false, error: "Invalid magic items." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ magic_items: magicItems as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface SetAvatarResult {
  success: boolean;
  error?: string;
}

export async function setCharacterAvatar(
  characterId: string,
  avatarUrl: string | null,
): Promise<SetAvatarResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .update({ avatar_url: avatarUrl })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true };
}

export interface DeleteCharacterResult {
  success: boolean;
  error?: string;
}

export async function deleteCharacter(characterId: string): Promise<DeleteCharacterResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/characters");
  return { success: true };
}

// Owner-side dismissal of a DM-pushed effect (character_effects). No explicit
// ownership filter is possible here (the owner test lives on the characters
// row, not this one) — like removeCharacterFromParty, this relies entirely on
// the table's OR'd delete policies: character's owner OR the pushing leader.
export async function dismissCharacterEffect(effectId: string): Promise<SetBioResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase.from("character_effects").delete().eq("id", effectId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

export interface LevelUpResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

// hpGain is the already-resolved HP increase (rolled or averaged client-side
// via the dice engine, same split of responsibility as the rest of the play
// sheet) — this action's job is only to persist the new level/draft.
// classIndex is the class the new level goes into (defaults to the primary
// class = "continue your main class"). If it's a class the character doesn't
// have yet, this is a multiclass into it — its ability prerequisites are
// enforced here (server-side, from the draft's own scores).
export async function levelUpCharacter(
  characterId: string,
  hpGain: number,
  classIndex?: string,
): Promise<LevelUpResult> {
  if (!Number.isInteger(hpGain) || hpGain < 1) {
    return { success: false, error: "Invalid HP gain." };
  }

  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (draft.level >= MAX_LEVEL) {
    return { success: false, error: `Already at the maximum level (${MAX_LEVEL}).` };
  }

  const chosen = classIndex ?? draft.classIndex;
  if (!chosen) {
    return { success: false, error: "No class selected for this level." };
  }

  // Multiclassing INTO a new class requires meeting its ability prerequisites.
  const isNewClass = classLevelOf(draft, chosen) === 0;
  if (isNewClass && !meetsMulticlassPrereq(finalScoresFromDraft(draft), chosen)) {
    return {
      success: false,
      error: "You don't meet the ability score prerequisites to multiclass into that class.",
    };
  }

  const nextDraft = appendClassLevel(draft, chosen, hpGain);

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface LevelDownResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

// Safety net for an accidental Level Up click — undoes the level increment
// and HP roll, and trims back any choices that are no longer valid at the
// lower level (subclass below 3, feats/expertise/fighting styles/metamagic/
// cantrips past their new level's count). Only truncates the END of each
// append-style list rather than wiping it, so a level-down from 9 to 8 keeps
// earlier milestone picks and only drops whatever the level being removed
// granted. Deliberately does NOT touch preparedSpells — its cap
// (preparedSpellCount) needs the character's FINAL ability modifier
// (species/background/ASI-adjusted), which isn't derivable here without the
// SRD species/background lookups this action doesn't have; left as a
// disclosed gap rather than guessed at, same as every other "can't fully
// verify server-side" call in this app.
export async function levelDownCharacter(characterId: string): Promise<LevelDownResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (draft.level <= 1) {
    return { success: false, error: "Already at level 1." };
  }

  // The level being removed is the most recently gained one — remove it from
  // whatever class it went into (which may be a secondary class).
  const poppedClass = draft.levelClasses[draft.levelClasses.length - 1] ?? draft.classIndex ?? "";
  const newLevel = draft.level - 1;
  const newLevelClasses = draft.levelClasses.slice(0, -1);
  // The popped class's NEW level after removing this one.
  const newClassLevel = classLevelOf(
    { ...draft, level: newLevel, levelClasses: newLevelClasses },
    poppedClass,
  );

  // What the popped class is allowed to know/have at its new (lower) level.
  const expertiseMax = (EXPERTISE_SCHEDULE[poppedClass] ?? [])
    .filter((m) => m.level <= newClassLevel)
    .reduce((sum, m) => sum + m.count, 0);
  const fightingStyleMax = FIGHTING_STYLE_KNOWN_BY_CLASS[poppedClass]?.(newClassLevel) ?? 0;
  const cantripsMax = CANTRIPS_KNOWN_BY_CLASS[poppedClass]?.(newClassLevel) ?? 0;
  const metamagicMax = poppedClass === "sorcerer" ? metamagicKnownMax(newClassLevel) : 0;

  const isPrimary = poppedClass === draft.classIndex;

  // Truncate a secondary class's per-class bucket to `max`; a class that hit 0
  // levels has its bucket removed entirely.
  const sliceBucket = (map: Record<string, string[]>, max: number): Record<string, string[]> => {
    const next = { ...map };
    if (newClassLevel === 0) delete next[poppedClass];
    else if (next[poppedClass]) next[poppedClass] = next[poppedClass].slice(0, max);
    return next;
  };
  // For the primary class its choices live in the legacy flat arrays.
  const sliceLegacy = (arr: string[], max: number) => (isPrimary ? arr.slice(0, max) : arr);

  const secondarySubclasses = { ...draft.secondarySubclasses };
  const secondaryOrderChoice = { ...draft.secondaryOrderChoice };
  let subclassIndex = draft.subclassIndex;
  if (isPrimary) {
    if (newClassLevel < 3) subclassIndex = null;
  } else if (newClassLevel < 3) {
    delete secondarySubclasses[poppedClass];
  }
  if (newClassLevel === 0) {
    delete secondarySubclasses[poppedClass];
    delete secondaryOrderChoice[poppedClass];
  }

  const nextDraft: CharacterDraft = {
    ...draft,
    level: newLevel,
    levelClasses: newLevelClasses,
    hpRolls: draft.hpRolls.slice(0, -1),
    subclassIndex,
    secondarySubclasses,
    secondaryOrderChoice,
    // Drop feats the popped class earned at a milestone above its new level.
    featChoices: draft.featChoices.filter((f) => {
      const owner = f.classIndex ?? draft.classIndex;
      return owner !== poppedClass || f.level <= newClassLevel;
    }),
    // Primary class → legacy flat arrays; a secondary class → its bucket.
    expertiseChoices: sliceLegacy(draft.expertiseChoices, expertiseMax),
    fightingStyleChoices: sliceLegacy(draft.fightingStyleChoices, fightingStyleMax),
    knownCantrips: sliceLegacy(draft.knownCantrips, cantripsMax),
    metamagicChoices: sliceLegacy(draft.metamagicChoices, metamagicMax),
    classExpertise: isPrimary ? draft.classExpertise : sliceBucket(draft.classExpertise, expertiseMax),
    classFightingStyles: isPrimary
      ? draft.classFightingStyles
      : sliceBucket(draft.classFightingStyles, fightingStyleMax),
    classCantrips: isPrimary ? draft.classCantrips : sliceBucket(draft.classCantrips, cantripsMax),
    classMetamagic: isPrimary ? draft.classMetamagic : sliceBucket(draft.classMetamagic, metamagicMax),
    // Prepared spells aren't truncated (cap needs the final ability modifier —
    // same disclosed gap as before); weapon mastery is a level-1 grant that
    // never scales, so buckets only need clearing if a secondary class is gone.
    classPreparedSpells:
      !isPrimary && newClassLevel === 0
        ? Object.fromEntries(Object.entries(draft.classPreparedSpells).filter(([k]) => k !== poppedClass))
        : draft.classPreparedSpells,
    classWeaponMastery:
      !isPrimary && newClassLevel === 0
        ? Object.fromEntries(Object.entries(draft.classWeaponMastery).filter(([k]) => k !== poppedClass))
        : draft.classWeaponMastery,
  };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface ChooseSubclassResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

export async function chooseSubclass(
  characterId: string,
  subclassIndex: string,
  classIndex?: string,
): Promise<ChooseSubclassResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  const cls = classIndex ?? draft.classIndex;
  if (!cls || classLevelOf(draft, cls) < 3) {
    return { success: false, error: "Subclass unlocks at level 3 in that class." };
  }

  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, subclassIndex }
      : {
          ...draft,
          secondarySubclasses: { ...draft.secondarySubclasses, [cls]: subclassIndex },
        };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface ChooseOrderResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

export async function chooseOriginOrder(
  characterId: string,
  choiceKey: string,
  classIndex?: string,
): Promise<ChooseOrderResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  const cls = classIndex ?? draft.classIndex ?? "";
  const options = ORDER_CHOICES[cls];
  if (!options) {
    return { success: false, error: "This class doesn't have an Order choice." };
  }
  if (!options.some((o) => o.key === choiceKey)) {
    return { success: false, error: "Invalid choice." };
  }

  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, orderChoice: choiceKey }
      : {
          ...draft,
          secondaryOrderChoice: { ...draft.secondaryOrderChoice, [cls]: choiceKey },
        };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface ChooseGiantAncestryResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

export async function chooseGiantAncestry(
  characterId: string,
  choiceKey: string,
): Promise<ChooseGiantAncestryResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (draft.speciesIndex !== "goliath") {
    return { success: false, error: "Only Goliaths can choose a Giant Ancestry benefit." };
  }
  if (!GIANT_ANCESTRY_OPTIONS.some((o) => o.key === choiceKey)) {
    return { success: false, error: "Invalid choice." };
  }

  const nextDraft: CharacterDraft = { ...draft, giantAncestryChoice: choiceKey };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface ChooseFeatResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

function isValidAsiBonus(bonus: AbilityBonusChoice): boolean {
  if (bonus.mode !== "two") return false;
  if (bonus.plusTwo) return bonus.plusOne.length === 0;
  return bonus.plusOne.length === 2 && bonus.plusOne[0] !== bonus.plusOne[1];
}

export async function chooseFeat(
  characterId: string,
  level: number,
  featIndex: string,
  abilityBonus: AbilityBonusChoice | null,
  classIndex?: string,
): Promise<ChooseFeatResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  // `level` is the OWNING class's level milestone; validate against that class.
  const cls = classIndex ?? draft.classIndex ?? "";
  if (!ASI_LEVELS.includes(level) || level > classLevelOf(draft, cls)) {
    return { success: false, error: "Not a feat choice you can make yet." };
  }
  if (draft.featChoices.some((fc) => (fc.classIndex ?? draft.classIndex) === cls && fc.level === level)) {
    return { success: false, error: "Already chose a feat for that level." };
  }

  const isAsi = featIndex === "ability-score-improvement";
  if (isAsi) {
    if (!abilityBonus || !isValidAsiBonus(abilityBonus)) {
      return { success: false, error: "Invalid ability score choice." };
    }
  } else {
    if (abilityBonus) {
      return { success: false, error: "Invalid choice." };
    }
    if (draft.featChoices.some((fc) => fc.featIndex === featIndex)) {
      return { success: false, error: "You already have that feat." };
    }
  }

  const nextDraft: CharacterDraft = {
    ...draft,
    featChoices: [
      ...draft.featChoices,
      { classIndex: cls, level, featIndex, abilityBonus, takenAtCharLevel: draft.level },
    ],
  };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface ChooseExpertiseResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

export async function chooseExpertise(
  characterId: string,
  level: number,
  skillIndexes: string[],
  classIndex?: string,
): Promise<ChooseExpertiseResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  const cls = classIndex ?? draft.classIndex ?? "";
  const schedule = EXPERTISE_SCHEDULE[cls];
  const milestone = schedule?.find((m) => m.level === level);
  if (!milestone || level > classLevelOf(draft, cls)) {
    return { success: false, error: "Not an Expertise choice you can make yet." };
  }

  const isPrimary = cls === draft.classIndex;
  const existing = isPrimary ? draft.expertiseChoices : draft.classExpertise[cls] ?? [];
  const priorCount = schedule
    .filter((m) => m.level < level)
    .reduce((sum, m) => sum + m.count, 0);
  if (existing.length !== priorCount) {
    return { success: false, error: "Already chose Expertise for that level." };
  }

  const uniqueSkills = new Set(skillIndexes);
  if (uniqueSkills.size !== milestone.count || skillIndexes.length !== milestone.count) {
    return { success: false, error: `Choose exactly ${milestone.count} skills.` };
  }
  if (skillIndexes.some((s) => existing.includes(s))) {
    return { success: false, error: "Already have Expertise in one of those skills." };
  }

  const combined = [...existing, ...skillIndexes];
  const nextDraft: CharacterDraft = isPrimary
    ? { ...draft, expertiseChoices: combined }
    : { ...draft, classExpertise: { ...draft.classExpertise, [cls]: combined } };

  const { error: saveError } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (saveError) return { success: false, error: saveError.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export interface SetSpellsResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

// Unlike feat/subclass/expertise picks, known cantrips and prepared spells are
// freely re-settable (2024 rules let prepared casters swap their list on
// every Long Rest) — this overwrites the list wholesale rather than appending
// to a permanent choice log. Count limits are enforced by the picker UI, not
// re-derived here (same level of rigor as the other choice actions, which
// don't re-validate e.g. a subclass index against the real subclass list
// either — owner-only mutation on the player's own character, not an
// adversarial boundary), just a sanity cap against a malformed payload.
// Persist leveling mode and/or XP total. XP is clamped non-negative; the mode
// is validated. Doesn't itself change `level` — reaching a threshold enables
// the existing Level Up control, it doesn't auto-advance.
export async function setLevelingProgress(
  characterId: string,
  patch: { levelingMode?: "milestone" | "xp"; xp?: number },
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  const nextDraft: CharacterDraft = {
    ...draft,
    ...(patch.levelingMode === "milestone" || patch.levelingMode === "xp"
      ? { levelingMode: patch.levelingMode }
      : {}),
    ...(typeof patch.xp === "number" && isFinite(patch.xp)
      ? { xp: Math.max(0, Math.floor(patch.xp)) }
      : {}),
  };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export async function setKnownCantrips(
  characterId: string,
  cantripIndexes: string[],
  classIndex?: string,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(cantripIndexes) || cantripIndexes.length > 30) {
    return { success: false, error: "Invalid cantrip list." };
  }

  const cls = classIndex ?? draft.classIndex ?? "";
  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, knownCantrips: cantripIndexes }
      : { ...draft, classCantrips: { ...draft.classCantrips, [cls]: cantripIndexes } };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

export async function setPreparedSpells(
  characterId: string,
  spellIndexes: string[],
  classIndex?: string,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(spellIndexes) || spellIndexes.length > 60) {
    return { success: false, error: "Invalid spell list." };
  }

  const cls = classIndex ?? draft.classIndex ?? "";
  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, preparedSpells: spellIndexes }
      : { ...draft, classPreparedSpells: { ...draft.classPreparedSpells, [cls]: spellIndexes } };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// Same freely-overwritable shape as setKnownCantrips/setPreparedSpells, same
// reasoning — the cap here (10) is just a sanity check against a malformed
// payload, not a re-derivation of metamagicKnownMax(level); the picker UI
// enforces the real limit.
export async function setMetamagicChoices(
  characterId: string,
  optionKeys: string[],
  classIndex?: string,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(optionKeys) || optionKeys.length > 10) {
    return { success: false, error: "Invalid Metamagic selection." };
  }

  const cls = classIndex ?? draft.classIndex ?? "";
  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, metamagicChoices: optionKeys }
      : { ...draft, classMetamagic: { ...draft.classMetamagic, [cls]: optionKeys } };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// Same freely-overwritable shape as setMetamagicChoices — Fighting Style is
// also "replace one whenever you gain a [class] level," not a permanent
// choice log.
export async function setFightingStyleChoices(
  characterId: string,
  featIndexes: string[],
  classIndex?: string,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(featIndexes) || featIndexes.length > 10) {
    return { success: false, error: "Invalid Fighting Style selection." };
  }

  const cls = classIndex ?? draft.classIndex ?? "";
  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, fightingStyleChoices: featIndexes }
      : { ...draft, classFightingStyles: { ...draft.classFightingStyles, [cls]: featIndexes } };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// Same freely-overwritable shape as setFightingStyleChoices — also
// "whenever you finish a Long Rest, you can change one of those weapon
// choices," not a permanent log. Lets an existing character created before
// this feature shipped set it retroactively too, same as any other
// pending-choice action.
export async function setWeaponMasteryChoices(
  characterId: string,
  weaponIndexes: string[],
  classIndex?: string,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(weaponIndexes) || weaponIndexes.length > 10) {
    return { success: false, error: "Invalid Weapon Mastery selection." };
  }

  const cls = classIndex ?? draft.classIndex ?? "";
  const nextDraft: CharacterDraft =
    cls === draft.classIndex
      ? { ...draft, weaponMasteryChoices: weaponIndexes }
      : { ...draft, classWeaponMastery: { ...draft.classWeaponMastery, [cls]: weaponIndexes } };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// Skill proficiency granted by multiclassing into a class (Bard/Ranger/Rogue).
// Overwrites that class's granted-skill list. Owner-gated overwrite, same shape
// as the other choice setters.
export async function setMulticlassSkills(
  characterId: string,
  classIndex: string,
  skillIndexes: string[],
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(skillIndexes) || skillIndexes.length > 6) {
    return { success: false, error: "Invalid skill selection." };
  }

  const nextDraft: CharacterDraft = {
    ...draft,
    multiclassSkills: { ...draft.multiclassSkills, [classIndex]: skillIndexes },
  };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// Human's Skillful trait — proficiency in one skill of choice. A single bare
// skill index, or null. Same owner-gated overwrite shape as the choices above.
export async function setHumanSkillChoice(
  characterId: string,
  skillIndex: string | null,
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (skillIndex !== null && typeof skillIndex !== "string") {
    return { success: false, error: "Invalid skill selection." };
  }

  const nextDraft: CharacterDraft = { ...draft, humanSkillChoice: skillIndex };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}

// The Skilled feat — proficiency in (up to 3 per time taken) skills of choice.
// Freely overwritable bare skill indexes, same shape as the other pickers.
export async function setSkilledChoices(
  characterId: string,
  skillIndexes: string[],
): Promise<SetSpellsResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!Array.isArray(skillIndexes) || skillIndexes.length > 12) {
    return { success: false, error: "Invalid Skilled selection." };
  }

  const nextDraft: CharacterDraft = { ...draft, skilledChoices: skillIndexes };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}
