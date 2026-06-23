"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCharacterToParty } from "@/app/parties/actions";

interface AddCharacterControlProps {
  partyId: string;
  addableCharacters: { id: string; name: string }[];
}

export default function AddCharacterControl({
  partyId,
  addableCharacters,
}: AddCharacterControlProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(addableCharacters[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (addableCharacters.length === 0) return null;

  async function handleAdd() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const result = await addCharacterToParty(partyId, selected);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't add character.");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-md border border-tavern-border bg-tavern-bg px-3 py-1.5 text-sm text-tavern-text"
      >
        {addableCharacters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={pending}
        className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-parchment uppercase hover:bg-tavern-oxblood-light disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to Party"}
      </button>
      {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}
