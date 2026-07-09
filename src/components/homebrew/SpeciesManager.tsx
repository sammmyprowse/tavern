"use client";

import { useState } from "react";
import { createUserSpecies, updateUserSpecies, deleteUserSpecies } from "@/app/homebrew/actions";
import type { UserSpeciesTrait } from "@/lib/user-content";

export interface HomebrewSpecies {
  id: string;
  name: string;
  description: string;
  size: string;
  speed: number;
  traits: UserSpeciesTrait[];
}

const emptyTrait = (): UserSpeciesTrait => ({ name: "", description: "" });

export default function SpeciesManager({ species: initial }: { species: HomebrewSpecies[] }) {
  const [species, setSpecies] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("Medium");
  const [speed, setSpeed] = useState(30);
  const [traits, setTraits] = useState<UserSpeciesTrait[]>([emptyTrait()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setDescription("");
    setSize("Medium");
    setSpeed(30);
    setTraits([emptyTrait()]);
    setError(null);
  }

  function startEdit(s: HomebrewSpecies) {
    setEditingId(s.id);
    setCreating(false);
    setName(s.name);
    setDescription(s.description);
    setSize(s.size);
    setSpeed(s.speed);
    setTraits(s.traits.length ? s.traits : [emptyTrait()]);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function setTrait(i: number, patch: Partial<UserSpeciesTrait>) {
    setTraits((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function save() {
    setPending(true);
    setError(null);
    const clean = traits.filter((t) => t.name.trim());
    const fn = editingId ? updateUserSpecies.bind(null, editingId) : createUserSpecies;
    const r = await fn(name, description, size, speed, clean);
    if (r.success) {
      if (editingId) {
        setSpecies((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? { ...s, name: name.trim(), description: description.trim(), size, speed, traits: clean }
              : s,
          ),
        );
        cancel();
      } else {
        window.location.reload();
        return;
      }
    } else setError(r.error ?? "Couldn't save.");
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserSpecies(id);
    if (r.success) setSpecies((prev) => prev.filter((s) => s.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-tavern-muted">
          Custom species appear in the builder&apos;s Species step for you, tagged homebrew — with
          your size, speed, and traits. Traits show in the Species Traits list (listed, not
          auto-simulated). No subspecies/lineages.
        </p>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
          >
            + New Species
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Species" : "New Species"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Species name (e.g. Stoneborn)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={2}
            placeholder="Flavour / description (optional)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-xs text-tavern-muted">
              Size{" "}
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="ml-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
              >
                {["Small", "Medium", "Large"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              Speed (ft){" "}
              <input
                type="number"
                value={speed}
                min={0}
                max={120}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="ml-1 w-20 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
              />
            </label>
          </div>

          <p className="mt-4 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Traits
          </p>
          <div className="mt-2 space-y-2">
            {traits.map((t, i) => (
              <div key={i} className="rounded-md border border-tavern-border p-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) => setTrait(i, { name: e.target.value })}
                    maxLength={100}
                    placeholder="Trait name (e.g. Stone's Endurance)"
                    className="flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                  />
                  {traits.length > 1 && (
                    <button
                      onClick={() => setTraits((prev) => prev.filter((_, idx) => idx !== i))}
                      className="px-2 text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  value={t.description}
                  onChange={(e) => setTrait(i, { description: e.target.value })}
                  maxLength={4000}
                  rows={2}
                  placeholder="What the trait does — full rules text."
                  className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setTraits((prev) => [...prev, emptyTrait()])}
            className="mt-2 text-xs text-tavern-gold-light hover:text-tavern-gold"
          >
            + Add trait
          </button>

          <div className="mt-4 flex items-center gap-3">
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
        {species.length === 0 && !formOpen && (
          <p className="text-sm text-tavern-muted italic">
            No custom species yet. Create one and it&apos;ll be selectable in the builder.
          </p>
        )}
        {species.map((s) => (
          <div key={s.id} className="rounded-md border border-tavern-border bg-tavern-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-heading font-bold text-tavern-text">
                  {s.name}
                  <span className="ml-2 text-xs font-normal text-tavern-muted">
                    {s.size} · {s.speed} ft
                  </span>
                  <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                    Homebrew
                  </span>
                </div>
                {s.traits.length > 0 && (
                  <p className="mt-1 text-[11px] text-tavern-muted">
                    {s.traits.length} trait{s.traits.length === 1 ? "" : "s"}:{" "}
                    {s.traits.map((t) => t.name).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(s)} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
                  Edit
                </button>
                <button onClick={() => remove(s.id)} className="text-xs text-tavern-muted hover:text-tavern-oxblood-light">
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
