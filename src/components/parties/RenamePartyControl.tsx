"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameParty } from "@/app/parties/actions";

export default function RenamePartyControl({
  partyId,
  currentName,
}: {
  partyId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await renameParty(partyId, name);
    if (result.success) {
      setEditing(false);
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't rename party.");
    }
    setPending(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
      >
        Rename
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-tavern-border bg-tavern-bg px-3 py-1.5 text-sm text-tavern-text"
      />
      <button
        onClick={handleSave}
        disabled={pending || !name.trim()}
        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-parchment uppercase hover:bg-tavern-oxblood-light disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setName(currentName);
          setError(null);
        }}
        className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-oxblood-light"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}
