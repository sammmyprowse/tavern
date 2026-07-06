"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { FeatOption } from "@/lib/srd";
import { USER_FEAT_PREFIX, type UserContentResult } from "@/lib/user-content";

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
