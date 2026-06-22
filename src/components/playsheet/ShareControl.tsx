"use client";

import { useState } from "react";
import { setCharacterPublic } from "@/app/characters/actions";

interface ShareControlProps {
  characterId: string;
  initialIsPublic: boolean;
}

export default function ShareControl({ characterId, initialIsPublic }: ShareControlProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    const next = !isPublic;
    const result = await setCharacterPublic(characterId, next);
    if (result.success) {
      setIsPublic(next);
    } else {
      setError(result.error ?? "Couldn't update sharing.");
    }
    setPending(false);
  }

  function copyLink() {
    const url = `${window.location.origin}/characters/${characterId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition-colors disabled:opacity-50 ${
          isPublic
            ? "border-tavern-gold bg-tavern-bg text-tavern-gold-light"
            : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
        }`}
      >
        {pending ? "Working…" : isPublic ? "Public" : "Private"}
      </button>
      {isPublic && (
        <button
          onClick={copyLink}
          className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light"
        >
          {copied ? "Copied!" : "Copy Share Link"}
        </button>
      )}
      {error && <span className="text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}
