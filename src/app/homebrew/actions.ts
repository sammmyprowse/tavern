"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { FeatOption, SubclassOption } from "@/lib/srd";
import type { Json } from "@/lib/database.types";
import {
  USER_FEAT_PREFIX,
  USER_SUBCLASS_PREFIX,
  type UserContentResult,
  type UserSubclassFeature,
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
