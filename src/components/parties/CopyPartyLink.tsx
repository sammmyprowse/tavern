"use client";

import { useState } from "react";

export default function CopyPartyLink({ partyId }: { partyId: string }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    const url = `${window.location.origin}/parties/${partyId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copyLink}
      className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light"
    >
      {copied ? "Copied!" : "Copy Party Link"}
    </button>
  );
}
