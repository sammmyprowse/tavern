"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export interface AuthFormState {
  error?: string;
  message?: string;
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  redirect("/characters");
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  if (!data.session) {
    return { message: "Check your email for a confirmation link, then sign in." };
  }

  redirect("/characters");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
