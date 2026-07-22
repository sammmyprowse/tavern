// DM-pushed character effects (the character_effects table): the bridge
// between the DM screen and each player's play sheet. Rows are prompts and
// reminders — the player's actual play state stays client-side localStorage,
// so applying a DM-called rest (or tracking a pushed condition) is always an
// explicit player action on their own sheet, never a server-side mutation.

export type CharacterEffectKind = "condition" | "effect" | "rest";

export type RestType = "short" | "long";

export interface CharacterEffectData {
  // kind='condition': the CONDITIONS index the name came from.
  conditionIndex?: string;
  // kind='effect': the DM's freeform rules text.
  description?: string;
  // kind='rest': which rest the DM called.
  rest?: RestType;
}

export interface CharacterEffect {
  id: string;
  characterId: string;
  partyId: string;
  kind: CharacterEffectKind;
  name: string;
  data: CharacterEffectData;
  createdAt: string;
}

// Raw row shape as it arrives from a select() or a Realtime payload.
export interface CharacterEffectRow {
  id: string;
  character_id: string;
  party_id: string;
  kind: string;
  name: string;
  data: unknown;
  created_at: string;
}

export function parseCharacterEffectRow(row: CharacterEffectRow): CharacterEffect {
  return {
    id: row.id,
    characterId: row.character_id,
    partyId: row.party_id,
    kind: (row.kind as CharacterEffectKind) ?? "effect",
    name: row.name,
    data: (row.data ?? {}) as CharacterEffectData,
    createdAt: row.created_at,
  };
}
