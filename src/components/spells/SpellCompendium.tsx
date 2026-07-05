"use client";

import { useMemo, useState } from "react";
import type { CompendiumSpell } from "@/lib/srd";

function levelLabel(level: number): string {
  if (level === 0) return "Cantrip";
  const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
  return `${level}${suffix} level`;
}

export default function SpellCompendium({ spells }: { spells: CompendiumSpell[] }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | "all">("all");
  const [school, setSchool] = useState<string>("all");
  const [klass, setKlass] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Distinct schools and classes for the filter dropdowns.
  const schools = useMemo(
    () => [...new Set(spells.map((s) => s.school).filter((s): s is string => Boolean(s)))].sort(),
    [spells],
  );
  const classes = useMemo(
    () => [...new Set(spells.flatMap((s) => s.classes))].sort(),
    [spells],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spells.filter((s) => {
      if (level !== "all" && s.level !== level) return false;
      if (school !== "all" && s.school !== school) return false;
      if (klass !== "all" && !s.classes.includes(klass)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.description ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [spells, query, level, school, klass]);

  function toggle(index: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectClass =
    "rounded-md border border-tavern-border bg-tavern-bg px-2 py-1.5 text-sm text-tavern-text";

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search spells…"
          className="min-w-[12rem] flex-1 rounded-md border border-tavern-border bg-tavern-bg px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted"
        />
        <select value={String(level)} onChange={(e) => setLevel(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectClass}>
          <option value="all">All levels</option>
          {Array.from({ length: 10 }, (_, i) => i).map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </select>
        <select value={school} onChange={(e) => setSchool(e.target.value)} className={selectClass}>
          <option value="all">All schools</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={klass} onChange={(e) => setKlass(e.target.value)} className={selectClass}>
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-tavern-muted">
        {filtered.length} spell{filtered.length === 1 ? "" : "s"}. Spell text is from the 2014 SRD
        (the 2024 SRD hasn&apos;t published spells yet).
      </p>

      {/* List */}
      <div className="mt-3 space-y-1.5">
        {filtered.map((s) => {
          const isOpen = expanded.has(s.index);
          return (
            <div key={s.index} className="rounded-md border border-tavern-border bg-tavern-card">
              <button
                onClick={() => toggle(s.index)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
              >
                <span>
                  <span className="font-heading font-bold text-tavern-text">{s.name}</span>
                  <span className="ml-2 text-xs text-tavern-muted">
                    {levelLabel(s.level)}
                    {s.school ? ` · ${s.school}` : ""}
                    {s.concentration ? " · Concentration" : ""}
                    {s.ritual ? " · Ritual" : ""}
                  </span>
                </span>
                <span className="text-xs text-tavern-muted">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-tavern-border px-4 py-3 text-sm text-tavern-muted">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="font-bold text-tavern-gold-light uppercase">Casting Time</dt>
                      <dd>{s.castingTime ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-tavern-gold-light uppercase">Range</dt>
                      <dd>{s.range ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-tavern-gold-light uppercase">Components</dt>
                      <dd>{s.components.length ? s.components.join(", ") : "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-tavern-gold-light uppercase">Duration</dt>
                      <dd>{s.duration ?? "—"}</dd>
                    </div>
                  </dl>
                  {s.material && (
                    <p className="mt-2 text-xs italic">Material: {s.material}</p>
                  )}
                  {s.description && (
                    <p className="mt-2 whitespace-pre-line">{s.description}</p>
                  )}
                  {s.higherLevel && (
                    <p className="mt-2 whitespace-pre-line">
                      <span className="font-bold text-tavern-gold-light">At Higher Levels. </span>
                      {s.higherLevel}
                    </p>
                  )}
                  {s.classes.length > 0 && (
                    <p className="mt-2 text-xs">
                      <span className="font-bold text-tavern-gold-light">Classes: </span>
                      {s.classes.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-tavern-muted">No spells match those filters.</p>
        )}
      </div>
    </div>
  );
}
