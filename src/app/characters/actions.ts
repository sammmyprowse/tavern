"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  MAX_LEVEL,
  ORDER_CHOICES,
  ASI_LEVELS,
  type AbilityBonusChoice,
  type CharacterDraft,
} from "@/lib/character";
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
    draft: character.draft as unknown as CharacterDraft,
  };
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

export interface LevelUpResult {
  success: boolean;
  error?: string;
  draft?: CharacterDraft;
}

// hpGain is the already-resolved HP increase (rolled or averaged client-side
// via the dice engine, same split of responsibility as the rest of the play
// sheet) — this action's job is only to persist the new level/draft.
export async function levelUpCharacter(
  characterId: string,
  hpGain: number,
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

  const nextDraft: CharacterDraft = {
    ...draft,
    level: draft.level + 1,
    hpRolls: [...draft.hpRolls, hpGain],
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
): Promise<ChooseSubclassResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (draft.level < 3) {
    return { success: false, error: "Subclass unlocks at level 3." };
  }

  const nextDraft: CharacterDraft = { ...draft, subclassIndex };

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
): Promise<ChooseOrderResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  const options = ORDER_CHOICES[draft.classIndex ?? ""];
  if (!options) {
    return { success: false, error: "This class doesn't have an Order choice." };
  }
  if (!options.some((o) => o.key === choiceKey)) {
    return { success: false, error: "Invalid choice." };
  }

  const nextDraft: CharacterDraft = { ...draft, orderChoice: choiceKey };

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
): Promise<ChooseFeatResult> {
  const loaded = await loadOwnedDraft(characterId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { supabase, userId, draft } = loaded;

  if (!ASI_LEVELS.includes(level) || level > draft.level) {
    return { success: false, error: "Not a feat choice you can make yet." };
  }
  if (draft.featChoices.some((fc) => fc.level === level)) {
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
    featChoices: [...draft.featChoices, { level, featIndex, abilityBonus }],
  };

  const { error } = await saveDraft(supabase, characterId, userId, nextDraft);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}
