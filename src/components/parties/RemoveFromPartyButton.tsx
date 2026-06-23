"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeCharacterFromParty } from "@/app/parties/actions";

export default function RemoveFromPartyButton({
  partyId,
  characterId,
}: {
  partyId: string;
  characterId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setPending(true);
    const result = await removeCharacterFromParty(partyId, characterId);
    if (result.success) router.refresh();
    setPending(false);
  }

  return (
    <button
      onClick={handleRemove}
      disabled={pending}
      className="font-heading text-[10px] tracking-widest text-tavern-muted uppercase hover:text-tavern-oxblood-light disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
