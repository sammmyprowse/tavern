"use client";

import { useState } from "react";
import { CURRENCY_ORDER, type Currency } from "@/lib/currency";

function CurrencyBox({
  label,
  value,
  isOwner,
  onCommit,
}: {
  label: string;
  value: number;
  isOwner: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // Resyncs if the committed value changes from elsewhere (e.g. another
  // box's edit triggered a fresh save round-trip) — but not on every
  // keystroke, since `draft` is the source of truth while typing. Adjusting
  // state during render (React's recommended pattern for this) rather than
  // an effect, which would commit the stale value for one extra frame and
  // risk a cascading-render lint error.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

  return (
    <div className="rounded-lg border border-tavern-border bg-tavern-bg p-2 text-center">
      <div className="font-heading text-[10px] tracking-wider text-tavern-muted uppercase">{label}</div>
      <input
        type="number"
        value={draft}
        disabled={!isOwner}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(Math.max(0, parseInt(draft, 10) || 0))}
        className="mt-1 w-full bg-transparent text-center font-heading text-lg font-bold text-tavern-gold-light focus:outline-none disabled:opacity-80"
      />
    </div>
  );
}

interface CurrencyTrackerProps {
  currency: Currency;
  isOwner: boolean;
  error: string | null;
  onCommit: (key: keyof Currency, value: number) => void;
}

export default function CurrencyTracker({ currency, isOwner, error, onCommit }: CurrencyTrackerProps) {
  return (
    <div className="mb-4">
      <div className="grid grid-cols-5 gap-2">
        {CURRENCY_ORDER.map(({ key, label }) => (
          <CurrencyBox
            key={key}
            label={label}
            value={currency[key]}
            isOwner={isOwner}
            onCommit={(value) => onCommit(key, value)}
          />
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-tavern-oxblood-light">{error}</p>}
    </div>
  );
}
