"use client";

import { useState } from "react";
import { setCharacterBio } from "@/app/characters/actions";

interface CharacterBioProps {
  characterId: string;
  initialBio: string | null;
  isOwner: boolean;
}

export default function CharacterBio({ characterId, initialBio, isOwner }: CharacterBioProps) {
  const [bio, setBio] = useState(initialBio ?? "");
  const [draft, setDraft] = useState(bio);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(bio);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await setCharacterBio(characterId, draft.trim());
    if (!result.success) {
      setError(result.error ?? "Couldn't save.");
      setPending(false);
      return;
    }
    setBio(draft.trim());
    setEditing(false);
    setPending(false);
  }

  if (editing) {
    return (
      <div className="mt-3 w-full">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Write a short bio for your character — who they are, where they're from, what drives them…"
          autoFocus
          className="w-full rounded-md border border-tavern-border bg-tavern-bg p-2 text-sm text-tavern-text placeholder:text-tavern-muted"
        />
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-tavern-oxblood px-3 py-1 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
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
          <span className="text-xs text-tavern-muted">{draft.length}/2000</span>
        </div>
        {error && <p className="mt-1 text-xs text-tavern-oxblood-light">{error}</p>}
      </div>
    );
  }

  if (!bio) {
    return isOwner ? (
      <button
        onClick={startEditing}
        className="mt-2 text-xs text-tavern-gold-light hover:text-tavern-gold"
      >
        + Add a bio
      </button>
    ) : null;
  }

  return (
    <div className="mt-2 max-w-2xl">
      <p className="text-sm whitespace-pre-line text-tavern-muted">{bio}</p>
      {isOwner && (
        <button
          onClick={startEditing}
          className="mt-1 text-xs text-tavern-gold-light hover:text-tavern-gold"
        >
          Edit bio
        </button>
      )}
    </div>
  );
}
