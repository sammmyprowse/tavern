"use client";

import { useState } from "react";
import { createUserClass, updateUserClass, deleteUserClass } from "@/app/homebrew/actions";
import {
  ABILITY_OPTIONS,
  HIT_DIE_OPTIONS,
  type UserClassData,
  type UserClassFeature,
} from "@/lib/user-content";

export interface HomebrewClass extends UserClassData {
  id: string;
  name: string;
}

const ABILITY_NAME = Object.fromEntries(ABILITY_OPTIONS.map((a) => [a.index, a.name]));
const CASTER_ABILITIES = ABILITY_OPTIONS.filter((a) => ["int", "wis", "cha"].includes(a.index));
const emptyFeature = (): UserClassFeature => ({ name: "", level: 1, description: "" });

export default function ClassManager({ classes: initial }: { classes: HomebrewClass[] }) {
  const [classes, setClasses] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [hitDie, setHitDie] = useState(8);
  const [saves, setSaves] = useState<string[]>([]);
  const [spellAbility, setSpellAbility] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<UserClassFeature[]>([emptyFeature()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setHitDie(8);
    setSaves([]);
    setSpellAbility(null);
    setDescription("");
    setFeatures([emptyFeature()]);
    setError(null);
  }

  function startEdit(c: HomebrewClass) {
    setEditingId(c.id);
    setCreating(false);
    setName(c.name);
    setHitDie(c.hitDie);
    setSaves(c.savingThrows);
    setSpellAbility(c.spellcastingAbility);
    setDescription(c.description);
    setFeatures(c.features.length ? c.features : [emptyFeature()]);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function toggleSave(index: string) {
    setSaves((prev) => {
      if (prev.includes(index)) return prev.filter((s) => s !== index);
      if (prev.length >= 2) return prev;
      return [...prev, index];
    });
  }

  function setFeature(i: number, patch: Partial<UserClassFeature>) {
    setFeatures((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function save() {
    setPending(true);
    setError(null);
    const data: UserClassData = {
      hitDie,
      savingThrows: saves,
      spellcastingAbility: spellAbility,
      description,
      features: features.filter((f) => f.name.trim()),
    };
    const fn = editingId ? updateUserClass.bind(null, editingId) : createUserClass;
    const r = await fn(name, data);
    if (r.success) {
      if (editingId) {
        setClasses((prev) => prev.map((c) => (c.id === editingId ? { ...data, id: editingId, name: name.trim() } : c)));
        cancel();
      } else {
        window.location.reload();
        return;
      }
    } else setError(r.error ?? "Couldn't save.");
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserClass(id);
    if (r.success) setClasses((prev) => prev.filter((c) => c.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-tavern-muted">
          Custom classes appear in the builder&apos;s Class step and the multiclass picker, tagged
          homebrew: a hit die, two saving throws, optional full-caster spellcasting, and per-level
          features (listed, not simulated). They don&apos;t grant the interactive class resources
          (Rage, Second Wind, …), starting equipment, or class skill choices.
        </p>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
          >
            + New Class
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Class" : "New Class"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Class name (e.g. Warden)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="text-xs text-tavern-muted">
              Hit die{" "}
              <select
                value={hitDie}
                onChange={(e) => setHitDie(Number(e.target.value))}
                className="ml-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
              >
                {HIT_DIE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    d{d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              Spellcasting{" "}
              <select
                value={spellAbility ?? ""}
                onChange={(e) => setSpellAbility(e.target.value || null)}
                className="ml-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text"
              >
                <option value="">None</option>
                {CASTER_ABILITIES.map((a) => (
                  <option key={a.index} value={a.index}>
                    Full caster ({a.name})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Saving throw proficiencies ({saves.length}/2)
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ABILITY_OPTIONS.map((a) => (
              <button
                key={a.index}
                onClick={() => toggleSave(a.index)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  saves.includes(a.index)
                    ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={2}
            placeholder="Class description / overview (optional)"
            className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
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
                    {Array.from({ length: 20 }, (_, n) => n + 1).map((l) => (
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

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending || !name.trim() || saves.length !== 2}
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
        {classes.length === 0 && !formOpen && (
          <p className="text-sm text-tavern-muted italic">
            No custom classes yet. Create one and it&apos;ll be selectable in the builder.
          </p>
        )}
        {classes.map((c) => (
          <div key={c.id} className="rounded-md border border-tavern-border bg-tavern-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-heading font-bold text-tavern-text">
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-tavern-muted">
                    d{c.hitDie} · {c.savingThrows.map((s) => ABILITY_NAME[s] ?? s).join("/")} saves
                    {c.spellcastingAbility ? ` · ${ABILITY_NAME[c.spellcastingAbility]} caster` : ""}
                  </span>
                  <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                    Homebrew
                  </span>
                </div>
                {c.features.length > 0 && (
                  <p className="mt-1 text-[11px] text-tavern-muted">
                    {c.features.length} feature{c.features.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(c)} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
                  Edit
                </button>
                <button onClick={() => remove(c.id)} className="text-xs text-tavern-muted hover:text-tavern-oxblood-light">
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
