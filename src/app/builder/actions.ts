"use server";

import { createClient } from "@/lib/supabase-server";
import type { CharacterDraft } from "@/lib/character";
import type { Json } from "@/lib/database.types";

export interface SaveCharacterResult {
  success: boolean;
  error?: string;
}

export async function saveCharacter(draft: CharacterDraft): Promise<SaveCharacterResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to save a character." };
  }

  if (!draft.name.trim()) {
    return { success: false, error: "Give your character a name first." };
  }

  const { error } = await supabase.from("characters").insert({
    user_id: userData.user.id,
    name: draft.name.trim(),
    draft: draft as unknown as Json,
  });

  if (error) return { success: false, error: error.message };

  return { success: true };
}
