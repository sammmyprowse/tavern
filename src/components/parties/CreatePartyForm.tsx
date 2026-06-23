"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createParty } from "@/app/parties/actions";

export default function CreatePartyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setPending(true);
    setError(null);
    const result = await createParty(name);
    if (result.success && result.partyId) {
      router.push(`/parties/${result.partyId}`);
    } else {
      setError(result.error ?? "Couldn't create party.");
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-tavern-border bg-tavern-card p-5">
      <h2 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light uppercase">
        Start a Party
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Party name (e.g. The Fellowship)"
          className="min-w-[200px] flex-1 rounded-md border border-tavern-border bg-tavern-bg px-3 py-2 text-tavern-text placeholder:text-tavern-muted/50"
        />
        <button
          onClick={handleCreate}
          disabled={pending || !name.trim()}
          className="rounded-lg bg-tavern-oxblood px-5 py-2 font-heading text-xs font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light disabled:cursor-not-allowed disabled:opacity-30"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-tavern-oxblood-light">{error}</p>}
    </div>
  );
}
