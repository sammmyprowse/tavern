"use client";

import { useMemo, useRef, useState } from "react";
import { createEncounter, deleteEncounter, saveEncounterState } from "@/app/parties/actions";
import type { MonsterListEntry, MonsterStatBlock } from "@/lib/srd";
import {
  crLabel,
  encounterDifficulty,
  formatMod,
  partyXpBudget,
  turnOrder,
  type Combatant,
  type EncounterMonster,
  type EncounterState,
} from "@/lib/encounter";
import { rollD20 } from "@/lib/dice";
import { abilityMod } from "@/lib/encounter";
import MonsterCard, { type DmLogEntry } from "@/components/dm/MonsterCard";

export interface DmMember {
  id: string;
  name: string;
  level: number;
  initiativeMod: number;
}

interface SavedEncounter {
  id: string;
  name: string;
  state: EncounterState;
}

// The DM screen's encounter section: saved-encounter list, the builder, and
// the live run view. The active encounter's state is authoritative HERE while
// the page is open — every mutation writes the whole blob via
// saveEncounterState (single writer, last-write-wins).
export default function EncounterManager({
  partyId,
  monsters,
  statBlocksByIndex,
  encounters,
  members,
}: {
  partyId: string;
  monsters: MonsterListEntry[];
  statBlocksByIndex: Record<string, MonsterStatBlock>;
  encounters: SavedEncounter[];
  members: DmMember[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const selected = encounters.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
          Encounters
        </h2>
        {!building && !selected && (
          <button
            onClick={() => setBuilding(true)}
            className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
          >
            + New Encounter
          </button>
        )}
        {(building || selected) && (
          <button
            onClick={() => {
              setBuilding(false);
              setSelectedId(null);
            }}
            className="text-xs text-tavern-muted hover:text-tavern-gold-light"
          >
            &larr; All encounters
          </button>
        )}
      </div>

      {building ? (
        <EncounterBuilder
          partyId={partyId}
          monsters={monsters}
          members={members}
          onCreated={(id) => {
            setBuilding(false);
            setSelectedId(id);
          }}
        />
      ) : selected ? (
        <RunEncounter
          key={selected.id}
          partyId={partyId}
          encounter={selected}
          statBlocksByIndex={statBlocksByIndex}
          members={members}
        />
      ) : (
        <EncounterList
          partyId={partyId}
          encounters={encounters}
          onOpen={setSelectedId}
        />
      )}
    </div>
  );
}

function EncounterList({
  partyId,
  encounters,
  onOpen,
}: {
  partyId: string;
  encounters: SavedEncounter[];
  onOpen: (id: string) => void;
}) {
  if (encounters.length === 0) {
    return (
      <p className="mt-3 text-sm text-tavern-muted">
        No encounters yet. Build one from the monster list — the party&apos;s XP budget is
        computed from their actual levels.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {encounters.map((e) => {
        const alive = e.state.monsters.filter((m) => m.currentHp > 0).length;
        return (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tavern-border bg-tavern-card p-4"
          >
            <div>
              <div className="font-heading font-bold text-tavern-text">{e.name}</div>
              <div className="mt-0.5 text-xs text-tavern-muted">
                {e.state.monsters.length} monster{e.state.monsters.length === 1 ? "" : "s"}
                {e.state.started
                  ? ` · round ${e.state.round} · ${alive} still up`
                  : " · not started"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpen(e.id)}
                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
              >
                Open
              </button>
              <DeleteEncounterButton partyId={partyId} encounterId={e.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeleteEncounterButton({
  partyId,
  encounterId,
}: {
  partyId: string;
  encounterId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
      >
        Delete
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        onClick={async () => {
          setPending(true);
          await deleteEncounter(partyId, encounterId);
        }}
        disabled={pending}
        className="font-bold text-tavern-oxblood-light disabled:opacity-50"
      >
        Confirm
      </button>
      <button onClick={() => setConfirming(false)} className="text-tavern-muted">
        Keep
      </button>
    </span>
  );
}

// ── Builder ─────────────────────────────────────────────────────────────────

function EncounterBuilder({
  partyId,
  monsters,
  members,
  onCreated,
}: {
  partyId: string;
  monsters: MonsterListEntry[];
  members: DmMember[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(
    () => [...new Set(monsters.map((m) => m.type))].sort(),
    [monsters],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monsters.filter(
      (m) =>
        (typeFilter === "all" || m.type === typeFilter) &&
        (!q || m.name.toLowerCase().includes(q)),
    );
  }, [monsters, search, typeFilter]);

  const budget = partyXpBudget(members.map((m) => m.level));
  const totalXp = Object.entries(picked).reduce((sum, [idx, count]) => {
    const m = monsters.find((x) => x.index === idx);
    return sum + (m?.xp ?? 0) * count;
  }, 0);
  const pickedCount = Object.values(picked).reduce((a, b) => a + b, 0);
  const difficulty = encounterDifficulty(totalXp, budget);

  function bump(index: string, delta: number) {
    setPicked((prev) => {
      const next = { ...prev };
      const count = (next[index] ?? 0) + delta;
      if (count <= 0) delete next[index];
      else next[index] = count;
      return next;
    });
  }

  async function create() {
    setPending(true);
    setError(null);
    const instances: EncounterMonster[] = Object.entries(picked).flatMap(([idx, count]) => {
      const m = monsters.find((x) => x.index === idx)!;
      return Array.from({ length: count }, (_, i) => ({
        key: `${idx}-${i + 1}`,
        index: idx,
        name: count > 1 ? `${m.name} ${i + 1}` : m.name,
        maxHp: m.hitPoints,
        currentHp: m.hitPoints,
        initiative: null,
      }));
    });
    const r = await createEncounter(partyId, name.trim() || "Encounter", {
      monsters: instances,
      playerInitiatives: {},
      round: 1,
      turn: 0,
      started: false,
    });
    if (r.success && r.encounterId) onCreated(r.encounterId);
    else {
      setError(r.error ?? "Couldn't create encounter.");
      setPending(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-tavern-gold/40 bg-tavern-card p-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Encounter name (e.g. Goblin Ambush)"
        className="w-full rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
      />

      {/* Difficulty readout: monster XP summed (2024 rules — no count multiplier)
          against the party's Low/Moderate/High budget. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-tavern-border px-3 py-2 text-xs">
        <span className="font-heading font-bold tracking-wider text-tavern-gold-light uppercase">
          {pickedCount === 0 ? "Empty" : difficulty}
        </span>
        <span className="text-tavern-text">{totalXp} XP</span>
        <span className="text-tavern-muted">
          Party budget — Low {budget.low} · Moderate {budget.moderate} · High {budget.high}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search monsters…"
          className="flex-1 rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-tavern-border">
        {filtered.map((m) => {
          const count = picked[m.index] ?? 0;
          return (
            <div
              key={m.index}
              className={`flex items-center justify-between gap-2 border-b border-tavern-border px-3 py-1.5 text-sm last:border-b-0 ${
                count > 0 ? "bg-tavern-bg" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="text-tavern-text">{m.name}</span>
                <span className="ml-2 text-xs text-tavern-muted">
                  CR {crLabel(m.challengeRating)} · {m.type} · AC {m.armorClass} · {m.hitPoints} HP
                  · {m.xp} XP
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {count > 0 && (
                  <>
                    <button
                      onClick={() => bump(m.index, -1)}
                      className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light"
                    >
                      &minus;
                    </button>
                    <span className="w-4 text-center font-heading font-bold text-tavern-text">
                      {count}
                    </span>
                  </>
                )}
                <button
                  onClick={() => bump(m.index, 1)}
                  className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-tavern-muted">No monsters match.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={create}
          disabled={pending || pickedCount === 0}
          className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
        >
          Create Encounter
        </button>
        {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
      </div>
    </div>
  );
}

// ── Run view ────────────────────────────────────────────────────────────────

function RunEncounter({
  partyId,
  encounter,
  statBlocksByIndex,
  members,
}: {
  partyId: string;
  encounter: SavedEncounter;
  statBlocksByIndex: Record<string, MonsterStatBlock>;
  members: DmMember[];
}) {
  const [state, setState] = useState<EncounterState>(encounter.state);
  const [log, setLog] = useState<DmLogEntry[]>([]);
  // Ref, not state: "Roll all monsters" pushes several entries in one tick,
  // and same-tick setState reads would hand every entry the same id (the
  // React batching trap in CLAUDE.md).
  const nextLogId = useRef(1);

  // Local state is authoritative; each change is persisted whole (fire and
  // forget — the DM is the only writer, and the next revalidated render echoes
  // what we already show).
  function persist(next: EncounterState) {
    setState(next);
    void saveEncounterState(partyId, encounter.id, next);
  }

  function pushLog(entry: Omit<DmLogEntry, "id">) {
    const id = nextLogId.current++;
    setLog((prev) => [{ ...entry, id }, ...prev].slice(0, 30));
  }

  const combatants: Combatant[] = [
    ...state.monsters.map((m) => ({
      id: m.key,
      name: m.name,
      isMonster: true,
      initiative: m.initiative,
    })),
    ...members.map((m) => ({
      id: m.id,
      name: m.name,
      isMonster: false,
      initiative: state.playerInitiatives[m.id] ?? null,
    })),
  ];
  const order = turnOrder(combatants);
  const activeId = state.started ? order[state.turn]?.id : null;

  function rollMonsterInitiative(keys?: string[]) {
    const nextMonsters = state.monsters.map((m) => {
      if (keys && !keys.includes(m.key)) return m;
      const sb = statBlocksByIndex[m.index];
      const mod = sb ? abilityMod(sb.abilities.dex) : 0;
      const r = rollD20(mod);
      pushLog({
        label: `${m.name} Initiative`,
        detail: `d20 [${r.rolls.join(", ")}] ${formatMod(mod)}`,
        total: r.total,
      });
      return { ...m, initiative: r.total };
    });
    persist({ ...state, monsters: nextMonsters });
  }

  function setPlayerInitiative(id: string, value: number | null) {
    const next = { ...state.playerInitiatives };
    if (value === null) delete next[id];
    else next[id] = value;
    persist({ ...state, playerInitiatives: next });
  }

  function nextTurn() {
    const count = order.length;
    if (count === 0) return;
    const turn = state.turn + 1;
    if (turn >= count) persist({ ...state, turn: 0, round: state.round + 1 });
    else persist({ ...state, turn });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-bold text-tavern-text">{encounter.name}</h3>
        <div className="flex items-center gap-3">
          {state.started ? (
            <>
              <span className="text-xs tracking-wider text-tavern-muted uppercase">
                Round {state.round}
              </span>
              <button
                onClick={nextTurn}
                className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
              >
                Next Turn
              </button>
            </>
          ) : (
            <button
              onClick={() => persist({ ...state, started: true, round: 1, turn: 0 })}
              className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
            >
              Start Combat
            </button>
          )}
        </div>
      </div>

      {/* Initiative order */}
      <div className="mt-3 rounded-lg border border-tavern-border bg-tavern-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
            Initiative
          </h4>
          <button
            onClick={() => rollMonsterInitiative()}
            className="text-xs text-tavern-gold-light hover:text-tavern-gold"
          >
            Roll all monsters
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {order.map((c) => {
            const monster = c.isMonster
              ? state.monsters.find((m) => m.key === c.id)
              : undefined;
            const member = c.isMonster ? undefined : members.find((m) => m.id === c.id);
            const down = monster ? monster.currentHp <= 0 : false;
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm ${
                  activeId === c.id
                    ? "border-tavern-gold bg-tavern-bg"
                    : "border-tavern-border"
                } ${down ? "opacity-40" : ""}`}
              >
                <span className={`text-tavern-text ${down ? "line-through" : ""}`}>
                  {c.name}
                  {!c.isMonster && (
                    <span className="ml-1.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                      PC
                    </span>
                  )}
                </span>
                {c.isMonster ? (
                  <span className="flex items-center gap-2">
                    <span className="font-heading font-bold text-tavern-text">
                      {c.initiative ?? "—"}
                    </span>
                    <button
                      onClick={() => rollMonsterInitiative([c.id])}
                      className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                    >
                      Roll
                    </button>
                  </span>
                ) : (
                  <PlayerInitiativeInput
                    value={c.initiative}
                    hint={member ? formatMod(member.initiativeMod) : ""}
                    onCommit={(v) => setPlayerInitiative(c.id, v)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-tavern-muted">
          Players roll their own initiative at the table — type the results in. Monsters at 0 HP
          stay listed but greyed out.
        </p>
      </div>

      {/* Roll log */}
      {log.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-tavern-border bg-tavern-card p-3">
          {log.map((entry) => (
            <div key={entry.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-tavern-muted">
                <span className="text-tavern-text">{entry.label}</span> — {entry.detail}
              </span>
              <span
                className={`font-heading font-bold ${
                  entry.isNat20
                    ? "text-tavern-gold"
                    : entry.isNat1
                      ? "text-tavern-oxblood-light"
                      : "text-tavern-text"
                }`}
              >
                {entry.total}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Monster cards */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {state.monsters.map((m) => (
          <MonsterCard
            key={m.key}
            monster={m}
            statBlock={statBlocksByIndex[m.index]}
            active={activeId === m.key}
            onHpSet={(hp) =>
              persist({
                ...state,
                monsters: state.monsters.map((x) =>
                  x.key === m.key ? { ...x, currentHp: Math.max(0, Math.min(x.maxHp, hp)) } : x,
                ),
              })
            }
            pushLog={pushLog}
          />
        ))}
      </div>
    </div>
  );
}

// Committed on blur/Enter so each keystroke doesn't hit the server.
function PlayerInitiativeInput({
  value,
  hint,
  onCommit,
}: {
  value: number | null;
  hint: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : `${value}`);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) return onCommit(null);
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n)) onCommit(n);
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-tavern-muted">{hint}</span>
      <input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="—"
        className="w-14 rounded-md border border-tavern-border bg-tavern-bg px-2 py-0.5 text-center text-sm text-tavern-text placeholder:text-tavern-muted"
      />
    </span>
  );
}
