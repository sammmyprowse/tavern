"use client";

import { useMemo, useState } from "react";
import type { EquipmentLookupItem } from "@/lib/srd";
import { categorizeBaseItem, emptyInventoryItem, type InventoryItem } from "@/lib/inventory";
import NumberStepper from "@/components/NumberStepper";

interface InventoryManagerProps {
  equipmentLookup: Map<string, EquipmentLookupItem>;
  onSave: (item: InventoryItem) => void;
  onClose: () => void;
  editingItem?: InventoryItem | null;
}

const CATEGORY_TABS: { label: string; match: (item: EquipmentLookupItem) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Weapons", match: (i) => (i.categories ?? []).includes("weapons") },
  { label: "Armor", match: (i) => (i.categories ?? []).includes("armor") || i.index === "shield" },
  { label: "Gear", match: (i) => (i.categories ?? []).includes("adventuring-gear") },
  { label: "Tools", match: (i) => (i.categories ?? []).includes("tools") },
];

const BONUS_DIE_SIZES = [4, 6, 8, 10, 12];

// Drives whether the "Special Variant" section starts expanded when
// editing an existing item — a plain found item (just a name + quantity)
// should still look plain when reopened, but one with any bonus/notes
// shouldn't hide that data behind a collapsed toggle by default.
function hasSpecialData(item: InventoryItem): boolean {
  return Boolean(
    item.customName || item.attackBonus || item.damageBonus || item.acBonus || item.bonusDamageDice || item.notes,
  );
}

export default function InventoryManager({
  equipmentLookup,
  onSave,
  onClose,
  editingItem = null,
}: InventoryManagerProps) {
  const allItems = useMemo(
    () => [...equipmentLookup.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [equipmentLookup],
  );

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [selectedBase, setSelectedBase] = useState<EquipmentLookupItem | null>(
    editingItem ? equipmentLookup.get(editingItem.baseIndex) ?? null : null,
  );
  const [draft, setDraft] = useState<InventoryItem>(
    editingItem ?? emptyInventoryItem(""),
  );
  const [showVariant, setShowVariant] = useState(() => (editingItem ? hasSpecialData(editingItem) : false));

  const filtered = allItems.filter(
    (i) => CATEGORY_TABS[activeTab].match(i) && i.name.toLowerCase().includes(search.toLowerCase()),
  );

  function pickBase(base: EquipmentLookupItem) {
    setSelectedBase(base);
    setDraft(emptyInventoryItem(base.index));
    setShowVariant(false);
  }

  function save() {
    if (!selectedBase) return;
    onSave(draft);
  }

  const category = selectedBase ? categorizeBaseItem(selectedBase) : null;

  // Composed from/into draft.bonusDamageDice (e.g. "2d6") rather than kept
  // as separate state — derives cleanly each render, no sync to manage.
  const bonusDiceMatch = draft.bonusDamageDice?.match(/^(\d+)d(\d+)$/);
  const bonusDieCount = bonusDiceMatch ? parseInt(bonusDiceMatch[1], 10) : 1;
  const bonusDieSize = bonusDiceMatch ? parseInt(bonusDiceMatch[2], 10) : null;

  function setBonusDieSize(size: number) {
    setDraft((d) => ({ ...d, bonusDamageDice: `${bonusDieCount}d${size}` }));
  }
  function setBonusDieCount(count: number) {
    if (!bonusDieSize) return;
    setDraft((d) => ({ ...d, bonusDamageDice: `${Math.max(1, count)}d${bonusDieSize}` }));
  }
  function clearBonusDamage() {
    setDraft((d) => ({ ...d, bonusDamageDice: null, bonusDamageCondition: null }));
  }

  return (
    <div className="mt-3 rounded-lg border border-tavern-gold/40 bg-tavern-bg p-4">
      {!selectedBase ? (
        <>
          <h3 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">
            Add Equipment
          </h3>
          <p className="mt-1 text-xs text-tavern-muted">
            Pick a base item — for a magic item (e.g. a Goblin Slayer Sword), pick its mundane
            equivalent (e.g. Longsword), then add the bonuses on the next step.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment…"
            autoFocus
            className="mt-3 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-2 text-sm text-tavern-text placeholder:text-tavern-muted/50"
          />
          <div className="mt-2 flex gap-1.5">
            {CATEGORY_TABS.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`rounded-md border px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                  activeTab === i
                    ? "border-tavern-gold bg-tavern-card text-tavern-gold-light"
                    : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-tavern-muted">No matching equipment.</p>
            )}
            {filtered.map((item) => (
              <button
                key={item.index}
                onClick={() => pickBase(item)}
                className="flex w-full items-center justify-between rounded-md border border-tavern-border px-3 py-1.5 text-left text-sm text-tavern-text hover:border-tavern-gold-light"
              >
                <span>{item.name}</span>
                {item.damage && (
                  <span className="text-xs text-tavern-muted">{item.damage.damageDice}</span>
                )}
                {item.armorClass && (
                  <span className="text-xs text-tavern-muted">AC {item.armorClass.base}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="mt-3 text-xs text-tavern-muted hover:text-tavern-gold-light"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <h3 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">
            {editingItem ? "Edit" : "Add"} {selectedBase.name}
          </h3>
          <p className="mt-1 text-xs text-tavern-muted">
            Pick a quantity for an ordinary item — only add a special variant if the DM said this
            one&apos;s special.
          </p>

          <label className="mt-3 block text-xs text-tavern-muted">
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

          {!showVariant ? (
            <button
              type="button"
              onClick={() => setShowVariant(true)}
              className="mt-3 text-xs text-tavern-gold-light hover:text-tavern-gold"
            >
              + Add Special Variant
            </button>
          ) : (
            <div className="mt-3 space-y-3 rounded-md border border-tavern-border p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-wide text-tavern-gold-light uppercase">
                  Special Variant
                </h4>
                <button
                  type="button"
                  onClick={() => setShowVariant(false)}
                  className="text-xs text-tavern-muted hover:text-tavern-gold-light"
                >
                  Hide
                </button>
              </div>

              <label className="block text-xs text-tavern-muted">
                Custom name (optional)
                <input
                  type="text"
                  value={draft.customName ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, customName: e.target.value || null }))}
                  placeholder={selectedBase.name}
                  maxLength={100}
                  className="mt-1 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
                />
              </label>

              {category === "weapon" && (
                <>
                  <div className="flex gap-3">
                    <label className="block text-xs text-tavern-muted">
                      Attack bonus
                      <div className="mt-1 w-20">
                        <NumberStepper
                          value={String(draft.attackBonus)}
                          onChange={(v) => setDraft((d) => ({ ...d, attackBonus: parseInt(v, 10) || 0 }))}
                          onStep={(delta) => setDraft((d) => ({ ...d, attackBonus: d.attackBonus + delta }))}
                          inputClassName="text-sm text-tavern-text"
                        />
                      </div>
                    </label>
                    <label className="block text-xs text-tavern-muted">
                      Damage bonus
                      <div className="mt-1 w-20">
                        <NumberStepper
                          value={String(draft.damageBonus)}
                          onChange={(v) => setDraft((d) => ({ ...d, damageBonus: parseInt(v, 10) || 0 }))}
                          onStep={(delta) => setDraft((d) => ({ ...d, damageBonus: d.damageBonus + delta }))}
                          inputClassName="text-sm text-tavern-text"
                        />
                      </div>
                    </label>
                  </div>
                  <p className="text-xs text-tavern-muted italic">
                    Flat numbers added to every attack/damage roll automatically. For a
                    conditional, dice-based bonus instead — like extra damage only against a
                    certain enemy — use Conditional Bonus Damage below, not these.
                  </p>

                  <div>
                    <p className="text-xs text-tavern-muted">Conditional bonus damage (optional)</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {BONUS_DIE_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setBonusDieSize(size)}
                          className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                            bonusDieSize === size
                              ? "border-tavern-gold bg-tavern-card text-tavern-gold-light"
                              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
                          }`}
                        >
                          d{size}
                        </button>
                      ))}
                      {bonusDieSize != null && (
                        <>
                          <div className="w-16">
                            <NumberStepper
                              value={String(bonusDieCount)}
                              onChange={(v) => setBonusDieCount(parseInt(v, 10) || 1)}
                              onStep={(delta) => setBonusDieCount(bonusDieCount + delta)}
                              inputClassName="text-sm text-tavern-text"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={clearBonusDamage}
                            className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                    {bonusDieSize != null && (
                      <>
                        <input
                          type="text"
                          value={draft.bonusDamageCondition ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, bonusDamageCondition: e.target.value || null }))
                          }
                          placeholder="When does it apply? e.g. vs goblins"
                          maxLength={100}
                          className="mt-1.5 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
                        />
                        <p className="mt-1 text-xs text-tavern-muted italic">
                          Rolled on its own from a &quot;Bonus&quot; button on the Attacks card —
                          on top of the normal Damage roll, not instead of it. You decide when the
                          condition applies; nothing here is checked automatically.
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}

              {(category === "armor" || category === "shield") && (
                <label className="block text-xs text-tavern-muted">
                  AC bonus
                  <div className="mt-1 w-20">
                    <NumberStepper
                      value={String(draft.acBonus)}
                      onChange={(v) => setDraft((d) => ({ ...d, acBonus: parseInt(v, 10) || 0 }))}
                      onStep={(delta) => setDraft((d) => ({ ...d, acBonus: d.acBonus + delta }))}
                      inputClassName="text-sm text-tavern-text"
                    />
                  </div>
                </label>
              )}

              <label className="block text-xs text-tavern-muted">
                Notes — special properties, flavor, anything else worth remembering
                <textarea
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
                  placeholder="e.g. glows faintly in moonlight"
                  maxLength={500}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-tavern-border bg-tavern-card px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
                />
              </label>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              className="rounded-md bg-tavern-oxblood px-3 py-1.5 text-xs font-bold text-tavern-parchment hover:bg-tavern-oxblood-light"
            >
              {editingItem ? "Save Changes" : "Add to Inventory"}
            </button>
            <button
              onClick={() => (editingItem ? onClose() : setSelectedBase(null))}
              className="text-xs text-tavern-muted hover:text-tavern-gold-light"
            >
              {editingItem ? "Cancel" : "Back"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
