"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { Json } from "@/lib/database.types";
import type { EncounterState } from "@/lib/encounter";

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

// ── Encounters (DM screen) ──────────────────────────────────────────────────
// All encounter rows are private to their creator (the party leader) — RLS
// enforces created_by = auth.uid() on every operation, plus "leader of the
// party" on insert. Actions here just pass through and surface errors.

export interface CreateEncounterResult {
  success: boolean;
  encounterId?: string;
  error?: string;
}

export async function createEncounter(
  partyId: string,
  name: string,
  state: EncounterState,
): Promise<CreateEncounterResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Give the encounter a name." };

  const { data, error } = await supabase
    .from("encounters")
    .insert({
      party_id: partyId,
      created_by: userData.user.id,
      name: trimmed,
      state: state as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Couldn't create encounter." };

  revalidatePath(`/parties/${partyId}/dm`);
  return { success: true, encounterId: data.id };
}

// Whole-blob save of the live combat state. Single writer (the DM), so
// last-write-wins is fine.
export async function saveEncounterState(
  partyId: string,
  encounterId: string,
  state: EncounterState,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase
    .from("encounters")
    .update({ state: state as unknown as Json })
    .eq("id", encounterId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}/dm`);
  return { success: true };
}

export async function deleteEncounter(
  partyId: string,
  encounterId: string,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase.from("encounters").delete().eq("id", encounterId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}/dm`);
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
