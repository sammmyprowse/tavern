import { EMPTY_DRAFT, type CharacterDraft } from "./character";
import type { PersonalityAnswers } from "./personality";
import type { InventoryItem } from "./inventory";
import type { Currency } from "./currency";
import type { MagicItem } from "./magic-items";

// Portable character file. Everything needed to recreate a character in another
// Tavern account — the mechanical build (draft) plus the presentation columns
// that live outside the draft (bio/personality/inventory/currency/magic items).
// NOT included: avatar image (a Storage URL scoped to the original owner),
// is_public, and party membership — those are account/instance-specific.
export const CHARACTER_EXPORT_VERSION = 1;

export interface CharacterExport {
  tavern: "character";
  version: number;
  name: string;
  draft: CharacterDraft;
  bio: string | null;
  personality: PersonalityAnswers | null;
  inventory: InventoryItem[];
  currency: Currency | null;
  magicItems: MagicItem[];
}

export function buildCharacterExport(input: {
  name: string;
  draft: CharacterDraft;
  bio: string | null;
  personality: PersonalityAnswers | null;
  inventory: InventoryItem[];
  currency: Currency | null;
  magicItems: MagicItem[];
}): CharacterExport {
  return { tavern: "character", version: CHARACTER_EXPORT_VERSION, ...input };
}

// Parse + validate an uploaded file's contents. Returns a normalized export or
// an error string. Lenient about the presentation columns (they default to
// empty) but strict that this is actually a Tavern character file with a draft.
export function parseCharacterExport(text: string): { ok: true; data: CharacterExport } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "That file isn't a Tavern character." };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.tavern !== "character" || typeof obj.draft !== "object" || obj.draft === null) {
    return { ok: false, error: "That file isn't a Tavern character export." };
  }
  // Merge the draft against EMPTY_DRAFT so a file from an older app version
  // (missing newer fields) still imports cleanly — same defensive merge the
  // play sheet and builder already do for stored drafts.
  const draft = { ...EMPTY_DRAFT, ...(obj.draft as Partial<CharacterDraft>) } as CharacterDraft;
  const name =
    typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : draft.name?.trim() || "Imported Character";
  return {
    ok: true,
    data: {
      tavern: "character",
      version: typeof obj.version === "number" ? obj.version : 1,
      name,
      draft: { ...draft, name },
      bio: typeof obj.bio === "string" ? obj.bio : null,
      personality: (obj.personality as PersonalityAnswers | null) ?? null,
      inventory: Array.isArray(obj.inventory) ? (obj.inventory as InventoryItem[]) : [],
      currency: (obj.currency as Currency | null) ?? null,
      magicItems: Array.isArray(obj.magicItems) ? (obj.magicItems as MagicItem[]) : [],
    },
  };
}

// Trigger a browser download of a character export as a .json file. Client only.
export function downloadCharacterExport(data: CharacterExport) {
  const safeName = (data.name || "character").replace(/[^\w\-]+/g, "_").toLowerCase();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.tavern.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
