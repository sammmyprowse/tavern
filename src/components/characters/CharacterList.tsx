"use client";

import { useState } from "react";
import Link from "next/link";
import DeleteCharacterButton from "@/components/playsheet/DeleteCharacterButton";

export interface CharacterListItem {
  id: string;
  name: string;
  isPublic: boolean;
  subtitle: string;
}

export default function CharacterList({ characters: initial }: { characters: CharacterListItem[] }) {
  const [characters, setCharacters] = useState(initial);

  if (characters.length === 0) {
    return (
      <p className="mt-8 text-tavern-muted">
        No characters yet —{" "}
        <Link href="/builder" className="text-tavern-gold-light underline hover:text-tavern-gold">
          build your first one
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="mt-8 space-y-3">
      {characters.map((c) => (
        <li
          key={c.id}
          className="rounded-lg border border-tavern-border bg-tavern-card p-4 hover:border-tavern-gold-light"
        >
          <Link href={`/characters/${c.id}`} className="block">
            <div className="flex items-center gap-2">
              <div className="font-heading text-lg font-bold text-tavern-text">{c.name}</div>
              {c.isPublic && (
                <span className="rounded-full border border-tavern-gold-light/40 px-2 py-0.5 text-[10px] tracking-wider text-tavern-gold-light uppercase">
                  Public
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-tavern-muted">{c.subtitle}</div>
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
  );
}
