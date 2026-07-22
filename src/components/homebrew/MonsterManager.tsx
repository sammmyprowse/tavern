"use client";

import { useState } from "react";
import {
  createUserMonster,
  updateUserMonster,
  deleteUserMonster,
} from "@/app/homebrew/actions";
import {
  MONSTER_SIZE_OPTIONS,
  type UserMonsterAction,
  type UserMonsterData,
  type UserMonsterTrait,
} from "@/lib/user-content";
import { CR_OPTIONS, crLabel, crToXp } from "@/lib/encounter";
import {
  ManagerHeader,
  ManagerItemCard,
  ManagerFormActions,
  ManagerEmptyNote,
} from "@/components/homebrew/shell";

export interface HomebrewMonster extends UserMonsterData {
  id: string;
  name: string;
}

const ABILITY_FIELDS = [
  ["str", "STR"],
  ["dex", "DEX"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "WIS"],
  ["cha", "CHA"],
] as const;

const emptyTrait = (): UserMonsterTrait => ({ name: "", description: "" });
const emptyAction = (): UserMonsterAction => ({
  name: "",
  description: "",
  attackBonus: null,
  damageDice: null,
  damageType: null,
});

const emptyData = (): UserMonsterData => ({
  size: "Medium",
  type: "",
  armorClass: 12,
  hitPoints: 10,
  speed: "30 ft.",
  challengeRating: 1,
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  traits: [],
  actions: [emptyAction()],
});

export default function MonsterManager({ monsters: initial }: { monsters: HomebrewMonster[] }) {
  const [monsters, setMonsters] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [data, setData] = useState<UserMonsterData>(emptyData());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setName("");
    setData(emptyData());
    setError(null);
  }

  function startEdit(m: HomebrewMonster) {
    setEditingId(m.id);
    setCreating(false);
    setName(m.name);
    const { id: _id, name: _name, ...rest } = m;
    setData({
      ...rest,
      traits: rest.traits.length ? rest.traits : [],
      actions: rest.actions.length ? rest.actions : [emptyAction()],
    });
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function patch(p: Partial<UserMonsterData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function setTrait(i: number, p: Partial<UserMonsterTrait>) {
    setData((prev) => ({
      ...prev,
      traits: prev.traits.map((t, idx) => (idx === i ? { ...t, ...p } : t)),
    }));
  }

  function setAction(i: number, p: Partial<UserMonsterAction>) {
    setData((prev) => ({
      ...prev,
      actions: prev.actions.map((a, idx) => (idx === i ? { ...a, ...p } : a)),
    }));
  }

  async function save() {
    setPending(true);
    setError(null);
    const clean: UserMonsterData = {
      ...data,
      traits: data.traits.filter((t) => t.name.trim()),
      actions: data.actions.filter((a) => a.name.trim()),
    };
    if (editingId) {
      const r = await updateUserMonster(editingId, name, clean);
      if (r.success) {
        setMonsters((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...clean, name: name.trim() } : m)),
        );
        cancel();
      } else setError(r.error ?? "Couldn't save.");
    } else {
      const r = await createUserMonster(name, clean);
      if (r.success) {
        window.location.reload();
        return;
      } else setError(r.error ?? "Couldn't create.");
    }
    setPending(false);
  }

  async function remove(id: string) {
    const r = await deleteUserMonster(id);
    if (r.success) setMonsters((prev) => prev.filter((m) => m.id !== id));
  }

  const formOpen = creating || editingId !== null;

  const numberInput =
    "w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text";

  return (
    <div>
      <ManagerHeader
        blurb="Custom monsters appear in the encounter builder on the DM screen of parties you lead, tagged homebrew. XP and proficiency bonus derive from the Challenge Rating you pick."
        buttonLabel="+ New Monster"
        formOpen={formOpen}
        onCreate={startCreate}
      />

      {formOpen && (
        <div className="mt-4 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
          <p className="font-heading text-sm font-bold text-tavern-gold-light">
            {editingId ? "Edit Monster" : "New Monster"}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Monster name (e.g. Bog Lurker)"
              className="w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
            />
            <input
              type="text"
              value={data.type}
              onChange={(e) => patch({ type: e.target.value })}
              maxLength={50}
              placeholder="Type (e.g. Monstrosity, Undead)"
              className="w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="block">
              <span className="text-[10px] tracking-wider text-tavern-muted uppercase">Size</span>
              <select
                value={data.size}
                onChange={(e) => patch({ size: e.target.value })}
                className={numberInput}
              >
                {MONSTER_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] tracking-wider text-tavern-muted uppercase">CR</span>
              <select
                value={data.challengeRating}
                onChange={(e) => patch({ challengeRating: Number(e.target.value) })}
                className={numberInput}
              >
                {CR_OPTIONS.map((cr) => (
                  <option key={cr} value={cr}>
                    {crLabel(cr)} ({crToXp(cr)} XP)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] tracking-wider text-tavern-muted uppercase">AC</span>
              <input
                type="number"
                value={data.armorClass}
                onChange={(e) => patch({ armorClass: Number(e.target.value) })}
                min={1}
                max={30}
                className={numberInput}
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-wider text-tavern-muted uppercase">HP</span>
              <input
                type="number"
                value={data.hitPoints}
                onChange={(e) => patch({ hitPoints: Number(e.target.value) })}
                min={1}
                max={999}
                className={numberInput}
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-wider text-tavern-muted uppercase">Speed</span>
              <input
                type="text"
                value={data.speed}
                onChange={(e) => patch({ speed: e.target.value })}
                maxLength={100}
                placeholder="30 ft."
                className={numberInput}
              />
            </label>
          </div>

          <p className="mt-4 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Ability Scores
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ABILITY_FIELDS.map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[10px] tracking-wider text-tavern-muted uppercase">
                  {label}
                </span>
                <input
                  type="number"
                  value={data.abilities[key]}
                  onChange={(e) =>
                    patch({ abilities: { ...data.abilities, [key]: Number(e.target.value) } })
                  }
                  min={1}
                  max={30}
                  className={numberInput}
                />
              </label>
            ))}
          </div>

          <p className="mt-4 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Traits
          </p>
          <div className="mt-2 space-y-2">
            {data.traits.map((t, i) => (
              <div key={i} className="rounded-md border border-tavern-border p-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) => setTrait(i, { name: e.target.value })}
                    maxLength={100}
                    placeholder="Trait name (e.g. Amphibious)"
                    className="flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                  />
                  <button
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        traits: prev.traits.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="px-2 text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={t.description}
                  onChange={(e) => setTrait(i, { description: e.target.value })}
                  maxLength={2000}
                  rows={2}
                  placeholder="What the trait does."
                  className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setData((prev) => ({ ...prev, traits: [...prev.traits, emptyTrait()] }))}
            className="mt-2 text-xs text-tavern-gold-light hover:text-tavern-gold"
          >
            + Add trait
          </button>

          <p className="mt-4 font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Actions
          </p>
          <div className="mt-2 space-y-2">
            {data.actions.map((a, i) => (
              <div key={i} className="rounded-md border border-tavern-border p-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => setAction(i, { name: e.target.value })}
                    maxLength={100}
                    placeholder="Action name (e.g. Bite)"
                    className="flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                  />
                  {data.actions.length > 1 && (
                    <button
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          actions: prev.actions.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="px-2 text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-[10px] tracking-wider text-tavern-muted uppercase">
                      To hit (blank = none)
                    </span>
                    <input
                      type="number"
                      value={a.attackBonus ?? ""}
                      onChange={(e) =>
                        setAction(i, {
                          attackBonus: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      min={-5}
                      max={30}
                      className={numberInput}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-wider text-tavern-muted uppercase">
                      Damage dice
                    </span>
                    <input
                      type="text"
                      value={a.damageDice ?? ""}
                      onChange={(e) => setAction(i, { damageDice: e.target.value || null })}
                      maxLength={12}
                      placeholder="2d6+3"
                      className={numberInput}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-wider text-tavern-muted uppercase">
                      Damage type
                    </span>
                    <input
                      type="text"
                      value={a.damageType ?? ""}
                      onChange={(e) => setAction(i, { damageType: e.target.value || null })}
                      maxLength={30}
                      placeholder="Piercing"
                      className={numberInput}
                    />
                  </label>
                </div>
                <textarea
                  value={a.description}
                  onChange={(e) => setAction(i, { description: e.target.value })}
                  maxLength={2000}
                  rows={2}
                  placeholder="Full action text (reach/range, targets, extra effects)."
                  className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1 text-sm text-tavern-text placeholder:text-tavern-muted"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setData((prev) => ({ ...prev, actions: [...prev.actions, emptyAction()] }))
            }
            className="mt-2 text-xs text-tavern-gold-light hover:text-tavern-gold"
          >
            + Add action
          </button>

          <ManagerFormActions
            pending={pending}
            disabled={!name.trim()}
            error={error}
            onSave={save}
            onCancel={cancel}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {monsters.length === 0 && !formOpen && (
          <ManagerEmptyNote>
            No custom monsters yet. Create one and it&apos;ll show up in the encounter builder for
            parties you lead.
          </ManagerEmptyNote>
        )}
        {monsters.map((m) => (
          <ManagerItemCard
            key={m.id}
            name={m.name}
            meta={`CR ${crLabel(m.challengeRating)} · ${m.type || "—"} · AC ${m.armorClass} · ${m.hitPoints} HP`}
            onEdit={() => startEdit(m)}
            onDelete={() => remove(m.id)}
          >
            {m.actions.length > 0 && (
              <p className="mt-1 text-[11px] text-tavern-muted">
                Actions: {m.actions.map((a) => a.name).join(", ")}
              </p>
            )}
          </ManagerItemCard>
        ))}
      </div>
    </div>
  );
}
