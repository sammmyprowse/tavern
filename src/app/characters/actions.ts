"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { MAX_LEVEL, type CharacterDraft } from "@/lib/character";
import type { Json } from "@/lib/database.types";

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
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  if (!Number.isInteger(hpGain) || hpGain < 1) {
    return { success: false, error: "Invalid HP gain." };
  }

  const { data: character, error: fetchError } = await supabase
    .from("characters")
    .select("draft")
    .eq("id", characterId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (fetchError || !character) {
    return { success: false, error: "Character not found." };
  }

  const draft = character.draft as unknown as CharacterDraft;

  if (draft.level >= MAX_LEVEL) {
    return { success: false, error: `Already at the maximum level (${MAX_LEVEL}).` };
  }

  const nextDraft: CharacterDraft = {
    ...draft,
    level: draft.level + 1,
    hpRolls: [...draft.hpRolls, hpGain],
  };

  const { error } = await supabase
    .from("characters")
    .update({ draft: nextDraft as unknown as Json })
    .eq("id", characterId)
    .eq("user_id", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { success: true, draft: nextDraft };
}
