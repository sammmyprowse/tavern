"use client";

import { useState } from "react";
import {
  createUserSubclass,
  updateUserSubclass,
  deleteUserSubclass,
} from "@/app/homebrew/actions";
import { CLASS_OPTIONS, type UserSubclassFeature } from "@/lib/user-content";
import {
  ManagerHeader,
  ManagerItemCard,
  ManagerFormActions,
  ManagerEmptyNote,
} from "@/components/homebrew/shell";

export interface HomebrewSubclass {
  id: string;
  name: string;
  classIndex: string;
  summary: string;
  description: string;
  features: UserSubclassFeature[];
}

const CLASS_NAME = Object.fromEntries(CLASS_OPTIONS.map((c) => [c.index, c.name]));

const emptyFeature = (): UserSubclassFeature => ({ name: "", level: 3, description: "" });

export default function SubclassManager({ subclasses: initial }: { subclasses: HomebrewSubclass[] }) {
  const [subclasses, setSubclasses] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [classIndex, setClassIndex] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<UserSubclassFeature[]>([emptyFeature()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setClassIndex("");
    setSummary("");
    setDescription("");
    setFeatures([emptyFeature()]);
    setError(null);
  }

  function startEdit(s: HomebrewSubclass) {
    setEditingId(s.id);
    setCreating(false);
    setName(s.name);
    setClassIndex(s.classIndex);
    setSummary(s.summary);
    setDescription(s.description);
    setFeatures(s.features.length ? s.features : [emptyFeature()]);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function setFeature(i: number, patch: Partial<UserSubclassFeature>) {
    setFeatures((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function save() {
    setPending(true);
    setError(null);
    const cleanFeatures = features.filter((f) => f.name.trim());
    if (editingId) {
      const r = await updateUserSubclass(editingId, name, classIndex, summary, description, cleanFeatures);
      if (r.success) {
        setSubclasses((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? { ...s, name: name.trim(), classIndex, summary: summary.trim(), description: description.trim(), features: cleanFeatures }
              : s,
          ),
        );
        cancel();
      } else setError(r.error ?? "Couldn't save.");
    } else {
      const r = await createUserSubclass(name, classIndex, summary, description, cleanFeatures);
      if (r.success) {
        window.location.reload();
        return;
      } else setError(r.error ?? "Couldn't create.");
    }
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserSubclass(id);
    if (r.success) setSubclasses((prev) => prev.filter((s) => s.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <ManagerHeader
        blurb="Custom subclasses appear in the subclass picker for that class on your own characters (at level 3), tagged homebrew. Their features show in the Features list — the effects are listed, not auto-simulated, same as every subclass."
        buttonLabel="+ New Subclass"
        formOpen={formOpen}
        onCreate={startCreate}
      />

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Subclass" : "New Subclass"}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Subclass name (e.g. Order of the Ember)"
              className="w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
            />
            <select
              value={classIndex}
              onChange={(e) => setClassIndex(e.target.value)}
              className="w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text"
            >
              <option value="">Which class?</option>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
            placeholder="One-line summary (optional)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Flavour / overview (optional)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />

          <p className="mt-4 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Features
          </p>
          <div className="mt-2 space-y-2">
            {features.map((f, i) => (
              <div key={i} className="rounded-md border border-tavern-border p-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => setFeature(i, { name: e.target.value })}
                    maxLength={100}
                    placeholder="Feature name"
                    className="flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                  />
                  <select
                    value={f.level}
                    onChange={(e) => setFeature(i, { level: Number(e.target.value) })}
                    className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
                  >
                    {[3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 20].map((l) => (
                      <option key={l} value={l}>
                        Lvl {l}
                      </option>
                    ))}
                  </select>
                  {features.length > 1 && (
                    <button
                      onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))}
                      className="px-2 text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  value={f.description}
                  onChange={(e) => setFeature(i, { description: e.target.value })}
                  maxLength={4000}
                  rows={2}
                  placeholder="What the feature does — full rules text."
                  className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setFeatures((prev) => [...prev, emptyFeature()])}
            className="mt-2 text-xs text-tavern-gold-light hover:text-tavern-gold"
          >
            + Add feature
          </button>

          <ManagerFormActions
            pending={pending}
            disabled={!name.trim() || !classIndex}
            error={error}
            onSave={save}
            onCancel={cancel}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {subclasses.length === 0 && !formOpen && (
          <ManagerEmptyNote>
            No custom subclasses yet. Create one and it&apos;ll be selectable on your characters of
            that class.
          </ManagerEmptyNote>
        )}
        {subclasses.map((s) => (
          <ManagerItemCard
            key={s.id}
            name={s.name}
            meta={CLASS_NAME[s.classIndex] ?? s.classIndex}
            onEdit={() => startEdit(s)}
            onDelete={() => remove(s.id)}
          >
            {s.summary && <p className="mt-1 text-xs text-tavern-muted">{s.summary}</p>}
            {s.features.length > 0 && (
              <p className="mt-1 text-[11px] text-tavern-muted">
                {s.features.length} feature{s.features.length === 1 ? "" : "s"}:{" "}
                {s.features.map((f) => `${f.name} (${f.level})`).join(", ")}
              </p>
            )}
          </ManagerItemCard>
        ))}
      </div>
    </div>
  );
}
