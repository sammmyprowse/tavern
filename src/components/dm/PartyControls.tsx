"use client";

import { useState } from "react";
import {
  applyCharacterEffect,
  applyPartyRest,
  removeCharacterEffect,
  savePartyCharacterNote,
} from "@/app/parties/actions";
import { CONDITIONS } from "@/lib/conditions";
import type { CharacterEffect, RestType } from "@/lib/dm-effects";

// DM Tier 2 controls: push conditions/effects onto party characters, call a
// party-wide rest, and keep private per-character notes. Everything here
// writes character_effects / party_character_notes rows — the player's play
// sheet picks effects up live via Realtime and decides what to do with them;
// nothing here mutates a player's actual play state.
export default function PartyControls({
  partyId,
  members,
  effectsByCharacter,
  notesByCharacter,
}: {
  partyId: string;
  members: { id: string; name: string }[];
  effectsByCharacter: Record<string, CharacterEffect[]>;
  notesByCharacter: Record<string, string>;
}) {
  const [restPending, setRestPending] = useState<RestType | null>(null);
  const [restNote, setRestNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callRest(rest: RestType) {
    setRestPending(rest);
    setError(null);
    setRestNote(null);
    const result = await applyPartyRest(
      partyId,
      members.map((m) => m.id),
      rest,
    );
    setRestPending(null);
    if (!result.success) setError(result.error ?? "Couldn't call the rest.");
    else
      setRestNote(
        `${rest === "long" ? "Long" : "Short"} Rest called — each player gets a prompt on their sheet to apply it.`,
      );
  }

  if (members.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
        Party Controls
      </h2>

      <div className="mt-3 rounded-lg border border-tavern-border bg-tavern-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-sm font-bold text-tavern-text">Call a rest:</span>
          <button
            onClick={() => callRest("short")}
            disabled={restPending !== null}
            className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
          >
            {restPending === "short" ? "Calling…" : "Short Rest"}
          </button>
          <button
            onClick={() => callRest("long")}
            disabled={restPending !== null}
            className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
          >
            {restPending === "long" ? "Calling…" : "Long Rest"}
          </button>
          {restNote && <span className="text-xs text-tavern-gold-light">{restNote}</span>}
          {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
        </div>
        <p className="mt-2 text-xs text-tavern-muted">
          Players apply the rest from their own sheet — their HP, slots, and resources live in
          their browser, so nothing changes until they confirm it.
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {members.map((m) => (
          <MemberControls
            key={m.id}
            partyId={partyId}
            member={m}
            effects={effectsByCharacter[m.id] ?? []}
            note={notesByCharacter[m.id] ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

function MemberControls({
  partyId,
  member,
  effects,
  note,
}: {
  partyId: string;
  member: { id: string; name: string };
  effects: CharacterEffect[];
  note: string;
}) {
  const [conditionIndex, setConditionIndex] = useState("");
  const [effectName, setEffectName] = useState("");
  const [effectText, setEffectText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local editable copy of the saved note (adjust-during-render pattern, same
  // as CurrencyTracker — an effect would commit one extra stale frame).
  const [noteDraft, setNoteDraft] = useState(note);
  const [prevNote, setPrevNote] = useState(note);
  if (note !== prevNote) {
    setPrevNote(note);
    setNoteDraft(note);
  }
  const [notePending, setNotePending] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const activeConditionIndexes = new Set(
    effects.filter((e) => e.kind === "condition").map((e) => e.data.conditionIndex),
  );
  const conditionOptions = CONDITIONS.filter((c) => !activeConditionIndexes.has(c.index));

  async function pushCondition() {
    const condition = CONDITIONS.find((c) => c.index === conditionIndex);
    if (!condition) return;
    setPending(true);
    setError(null);
    const result = await applyCharacterEffect(partyId, member.id, "condition", condition.name, {
      conditionIndex: condition.index,
    });
    setPending(false);
    if (!result.success) setError(result.error ?? "Couldn't push the condition.");
    else setConditionIndex("");
  }

  async function pushEffect() {
    if (!effectName.trim()) return;
    setPending(true);
    setError(null);
    const result = await applyCharacterEffect(partyId, member.id, "effect", effectName, {
      description: effectText.trim() || undefined,
    });
    setPending(false);
    if (!result.success) setError(result.error ?? "Couldn't push the effect.");
    else {
      setEffectName("");
      setEffectText("");
    }
  }

  async function remove(effectId: string) {
    setPending(true);
    setError(null);
    const result = await removeCharacterEffect(partyId, effectId);
    setPending(false);
    if (!result.success) setError(result.error ?? "Couldn't remove that.");
  }

  async function saveNote() {
    setNotePending(true);
    setError(null);
    const result = await savePartyCharacterNote(partyId, member.id, noteDraft);
    setNotePending(false);
    if (!result.success) setError(result.error ?? "Couldn't save the note.");
    else {
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  }

  return (
    <div className="rounded-lg border border-tavern-border bg-tavern-card p-4">
      <div className="font-heading font-bold text-tavern-text">{member.name}</div>

      {effects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {effects.map((e) => (
            <span
              key={e.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                e.kind === "condition"
                  ? "border-tavern-oxblood-light/60 text-tavern-oxblood-light"
                  : "border-tavern-gold-light/40 text-tavern-gold-light"
              }`}
              title={
                e.kind === "condition"
                  ? CONDITIONS.find((c) => c.index === e.data.conditionIndex)?.effect
                  : e.data.description
              }
            >
              {e.kind === "rest" ? `${e.name} (pending)` : e.name}
              <button
                onClick={() => remove(e.id)}
                disabled={pending}
                className="text-tavern-muted hover:text-tavern-text"
                aria-label={`Remove ${e.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={conditionIndex}
          onChange={(e) => setConditionIndex(e.target.value)}
          className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-xs text-tavern-text"
        >
          <option value="">Push a condition…</option>
          {conditionOptions.map((c) => (
            <option key={c.index} value={c.index}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={pushCondition}
          disabled={pending || !conditionIndex}
          className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
        >
          Apply
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={effectName}
          onChange={(e) => setEffectName(e.target.value)}
          placeholder="Custom effect name (e.g. Blessed)"
          className="w-48 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-xs text-tavern-text placeholder:text-tavern-muted"
        />
        <input
          value={effectText}
          onChange={(e) => setEffectText(e.target.value)}
          placeholder="What it does (optional)"
          className="min-w-0 flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-xs text-tavern-text placeholder:text-tavern-muted"
        />
        <button
          onClick={pushEffect}
          disabled={pending || !effectName.trim()}
          className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
        >
          Push
        </button>
      </div>

      <div className="mt-3">
        <label className="text-[10px] tracking-wider text-tavern-muted uppercase">
          DM notes (only you see these)
        </label>
        <div className="mt-1 flex items-start gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            className="min-w-0 flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-xs text-tavern-text"
          />
          <button
            onClick={saveNote}
            disabled={notePending || noteDraft === note}
            className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
          >
            {notePending ? "Saving…" : noteSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-tavern-oxblood-light">{error}</p>}
    </div>
  );
}
