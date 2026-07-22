"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { dismissCharacterEffect } from "@/app/characters/actions";
import { CONDITIONS } from "@/lib/conditions";
import {
  parseCharacterEffectRow,
  type CharacterEffect,
  type CharacterEffectRow,
  type RestType,
} from "@/lib/dm-effects";

// DM-pushed effects on the owner's play sheet, kept live via Supabase
// Realtime (postgres_changes on character_effects, filtered to this
// character — DELETE events reach the filter because the table has REPLICA
// IDENTITY FULL, see the migration). Everything a DM pushes is a prompt:
// a rest is applied only when the player taps Apply, a condition only starts
// counting on their own sheet when they tap Track. Dismissing deletes the row
// (owner-side RLS policy), which also clears it from the DM's screen.
export default function DmEffectsPanel({
  characterId,
  initialEffects,
  onApplyRest,
  onTrackCondition,
}: {
  characterId: string;
  initialEffects: CharacterEffect[];
  onApplyRest: (rest: RestType) => void;
  onTrackCondition: (conditionIndex: string) => void;
}) {
  const [effects, setEffects] = useState<CharacterEffect[]>(initialEffects);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const client = createClient();
    const channel = client
      .channel(`character-effects-${characterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_effects",
          filter: `character_id=eq.${characterId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const effect = parseCharacterEffectRow(payload.new as CharacterEffectRow);
            setEffects((prev) =>
              prev.some((e) => e.id === effect.id) ? prev : [...prev, effect],
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) setEffects((prev) => prev.filter((e) => e.id !== oldId));
          }
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [characterId]);

  async function dismiss(effectId: string) {
    setPendingId(effectId);
    const result = await dismissCharacterEffect(effectId);
    setPendingId(null);
    // The Realtime DELETE event also lands here, but removing locally keeps
    // the UI instant even if the socket is slow or momentarily dropped.
    if (result.success) setEffects((prev) => prev.filter((e) => e.id !== effectId));
  }

  if (effects.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-tavern-gold/50 bg-tavern-card p-4">
      <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold uppercase">
        From your DM
      </h2>
      <div className="mt-2 space-y-2">
        {effects.map((e) => {
          const busy = pendingId === e.id;
          if (e.kind === "rest") {
            const rest: RestType = e.data.rest === "long" ? "long" : "short";
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-tavern-border bg-tavern-bg p-3"
              >
                <span className="text-sm text-tavern-text">
                  Your DM called a{" "}
                  <span className="font-heading font-bold text-tavern-gold-light">{e.name}</span>.
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => {
                      onApplyRest(rest);
                      dismiss(e.id);
                    }}
                    disabled={busy}
                    className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
                  >
                    Apply {e.name}
                  </button>
                  <button
                    onClick={() => dismiss(e.id)}
                    disabled={busy}
                    className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            );
          }

          const conditionEffect =
            e.kind === "condition"
              ? CONDITIONS.find((c) => c.index === e.data.conditionIndex)?.effect
              : null;
          return (
            <div
              key={e.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-tavern-border bg-tavern-bg p-3"
            >
              <span className="min-w-0 flex-1 text-sm">
                <span
                  className={`font-heading font-bold ${
                    e.kind === "condition" ? "text-tavern-oxblood-light" : "text-tavern-gold-light"
                  }`}
                >
                  {e.name}
                </span>
                {(conditionEffect ?? e.data.description) && (
                  <span className="mt-0.5 block text-xs text-tavern-muted">
                    {conditionEffect ?? e.data.description}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-2">
                {e.kind === "condition" && e.data.conditionIndex && (
                  <button
                    onClick={() => {
                      onTrackCondition(e.data.conditionIndex!);
                      dismiss(e.id);
                    }}
                    disabled={busy}
                    className="rounded-md border border-tavern-gold/60 px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold disabled:opacity-50"
                  >
                    Track
                  </button>
                )}
                <button
                  onClick={() => dismiss(e.id)}
                  disabled={busy}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                >
                  Dismiss
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
