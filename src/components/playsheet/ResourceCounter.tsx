"use client";

// The +/− counter strip used by every rest-recovered resource pool on the
// play sheet (Sorcery Points, Channel Divinity, Wild Shape, Favored Enemy,
// Focus Points, the species trait pools, …). Purely presentational —
// `remaining`/`max` are display values and the handlers own their own
// clamping/side effects, exactly as each call site did before extraction.
export function CounterStepper({
  remaining,
  max,
  onRestore,
  onExpend,
}: {
  remaining: number;
  max: number;
  onRestore: () => void;
  onExpend: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-tavern-border px-3 py-1.5">
      <button
        onClick={onRestore}
        disabled={remaining >= max}
        className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
      >
        +
      </button>
      <span className="font-heading font-bold text-tavern-text">
        {remaining}/{max}
      </span>
      <button
        onClick={onExpend}
        disabled={remaining <= 0}
        className="rounded-md border border-tavern-border px-2 text-tavern-gold-light hover:border-tavern-gold-light disabled:opacity-30"
      >
        &minus;
      </button>
    </div>
  );
}

// A titled resource row: name + rules blurb on the left, counter on the
// right. The standard shape for every counter-style class/species resource.
export function ResourceRow({
  title,
  description,
  remaining,
  max,
  onRestore,
  onExpend,
}: {
  title: string;
  description: React.ReactNode;
  remaining: number;
  max: number;
  onRestore: () => void;
  onExpend: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-tavern-border p-3">
      <div>
        <div className="font-heading text-xs font-bold tracking-wider text-tavern-gold-light uppercase">
          {title}
        </div>
        <div className="text-xs text-tavern-muted">{description}</div>
      </div>
      <CounterStepper remaining={remaining} max={max} onRestore={onRestore} onExpend={onExpend} />
    </div>
  );
}
