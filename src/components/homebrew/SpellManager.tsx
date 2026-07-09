"use client";

import { useState } from "react";
import { createUserSpell, updateUserSpell, deleteUserSpell } from "@/app/homebrew/actions";
import {
  CLASS_OPTIONS,
  SPELL_SCHOOL_OPTIONS,
  ABILITY_OPTIONS,
  type UserSpellData,
} from "@/lib/user-content";

export interface HomebrewSpell extends UserSpellData {
  id: string;
  name: string;
}

const CLASS_NAME = Object.fromEntries(CLASS_OPTIONS.map((c) => [c.index, c.name]));

const blank = (): UserSpellData => ({
  level: 0,
  school: "Evocation",
  classes: [],
  castingTime: "1 Action",
  range: "",
  duration: "Instantaneous",
  components: ["V", "S"],
  material: "",
  concentration: false,
  ritual: false,
  description: "",
  higherLevel: "",
  attackType: null,
  dcAbility: null,
  damageDice: null,
  damageType: null,
});

const input =
  "w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted";

export default function SpellManager({ spells: initial }: { spells: HomebrewSpell[] }) {
  const [spells, setSpells] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [f, setF] = useState<UserSpellData>(blank());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(patch: Partial<UserSpellData>) {
    setF((prev) => ({ ...prev, ...patch }));
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setF(blank());
    setError(null);
  }

  function startEdit(s: HomebrewSpell) {
    setEditingId(s.id);
    setCreating(false);
    setName(s.name);
    const { id: _id, name: _n, ...data } = s;
    setF({ ...blank(), ...data });
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function toggleClass(index: string) {
    set({
      classes: f.classes.includes(index)
        ? f.classes.filter((c) => c !== index)
        : [...f.classes, index],
    });
  }

  function toggleComponent(c: string) {
    set({
      components: f.components.includes(c)
        ? f.components.filter((x) => x !== c)
        : [...f.components, c],
    });
  }

  async function save() {
    setPending(true);
    setError(null);
    const fn = editingId ? updateUserSpell.bind(null, editingId) : createUserSpell;
    const r = await fn(name, f);
    if (r.success) {
      if (editingId) {
        setSpells((prev) => prev.map((s) => (s.id === editingId ? { ...f, id: editingId, name: name.trim() } : s)));
        cancel();
      } else {
        window.location.reload();
        return;
      }
    } else setError(r.error ?? "Couldn't save.");
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserSpell(id);
    if (r.success) setSpells((prev) => prev.filter((s) => s.id !== id));
  }

  const formOpen = creating || editingId !== null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-tavern-muted">
          Custom spells appear in the spell compendium and in the prepared/cantrip pickers for the
          classes you assign, on your own characters — tagged homebrew. Attack/save/damage fields
          drive the Attack and Damage buttons; everything else is shown as rules text.
        </p>
        {!formOpen && (
          <button
            onClick={startCreate}
            className="shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
          >
            + New Spell
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Spell" : "New Spell"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Spell name"
            className={`mt-2 ${input}`}
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-tavern-muted">
              Level
              <select value={f.level} onChange={(e) => set({ level: Number(e.target.value) })} className={`mt-1 ${input}`}>
                <option value={0}>Cantrip</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              School
              <select value={f.school} onChange={(e) => set({ school: e.target.value })} className={`mt-1 ${input}`}>
                {SPELL_SCHOOL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              Casting time
              <input value={f.castingTime} onChange={(e) => set({ castingTime: e.target.value })} placeholder="1 Action" className={`mt-1 ${input}`} />
            </label>
            <label className="text-xs text-tavern-muted">
              Range
              <input value={f.range} onChange={(e) => set({ range: e.target.value })} placeholder="60 ft" className={`mt-1 ${input}`} />
            </label>
            <label className="text-xs text-tavern-muted">
              Duration
              <input value={f.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Instantaneous" className={`mt-1 ${input}`} />
            </label>
          </div>

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Classes ({f.classes.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CLASS_OPTIONS.map((c) => (
              <button
                key={c.index}
                onClick={() => toggleClass(c.index)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  f.classes.includes(c.index)
                    ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-tavern-muted">Components:</span>
              {["V", "S", "M"].map((c) => (
                <button
                  key={c}
                  onClick={() => toggleComponent(c)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    f.components.includes(c)
                      ? "border-tavern-gold bg-tavern-gold/10 text-tavern-gold-light"
                      : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-tavern-muted">
              <input type="checkbox" checked={f.concentration} onChange={(e) => set({ concentration: e.target.checked })} />
              Concentration
            </label>
            <label className="flex items-center gap-1.5 text-xs text-tavern-muted">
              <input type="checkbox" checked={f.ritual} onChange={(e) => set({ ritual: e.target.checked })} />
              Ritual
            </label>
          </div>
          {f.components.includes("M") && (
            <input value={f.material} onChange={(e) => set({ material: e.target.value })} placeholder="Material component (e.g. a pinch of sulfur)" className={`mt-2 ${input}`} />
          )}

          <textarea
            value={f.description}
            onChange={(e) => set({ description: e.target.value })}
            maxLength={4000}
            rows={4}
            placeholder="Full spell description / rules text."
            className={`mt-2 ${input}`}
          />
          <textarea
            value={f.higherLevel}
            onChange={(e) => set({ higherLevel: e.target.value })}
            maxLength={2000}
            rows={2}
            placeholder="At Higher Levels (optional)"
            className={`mt-2 ${input}`}
          />

          <p className="mt-3 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Combat (optional)
          </p>
          <div className="mt-1 grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-tavern-muted">
              Attack
              <select value={f.attackType ?? ""} onChange={(e) => set({ attackType: (e.target.value || null) as UserSpellData["attackType"] })} className={`mt-1 ${input}`}>
                <option value="">None</option>
                <option value="ranged">Ranged</option>
                <option value="melee">Melee</option>
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              Save
              <select value={f.dcAbility ?? ""} onChange={(e) => set({ dcAbility: e.target.value || null })} className={`mt-1 ${input}`}>
                <option value="">None</option>
                {ABILITY_OPTIONS.map((a) => (
                  <option key={a.index} value={a.index}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tavern-muted">
              Damage dice
              <input value={f.damageDice ?? ""} onChange={(e) => set({ damageDice: e.target.value || null })} placeholder="e.g. 3d6" className={`mt-1 ${input}`} />
            </label>
            <label className="text-xs text-tavern-muted">
              Damage type
              <input value={f.damageType ?? ""} onChange={(e) => set({ damageType: e.target.value || null })} placeholder="e.g. fire" className={`mt-1 ${input}`} />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending || !name.trim() || f.classes.length === 0}
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
        {spells.length === 0 && !formOpen && (
          <p className="text-sm text-tavern-muted italic">
            No custom spells yet. Create one and it&apos;ll appear in the compendium and your
            characters&apos; spell pickers.
          </p>
        )}
        {spells.map((s) => (
          <div key={s.id} className="rounded-md border border-tavern-border bg-tavern-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-heading font-bold text-tavern-text">
                  {s.name}
                  <span className="ml-2 text-xs font-normal text-tavern-muted">
                    {s.level === 0 ? "Cantrip" : `Level ${s.level}`} · {s.school}
                  </span>
                  <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                    Homebrew
                  </span>
                </div>
                {s.classes.length > 0 && (
                  <p className="mt-1 text-[11px] text-tavern-muted">
                    {s.classes.map((c) => CLASS_NAME[c] ?? c).join(", ")}
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
