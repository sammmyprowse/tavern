"use client";

// Shared chrome for the six homebrew manager components (feats, subclasses,
// backgrounds, species, spells, classes). Each manager owns its form fields
// and save/remove wiring; the header row, list item card, form action row,
// and empty-state note are identical across all six and live here.

export function ManagerHeader({
  blurb,
  buttonLabel,
  formOpen,
  onCreate,
}: {
  blurb: string;
  buttonLabel: string;
  formOpen: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-tavern-muted">{blurb}</p>
      {!formOpen && (
        <button
          onClick={onCreate}
          className="shrink-0 rounded-md border border-tavern-gold/60 bg-tavern-bg px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

// One saved item in the list: name + optional inline meta + Homebrew badge,
// optional detail lines below, Edit/Delete on the right.
export function ManagerItemCard({
  name,
  meta,
  onEdit,
  onDelete,
  children,
}: {
  name: string;
  meta?: string;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-tavern-border bg-tavern-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-heading font-bold text-tavern-text">
            {name}
            {meta && <span className="ml-2 text-xs font-normal text-tavern-muted">{meta}</span>}
            <span className="ml-2 rounded-full border border-tavern-gold-light/40 px-1.5 py-0.5 text-[9px] tracking-wider text-tavern-gold-light uppercase">
              Homebrew
            </span>
          </div>
          {children}
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onEdit} className="text-xs text-tavern-gold-light hover:text-tavern-gold">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs text-tavern-muted hover:text-tavern-oxblood-light">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManagerFormActions({
  pending,
  disabled,
  error,
  onSave,
  onCancel,
}: {
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={pending || disabled}
        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} disabled={pending} className="text-xs text-tavern-muted hover:text-tavern-gold-light">
        Cancel
      </button>
      {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}

export function ManagerEmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-tavern-muted italic">{children}</p>;
}
