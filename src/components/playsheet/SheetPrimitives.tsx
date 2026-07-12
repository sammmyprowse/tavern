"use client";

// Shared row/picker primitives for the play sheet. Expansion state stays in
// PlaySheet's existing expandedFeatures set — these take expanded/onToggle
// props rather than owning state, so behaviour is identical to the inline
// markup they replaced.

// The standard play-sheet card header: full-width toggle with the card title
// on the left and the collapse arrow on the right. Cards with extra header
// controls (Edit buttons, pending highlights) keep their own markup.
export function CardHeader({
  title,
  collapsed,
  onToggle,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} className="flex w-full items-center justify-between">
      <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
        {title}
      </h2>
      <span className="text-xs text-tavern-muted">{collapsed ? "▸" : "▾"}</span>
    </button>
  );
}

// View-mode row used by Features, Species Traits, and the chosen Fighting
// Style / Weapon Mastery lists: name + optional right label, tap anywhere on
// the row to expand the rules text.
export function ExpandableRow({
  name,
  rightLabel,
  description,
  expanded,
  onToggle,
}: {
  name: string;
  rightLabel?: string | null;
  description: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-tavern-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
      >
        <span className="text-tavern-text">{name}</span>
        {rightLabel && (
          <span className="text-xs tracking-wide text-tavern-muted uppercase">{rightLabel}</span>
        )}
      </button>
      {expanded && description && (
        <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
          {description}
        </p>
      )}
    </div>
  );
}

// One selectable option in a choose-up-to-N picker (Fighting Style, Weapon
// Mastery, Metamagic). Selecting and reading are deliberately separate taps —
// a "Show details" toggle under the name — so reading a rule never commits a
// selection.
export function PickerOption({
  name,
  rightLabel,
  rightLabelTone = "muted",
  description,
  selected,
  onSelect,
  detailsExpanded,
  onToggleDetails,
}: {
  name: string;
  rightLabel?: string | null;
  // "gold" highlights the label (Weapon Mastery's property name); "muted" is
  // the quiet default (Metamagic's cost).
  rightLabelTone?: "muted" | "gold";
  description: string | null;
  selected: boolean;
  onSelect: () => void;
  detailsExpanded: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className={`rounded-md border ${selected ? "border-tavern-gold bg-tavern-card" : "border-tavern-border"}`}>
      <button
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-tavern-bg"
      >
        <span className="text-tavern-text">{name}</span>
        {rightLabel && (
          <span
            className={`text-xs tracking-wide uppercase ${
              rightLabelTone === "gold" ? "text-tavern-gold-light" : "text-tavern-muted"
            }`}
          >
            {rightLabel}
          </span>
        )}
      </button>
      {description && (
        <>
          <button
            onClick={onToggleDetails}
            className="block w-full px-3 py-1 text-left text-[10px] text-tavern-muted hover:text-tavern-gold-light"
          >
            {detailsExpanded ? "Hide details" : "Show details"}
          </button>
          {detailsExpanded && (
            <p className="border-t border-tavern-border px-3 py-2 text-xs whitespace-pre-line text-tavern-muted">
              {description}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// A spell entry in the Spells card (known cantrips, prepared spells, lineage
// spells, subclass always-prepared spells). The whole left side toggles the
// full rules text; the call site supplies its own meta line (level/school/
// range/DC varies by list) and action buttons (Attack/Damage/Cast/slot picks).
export function SpellRow({
  name,
  isHomebrew,
  metaLine,
  description,
  expanded,
  onToggle,
  actions,
}: {
  name: string;
  isHomebrew?: boolean;
  metaLine: React.ReactNode;
  description: string | null;
  expanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-tavern-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-heading font-bold text-tavern-text">
              {name}
              {isHomebrew && (
                <span className="ml-1.5 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
                  HB
                </span>
              )}
            </span>
            <span className="text-xs text-tavern-muted">{expanded ? "▴" : "▾"}</span>
          </div>
          <div className="mt-0.5 text-xs text-tavern-muted">{metaLine}</div>
        </button>
        {actions && <div className="flex flex-shrink-0 flex-wrap gap-1.5">{actions}</div>}
      </div>
      {expanded && description && (
        <p className="mt-2 border-t border-tavern-border pt-2 text-xs whitespace-pre-line text-tavern-muted">
          {description}
        </p>
      )}
    </div>
  );
}

// The commit row at the bottom of every play-sheet picker.
export function SaveCancelRow({
  pending,
  onSave,
  onCancel,
}: {
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={pending}
        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        disabled={pending}
        className="text-xs text-tavern-muted hover:text-tavern-gold-light disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
