"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export interface CreatePartyResult {
  success: boolean;
  partyId?: string;
  error?: string;
}

export async function createParty(name: string): Promise<CreatePartyResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to create a party." };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "Give your party a name." };
  }

  const { data, error } = await supabase
    .from("parties")
    .insert({ name: trimmed, created_by: userData.user.id })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Couldn't create party." };

  return { success: true, partyId: data.id };
}

export interface PartyActionResult {
  success: boolean;
  error?: string;
}

export async function addCharacterToParty(
  partyId: string,
  characterId: string,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("party_characters")
    .insert({ party_id: partyId, character_id: characterId });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return { success: true };
}

export async function removeCharacterFromParty(
  partyId: string,
  characterId: string,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  // No ownership check here beyond what RLS already enforces — removal is
  // allowed for either the character's owner OR the party's leader, and that
  // OR is exactly what the two delete policies on party_characters encode.
  const { error } = await supabase
    .from("party_characters")
    .delete()
    .eq("party_id", partyId)
    .eq("character_id", characterId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return { success: true };
}

export async function renameParty(partyId: string, name: string): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "Party name can't be empty." };
  }

  const { error } = await supabase
    .from("parties")
    .update({ name: trimmed })
    .eq("id", partyId)
    .eq("created_by", userData.user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return { success: true };
}
