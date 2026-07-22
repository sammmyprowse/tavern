"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { Json } from "@/lib/database.types";
import type { EncounterState } from "@/lib/encounter";
import type { CharacterEffectData, CharacterEffectKind, RestType } from "@/lib/dm-effects";

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

// ── DM-pushed effects (character_effects) ───────────────────────────────────
// RLS is the real gate on every one of these: insert requires being the
// party's leader AND the target character being in that party; delete is
// allowed to the leader (here) or the character's owner (dismiss, in
// characters/actions.ts) — same OR-composition as party_characters removal.

export async function applyCharacterEffect(
  partyId: string,
  characterId: string,
  kind: CharacterEffectKind,
  name: string,
  data: CharacterEffectData,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Give the effect a name." };
  if (trimmed.length > 100 || (data.description ?? "").length > 1000) {
    return { success: false, error: "That's too long." };
  }

  const { error } = await supabase.from("character_effects").insert({
    party_id: partyId,
    character_id: characterId,
    created_by: userData.user.id,
    kind,
    name: trimmed,
    data: data as unknown as Json,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}/dm`);
  return { success: true };
}

// A party-wide rest call: one 'rest' row per member character, applied by
// each player from their own sheet (a banner with Apply/Dismiss — the server
// never mutates play state, which is client-side localStorage by design).
export async function applyPartyRest(
  partyId: string,
  characterIds: string[],
  rest: RestType,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }
  if (characterIds.length === 0) {
    return { success: false, error: "No characters in this party yet." };
  }

  const name = rest === "long" ? "Long Rest" : "Short Rest";
  const { error } = await supabase.from("character_effects").insert(
    characterIds.map((characterId) => ({
      party_id: partyId,
      character_id: characterId,
      created_by: userData.user!.id,
      kind: "rest",
      name,
      data: { rest } as unknown as Json,
    })),
  );

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}/dm`);
  return { success: true };
}

export async function removeCharacterEffect(
  partyId: string,
  effectId: string,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const { error } = await supabase.from("character_effects").delete().eq("id", effectId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/parties/${partyId}/dm`);
  return { success: true };
}

// ── Per-character DM notes (party_character_notes) ──────────────────────────
// Leader-only, private — players have no policy on this table at all. An
// empty note deletes the row rather than storing blank strings forever.

export async function savePartyCharacterNote(
  partyId: string,
  characterId: string,
  note: string,
): Promise<PartyActionResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "You need to sign in to do that." };
  }

  const trimmed = note.trim();
  if (trimmed.length > 4000) return { success: false, error: "That note is too long." };

  const { error } = trimmed
    ? await supabase.from("party_character_notes").upsert({
        party_id: partyId,
        character_id: characterId,
        created_by: userData.user.id,
        note: trimmed,
        updated_at: new Date().toISOString(),
      })
    : await supabase
        .from("party_character_notes")
        .delete()
        .eq("party_id", partyId)
        .eq("character_id", characterId);

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
