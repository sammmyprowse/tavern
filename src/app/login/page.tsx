"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signIn, signUp } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, {});
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, {});

  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;
  const action = isSignIn ? signInAction : signUpAction;
  const pending = isSignIn ? signInPending : signUpPending;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center font-heading text-sm tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
        >
          &larr; Tavern
        </Link>

        <div className="rounded-xl border border-tavern-border bg-tavern-card p-8">
          <h1 className="text-center font-heading text-2xl font-bold text-tavern-gold">
            {isSignIn ? "Sign In" : "Create an Account"}
          </h1>

          <form action={action} className="mt-6 space-y-4">
            <div>
              <label className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-3 py-2 text-tavern-text"
              />
            </div>
            <div>
              <label className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={isSignIn ? undefined : 8}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-3 py-2 text-tavern-text"
              />
              {!isSignIn && (
                <p className="mt-1 text-xs text-tavern-muted">At least 8 characters.</p>
              )}
            </div>

            {state.error && <p className="text-sm text-tavern-oxblood-light">{state.error}</p>}
            {state.message && <p className="text-sm text-tavern-gold-light">{state.message}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-tavern-oxblood px-6 py-2.5 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light disabled:opacity-50"
            >
              {pending ? "Working…" : isSignIn ? "Sign In" : "Sign Up"}
            </button>
          </form>

          <button
            onClick={() => setMode(isSignIn ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm text-tavern-muted hover:text-tavern-gold-light"
          >
            {isSignIn ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
