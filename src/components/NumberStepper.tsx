"use client";

interface NumberStepperProps {
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  inputClassName?: string;
}

// Native number-input spin buttons are hidden globally (see globals.css)
// since their bare gray OS arrows clash with the theme everywhere they
// show up — this replaces them with a themed +/- pair (gold background,
// muted arrow) fused against the input's right edge. The input itself
// stays real and directly editable (typing a large amount, e.g. spending
// 50 gold, shouldn't require 50 clicks) — the buttons are a fast path
// for small adjustments, not the only way in.
export default function NumberStepper({
  value,
  onChange,
  onStep,
  onBlur,
  disabled,
  inputClassName = "",
}: NumberStepperProps) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-tavern-border">
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full min-w-0 flex-1 border-0 bg-tavern-bg px-2 text-center focus:outline-none disabled:opacity-80 ${inputClassName}`}
      />
      {!disabled && (
        <div className="flex flex-col border-l border-tavern-border">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onStep(1)}
            className="flex h-1/2 w-6 items-center justify-center bg-tavern-gold text-[8px] text-tavern-muted hover:bg-tavern-gold-light"
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onStep(-1)}
            className="flex h-1/2 w-6 items-center justify-center border-t border-tavern-bg/30 bg-tavern-gold text-[8px] text-tavern-muted hover:bg-tavern-gold-light"
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}
