"use client";

import { useState } from "react";
import {
  EMPTY_PERSONALITY,
  PERSONALITY_QUESTIONS,
  buildPersonalityPrompt,
  type PersonalityAnswers,
} from "@/lib/personality";
import type { CharacterSheet } from "@/lib/character-sheet";
import { setCharacterPersonality } from "@/app/characters/actions";
import PersonalityQuestionnaire from "@/components/PersonalityQuestionnaire";

interface CharacterPersonalityProps {
  characterId: string;
  initialPersonality: PersonalityAnswers | null;
  isOwner: boolean;
  sheet: CharacterSheet;
}

export default function CharacterPersonality({
  characterId,
  initialPersonality,
  isOwner,
  sheet,
}: CharacterPersonalityProps) {
  const [personality, setPersonality] = useState(initialPersonality);
  const [draft, setDraft] = useState<PersonalityAnswers>(initialPersonality ?? EMPTY_PERSONALITY);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!personality && !isOwner) return null;

  async function save(next: PersonalityAnswers | null) {
    setPending(true);
    setError(null);
    const result = await setCharacterPersonality(characterId, next);
    if (!result.success) {
      setError(result.error ?? "Couldn't save.");
      setPending(false);
      return;
    }
    setPersonality(next);
    setEditing(false);
    setPending(false);
  }

  function startEditing() {
    setDraft(personality ?? EMPTY_PERSONALITY);
    setError(null);
    setEditing(true);
  }

  function copyPrompt() {
    if (!personality) return;
    setError(null);
    navigator.clipboard
      .writeText(buildPersonalityPrompt(sheet, personality))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Couldn't copy automatically — use Preview prompt and copy it manually."));
  }

  if (editing) {
    return (
      <div id="personality" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Personality &amp; Backstory
        </h2>
        <p className="mt-1 text-xs text-tavern-muted">
          Entirely optional flavor — nothing here changes your stats, gameplay, or inventory.
        </p>
        <div className="mt-4">
          <PersonalityQuestionnaire
            personality={draft}
            onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value || "None" }))}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => save(draft)}
            disabled={pending}
            className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={pending}
            className="text-xs text-tavern-muted hover:text-tavern-gold-light"
          >
            Cancel
          </button>
          {personality && (
            <button
              onClick={() => save(null)}
              disabled={pending}
              className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
            >
              Remove entirely
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-tavern-oxblood-light">{error}</p>}
      </div>
    );
  }

  if (!personality) {
    return (
      <div id="personality" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Personality &amp; Backstory
        </h2>
        <p className="mt-1 text-xs text-tavern-muted">
          Optional flavor — generates a prompt you can paste into an AI tool for a portrait and
          backstory. Doesn&apos;t affect stats, gameplay, or inventory.
        </p>
        <button
          onClick={startEditing}
          className="mt-3 text-xs text-tavern-gold-light hover:text-tavern-gold"
        >
          + Add personality &amp; backstory
        </button>
      </div>
    );
  }

  return (
    <div id="personality" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Personality &amp; Backstory
        </h2>
        {isOwner && (
          <button onClick={startEditing} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
            Edit
          </button>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        {PERSONALITY_QUESTIONS.map((q) => (
          <div key={q.key} className="flex flex-wrap justify-between gap-2">
            <dt className="text-tavern-muted">{q.label}</dt>
            <dd className="text-right text-tavern-text">{personality[q.key]}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 border-t border-tavern-border pt-3 text-xs text-tavern-muted">
        Works best pasted into ChatGPT, Google Gemini, or Grok — they can generate the portrait
        image directly from this same prompt, not just the backstory text.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={copyPrompt}
          className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold text-tavern-gold-light hover:border-tavern-gold"
        >
          {copied ? "Copied!" : "Copy AI Prompt"}
        </button>
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="text-xs text-tavern-muted hover:text-tavern-gold-light"
        >
          {showPrompt ? "Hide preview" : "Preview prompt"}
        </button>
        {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
      </div>
      {showPrompt && (
        <pre className="mt-3 max-h-64 overflow-y-auto rounded-md border border-tavern-border bg-tavern-bg p-3 text-xs whitespace-pre-wrap text-tavern-muted">
          {buildPersonalityPrompt(sheet, personality)}
        </pre>
      )}
    </div>
  );
}
