"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { FeatOption, SubclassOption, BackgroundOption, SpeciesOption } from "@/lib/srd";
import type { Json } from "@/lib/database.types";
import {
  USER_FEAT_PREFIX,
  USER_SUBCLASS_PREFIX,
  USER_BACKGROUND_PREFIX,
  USER_SPECIES_PREFIX,
  ABILITY_OPTIONS,
  ORIGIN_FEAT_OPTIONS,
  type UserContentResult,
  type UserSubclassFeature,
  type UserSpeciesTrait,
} from "@/lib/user-content";

// User-created homebrew feats. Stored in user_content (kind='feat'), owned by
// the creating user via RLS. Surfaced in the feat picker for that user's own
// characters, tagged homebrew like the built-in homebrew feats.

// Every custom feat the signed-in user has made, as FeatOptions ready to merge
// into the feat picker. Returns [] when signed out.
export async function getUserFeats(): Promise<FeatOption[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", userData.user.id)
    .eq("kind", "feat")
    .order("name");

  return (data ?? []).map((row) => ({
    index: `${USER_FEAT_PREFIX}${row.id}`,
    name: row.name,
    description: (row.data as { description?: string }).description ?? null,
    isHomebrew: true,
  }));
}

export async function createUserFeat(name: string, description: string): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  if (!name.trim()) return { success: false, error: "Give the feat a name." };
  if (name.length > 100 || description.length > 4000) {
    return { success: false, error: "That's too long." };
  }

  const { error } = await supabase.from("user_content").insert({
    user_id: userData.user.id,
    kind: "feat",
    name: name.trim(),
    data: { description: description.trim() },
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function updateUserFeat(
  id: string,
  name: string,
  description: string,
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  if (!name.trim()) return { success: false, error: "Give the feat a name." };
  if (name.length > 100 || description.length > 4000) {
    return { success: false, error: "That's too long." };
  }

  const { error } = await supabase
    .from("user_content")
    .update({ name: name.trim(), data: { description: description.trim() }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function deleteUserFeat(id: string): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };

  const { error } = await supabase
    .from("user_content")
    .delete()
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

// ── Custom subclasses (kind='subclass') ────────────────────────────────────
// Stored data shape: { classIndex, summary, description, features: [...] }.
// Surfaced in the play sheet's subclass picker for that class on the owner's
// own characters (index `user-subclass:{id}`), tagged homebrew like the
// dev-authored homebrew subclasses.

export interface UserSubclass extends SubclassOption {
  classIndex: string;
}

function sanitizeFeatures(features: unknown): UserSubclassFeature[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((f) => {
      const o = f as { name?: unknown; level?: unknown; description?: unknown };
      const level = Number(o.level);
      return {
        name: typeof o.name === "string" ? o.name.trim().slice(0, 100) : "",
        level: Number.isFinite(level) ? Math.min(20, Math.max(1, Math.round(level))) : 3,
        description: typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "",
      };
    })
    .filter((f) => f.name)
    .slice(0, 20);
}

export async function getUserSubclasses(): Promise<UserSubclass[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", userData.user.id)
    .eq("kind", "subclass")
    .order("name");

  return (data ?? []).map((row) => {
    const d = row.data as {
      classIndex?: string;
      summary?: string;
      description?: string;
      features?: UserSubclassFeature[];
    };
    return {
      index: `${USER_SUBCLASS_PREFIX}${row.id}`,
      name: row.name,
      classIndex: d.classIndex ?? "",
      summary: d.summary ?? null,
      description: d.description ?? null,
      features: [...(d.features ?? [])].sort((a, b) => a.level - b.level),
      isHomebrew: true,
    };
  });
}

export async function createUserSubclass(
  name: string,
  classIndex: string,
  summary: string,
  description: string,
  features: UserSubclassFeature[],
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  if (!name.trim()) return { success: false, error: "Give the subclass a name." };
  if (!classIndex) return { success: false, error: "Pick which class this subclass is for." };
  if (name.length > 100 || summary.length > 500 || description.length > 4000) {
    return { success: false, error: "That's too long." };
  }

  const { error } = await supabase.from("user_content").insert({
    user_id: userData.user.id,
    kind: "subclass",
    name: name.trim(),
    data: {
      classIndex,
      summary: summary.trim(),
      description: description.trim(),
      features: sanitizeFeatures(features),
    } as unknown as Json,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function updateUserSubclass(
  id: string,
  name: string,
  classIndex: string,
  summary: string,
  description: string,
  features: UserSubclassFeature[],
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  if (!name.trim()) return { success: false, error: "Give the subclass a name." };
  if (!classIndex) return { success: false, error: "Pick which class this subclass is for." };
  if (name.length > 100 || summary.length > 500 || description.length > 4000) {
    return { success: false, error: "That's too long." };
  }

  const { error } = await supabase
    .from("user_content")
    .update({
      name: name.trim(),
      data: {
        classIndex,
        summary: summary.trim(),
        description: description.trim(),
        features: sanitizeFeatures(features),
      } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function deleteUserSubclass(id: string): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };

  const { error } = await supabase
    .from("user_content")
    .delete()
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .eq("kind", "subclass");
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

// ── Custom backgrounds (kind='background') ─────────────────────────────────
// Stored data: { description, skills:[bare skill index], abilities:[3 ability
// indexes], featIndex }. Surfaced in the builder's Background step (and the
// play sheet) for the owner, tagged homebrew. Same mechanical shape as the
// dev-authored homebrew backgrounds (2 skills + a 3-ability bonus choice + an
// Origin feat), minus starting equipment (a disclosed simplification — user
// backgrounds grant no gear/gold).
const ABILITY_NAME = Object.fromEntries(ABILITY_OPTIONS.map((a) => [a.index, a.name]));
const ORIGIN_FEAT_NAME = Object.fromEntries(ORIGIN_FEAT_OPTIONS.map((f) => [f.index, f.name]));

interface UserBackgroundData {
  description?: string;
  skills?: string[];
  abilities?: string[];
  featIndex?: string;
}

export async function getUserBackgrounds(): Promise<BackgroundOption[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", userData.user.id)
    .eq("kind", "background")
    .order("name");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Resolve skill display names and Origin-feat descriptions from the SRD.
  const skillIndexes = [...new Set(rows.flatMap((r) => (r.data as UserBackgroundData).skills ?? []))];
  const featIndexes = [
    ...new Set(rows.map((r) => (r.data as UserBackgroundData).featIndex).filter(Boolean) as string[]),
  ];
  const [{ data: skillRows }, { data: featRows }] = await Promise.all([
    skillIndexes.length
      ? supabase.from("skills").select("index, name").in("index", skillIndexes)
      : Promise.resolve({ data: [] as { index: string; name: string }[] }),
    featIndexes.length
      ? supabase.from("feats").select("index, data").in("index", featIndexes)
      : Promise.resolve({ data: [] as { index: string; data: unknown }[] }),
  ]);
  const skillName = new Map((skillRows ?? []).map((s) => [s.index, s.name]));
  const featDesc = new Map(
    (featRows ?? []).map((f) => [f.index, (f.data as { description?: string }).description ?? null]),
  );

  return rows.map((row) => {
    const d = row.data as UserBackgroundData;
    const feat = d.featIndex
      ? {
          index: d.featIndex,
          name: ORIGIN_FEAT_NAME[d.featIndex] ?? d.featIndex,
          description: featDesc.get(d.featIndex) ?? undefined,
        }
      : null;
    return {
      index: `${USER_BACKGROUND_PREFIX}${row.id}`,
      name: row.name,
      description: d.description ?? null,
      isHomebrew: true,
      abilityScores: (d.abilities ?? []).map((a) => ({ index: a, name: ABILITY_NAME[a] ?? a })),
      feat,
      // Proficiencies use the "skill-" prefixed index (buildCharacterSheet
      // strips it) — see the "skill-" prefix trap note in CLAUDE.md.
      proficiencies: (d.skills ?? []).map((s) => ({
        index: `skill-${s}`,
        name: skillName.get(s) ?? s,
      })),
      equipmentDesc: null,
      equipmentFirstOption: [],
      equipmentOptions: [],
      toolProficiencyChoices: [],
    };
  });
}

function validateBackground(
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): string | null {
  if (!name.trim()) return "Give the background a name.";
  if (name.length > 100 || description.length > 4000) return "That's too long.";
  if (skills.length !== 2 || new Set(skills).size !== 2) return "Choose exactly 2 different skills.";
  if (abilities.length !== 3 || new Set(abilities).size !== 3)
    return "Choose exactly 3 different ability scores.";
  if (!featIndex || !ORIGIN_FEAT_NAME[featIndex]) return "Choose an Origin feat.";
  return null;
}

export async function createUserBackground(
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  const err = validateBackground(name, description, skills, abilities, featIndex);
  if (err) return { success: false, error: err };

  const { error } = await supabase.from("user_content").insert({
    user_id: userData.user.id,
    kind: "background",
    name: name.trim(),
    data: { description: description.trim(), skills, abilities, featIndex } as unknown as Json,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function updateUserBackground(
  id: string,
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  const err = validateBackground(name, description, skills, abilities, featIndex);
  if (err) return { success: false, error: err };

  const { error } = await supabase
    .from("user_content")
    .update({
      name: name.trim(),
      data: { description: description.trim(), skills, abilities, featIndex } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function deleteUserBackground(id: string): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };

  const { error } = await supabase
    .from("user_content")
    .delete()
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .eq("kind", "background");
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

// ── Custom species (kind='species') ────────────────────────────────────────
// Stored data: { description, size, speed, traits:[{name,description}] }.
// Traits get a synthetic per-row index (`user-trait:{rowId}:{i}`); their
// descriptions ride along on the returned option so the play sheet can merge
// them into its traitDescriptions lookup (the SRD keeps trait text in a
// separate `traits` table, which this mirrors). No subspecies/lineages — same
// flat scope as the dev-authored homebrew species. Special-cased trait
// mechanics (Darkvision, Breath Weapon, etc.) don't apply to user traits;
// they're shown in the Species Traits list, not simulated.

// SpeciesOption plus the trait-index → description map for this species.
export type UserSpecies = SpeciesOption & { traitDescriptions: Record<string, string> };

interface UserSpeciesData {
  description?: string;
  size?: string;
  speed?: number;
  traits?: UserSpeciesTrait[];
}

export async function getUserSpecies(): Promise<UserSpecies[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", userData.user.id)
    .eq("kind", "species")
    .order("name");

  return (data ?? []).map((row) => {
    const d = row.data as UserSpeciesData;
    const rawTraits = d.traits ?? [];
    const traits = rawTraits.map((t, i) => ({ index: `user-trait:${row.id}:${i}`, name: t.name }));
    const traitDescriptions = Object.fromEntries(
      rawTraits.map((t, i) => [`user-trait:${row.id}:${i}`, t.description ?? ""]),
    );
    return {
      index: `${USER_SPECIES_PREFIX}${row.id}`,
      name: row.name,
      size: d.size ?? "Medium",
      speed: typeof d.speed === "number" ? d.speed : 30,
      traits,
      hasSubspecies: false,
      isHomebrew: true,
      description: d.description ?? null,
      traitDescriptions,
    };
  });
}

function sanitizeTraits(traits: unknown): UserSpeciesTrait[] {
  if (!Array.isArray(traits)) return [];
  return traits
    .map((t) => {
      const o = t as { name?: unknown; description?: unknown };
      return {
        name: typeof o.name === "string" ? o.name.trim().slice(0, 100) : "",
        description: typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "",
      };
    })
    .filter((t) => t.name)
    .slice(0, 20);
}

function validateSpecies(name: string, speed: number, size: string): string | null {
  if (!name.trim()) return "Give the species a name.";
  if (name.length > 100) return "That name's too long.";
  if (!Number.isFinite(speed) || speed < 0 || speed > 120) return "Speed must be 0–120 ft.";
  if (!["Small", "Medium", "Large"].includes(size)) return "Pick a valid size.";
  return null;
}

export async function createUserSpecies(
  name: string,
  description: string,
  size: string,
  speed: number,
  traits: UserSpeciesTrait[],
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  const err = validateSpecies(name, speed, size);
  if (err) return { success: false, error: err };

  const { error } = await supabase.from("user_content").insert({
    user_id: userData.user.id,
    kind: "species",
    name: name.trim(),
    data: {
      description: description.trim().slice(0, 4000),
      size,
      speed,
      traits: sanitizeTraits(traits),
    } as unknown as Json,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function updateUserSpecies(
  id: string,
  name: string,
  description: string,
  size: string,
  speed: number,
  traits: UserSpeciesTrait[],
): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };
  const err = validateSpecies(name, speed, size);
  if (err) return { success: false, error: err };

  const { error } = await supabase
    .from("user_content")
    .update({
      name: name.trim(),
      data: {
        description: description.trim().slice(0, 4000),
        size,
        speed,
        traits: sanitizeTraits(traits),
      } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}

export async function deleteUserSpecies(id: string): Promise<UserContentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "You need to sign in." };

  const { error } = await supabase
    .from("user_content")
    .delete()
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .eq("kind", "species");
  if (error) return { success: false, error: error.message };

  revalidatePath("/homebrew");
  return { success: true };
}
