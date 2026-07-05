"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DeleteCharacterButton from "@/components/playsheet/DeleteCharacterButton";
import { importCharacter } from "@/app/builder/actions";

export interface CharacterListItem {
  id: string;
  name: string;
  isPublic: boolean;
  avatarUrl: string | null;
  subtitle: string;
}

export default function CharacterList({ characters: initial }: { characters: CharacterListItem[] }) {
  const [characters, setCharacters] = useState(initial);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importCharacter(text);
      if (result.success && result.characterId) {
        router.push(`/characters/${result.characterId}`);
      } else {
        setImportError(result.error ?? "Couldn't import that file.");
        setImporting(false);
      }
    } catch {
      setImportError("Couldn't read that file.");
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {importError && <span className="text-xs text-tavern-oxblood-light">{importError}</span>}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="rounded-md border border-tavern-border px-3 py-1.5 text-xs font-bold tracking-wide text-tavern-gold-light uppercase hover:border-tavern-gold-light disabled:opacity-50"
          title="Import a character from a Tavern .json export file"
        >
          {importing ? "Importing…" : "Import from File"}
        </button>
      </div>

      {characters.length === 0 ? (
        <p className="mt-8 text-tavern-muted">
          No characters yet —{" "}
          <Link href="/builder" className="text-tavern-gold-light underline hover:text-tavern-gold">
            build your first one
          </Link>{" "}
          or import one from a file.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {characters.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-tavern-border bg-tavern-card p-4 hover:border-tavern-gold-light"
            >
              <Link href={`/characters/${c.id}`} className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-tavern-gold/50 bg-tavern-bg">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-heading text-xl font-bold text-tavern-gold-light">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-heading text-lg font-bold text-tavern-text">{c.name}</div>
                    {c.isPublic && (
                      <span className="rounded-full border border-tavern-gold-light/40 px-2 py-0.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                        Public
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-tavern-muted">{c.subtitle}</div>
                </div>
              </Link>
              <div className="mt-2 flex justify-end border-t border-tavern-border pt-2">
                <DeleteCharacterButton
                  characterId={c.id}
                  characterName={c.name}
                  onDeleted={() => setCharacters((prev) => prev.filter((x) => x.id !== c.id))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
