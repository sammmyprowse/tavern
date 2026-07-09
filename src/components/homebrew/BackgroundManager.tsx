"use client";

import { useState } from "react";
import {
  createUserBackground,
  updateUserBackground,
  deleteUserBackground,
} from "@/app/homebrew/actions";
import { ABILITY_OPTIONS, ORIGIN_FEAT_OPTIONS } from "@/lib/user-content";

export interface HomebrewBackground {
  id: string;
  name: string;
  description: string;
  skills: string[];
  abilities: string[];
  featIndex: string;
}

const ABILITY_NAME = Object.fromEntries(ABILITY_OPTIONS.map((a) => [a.index, a.name]));
const FEAT_NAME = Object.fromEntries(ORIGIN_FEAT_OPTIONS.map((f) => [f.index, f.name]));

export default function BackgroundManager({
  backgrounds: initial,
  skills,
}: {
  backgrounds: HomebrewBackground[];
  skills: { index: string; name: string }[];
}) {
  const [backgrounds, setBackgrounds] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [chosenAbilities, setChosenAbilities] = useState<string[]>([]);
  const [featIndex, setFeatIndex] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setDescription("");
    setChosenSkills([]);
    setChosenAbilities([]);
    setFeatIndex("");
    setError(null);
  }

  function startEdit(b: HomebrewBackground) {
    setEditingId(b.id);
    setCreating(false);
    setName(b.name);
    setDescription(b.description);
    setChosenSkills(b.skills);
    setChosenAbilities(b.abilities);
    setFeatIndex(b.featIndex);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function toggle(list: string[], set: (v: string[]) => void, value: string, max: number) {
    if (list.includes(value)) set(list.filter((v) => v !== value));
    else if (list.length < max) set([...list, value]);
  }

  async function save() {
    setPending(true);
    setError(null);
    const fn = editingId ? updateUserBackground.bind(null, editingId) : createUserBackground;
    const r = await fn(name, description, chosenSkills, chosenAbilities, featIndex);
    if (r.success) {
      if (editingId) {
        setBackgrounds((prev) =>
          prev.map((b) =>
            b.id === editingId
              ? { ...b, name: name.trim(), description: description.trim(), skills: chosenSkills, abilities: chosenAbilities, featIndex }
              : b,
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
    const r = await deleteUserBackground(id);
    if (r.success) setBackgrounds((prev) => prev.filter((b) => b.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-tavern-muted">
          Custom backgrounds appear in the builder&apos;s Background step for you, tagged homebrew:
          2 skill proficiencies, a 3-ability bonus choice, and an Origin feat. (They grant no
          starting equipment or gold — a small simplification.)
        </p>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
          >
            + New Background
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Background" : "New Background"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Background name (e.g. Lighthouse Keeper)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Flavour / description (optional)"
            className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
          />

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Skill proficiencies ({chosenSkills.length}/2)
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <button
                key={s.index}
                onClick={() => toggle(chosenSkills, setChosenSkills, s.index, 2)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  chosenSkills.includes(s.index)
                    ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Ability score options ({chosenAbilities.length}/3)
          </p>
          <p className="text-[11px] text-tavern-muted">
            The player picks +2/+1 or +1/+1/+1 among these three when building.
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ABILITY_OPTIONS.map((a) => (
              <button
                key={a.index}
                onClick={() => toggle(chosenAbilities, setChosenAbilities, a.index, 3)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  chosenAbilities.includes(a.index)
                    ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Origin feat
          </p>
          <select
            value={featIndex}
            onChange={(e) => setFeatIndex(e.target.value)}
            className="mt-1 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text sm:w-auto"
          >
            <option value="">Choose an Origin feat…</option>
            {ORIGIN_FEAT_OPTIONS.map((f) => (
              <option key={f.index} value={f.index}>
                {f.name}
              </option>
            ))}
          </select>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending || !name.trim() || chosenSkills.length !== 2 || chosenAbilities.length !== 3 || !featIndex}
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
        {backgrounds.length === 0 && !formOpen && (
          <p className="text-sm text-tavern-muted italic">
            No custom backgrounds yet. Create one and it&apos;ll be selectable in the builder.
          </p>
        )}
        {backgrounds.map((b) => (
          <div key={b.id} className="rounded-md border border-tavern-border bg-tavern-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-heading font-bold text-tavern-text">
                  {b.name}
                  <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                    Homebrew
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-tavern-muted">
                  {b.skills.map((s) => skills.find((x) => x.index === s)?.name ?? s).join(", ")} ·{" "}
                  {b.abilities.map((a) => ABILITY_NAME[a] ?? a).join("/")} ·{" "}
                  {FEAT_NAME[b.featIndex] ?? b.featIndex}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(b)} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
                  Edit
                </button>
                <button onClick={() => remove(b.id)} className="text-xs text-tavern-muted hover:text-tavern-oxblood-light">
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
