"use client";

import { useState } from "react";
import { createUserFeat, updateUserFeat, deleteUserFeat } from "@/app/homebrew/actions";

export interface HomebrewFeat {
  id: string;
  name: string;
  description: string;
}

export default function HomebrewManager({ feats: initial }: { feats: HomebrewFeat[] }) {
  const [feats, setFeats] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setDescription("");
    setError(null);
  }

  function startEdit(f: HomebrewFeat) {
    setEditingId(f.id);
    setCreating(false);
    setName(f.name);
    setDescription(f.description);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function save() {
    setPending(true);
    setError(null);
    if (editingId) {
      const r = await updateUserFeat(editingId, name, description);
      if (r.success) {
        setFeats((prev) => prev.map((f) => (f.id === editingId ? { ...f, name: name.trim(), description: description.trim() } : f)));
        cancel();
      } else setError(r.error ?? "Couldn't save.");
    } else {
      const r = await createUserFeat(name, description);
      if (r.success) {
        // Re-fetch via a full reload is heavy; optimistically add with a temp id
        // then reload to pick up the real row (the picker reads from the DB).
        window.location.reload();
        return;
      } else setError(r.error ?? "Couldn't create.");
    }
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserFeat(id);
    if (r.success) setFeats((prev) => prev.filter((f) => f.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-tavern-muted">
          Custom feats appear in the feat picker on your own characters (at levels 4/8/12/16/19),
          tagged as homebrew. They&apos;re shown with your description — like every other feat,
          the effect is listed, not auto-simulated.
        </p>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="ml-4 shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
          >
            + New Feat
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Feat" : "New Feat"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Feat name"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={5}
            placeholder="What the feat does — prerequisites, benefits, the full rules text."
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending || !name.trim()}
              className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button onClick={cancel} disabled={pending} className="text-xs text-tavern-muted hover:text-tavern-gold-light">
              Cancel
            </button>
            {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {feats.length === 0 && !formOpen && (
          <p className="text-sm text-tavern-muted italic">
            No custom feats yet. Create one and it&apos;ll be selectable on your characters.
          </p>
        )}
        {feats.map((f) => (
          <div key={f.id} className="rounded-md border border-tavern-border bg-tavern-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-heading font-bold text-tavern-text">
                  {f.name}
                  <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                    Homebrew
                  </span>
                </div>
                {f.description && <p className="mt-1 text-xs whitespace-pre-line text-tavern-muted">{f.description}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(f)} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
                  Edit
                </button>
                <button onClick={() => remove(f.id)} className="text-xs text-tavern-muted hover:text-tavern-oxblood-light">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
