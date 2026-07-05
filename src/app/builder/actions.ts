"use server";

import { createClient } from "@/lib/supabase-server";
import type { CharacterDraft } from "@/lib/character";
import type { PersonalityAnswers } from "@/lib/personality";
import { parseCharacterExport } from "@/lib/character-export";
import type { Json } from "@/lib/database.types";

export interface SaveCharacterResult {
  success: boolean;
  error?: string;
  characterId?: string;
}

// Import a character from an uploaded Tavern export file (raw file text).
// Validates it's a real export, then inserts a NEW character owned by the
// current user (never overwrites an existing one). is_public defaults to false
// and the avatar is not carried over (see character-export.ts).
export async function importCharacter(fileText: string): Promise<SaveCharacterResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to import a character." };
  }

  const parsed = parseCharacterExport(fileText);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const c = parsed.data;

  const { data, error } = await supabase
    .from("characters")
    .insert({
      user_id: userData.user.id,
      name: c.name,
      draft: c.draft as unknown as Json,
      personality: c.personality as unknown as Json,
      bio: c.bio,
      inventory: c.inventory as unknown as Json,
      currency: c.currency as unknown as Json,
      magic_items: c.magicItems as unknown as Json,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, characterId: data.id };
}

export async function saveCharacter(
  draft: CharacterDraft,
  personality: PersonalityAnswers | null = null,
): Promise<SaveCharacterResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to save a character." };
  }

  if (!draft.name.trim()) {
    return { success: false, error: "Give your character a name first." };
  }

  const { data, error } = await supabase
    .from("characters")
    .insert({
      user_id: userData.user.id,
      name: draft.name.trim(),
      draft: draft as unknown as Json,
      personality: personality as unknown as Json,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  return { success: true, characterId: data.id };
}
