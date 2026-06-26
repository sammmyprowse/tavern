"use client";

import { useMemo, useState } from "react";
import type { MagicItemLookupEntry } from "@/lib/srd";
import { emptyMagicItem, type MagicItem } from "@/lib/magic-items";
import NumberStepper from "@/components/NumberStepper";

interface MagicItemManagerProps {
  magicItemLookup: Map<string, MagicItemLookupEntry>;
  onSave: (item: MagicItem) => void;
  onClose: () => void;
  editingItem?: MagicItem | null;
}

const CATEGORY_TABS = ["All", "Wondrous Items", "Weapons", "Armor", "Rings", "Potions", "Wands", "Staffs"];

export default function MagicItemManager({
  magicItemLookup,
  onSave,
  onClose,
  editingItem = null,
}: MagicItemManagerProps) {
  const allItems = useMemo(
    () => [...magicItemLookup.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [magicItemLookup],
  );

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  // null = still on the picker step; "homebrew" = no real anchor at all
  // (e.g. "Ol'Greg's Loin Cloth"); otherwise the picked real lookup entry.
  const [selectedBase, setSelectedBase] = useState<MagicItemLookupEntry | "homebrew" | null>(
    editingItem
      ? (editingItem.magicItemIndex ? magicItemLookup.get(editingItem.magicItemIndex) : null) ?? "homebrew"
      : null,
  );
  const [draft, setDraft] = useState<MagicItem>(editingItem ?? emptyMagicItem(null));

  const filtered = allItems.filter(
    (i) => (activeTab === "All" || i.category === activeTab) && i.name.toLowerCase().includes(search.toLowerCase()),
  );

  function pickBase(base: MagicItemLookupEntry) {
    setSelectedBase(base);
    setDraft(emptyMagicItem(base.index));
  }

  function pickHomebrew() {
    setSelectedBase("homebrew");
    setDraft(emptyMagicItem(null));
  }

  const isHomebrew = selectedBase === "homebrew";
  const lookup = selectedBase && selectedBase !== "homebrew" ? selectedBase : null;
  // Required when there's no real item to fall back on for a name.
  const canSave = !isHomebrew || Boolean(draft.customName?.trim());

  function save() {
    if (!canSave) return;
    onSave(draft);
  }

  return (
    <div className="mt-3 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-4">
      {!selectedBase ? (
        <>
          <h3 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">Add Magic Item</h3>
          <p className="mt-1 text-xs text-tavern-muted">
            Pick a real magic item for its rarity/attunement/effect reference, or create a homebrew
            one if the DM gave you something that&apos;s not in any book.
          </p>
          <button
            type="button"
            onClick={pickHomebrew}
            className="mt-3 w-full rounded-md border border-tavern-gold/60 bg-tavern-card px-3 py-2 text-left text-sm font-bold text-tavern-gold-light hover:border-tavern-gold"
          >
            + Create Homebrew Magic Item
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search magic items…"
            className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-2 text-sm text-tavern-text placeholder:text-tavern-muted/50"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md border px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                  activeTab === tab
                    ? "border-tavern-gold bg-tavern-card text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-tavern-muted">No matching magic items.</p>
            )}
            {filtered.map((item) => (
              <button
                key={item.index}
                onClick={() => pickBase(item)}
                className="flex w-full items-center justify-between rounded-md border border-tavern-border px-3 py-1.5 text-left text-sm text-tavern-text hover:border-tavern-gold-light"
              >
                <span>{item.name}</span>
                {item.rarity && <span className="text-xs text-tavern-muted">{item.rarity}</span>}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="mt-3 text-xs text-tavern-muted hover:text-tavern-gold-light">
            Cancel
          </button>
        </>
      ) : (
        <>
          <h3 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">
            {editingItem ? "Edit" : "Add"} {isHomebrew ? "Homebrew Magic Item" : lookup?.name}
          </h3>

          {lookup && (
            <div className="mt-2 rounded-md border border-tavern-border bg-tavern-card p-3 text-xs text-tavern-muted">
              <p className="text-tavern-gold-light">
                {lookup.category}
                {lookup.rarity ? ` — ${lookup.rarity}` : ""}
                {lookup.requiresAttunement ? " (Requires Attunement)" : ""}
              </p>
              <p className="mt-1 whitespace-pre-line">{lookup.description}</p>
            </div>
          )}

          <label className="mt-3 block text-xs text-tavern-muted">
            {isHomebrew ? "Name" : "Custom name (optional)"}
            <input
              type="text"
              value={draft.customName ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, customName: e.target.value || null }))}
              placeholder={isHomebrew ? "e.g. Ol'Greg's Loin Cloth" : lookup?.name}
              maxLength={100}
              className="mt-1 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
            />
          </label>

          <label className="mt-2 block text-xs text-tavern-muted">
            Quantity
            <div className="mt-1 w-24">
              <NumberStepper
                value={String(draft.count)}
                onChange={(v) => setDraft((d) => ({ ...d, count: Math.max(1, parseInt(v, 10) || 1) }))}
                onStep={(delta) => setDraft((d) => ({ ...d, count: Math.max(1, d.count + delta) }))}
                inputClassName="text-sm text-tavern-text"
              />
            </div>
          </label>

          <label className="mt-2 block text-xs text-tavern-muted">
            AC bonus (if any)
            <div className="mt-1 w-20">
              <NumberStepper
                value={String(draft.acBonus)}
                onChange={(v) => setDraft((d) => ({ ...d, acBonus: parseInt(v, 10) || 0 }))}
                onStep={(delta) => setDraft((d) => ({ ...d, acBonus: d.acBonus + delta }))}
                inputClassName="text-sm text-tavern-text"
              />
            </div>
          </label>
          <p className="mt-1 text-xs text-tavern-muted italic">
            The only number this app auto-applies — added straight to your AC while equipped.
            Everything else the item does (attack/damage bonuses, resistances, utility effects)
            goes in the field below as a reminder; you apply it yourself when it&apos;s relevant.
          </p>

          <label className="mt-2 block text-xs text-tavern-muted">
            Effect / Notes
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
              placeholder="e.g. resistance to necrotic damage"
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
            />
          </label>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={!canSave}
              className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light disabled:opacity-50"
            >
              {editingItem ? "Save Changes" : "Add Magic Item"}
            </button>
            <button
              onClick={() => (editingItem ? onClose() : setSelectedBase(null))}
              className="text-xs text-tavern-muted hover:text-tavern-gold-light"
            >
              {editingItem ? "Cancel" : "Back"}
            </button>
          </div>
          {isHomebrew && !canSave && (
            <p className="mt-1 text-xs text-tavern-oxblood-light">Give your homebrew item a name first.</p>
          )}
        </>
      )}
    </div>
  );
}
