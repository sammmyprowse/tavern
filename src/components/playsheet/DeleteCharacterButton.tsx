"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCharacter } from "@/app/characters/actions";

interface DeleteCharacterButtonProps {
  characterId: string;
  characterName: string;
}

export default function DeleteCharacterButton({
  characterId,
  characterName,
}: DeleteCharacterButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await deleteCharacter(characterId);
    if (!result.success) {
      setError(result.error ?? "Couldn't delete this character.");
      setPending(false);
      return;
    }
    router.push("/characters");
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
      >
        Delete Character
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-tavern-oxblood bg-tavern-oxblood/10 px-3 py-2">
      <span className="text-xs text-tavern-text">
        Permanently delete <strong>{characterName}</strong>? This can&apos;t be undone.
      </span>
      <button
        onClick={confirmDelete}
        disabled={pending}
        className="rounded-md bg-tavern-oxblood px-3 py-1 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Confirm Delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-xs text-tavern-muted hover:text-tavern-gold-light"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}
