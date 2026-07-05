"use client";

import { useState } from "react";
import { setCharacterNotes } from "@/app/characters/actions";

interface CharacterNotesProps {
  characterId: string;
  initialNotes: string | null;
  isOwner: boolean;
}

// A free-form campaign journal — session logs, plot threads, NPC names, loot,
// anything the player wants to remember. Separate from the character's bio
// ("who they are") — this is "what's happened." Owner-editable, shown to
// anyone viewing a public character.
export default function CharacterNotes({ characterId, initialNotes, isOwner }: CharacterNotesProps) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [draft, setDraft] = useState(notes);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(notes);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await setCharacterNotes(characterId, draft);
    if (!result.success) {
      setError(result.error ?? "Couldn't save.");
      setPending(false);
      return;
    }
    setNotes(draft);
    setEditing(false);
    setPending(false);
  }

  return (
    <div id="notes" className="mt-6 rounded-xl border border-tavern-border bg-tavern-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Campaign Notes
        </h2>
        {isOwner && !editing && (
          <button onClick={startEditing} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
            {notes ? "Edit" : "+ Add notes"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={20000}
            rows={8}
            placeholder="Session logs, quest details, NPC names, clues, loot to remember…"
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
            <button onClick={() => setEditing(false)} disabled={pending} className="text-xs text-tavern-muted hover:text-tavern-gold-light">
              Cancel
            </button>
            <span className="text-xs text-tavern-muted">{draft.length}/20000</span>
          </div>
          {error && <p className="mt-1 text-xs text-tavern-oxblood-light">{error}</p>}
        </div>
      ) : notes ? (
        <p className="mt-3 text-sm whitespace-pre-line text-tavern-muted">{notes}</p>
      ) : (
        <p className="mt-3 text-sm text-tavern-muted italic">
          {isOwner ? "No notes yet — keep a running log of your adventures." : "No campaign notes."}
        </p>
      )}
    </div>
  );
}
